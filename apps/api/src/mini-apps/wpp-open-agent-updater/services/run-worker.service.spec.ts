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
