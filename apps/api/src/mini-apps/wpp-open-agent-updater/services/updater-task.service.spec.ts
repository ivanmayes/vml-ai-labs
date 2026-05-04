import { ForbiddenException, BadRequestException } from '@nestjs/common';

import {
	UpdaterTask,
	UpdaterTaskStatus,
} from '../entities/updater-task.entity';
import { TaskRun } from '../entities/task-run.entity';
import { WppOpenOsContext } from '../types/wpp-open.types';
import { PgBossService } from '../../../_platform/queue/pg-boss.service';

import { UpdaterTaskService } from './updater-task.service';
import {
	WppOpenAgentService,
	WppOpenAgentMismatchError,
	WppOpenPermissionError,
} from './wpp-open-agent.service';
import { BoxService } from './box.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<UpdaterTask> = {}): UpdaterTask {
	return Object.assign(new UpdaterTask(), {
		id: 'task-id',
		name: 'Test Task',
		boxFolderId: 'box-folder-id',
		boxFolderName: 'Folder',
		wppOpenAgentId: 'agent-id',
		wppOpenAgentName: 'Agent',
		wppOpenProjectId: '4zBQjXPNiqDP8UDGSc1Zg',
		wppOpenAgentProjectId: 'UpzobLayjowdnfzZdorWo',
		status: UpdaterTaskStatus.ACTIVE,
		fileExtensions: ['pptx'],
		includeSubfolders: true,
		cadence: 'manual',
		lastRunAt: null,
		createdById: 'user-id',
		organizationId: 'org-id',
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	} as UpdaterTask);
}

function makeService(
	deps: {
		task?: UpdaterTask;
		listAgentsImpl?: jest.Mock;
		getAgentConfigImpl?: jest.Mock;
		resolveProjectIdImpl?: jest.Mock;
		saveImpl?: jest.Mock;
		findOneImpl?: jest.Mock;
		sendJobImpl?: jest.Mock;
		createRunImpl?: jest.Mock;
		saveRunImpl?: jest.Mock;
		findRunImpl?: jest.Mock;
	} = {},
) {
	const task = deps.task ?? makeTask();
	const taskRepo = {
		findOne: deps.findOneImpl ?? jest.fn().mockResolvedValue(task),
		save: deps.saveImpl ?? jest.fn().mockImplementation((t) => t),
		create: jest
			.fn()
			.mockImplementation((data) =>
				Object.assign(new UpdaterTask(), data),
			),
	};

	const runRepo = {
		findOne: deps.findRunImpl ?? jest.fn().mockResolvedValue(null),
		create:
			deps.createRunImpl ??
			jest
				.fn()
				.mockImplementation((data) =>
					Object.assign(new TaskRun(), data),
				),
		save:
			deps.saveRunImpl ??
			jest.fn().mockImplementation((r) => ({ ...r, id: 'run-id' })),
		createQueryBuilder: jest.fn(),
	};

	const boxService = {
		validateFolder: jest
			.fn()
			.mockResolvedValue({ name: 'Folder', fileCount: 1 }),
	} as unknown as BoxService;

	const pgBossService = {
		sendAgentUpdaterJob:
			deps.sendJobImpl ?? jest.fn().mockResolvedValue(undefined),
	} as unknown as PgBossService;

	const wppOpenAgentService = {
		listAgents: deps.listAgentsImpl ?? jest.fn().mockResolvedValue([]),
		getAgentConfig:
			deps.getAgentConfigImpl ?? jest.fn().mockResolvedValue({}),
		resolveProjectId:
			deps.resolveProjectIdImpl ??
			jest.fn().mockResolvedValue('resolved-id'),
	} as unknown as WppOpenAgentService;

	const service = new UpdaterTaskService(
		taskRepo as never,
		runRepo as never,
		boxService,
		pgBossService,
		wppOpenAgentService,
	);
	return {
		service,
		task,
		taskRepo,
		runRepo,
		wppOpenAgentService,
		pgBossService,
	};
}

const osContext: WppOpenOsContext = {
	hierarchy: { azId: 'h-az' },
	project: { azId: 'p-az', id: 'p-id', name: 'P' },
};

// ---------------------------------------------------------------------------
// updateTask resolution behavior
// ---------------------------------------------------------------------------

