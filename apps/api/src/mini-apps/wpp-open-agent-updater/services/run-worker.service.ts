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
				try {
					await this.failRun(
						job.data.taskRunId,
						error instanceof Error
							? error.message
							: 'Unknown error',
					);
				} catch (failError) {
					this.logger.error(
						`Failed to mark run ${job.data.taskRunId} as failed:`,
						failError,
					);
				}
			}
		}
	}

	/**
	 * Execute the full run pipeline.
	 */
	private async processRun(data: AgentUpdaterJobData): Promise<void> {
		const {
			taskRunId,
			taskId,
			boxFolderId,
			lastRunAt,
			wppOpenToken,
			osContext,
			fileExtensions = ['docx', 'pdf', 'pptx', 'xlsx'],
			includeSubfolders = true,
		} = data;

		this.logger.log(
			`[run:${taskRunId}] Starting run for task ${taskId} | folder: ${boxFolderId} | extensions: ${fileExtensions.join(',')} | subfolders: ${includeSubfolders}`,
		);

		// 1. Update run status to processing
		await this.runRepo.update(taskRunId, {
			status: TaskRunStatus.PROCESSING,
			startedAt: new Date(),
		});

		// 2. Validate WPP Open token before doing any work
		this.logger.log(
			`[run:${taskRunId}] Validating WPP Open token for project ${data.wppOpenProjectId}`,
		);
		try {
			const agents = await this.wppOpenAgentService.listAgents(
				wppOpenToken,
				data.wppOpenProjectId,
				osContext,
			);
			this.logger.log(
				`[run:${taskRunId}] Token valid — found ${agents.length} agents`,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`[run:${taskRunId}] Token validation failed: ${message}`,
			);
			throw new Error(`WPP Open token validation failed: ${message}`);
		}

		// 3. List files from Box (with date filter)
		const modifiedAfter = lastRunAt
			? new Date(new Date(lastRunAt).getTime() - LAST_RUN_BUFFER_MS)
			: undefined;

		const supportedExtensions = new Set(['docx', 'pdf', 'pptx', 'xlsx']);
		const safeExtensions = fileExtensions.filter((ext) =>
			supportedExtensions.has(ext),
		);

		const { files, totalSeen, skippedByDate } =
			await this.boxService.listFolderFiles(boxFolderId, {
				modifiedAfter,
				extensions:
					safeExtensions.length > 0 ? safeExtensions : undefined,
				includeSubfolders,
			});

		this.logger.log(
			`[run:${taskRunId}] Box scan complete: ${totalSeen} total, ${files.length} new/modified, ${skippedByDate} skipped by date`,
		);

		await this.runRepo.update(taskRunId, {
			filesFound: files.length,
			filesSkipped: skippedByDate,
		});

		if (files.length === 0) {
			await this.runRepo.update(taskRunId, {
				status: TaskRunStatus.COMPLETED,
				completedAt: new Date(),
				filesSkipped: skippedByDate,
			});
			await this.taskRepo.update(taskId, { lastRunAt: new Date() });
			return;
		}

		// 4. Create TaskRunFile records
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

		// 5. Process files with concurrency limit
		let converted = 0;
		let failed = 0;
		let skipped = 0;
		const knowledgeDocs: WppOpenKnowledgeItem[] = [];
		const totalFiles = runFiles.length;
		const totalBatches = Math.ceil(totalFiles / FILE_CONCURRENCY);

		this.logger.log(
			`[run:${taskRunId}] Starting file processing: ${totalFiles} files in ${totalBatches} batches (concurrency: ${FILE_CONCURRENCY})`,
		);

		for (let i = 0; i < runFiles.length; i += FILE_CONCURRENCY) {
			if (this.isShuttingDown) {
				this.logger.warn(
					`[run:${taskRunId}] Shutdown requested, stopping at file ${i}/${totalFiles}`,
				);
				break;
			}

			const batchNum = Math.floor(i / FILE_CONCURRENCY) + 1;
			const batch = runFiles.slice(i, i + FILE_CONCURRENCY);
			const batchFiles = files.slice(i, i + FILE_CONCURRENCY);

			this.logger.log(
				`[run:${taskRunId}] Batch ${batchNum}/${totalBatches} — files ${i + 1}-${Math.min(i + FILE_CONCURRENCY, totalFiles)}/${totalFiles} | progress: ${converted} converted, ${failed} failed, ${skipped} skipped`,
			);

			const results = await Promise.allSettled(
				batch.map((runFile, idx) =>
					this.processFile(
						runFile,
						batchFiles[idx],
						knowledgeDocs,
						taskRunId,
					),
				),
			);

			for (const result of results) {
				if (result.status === 'fulfilled') {
					if (result.value === 'converted') {
						converted++;
					} else if (result.value === 'skipped') {
						skipped++;
					} else {
						failed++;
					}
				} else {
					failed++;
					this.logger.error(
						`[run:${taskRunId}] Unexpected batch rejection: ${result.reason}`,
					);
				}
			}
		}

		this.logger.log(
			`[run:${taskRunId}] File processing complete: ${converted} converted, ${failed} failed, ${skipped} skipped, ${knowledgeDocs.length} docs ready for upsert`,
		);

		// 6. Upsert knowledge into WPP Open agent (batch all docs at once)
		let upsertError: string | null = null;
		let processed = 0;
		if (knowledgeDocs.length > 0) {
			this.logger.log(
				`[run:${taskRunId}] Upserting ${knowledgeDocs.length} docs into agent ${data.wppOpenAgentId} (total content: ${Math.round(knowledgeDocs.reduce((sum, d) => sum + d.content.length, 0) / 1024)}KB)`,
			);
			try {
				await this.wppOpenAgentService.upsertKnowledge(
					wppOpenToken,
					data.wppOpenProjectId,
					data.wppOpenAgentId,
					knowledgeDocs,
					osContext,
				);
				this.logger.log(
					`[run:${taskRunId}] Upsert successful — ${knowledgeDocs.length} docs into agent ${data.wppOpenAgentId}`,
				);
				processed = converted;

				await this.runFileRepo
					.createQueryBuilder()
					.update(TaskRunFile)
					.set({
						status: TaskRunFileStatus.COMPLETED,
						processedAt: new Date(),
					})
					.where('taskRunId = :taskRunId', { taskRunId })
					.andWhere('status = :status', {
						status: TaskRunFileStatus.CONVERTING,
					})
					.execute();
			} catch (error) {
				upsertError =
					error instanceof Error ? error.message : 'Unknown error';
				this.logger.error(
					`[run:${taskRunId}] Upsert FAILED: ${upsertError}`,
				);
				failed += converted;

				await this.runFileRepo
					.createQueryBuilder()
					.update(TaskRunFile)
					.set({
						status: TaskRunFileStatus.FAILED,
						errorMessage: `Knowledge upsert failed: ${upsertError}`,
					})
					.where('taskRunId = :taskRunId', { taskRunId })
					.andWhere('status = :status', {
						status: TaskRunFileStatus.CONVERTING,
					})
					.execute();
			}
		}

		// 7. Finalize run
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
					? upsertError
						? `Knowledge upsert failed: ${upsertError}`
						: 'No files were successfully processed'
					: null,
		});

		// 8. Update task's lastRunAt only on successful completion
		if (finalStatus === TaskRunStatus.COMPLETED) {
			await this.taskRepo.update(taskId, { lastRunAt: new Date() });
		}

		this.logger.log(
			`[run:${taskRunId}] Run ${finalStatus}: ${processed} processed, ${failed} failed, ${skipped} skipped`,
		);
	}

	/**
	 * Process a single file: download, convert, collect for knowledge upsert.
	 * Returns 'converted', 'skipped', or 'failed'.
	 *
	 * Files that complete conversion are left at CONVERTING status.
	 * The caller is responsible for marking them COMPLETED or FAILED
	 * after the batch upsert to WPP Open succeeds or fails.
	 */
	private async processFile(
		runFile: TaskRunFile,
		fileInfo: { id: string; name: string; size: number; extension: string },
		knowledgeDocs: WppOpenKnowledgeItem[],
		taskRunId: string,
	): Promise<'converted' | 'skipped' | 'failed'> {
		const fileLabel = `${fileInfo.name} (${(fileInfo.size / 1024 / 1024).toFixed(1)}MB)`;
		try {
			// Size check
			if (fileInfo.size > MAX_FILE_SIZE) {
				this.logger.warn(
					`[run:${taskRunId}] SKIP ${fileLabel} — exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
				);
				await this.runFileRepo.update(runFile.id, {
					status: TaskRunFileStatus.FAILED,
					errorMessage: `File too large (${Math.round(fileInfo.size / 1024 / 1024)}MB exceeds 50MB limit)`,
					processedAt: new Date(),
				});
				return 'skipped';
			}

			// Download
			this.logger.log(`[run:${taskRunId}] Downloading ${fileLabel}`);
			await this.runFileRepo.update(runFile.id, {
				status: TaskRunFileStatus.DOWNLOADING,
			});
			const buffer = await this.boxService.downloadFile(fileInfo.id);
			this.logger.log(
				`[run:${taskRunId}] Downloaded ${fileInfo.name} (${buffer.length} bytes)`,
			);

			// Convert (status stays at CONVERTING until batch upsert resolves)
			await this.runFileRepo.update(runFile.id, {
				status: TaskRunFileStatus.CONVERTING,
			});
			const result = await this.converterFactory.convert(
				buffer,
				fileInfo.extension,
			);
			this.logger.log(
				`[run:${taskRunId}] Converted ${fileInfo.name} → ${result.content.length} chars`,
			);

			knowledgeDocs.push({
				title: fileInfo.name,
				content: result.content,
				source: `box://${fileInfo.id}`,
			});

			return 'converted';
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`[run:${taskRunId}] FAILED ${fileLabel}: ${message}`,
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
