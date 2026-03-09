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

import { BoxService } from './box.service';

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

		const task = this.taskRepo.create({
			name: dto.name,
			boxFolderId: dto.boxFolderId,
			boxFolderName: folderInfo.name,
			wppOpenAgentId: dto.wppOpenAgentId,
			wppOpenProjectId: dto.wppOpenProjectId,
			createdById: userId,
			organizationId: orgId,
		});

		const saved = await this.taskRepo.save(task);
		this.logger.log(`Task created: ${saved.id} (${saved.name})`);
		return saved;
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

		if (dto.name !== undefined) task.name = dto.name;
		if (dto.status !== undefined) task.status = dto.status;

		return this.taskRepo.save(task);
	}

	/**
	 * Soft-delete a task by archiving it.
	 */
	async deleteTask(id: string, orgId: string): Promise<void> {
		const task = await this.getTask(id, orgId);
		task.status = UpdaterTaskStatus.ARCHIVED;
		await this.taskRepo.save(task);
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
	): Promise<TaskRun> {
		const task = await this.getTask(taskId, orgId);

		if (task.status !== UpdaterTaskStatus.ACTIVE) {
			throw new BadRequestException(
				`Task is ${task.status}, must be active to run`,
			);
		}

		// Check for active runs
		const activeRun = await this.runRepo.findOne({
			where: {
				taskId,
				status: TaskRunStatus.PROCESSING,
			},
		});

		if (activeRun) {
			throw new ConflictException(
				`Task already has an active run: ${activeRun.id}`,
			);
		}

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
			userId,
			organizationId: orgId,
			lastRunAt: task.lastRunAt?.toISOString() || null,
			wppOpenToken,
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
			relations: ['task'],
		});

		if (!run) {
			throw new NotFoundException(`Run ${runId} not found`);
		}

		return run;
	}
}
