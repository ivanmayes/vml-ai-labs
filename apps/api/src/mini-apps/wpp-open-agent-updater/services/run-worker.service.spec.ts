import { HttpException, HttpStatus } from '@nestjs/common';

import { TaskRunStatus } from '../entities/task-run.entity';
import { TaskRunFileStatus } from '../entities/task-run-file.entity';

import { RunWorkerService } from './run-worker.service';
import {
	WppOpenPermissionError,
	WppOpenAgentMismatchError,
} from './wpp-open-agent.service';

describe('RunWorkerService.toRunErrorMessage', () => {
	it('returns the human message for WppOpenPermissionError', () => {
		const err = new WppOpenPermissionError('4zBQjXPNiqDP8UDGSc1Zg');
		const msg = RunWorkerService.toRunErrorMessage(err);
		expect(msg).toContain('not accessible from your current workspace');
	});

	it('returns the human message for WppOpenAgentMismatchError', () => {
		const err = new WppOpenAgentMismatchError('p', 'a');
		const msg = RunWorkerService.toRunErrorMessage(err);
		expect(msg).toContain('does not belong to the saved project');
	});

	it('returns the .message for any other Error', () => {
		const err = new Error('something else broke');
		expect(RunWorkerService.toRunErrorMessage(err)).toBe(
			'something else broke',
		);
	});

	it('falls back for non-Error throwables', () => {
		expect(RunWorkerService.toRunErrorMessage('weird')).toBe(
			'Unknown error',
		);
		expect(RunWorkerService.toRunErrorMessage(undefined)).toBe(
			'Unknown error',
		);
	});
});

describe('RunWorkerService.toFileErrorMessage', () => {
	it('uses the pre-upload phrasing for WppOpenAgentMismatchError', () => {
		const err = new WppOpenAgentMismatchError('p', 'a');
		const msg = RunWorkerService.toFileErrorMessage(err);
		expect(msg).toContain('Run aborted before upload');
		expect(msg).toContain('preserved for next run');
	});

	it('uses the pre-upload phrasing for WppOpenPermissionError', () => {
		const err = new WppOpenPermissionError('p');
		const msg = RunWorkerService.toFileErrorMessage(err);
		expect(msg).toContain('Run aborted before upload');
	});

	it('uses the upsert phrasing for non-pre-upload errors', () => {
		const err = new Error('S3 timeout');
		const msg = RunWorkerService.toFileErrorMessage(err);
		expect(msg).toBe('Knowledge upsert failed: S3 timeout');
	});
});

describe('RunWorkerService.isPreUploadFailure', () => {
	it('flags both typed errors as pre-upload', () => {
		expect(
			RunWorkerService.isPreUploadFailure(
				new WppOpenAgentMismatchError(),
			),
		).toBe(true);
		expect(
			RunWorkerService.isPreUploadFailure(new WppOpenPermissionError()),
		).toBe(true);
	});

	it('does not flag plain errors as pre-upload', () => {
		expect(RunWorkerService.isPreUploadFailure(new Error('whatever'))).toBe(
			false,
		);
	});
});

describe('RunWorkerService.isTransientUpsertError', () => {
	it('flags 5xx HttpException as transient', () => {
		const err = new HttpException(
			'WPP Open API error: 500',
			HttpStatus.BAD_GATEWAY,
		);
		expect(RunWorkerService.isTransientUpsertError(err)).toBe(true);
	});

	it('flags 502/503/504 as transient', () => {
		for (const status of [502, 503, 504]) {
			const err = new HttpException(`upstream`, status);
			expect(RunWorkerService.isTransientUpsertError(err)).toBe(true);
		}
	});

	it('does NOT flag 4xx as transient (auth/validation will not recover)', () => {
		const err = new HttpException('bad request', HttpStatus.BAD_REQUEST);
		expect(RunWorkerService.isTransientUpsertError(err)).toBe(false);
	});

	it('does NOT flag typed permission errors as transient', () => {
		// User has to fix scope; retrying produces the same response.
		expect(
			RunWorkerService.isTransientUpsertError(
				new WppOpenPermissionError(),
			),
		).toBe(false);
		expect(
			RunWorkerService.isTransientUpsertError(
				new WppOpenAgentMismatchError(),
			),
		).toBe(false);
	});

	it('does NOT flag plain Errors as transient (defensive default)', () => {
		expect(
			RunWorkerService.isTransientUpsertError(new Error('weird')),
		).toBe(false);
		expect(RunWorkerService.isTransientUpsertError('string')).toBe(false);
	});
});