describe('UpdaterTaskService.updateTask', () => {
	it('re-resolves wppOpenAgentProjectId when caller supplies token + osContext', async () => {
		const resolveProjectIdImpl = jest
			.fn()
			.mockResolvedValue('NEW-RESOLVED');
		const { service } = makeService({ resolveProjectIdImpl });

		const updated = await service.updateTask(
			'task-id',
			{
				wppOpenAgentId: 'new-agent',
				wppOpenToken: 'tok',
				osContext: osContext as unknown,
			},
			'org-id',
		);

		expect(resolveProjectIdImpl).toHaveBeenCalledWith('tok', osContext);
		expect(updated.wppOpenAgentProjectId).toBe('NEW-RESOLVED');
	});

	it('does NOT call resolveProjectId when caller omits osContext', async () => {
		const resolveProjectIdImpl = jest.fn();
		const { service } = makeService({ resolveProjectIdImpl });

		const updated = await service.updateTask(
			'task-id',
			{ wppOpenAgentId: 'new-agent' },
			'org-id',
		);

		expect(resolveProjectIdImpl).not.toHaveBeenCalled();
		// Stale prior value is nulled so the worker falls back rather than
		// confidently using the old (now-stale) resolution.
		expect(updated.wppOpenAgentProjectId).toBeNull();
	});

	it('nulls wppOpenAgentProjectId when resolveProjectId throws', async () => {
		const resolveProjectIdImpl = jest
			.fn()
			.mockRejectedValue(new Error('boom'));
		const { service } = makeService({ resolveProjectIdImpl });

		const updated = await service.updateTask(
			'task-id',
			{
				wppOpenProjectId: '4zBQjXPNiqDP8UDGSc1Zg',
				wppOpenAgentId: 'new-agent',
				wppOpenToken: 'tok',
				osContext: osContext as unknown,
			},
			'org-id',
		);

		expect(resolveProjectIdImpl).toHaveBeenCalled();
		expect(updated.wppOpenAgentProjectId).toBeNull();
	});

	it('leaves wppOpenAgentProjectId untouched when only the name changes', async () => {
		const resolveProjectIdImpl = jest.fn();
		const { service, task } = makeService({ resolveProjectIdImpl });
		const original = task.wppOpenAgentProjectId;

		const updated = await service.updateTask(
			'task-id',
			{ name: 'Renamed' },
			'org-id',
		);

		expect(resolveProjectIdImpl).not.toHaveBeenCalled();
		expect(updated.wppOpenAgentProjectId).toBe(original);
	});

	it('re-resolves when only the agent changes (project unchanged)', async () => {
		const resolveProjectIdImpl = jest
			.fn()
			.mockResolvedValue('AGENT-OWNING');
		const { service } = makeService({ resolveProjectIdImpl });

		const updated = await service.updateTask(
			'task-id',
			{
				wppOpenAgentId: 'different-agent',
				wppOpenToken: 'tok',
				osContext: osContext as unknown,
			},
			'org-id',
		);

		expect(resolveProjectIdImpl).toHaveBeenCalled();
		expect(updated.wppOpenAgentProjectId).toBe('AGENT-OWNING');
	});

	it('prefers dto.wppOpenAgentProjectId from the frontend over osContext resolution', async () => {
		// When the frontend sends an explicit owning-project (because CS
		// surfaced it on listAgents), the service must use it directly and
		// NOT call resolveProjectId — that's the whole point: works from
		// any workspace.
		const resolveProjectIdImpl = jest
			.fn()
			.mockResolvedValue('would-be-wrong');
		const { service } = makeService({ resolveProjectIdImpl });

		const updated = await service.updateTask(
			'task-id',
			{
				wppOpenAgentId: 'new-agent',
				wppOpenAgentProjectId: 'EXPLICIT-FROM-LIST-AGENTS',
				wppOpenToken: 'tok',
				osContext: osContext as unknown,
			},
			'org-id',
		);

		expect(resolveProjectIdImpl).not.toHaveBeenCalled();
		expect(updated.wppOpenAgentProjectId).toBe('EXPLICIT-FROM-LIST-AGENTS');
	});

	it('rejects updates on archived tasks', async () => {
		const archived = makeTask({ status: UpdaterTaskStatus.ARCHIVED });
		const { service } = makeService({ task: archived });

		await expect(
			service.updateTask('task-id', { name: 'x' }, 'org-id'),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});

// ---------------------------------------------------------------------------
// triggerRun pre-flight behavior
// ---------------------------------------------------------------------------

describe('UpdaterTaskService.triggerRun pre-flight', () => {
	it('runs both listAgents and getAgentConfig before enqueueing', async () => {
		const listAgentsImpl = jest.fn().mockResolvedValue([]);
		const getAgentConfigImpl = jest.fn().mockResolvedValue({});
		const sendJobImpl = jest.fn().mockResolvedValue(undefined);
		const { service } = makeService({
			listAgentsImpl,
			getAgentConfigImpl,
			sendJobImpl,
		});

		await service.triggerRun(
			'task-id',
			'user-id',
			'org-id',
			'tok',
			osContext,
		);

		expect(listAgentsImpl).toHaveBeenCalledTimes(1);
		expect(getAgentConfigImpl).toHaveBeenCalledTimes(1);
		// Pair check uses the resolved agentProjectId, not the user-facing one.
		expect(getAgentConfigImpl.mock.calls[0][1]).toBe(
			'UpzobLayjowdnfzZdorWo',
		);
		expect(sendJobImpl).toHaveBeenCalledTimes(1);
	});

	it('falls back to wppOpenProjectId for getAgentConfig when wppOpenAgentProjectId is null (legacy task)', async () => {
		const listAgentsImpl = jest.fn().mockResolvedValue([]);
		const getAgentConfigImpl = jest.fn().mockResolvedValue({});
		const legacyTask = makeTask({ wppOpenAgentProjectId: null });
		const { service } = makeService({
			task: legacyTask,
			listAgentsImpl,
			getAgentConfigImpl,
		});

		await service.triggerRun(
			'task-id',
			'user-id',
			'org-id',
			'tok',
			osContext,
		);

		expect(getAgentConfigImpl.mock.calls[0][1]).toBe(
			'4zBQjXPNiqDP8UDGSc1Zg',
		);
	});

	it('does NOT enqueue when listAgents throws WppOpenPermissionError', async () => {
		const listAgentsImpl = jest
			.fn()
			.mockRejectedValue(new WppOpenPermissionError('p'));
		const getAgentConfigImpl = jest.fn();
		const sendJobImpl = jest.fn();
		const { service } = makeService({
			listAgentsImpl,
			getAgentConfigImpl,
			sendJobImpl,
		});

		await expect(
			service.triggerRun(
				'task-id',
				'user-id',
				'org-id',
				'tok',
				osContext,
			),
		).rejects.toBeInstanceOf(WppOpenPermissionError);

		expect(getAgentConfigImpl).not.toHaveBeenCalled();
		expect(sendJobImpl).not.toHaveBeenCalled();
	});

	it('does NOT enqueue when getAgentConfig throws WppOpenAgentMismatchError', async () => {
		const listAgentsImpl = jest.fn().mockResolvedValue([]);
		const getAgentConfigImpl = jest
			.fn()
			.mockRejectedValue(new WppOpenAgentMismatchError('p', 'a'));
		const sendJobImpl = jest.fn();
		const { service } = makeService({
			listAgentsImpl,
			getAgentConfigImpl,
			sendJobImpl,
		});

		await expect(
			service.triggerRun(
				'task-id',
				'user-id',
				'org-id',
				'tok',
				osContext,
			),
		).rejects.toBeInstanceOf(WppOpenAgentMismatchError);

		expect(sendJobImpl).not.toHaveBeenCalled();
	});

	it('confirms WppOpenPermissionError surfaces as 403 (HttpException) — not 500', async () => {
		const listAgentsImpl = jest
			.fn()
			.mockRejectedValue(new WppOpenPermissionError('p'));
		const { service } = makeService({ listAgentsImpl });

		try {
			await service.triggerRun(
				'task-id',
				'user-id',
				'org-id',
				'tok',
				osContext,
			);
			fail('expected throw');
		} catch (err) {
			// WppOpenPermissionError extends HttpException(403) — covers the
			// "use ForbiddenException" requirement without an extra translation.
			expect((err as ForbiddenException).getStatus()).toBe(403);
		}
	});
});
