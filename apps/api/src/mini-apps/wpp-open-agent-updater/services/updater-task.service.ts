import {
	Injectable,
	Logger,
	NotFoundException,
	ConflictException,
	BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PgBossService } from '../../../_platform/queue/pg-boss.service';
import {
	UpdaterTask,
	UpdaterTaskStatus,
} from '../entities/updater-task.entity';
import { TaskRun, TaskRunStatus } from '../entities/task-run.entity';
import { CreateTaskDto } from '../dtos/create-task.dto';
import { UpdateTaskDto } from '../dtos/update-task.dto';
import { WppOpenOsContext } from '../types/wpp-open.types';

import { BoxService } from './box.service';
import { WppOpenAgentService } from './wpp-open-agent.service';

@Injectable()
export class UpdaterTaskService {
	private readonly logger = new Logger(UpdaterTaskService.name);

	constructor(
		@InjectRepository(UpdaterTask)
		private readonly taskRepo: Repository<UpdaterTask>,
		@InjectRepository(TaskRun)
		private readonly runRepo: Repository<TaskRun>,
		private readonly boxService: BoxService,
		private readonly pgBossService: PgBossService,
		private readonly wppOpenAgentService: WppOpenAgentService,
	) {}

	/**
	 * Create a new updater task.
	 * Validates the Box folder exists before saving.
	 */
	async createTask(
		dto: CreateTaskDto,
		userId: string,
		orgId: string,
	): Promise<UpdaterTask> {
		// Validate Box folder
		const folderInfo = await this.boxService.validateFolder(
			dto.boxFolderId,
		);

		// Capture the agent's CS-internal owning project. Worker uses this
		// for getAgentConfig because CS's listAgents is loose-scoped while
		// getAgentConfig is strict-scoped.
		//
		// Preference order:
		//   1. Explicit `dto.wppOpenAgentProjectId` from the frontend (when
		//      CS surfaced it on the listAgents response). This is correct
		//      regardless of which workspace the user is currently in.
		//   2. Fall back to resolving from the user's osContext — only
		//      correct when the user IS in the agent's home workspace.
		const wppOpenAgentProjectId =
			dto.wppOpenAgentProjectId ??
			(await this.resolveAgentProjectId(
				dto.wppOpenToken,
				dto.osContext as WppOpenOsContext | undefined,
			));

		const task = this.taskRepo.create({
			name: dto.name,
			boxFolderId: dto.boxFolderId,
			boxFolderName: folderInfo.name,
			wppOpenAgentId: dto.wppOpenAgentId,
			wppOpenProjectId: dto.wppOpenProjectId,
			wppOpenAgentProjectId,
			wppOpenAgentName: dto.wppOpenAgentName,
			fileExtensions: dto.fileExtensions,
			includeSubfolders: dto.includeSubfolders,
			cadence: dto.cadence,
			createdById: userId,
			organizationId: orgId,
		});

		const saved = await this.taskRepo.save(task);
		this.logger.log(
			`Task created: ${saved.id} (${saved.name}) | agentProject: ${wppOpenAgentProjectId ?? '(unresolved — worker will fall back to wppOpenProjectId)'}`,
		);
		return saved;
	}