describe('RunWorkerService.computeFinalStatus', () => {
	it('marks COMPLETED when at least one file uploaded successfully', () => {
		expect(
			RunWorkerService.computeFinalStatus({
				aborted: false,
				isShuttingDown: false,
				processed: 5,
				failed: 0,
				skipped: 0,
			}),
		).toBe(TaskRunStatus.COMPLETED);
	});

	it('marks COMPLETED for a clean skip-only run (every file size-skipped, no failures)', () => {
		// Pre-fix: this returned FAILED, lastRunAt did not advance, and the
		// next run re-listed and re-skipped the same files forever. The fix
		// recognizes deterministic skipping as a successful evaluation.
		expect(
			RunWorkerService.computeFinalStatus({
				aborted: false,
				isShuttingDown: false,
				processed: 0,
				failed: 0,
				skipped: 12,
			}),
		).toBe(TaskRunStatus.COMPLETED);
	});

	it('marks FAILED when every file failed (no successes, no clean skip)', () => {
		expect(
			RunWorkerService.computeFinalStatus({
				aborted: false,
				isShuttingDown: false,
				processed: 0,
				failed: 7,
				skipped: 0,
			}),
		).toBe(TaskRunStatus.FAILED);
	});

	it('marks FAILED when failures exist alongside skips (no clean skip-only)', () => {
		expect(
			RunWorkerService.computeFinalStatus({
				aborted: false,
				isShuttingDown: false,
				processed: 0,
				failed: 3,
				skipped: 5,
			}),
		).toBe(TaskRunStatus.FAILED);
	});

	it('marks FAILED when aborted, even if some processed', () => {
		// Mid-flight chunk-flush failure aborts the run; the remaining files
		// were never tried. lastRunAt must stay put so the next run picks them
		// up.
		expect(
			RunWorkerService.computeFinalStatus({
				aborted: true,
				isShuttingDown: false,
				processed: 30,
				failed: 10,
				skipped: 0,
			}),
		).toBe(TaskRunStatus.FAILED);
	});

	it('marks FAILED when shutting down (dyno restart interrupted the run)', () => {
		expect(
			RunWorkerService.computeFinalStatus({
				aborted: false,
				isShuttingDown: true,
				processed: 30,
				failed: 0,
				skipped: 0,
			}),
		).toBe(TaskRunStatus.FAILED);
	});
});

