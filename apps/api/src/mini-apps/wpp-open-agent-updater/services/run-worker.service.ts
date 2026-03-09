import {
	Injectable,
	Logger,
	OnModuleInit,
	OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PgBoss from 'pg-boss';

import { PgBossService } from '../../../_platform/queue/pg-boss.service';
import { ConverterFactory } from '../../../_platform/converters';
import { AgentUpdaterJobData } from '../../../_platform/queue/pg-boss.types';
import { TaskRun, TaskRunStatus } from '../entities/task-run.entity';
import {
	TaskRunFile,
	TaskRunFileStatus,
} from '../entities/task-run-file.entity';
import { UpdaterTask } from '../entities/updater-task.entity';
import { WppOpenKnowledgeItem } from '../types/wpp-open.types';

import { BoxService } from './box.service';
import { WppOpenAgentService } from './wpp-open-agent.service';

/** Max file size: 50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Buffer before lastRunAt to avoid missing files (5 minutes) */
const LAST_RUN_BUFFER_MS = 5 * 60 * 1000;

/** Max concurrent file processing within a single run */
const FILE_CONCURRENCY = 4;

@Injectable()
export class RunWorkerService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(RunWorkerService.name);
	private isShuttingDown = false;

	constructor(
		@InjectRepository(TaskRun)
		private readonly runRepo: Repository<TaskRun>,
		@InjectRepository(TaskRunFile)
		private readonly runFileRepo: Repository<TaskRunFile>,
		@InjectRepository(UpdaterTask)
		private readonly taskRepo: Repository<UpdaterTask>,
		private readonly pgBossService: PgBossService,
		private readonly boxService: BoxService,
		private readonly wppOpenAgentService: WppOpenAgentService,
		private readonly converterFactory: ConverterFactory,
	) {}

	async onModuleInit(): Promise<void> {
		await this.pgBossService.workAgentUpdaterQueue(
			(jobs) => this.handleJobs(jobs),
			{ batchSize: 1 },
		);
		this.logger.log('Agent updater worker registered');
	}

	async onModuleDestroy(): Promise<void> {
		this.isShuttingDown = true;
		this.logger.log('Agent updater worker shutting down');
	}

	/**
	 * Handle agent updater jobs from pg-boss.
	 */
	private async handleJobs(
		jobs: PgBoss.Job<AgentUpdaterJobData>[],
	): Promise<void> {
		for (const job of jobs) {
			if (this.isShuttingDown) {
				this.logger.warn('Shutdown in progress, skipping job');
				return;
			}

			try {
				await this.processRun(job.data);
			} catch (error) {
				this.logger.error(
					`Run worker error for ${job.data.taskRunId}:`,
					error,
				);
				await this.failRun(
					job.data.taskRunId,
					error instanceof Error ? error.message : 'Unknown error',
				);
			}
		}
	}

	/**
	 * Execute the full run pipeline.
	 */
	private async processRun(data: AgentUpdaterJobData): Promise<void> {
		const { taskRunId, taskId, boxFolderId, lastRunAt, wppOpenToken } =
			data;

		this.logger.log(`Processing run ${taskRunId} for task ${taskId}`);

		// 1. Update run status to processing
		await this.runRepo.update(taskRunId, {
			status: TaskRunStatus.PROCESSING,
			startedAt: new Date(),
		});

		// 2. List files from Box (with date filter)
		const modifiedAfter = lastRunAt
			? new Date(new Date(lastRunAt).getTime() - LAST_RUN_BUFFER_MS)
			: undefined;

		const files = await this.boxService.listFolderFiles(
			boxFolderId,
			modifiedAfter,
		);

		this.logger.log(
			`Found ${files.length} files to process for run ${taskRunId}`,
		);

		await this.runRepo.update(taskRunId, { filesFound: files.length });

		if (files.length === 0) {
			await this.runRepo.update(taskRunId, {
				status: TaskRunStatus.COMPLETED,
				completedAt: new Date(),
			});
			await this.taskRepo.update(taskId, { lastRunAt: new Date() });
			return;
		}

		// 3. Create TaskRunFile records
		const runFiles = files.map((file) =>
			this.runFileRepo.create({
				taskRunId,
				boxFileId: file.id,
				fileName: file.name,
				fileSize: file.size,
				status: TaskRunFileStatus.PENDING,
			}),
		);
		await this.runFileRepo.save(runFiles);

		// 4. Process files with concurrency limit
		let processed = 0;
		let failed = 0;
		let skipped = 0;
		const knowledgeDocs: WppOpenKnowledgeItem[] = [];

		for (let i = 0; i < runFiles.length; i += FILE_CONCURRENCY) {
			if (this.isShuttingDown) break;

			const batch = runFiles.slice(i, i + FILE_CONCURRENCY);
			const batchFiles = files.slice(i, i + FILE_CONCURRENCY);

			const results = await Promise.allSettled(
				batch.map((runFile, idx) =>
					this.processFile(
						runFile,
						batchFiles[idx],
						wppOpenToken,
						knowledgeDocs,
					),
				),
			);

			for (const result of results) {
				if (result.status === 'fulfilled') {
					if (result.value === 'completed') processed++;
					else if (result.value === 'skipped') skipped++;
					else failed++;
				} else {
					failed++;
				}
			}
		}

		// 5. Upsert knowledge into WPP Open agent (batch all docs at once)
		if (knowledgeDocs.length > 0) {
			try {
				await this.wppOpenAgentService.upsertKnowledge(
					wppOpenToken,
					data.wppOpenProjectId,
					data.wppOpenAgentId,
					knowledgeDocs,
				);
				this.logger.log(
					`Upserted ${knowledgeDocs.length} docs into agent ${data.wppOpenAgentId}`,
				);
			} catch (error) {
				this.logger.error(
					`Failed to upsert knowledge for run ${taskRunId}:`,
					error,
				);
				// Mark all as failed if the final upsert fails
				failed += processed;
				processed = 0;
			}
		}

		// 6. Finalize run
		const finalStatus =
			processed > 0 ? TaskRunStatus.COMPLETED : TaskRunStatus.FAILED;

		await this.runRepo.update(taskRunId, {
			status: finalStatus,
			completedAt: new Date(),
			filesProcessed: processed,
			filesFailed: failed,
			filesSkipped: skipped,
			errorMessage:
				finalStatus === TaskRunStatus.FAILED
					? 'No files were successfully processed'
					: null,
		});

		// 7. Update task's lastRunAt
		await this.taskRepo.update(taskId, { lastRunAt: new Date() });

		this.logger.log(
			`Run ${taskRunId} completed: ${processed} processed, ${failed} failed, ${skipped} skipped`,
		);
	}

	/**
	 * Process a single file: download, convert, collect for knowledge upsert.
	 * Returns 'completed', 'skipped', or 'failed'.
	 */
	private async processFile(
		runFile: TaskRunFile,
		fileInfo: { id: string; name: string; size: number; extension: string },
		_wppOpenToken: string,
		knowledgeDocs: WppOpenKnowledgeItem[],
	): Promise<'completed' | 'skipped' | 'failed'> {
		try {
			// Size check
			if (fileInfo.size > MAX_FILE_SIZE) {
				await this.runFileRepo.update(runFile.id, {
					status: TaskRunFileStatus.FAILED,
					errorMessage: 'File too large (>50MB)',
					processedAt: new Date(),
				});
				return 'skipped';
			}

			// Download
			await this.runFileRepo.update(runFile.id, {
				status: TaskRunFileStatus.DOWNLOADING,
			});
			const buffer = await this.boxService.downloadFile(fileInfo.id);

			// Convert
			await this.runFileRepo.update(runFile.id, {
				status: TaskRunFileStatus.CONVERTING,
			});
			const result = await this.converterFactory.convert(
				buffer,
				fileInfo.extension,
			);

			// Collect for batch upsert
			await this.runFileRepo.update(runFile.id, {
				status: TaskRunFileStatus.UPLOADING,
			});
			knowledgeDocs.push({
				title: fileInfo.name,
				content: result.content,
				source: `box://${fileInfo.id}`,
			});

			// Mark completed
			await this.runFileRepo.update(runFile.id, {
				status: TaskRunFileStatus.COMPLETED,
				processedAt: new Date(),
			});

			return 'completed';
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`Failed to process file ${fileInfo.name}: ${message}`,
			);
			await this.runFileRepo.update(runFile.id, {
				status: TaskRunFileStatus.FAILED,
				errorMessage: message,
				processedAt: new Date(),
			});
			return 'failed';
		}
	}

	/**
	 * Mark a run as failed with an error message.
	 */
	private async failRun(runId: string, errorMessage: string): Promise<void> {
		await this.runRepo.update(runId, {
			status: TaskRunStatus.FAILED,
			completedAt: new Date(),
			errorMessage,
		});
	}
}