	/**
	 * Resolve the CS-internal owning project for the agent picker's current
	 * osContext. Returns `null` on any failure — saving the task should not
	 * be blocked by a transient resolution error; the worker falls back to
	 * `wppOpenProjectId`.
	 */
	private async resolveAgentProjectId(
		token: string | undefined,
		osContext: WppOpenOsContext | undefined,
	): Promise<string | null> {
		if (!token || !osContext) return null;
		try {
			return await this.wppOpenAgentService.resolveProjectId(
				token,
				osContext,
			);
		} catch (error) {
			this.logger.warn(
				`Agent project resolution failed (will fall back to wppOpenProjectId): ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return null;
		}
	}

	/**
	 * List all tasks for an organization.
	 */
	async listTasks(orgId: string): Promise<UpdaterTask[]> {
		return this.taskRepo.find({
			where: { organizationId: orgId },
			order: { createdAt: 'DESC' },
		});
	}

	/**
	 * Get a single task by ID, scoped to org.
	 */
	async getTask(id: string, orgId: string): Promise<UpdaterTask> {
		const task = await this.taskRepo.findOne({
			where: { id, organizationId: orgId },
		});

		if (!task) {
			throw new NotFoundException(`Task ${id} not found`);
		}

		return task;
	}

	/**
	 * Update a task's configuration.
	 */
	async updateTask(
		id: string,
		dto: UpdateTaskDto,
		orgId: string,
	): Promise<UpdaterTask> {
		const task = await this.getTask(id, orgId);

		if (task.status === UpdaterTaskStatus.ARCHIVED) {
			throw new BadRequestException('Cannot update an archived task');
		}

		if (dto.status !== undefined) {
			if (dto.status === UpdaterTaskStatus.ARCHIVED) {
				throw new BadRequestException(
					'Use the delete endpoint to archive a task',
				);
			}
			task.status = dto.status;
		}

		if (dto.name !== undefined) task.name = dto.name;
		if (dto.fileExtensions !== undefined)
			task.fileExtensions = dto.fileExtensions;
		if (dto.includeSubfolders !== undefined)
			task.includeSubfolders = dto.includeSubfolders;
		if (dto.cadence !== undefined) task.cadence = dto.cadence;

		// Re-pointing project / agent: re-resolve the agent's owning project
		// from the user's current osContext so the worker stops using the
		// stale value. Only re-resolve when the user is actually changing
		// project or agent — name-only updates leave the resolution alone.
		const projectChanged =
			dto.wppOpenProjectId !== undefined &&
			dto.wppOpenProjectId !== task.wppOpenProjectId;
		const agentChanged =
			dto.wppOpenAgentId !== undefined &&
			dto.wppOpenAgentId !== task.wppOpenAgentId;

		if (dto.wppOpenProjectId !== undefined)
			task.wppOpenProjectId = dto.wppOpenProjectId;
		if (dto.wppOpenAgentId !== undefined)
			task.wppOpenAgentId = dto.wppOpenAgentId;
		if (dto.wppOpenAgentName !== undefined)
			task.wppOpenAgentName = dto.wppOpenAgentName;

		// An explicit dto.wppOpenAgentProjectId is authoritative — apply it
		// even when project/agent didn't change. Lets a user re-save the
		// same agent to fix a previously-stored stale value (which is exactly
		// what happens after the v59→v60 chain of fixes).
		if (dto.wppOpenAgentProjectId !== undefined) {
			task.wppOpenAgentProjectId = dto.wppOpenAgentProjectId;
			this.logger.log(
				`Task ${id} agentProject set explicitly: ${dto.wppOpenAgentProjectId}`,
			);
		} else if (projectChanged || agentChanged) {
			if (dto.wppOpenToken && dto.osContext) {
				// Caller supplied auth context — re-resolve. Whatever
				// resolveAgentProjectId returns (string or null) is the new
				// authoritative value. Only correct when the user IS in the
				// agent's home workspace.
				task.wppOpenAgentProjectId = await this.resolveAgentProjectId(
					dto.wppOpenToken,
					dto.osContext as WppOpenOsContext | undefined,
				);
			} else {
				// Caller didn't send auth context (CLI, programmatic update).
				// Any prior resolution is now stale — null it so the worker
				// falls back to the new wppOpenProjectId rather than
				// confidently using a wrong CS-internal id.
				task.wppOpenAgentProjectId = null;
			}
			this.logger.log(
				`Task ${id} re-pointed | new agentProject: ${task.wppOpenAgentProjectId ?? '(unresolved — worker will fall back to wppOpenProjectId)'}`,
			);
		}

		return this.taskRepo.save(task);
	}

	/**
	 * Soft-delete a task by archiving it.
	 */
	async deleteTask(id: string, orgId: string): Promise<void> {
		const task = await this.getTask(id, orgId);
		task.status = UpdaterTaskStatus.ARCHIVED;
		await this.taskRepo.save(task);

		await this.runRepo
			.createQueryBuilder()
			.update(TaskRun)
			.set({
				status: TaskRunStatus.CANCELLED,
				completedAt: new Date(),
				errorMessage: 'Task was archived',
			})
			.where('taskId = :taskId', { taskId: id })
			.andWhere('status IN (:...statuses)', {
				statuses: [TaskRunStatus.PENDING, TaskRunStatus.PROCESSING],
			})
			.execute();

		this.logger.log(`Task archived: ${id}`);
	}

	/**
	 * Trigger a manual run for a task.
	 * Validates no active run exists, creates a TaskRun,
	 * and sends the job to the pg-boss queue.
	 */
	async triggerRun(
		taskId: string,
		userId: string,
		orgId: string,
		wppOpenToken: string,
		osContext?: WppOpenOsContext,
	): Promise<TaskRun> {
		const task = await this.getTask(taskId, orgId);

		if (task.status !== UpdaterTaskStatus.ACTIVE) {
			throw new BadRequestException(
				`Task is ${task.status}, must be active to run`,
			);
		}

		// Check for active runs (both pending and processing)
		const activeRun = await this.runRepo.findOne({
			where: [
				{ taskId, status: TaskRunStatus.PENDING },
				{ taskId, status: TaskRunStatus.PROCESSING },
			],
		});

		if (activeRun) {
			throw new ConflictException(
				`Task already has an active run: ${activeRun.id} (${activeRun.status})`,
			);
		}

		// Pre-flight: catch failure modes the worker would hit *before*
		// queuing a job. Both typed errors are HttpExceptions, so they
		// bubble up unchanged and the UI gets an actionable message.
		//
		//   listAgents(wppOpenProjectId)  — workspace/project access (403)
		//   getAgentConfig(agentProjectId, agentId) — strict pair check (400)
		//
		// The two checks intentionally use different projectIds: CS treats
		// listAgents loosely (broader scope) and getAgentConfig strictly,
		// which is exactly the inconsistency this validates against.
		await this.wppOpenAgentService.listAgents(
			wppOpenToken,
			task.wppOpenProjectId,
			osContext,
		);
		await this.wppOpenAgentService.getAgentConfig(
			wppOpenToken,
			task.wppOpenAgentProjectId || task.wppOpenProjectId,
			task.wppOpenAgentId,
			osContext,
		);

		// Create the run record
		const run = this.runRepo.create({
			taskId,
			triggeredById: userId,
			organizationId: orgId,
			status: TaskRunStatus.PENDING,
		});

		const savedRun = await this.runRepo.save(run);

		// Send to pg-boss queue
		await this.pgBossService.sendAgentUpdaterJob({
			taskRunId: savedRun.id,
			taskId: task.id,
			boxFolderId: task.boxFolderId,
			wppOpenAgentId: task.wppOpenAgentId,
			wppOpenProjectId: task.wppOpenProjectId,
			wppOpenAgentProjectId: task.wppOpenAgentProjectId,
			userId,
			organizationId: orgId,
			lastRunAt: task.lastRunAt?.toISOString() || null,
			wppOpenToken,
			osContext,
			fileExtensions: task.fileExtensions,
			includeSubfolders: task.includeSubfolders,
		});

		this.logger.log(`Run triggered: ${savedRun.id} for task ${taskId}`);
		return savedRun;
	}

	/**
	 * List runs for a task, most recent first.
	 */
	async listRuns(taskId: string, orgId: string): Promise<TaskRun[]> {
		// Verify task access
		await this.getTask(taskId, orgId);

		return this.runRepo.find({
			where: { taskId },
			order: { createdAt: 'DESC' },
			take: 50,
		});
	}

	/**
	 * Get a single run with file details.
	 */
	async getRun(runId: string, orgId: string): Promise<TaskRun> {
		const run = await this.runRepo.findOne({
			where: { id: runId, organizationId: orgId },
			relations: ['task', 'files'],
		});

		if (!run) {
			throw new NotFoundException(`Run ${runId} not found`);
		}

		return run;
	}
}