describe('RunWorkerService.failedCountAfterUpsertError', () => {
	it('does not count converted files as failed on pre-upload (mismatch) error', () => {
		const result = RunWorkerService.failedCountAfterUpsertError(
			4,
			1006,
			new WppOpenAgentMismatchError(),
		);
		// Mirrors the production scenario: 4 process failures, 1006 converted,
		// pre-upload mismatch — aggregate stays at 4, per-file rows say
		// "preserved for next run".
		expect(result).toBe(4);
	});

	it('does not count converted files as failed on pre-upload (permission) error', () => {
		const result = RunWorkerService.failedCountAfterUpsertError(
			0,
			500,
			new WppOpenPermissionError(),
		);
		expect(result).toBe(0);
	});

	it('counts converted files as failed on post-upload (real) error', () => {
		const result = RunWorkerService.failedCountAfterUpsertError(
			4,
			1006,
			new Error('S3 timeout during PUT'),
		);
		expect(result).toBe(1010);
	});

	it('counts converted files as failed on non-Error throwables (defensive)', () => {
		const result = RunWorkerService.failedCountAfterUpsertError(
			0,
			3,
			'weird string',
		);
		expect(result).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// processFile: size-cap path emits SKIPPED, not FAILED
// ---------------------------------------------------------------------------

describe('RunWorkerService.processFile size-cap', () => {
	function makeService(updateImpl: jest.Mock) {
		const runFileRepo = { update: updateImpl };
		// Cast through unknown so we can pass partial repos into the
		// constructor without re-implementing every dependency.
		return new RunWorkerService(
			{} as never,
			runFileRepo as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);
	}

	it('marks oversized files SKIPPED (not FAILED) and counts them as skipped', async () => {
		// Calls `processFile` directly through a typed cast — Jest doesn't
		// expose private members, but the runtime method is callable. This
		// keeps the test free of the full processRun fixture (Box, queue,
		// converters, WPP Open) while pinning the user-visible bug:
		// "file size issues shouldnt be a fail, it should be a skip".
		const update = jest.fn().mockResolvedValue(undefined);
		const service = makeService(update);

		const runFile = { id: 'rf-1' };
		const fileInfo = {
			id: 'box-1',
			name: 'huge.pptx',
			size: 200 * 1024 * 1024, // 200MB > 150MB cap
			extension: 'pptx',
		};

		const result = await (
			service as unknown as {
				processFile: (
					runFile: unknown,
					fileInfo: unknown,
					docs: unknown[],
					ids: string[],
					taskRunId: string,
				) => Promise<'converted' | 'skipped' | 'failed'>;
			}
		).processFile(runFile, fileInfo, [], [], 'run-id');

		expect(result).toBe('skipped');
		expect(update).toHaveBeenCalledWith(
			'rf-1',
			expect.objectContaining({
				status: TaskRunFileStatus.SKIPPED,
				errorMessage: expect.stringContaining('File too large'),
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// collectCompletedBoxFileIds: resume filter source-of-truth
// ---------------------------------------------------------------------------

describe('RunWorkerService.collectCompletedBoxFileIds', () => {
	it('queries task_run_files joined to task_runs, filters by completed status, and returns a Set of boxFileIds', async () => {
		// Pin the SQL shape — the resume filter depends on three things:
		//   (1) join through task_runs on taskId so cross-run completion
		//       contributes (not just current run);
		//   (2) WHERE status = 'completed' so failed/skipped rows do not
		//       accidentally suppress next-run attempts;
		//   (3) DISTINCT boxFileId so duplicates from multiple runs of the
		//       same file collapse into one entry.
		const innerJoin = jest.fn().mockReturnThis();
		const select = jest.fn().mockReturnThis();
		const where = jest.fn().mockReturnThis();
		const getRawMany = jest
			.fn()
			.mockResolvedValue([
				{ boxFileId: 'box-A' },
				{ boxFileId: 'box-B' },
			]);
		const queryBuilder = { innerJoin, select, where, getRawMany };

		const runFileRepo = {
			createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
		};

		const service = new RunWorkerService(
			{} as never,
			runFileRepo as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);

		const result = await (
			service as unknown as {
				collectCompletedBoxFileIds: (
					taskId: string,
				) => Promise<Set<string>>;
			}
		).collectCompletedBoxFileIds('task-id');

		expect(result).toBeInstanceOf(Set);
		expect(result.has('box-A')).toBe(true);
		expect(result.has('box-B')).toBe(true);
		expect(result.size).toBe(2);

		// SQL-shape assertions
		expect(runFileRepo.createQueryBuilder).toHaveBeenCalledWith('file');
		expect(innerJoin).toHaveBeenCalledWith(
			expect.anything(),
			'run',
			expect.stringContaining('"taskId"'),
			{ taskId: 'task-id' },
		);
		expect(select).toHaveBeenCalledWith(
			expect.stringMatching(/DISTINCT.*"boxFileId"/),
			'boxFileId',
		);
		expect(where).toHaveBeenCalledWith(
			'file.status = :status',
			expect.objectContaining({ status: TaskRunFileStatus.COMPLETED }),
		);
	});

	it('returns an empty Set when no prior completions exist', async () => {
		const queryBuilder = {
			innerJoin: jest.fn().mockReturnThis(),
			select: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			getRawMany: jest.fn().mockResolvedValue([]),
		};
		const runFileRepo = {
			createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
		};
		const service = new RunWorkerService(
			{} as never,
			runFileRepo as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);

		const result = await (
			service as unknown as {
				collectCompletedBoxFileIds: (
					taskId: string,
				) => Promise<Set<string>>;
			}
		).collectCompletedBoxFileIds('task-id');

		expect(result.size).toBe(0);
	});
});
