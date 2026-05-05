import {
	HttpException,
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
import {
	WppOpenKnowledgeItem,
	WppOpenOsContext,
} from '../types/wpp-open.types';

import { BoxService } from './box.service';
import {
	WppOpenAgentService,
	WppOpenPermissionError,
	WppOpenAgentMismatchError,
} from './wpp-open-agent.service';

/** Max file size: 150MB */
const MAX_FILE_SIZE = 150 * 1024 * 1024;

/** Buffer before lastRunAt to avoid missing files (5 minutes) */
const LAST_RUN_BUFFER_MS = 5 * 60 * 1000;

/**
 * Max concurrent file processing within a single run.
 *
 * Each in-flight file holds a download buffer (up to MAX_FILE_SIZE) plus
 * conversion working memory. On a Standard-1X dyno (512MB) at MAX_FILE_SIZE
 * 150MB, a concurrency of 2 keeps the worst-case peak under ~350MB and
 * leaves headroom for Nest, pg-boss, and the merged knowledge-doc array
 * that grows over the course of the run. Earlier runs at concurrency 4
 * sustained R14 memory-quota errors after long file processing.
 */
const FILE_CONCURRENCY = 2;

/**
 * Max docs to accumulate in memory before flushing to WPP Open via
 * `upsertKnowledge`. The worker used to convert ALL files first and upsert
 * once at the end — for a 1000+ file folder that meant the in-memory
 * `knowledgeDocs` array (each entry holds the converted content) plus the
 * Box download/convert buffers plus Nest framework overhead exceeded the
 * Standard-1X dyno's 512MB and triggered sustained R14 errors.
 *
 * Chunked upsert flushes every N converted docs, freeing the accumulator
 * and bounding peak memory regardless of folder size. Each flush costs
 * ~3-4 extra round-trips (getAgentConfig + N uploads + updateAgentConfig)
 * but the per-file fileName-keyed merge in `upsertKnowledge` makes
 * repeated calls correct: existing files not in the chunk are preserved.
 */
const UPSERT_CHUNK_SIZE = 10;

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

	/**
	 * Map a thrown error to the message persisted on the run row. Handles the
	 * typed cases explicitly so the user sees a self-service explanation
	 * instead of "WPP Open API error: 4xx".
	 */
	static toRunErrorMessage(error: unknown): string {
		if (
			error instanceof WppOpenPermissionError ||
			error instanceof WppOpenAgentMismatchError
		) {
			return error.message;
		}
		return error instanceof Error ? error.message : 'Unknown error';
	}

	/**
	 * Pre-upload errors (`getAgentConfig`, project access denied) mean no file
	 * was actually uploaded — the run aborted before the write step. Per-file
	 * rows get a different message so the UI tells the truth: "we never tried
	 * this file, it'll be retried next run" rather than "upsert failed".
	 *
	 * Post-upload errors (`updateAgentConfig`, transfer-service failures) get
	 * the existing "Knowledge upsert failed" message — by that point we may
	 * have side effects on WPP Open's side and the failure is real.
	 */
	static isPreUploadFailure(error: unknown): boolean {
		return (
			error instanceof WppOpenPermissionError ||
			error instanceof WppOpenAgentMismatchError
		);
	}

	static toFileErrorMessage(error: unknown): string {
		if (RunWorkerService.isPreUploadFailure(error)) {
			const reason =
				error instanceof Error ? error.message : 'Unknown error';
			return `Run aborted before upload (${reason}). File preserved for next run.`;
		}
		const upsertError =
			error instanceof Error ? error.message : 'Unknown error';
		return `Knowledge upsert failed: ${upsertError}`;
	}

	/**
	 * Decide whether a `flushChunk` upsert failure is worth retrying.
	 *
	 * CS occasionally emits transient 5xx (502/503/504, plus the
	 * occasional 500 that recovers on retry). A single 500 used to abort
	 * the whole run — wasted work for what's often a multi-second hiccup.
	 *
	 * Typed permission/mismatch errors are NOT transient: the user has
	 * to fix scope, retrying just produces the same response. 4xx is
	 * also not retried (auth, validation — won't recover with the same
	 * inputs).
	 */
	static isTransientUpsertError(error: unknown): boolean {
		if (
			error instanceof WppOpenPermissionError ||
			error instanceof WppOpenAgentMismatchError
		) {
			return false;
		}
		if (error instanceof HttpException) {
			const status = error.getStatus();
			return status >= 500 && status < 600;
		}
		return false;
	}

	/**
	 * Decide the run's terminal status from the final tallies.
	 *
	 * COMPLETED requires either at least one successful upload OR a clean
	 * skip-only run — every file legitimately deterministic-skipped (size
	 * cap), no failures, no abort. Everything else is FAILED so
	 * `lastRunAt` does not advance and the next run retries the un-tried
	 * files.
	 *
	 * Without the skip-only branch, a folder where every file exceeds the
	 * size cap marks the run FAILED and the next run re-lists+re-skips
	 * the same files forever.
	 */
	static computeFinalStatus(input: {
		aborted: boolean;
		isShuttingDown: boolean;
		processed: number;
		failed: number;
		skipped: number;
	}): TaskRunStatus.COMPLETED | TaskRunStatus.FAILED {
		const ranToCompletion = !input.aborted && !input.isShuttingDown;
		const cleanSkipOnly =
			input.processed === 0 && input.failed === 0 && input.skipped > 0;
		return ranToCompletion && (input.processed > 0 || cleanSkipOnly)
			? TaskRunStatus.COMPLETED
			: TaskRunStatus.FAILED;
	}

	/**
	 * Compute the new `filesFailed` aggregate after an upsert failure.
	 *
	 * Pre-upload failure (typed errors): the converted-but-not-yet-uploaded
	 * files are NOT counted as failures. Per-file rows already say "preserved
	 * for next run" and Box's lastRunAt cursor doesn't advance, so the next
	 * run will re-attempt them. Counting them as failures would scare the
	 * user with a misleading topline number.
	 *
	 * Post-upload failure (anything else): the upload was attempted and
	 * broke; count the converted files as failed.
	 */
	static failedCountAfterUpsertError(
		failedSoFar: number,
		converted: number,
		error: unknown,
	): number {
		return RunWorkerService.isPreUploadFailure(error)
			? failedSoFar
			: failedSoFar + converted;
	}

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
						RunWorkerService.toRunErrorMessage(error),
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
			// Preserve the typed permission error so the run row gets the
			// human message; otherwise wrap as a generic token failure.
			if (error instanceof WppOpenPermissionError) {
				throw error;
			}
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

		// Resume: when a prior run uploaded a file successfully, its row stays
		// COMPLETED in the DB (CS already has it; the per-file fileName-keyed
		// merge in `upsertKnowledge` would just re-PUT the same content). If
		// that prior run aborted before finalize, `lastRunAt` does not
		// advance, so Box hands us the file again on the next attempt. Skip
		// the redundant download+convert+upload by filtering against the set
		// of boxFileIds this task has already finished. The remaining file
		// count drives `filesFound` so the topline reflects work-to-do.
		const alreadyCompletedBoxFileIds =
			await this.collectCompletedBoxFileIds(taskId);
		const newFiles = files.filter(
			(file) => !alreadyCompletedBoxFileIds.has(file.id),
		);
		const skippedByPriorCompletion = files.length - newFiles.length;

		if (skippedByPriorCompletion > 0) {
			this.logger.log(
				`[run:${taskRunId}] Resume filter: ${skippedByPriorCompletion} files already completed in a prior run — skipping`,
			);
		}

		const totalSkipped = skippedByDate + skippedByPriorCompletion;

		await this.runRepo.update(taskRunId, {
			filesFound: newFiles.length,
			filesSkipped: totalSkipped,
		});

		if (newFiles.length === 0) {
			await this.runRepo.update(taskRunId, {
				status: TaskRunStatus.COMPLETED,
				completedAt: new Date(),
				filesSkipped: totalSkipped,
			});
			await this.taskRepo.update(taskId, { lastRunAt: new Date() });
			return;
		}

		// 4. Create TaskRunFile records
		const runFiles = newFiles.map((file) =>
			this.runFileRepo.create({
				taskRunId,
				boxFileId: file.id,
				fileName: file.name,
				fileSize: file.size,
				status: TaskRunFileStatus.PENDING,
			}),
		);
		await this.runFileRepo.save(runFiles);

		// 5. Process files with concurrency limit + chunked upsert.
		// Memory profile: peak holds <= UPSERT_CHUNK_SIZE converted docs +
		// FILE_CONCURRENCY in-flight download buffers. Bounded regardless of
		// folder size (used to grow with the whole run).
		let converted = 0;
		let failed = 0;
		let skipped = 0;
		let processed = 0;
		let upsertErrorRaw: unknown = null;
		let aborted = false;
		const knowledgeDocs: WppOpenKnowledgeItem[] = [];
		const chunkRunFileIds: string[] = [];
		const upsertProjectId =
			data.wppOpenAgentProjectId || data.wppOpenProjectId;
		const totalFiles = runFiles.length;
		const totalBatches = Math.ceil(totalFiles / FILE_CONCURRENCY);

		this.logger.log(
			`[run:${taskRunId}] Starting file processing: ${totalFiles} files in ${totalBatches} batches (concurrency: ${FILE_CONCURRENCY}, upsert chunk: ${UPSERT_CHUNK_SIZE})${
				data.wppOpenAgentProjectId &&
				data.wppOpenAgentProjectId !== data.wppOpenProjectId
					? ` | upsert project: ${upsertProjectId} (resolved from ${data.wppOpenProjectId})`
					: ''
			}`,
		);

		for (let i = 0; i < runFiles.length; i += FILE_CONCURRENCY) {
			if (this.isShuttingDown) {
				this.logger.warn(
					`[run:${taskRunId}] Shutdown requested, stopping at file ${i}/${totalFiles}`,
				);
				break;
			}
			if (aborted) {
				// A prior chunk-flush failed in a way that means no further
				// upserts will succeed (typed permission/mismatch error).
				// Stop processing — the remaining files would just fail.
				break;
			}

			const batchNum = Math.floor(i / FILE_CONCURRENCY) + 1;
			const batch = runFiles.slice(i, i + FILE_CONCURRENCY);
			const batchFiles = newFiles.slice(i, i + FILE_CONCURRENCY);

			this.logger.log(
				`[run:${taskRunId}] Batch ${batchNum}/${totalBatches} — files ${i + 1}-${Math.min(i + FILE_CONCURRENCY, totalFiles)}/${totalFiles} | progress: ${converted} converted, ${failed} failed, ${skipped} skipped`,
			);

			const results = await Promise.allSettled(
				batch.map((runFile, idx) =>
					this.processFile(
						runFile,
						batchFiles[idx],
						knowledgeDocs,
						chunkRunFileIds,
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

			// Flush a chunk as soon as the accumulator is full.
			if (knowledgeDocs.length >= UPSERT_CHUNK_SIZE) {
				const flush = await this.flushChunk(
					taskRunId,
					knowledgeDocs,
					chunkRunFileIds,
					upsertProjectId,
					data.wppOpenAgentId,
					wppOpenToken,
					osContext,
				);
				if (flush.ok) {
					processed += flush.docsFlushed;
				} else {
					upsertErrorRaw = flush.error;
					failed = RunWorkerService.failedCountAfterUpsertError(
						failed,
						flush.docsFlushed,
						flush.error,
					);
					aborted = true;
				}
				// Free memory regardless of outcome — the chunk's files have
				// already been row-updated by flushChunk, so we don't need
				// to retain the docs.
				knowledgeDocs.length = 0;
				chunkRunFileIds.length = 0;
			}

			// Persist running counters after every batch. This is what makes
			// the run-detail page tell the truth even when the worker dies
			// mid-flight (dyno restart, pg-boss expireInSeconds retry,
			// uncaught throw → failRun() which doesn't touch counters).
			// Without this, `filesProcessed` was 0 on failed runs even when
			// dozens of file rows were already row-marked COMPLETED.
			await this.runRepo.update(taskRunId, {
				filesProcessed: processed,
				filesFailed: failed,
				filesSkipped: totalSkipped + skipped,
			});
		}

		// Flush the trailing partial chunk (if any and not aborted).
		if (!aborted && knowledgeDocs.length > 0) {
			const flush = await this.flushChunk(
				taskRunId,
				knowledgeDocs,
				chunkRunFileIds,
				upsertProjectId,
				data.wppOpenAgentId,
				wppOpenToken,
				osContext,
			);
			if (flush.ok) {
				processed += flush.docsFlushed;
			} else {
				upsertErrorRaw = flush.error;
				failed = RunWorkerService.failedCountAfterUpsertError(
					failed,
					flush.docsFlushed,
					flush.error,
				);
				// Trailing-flush failure means the run did not fully complete
				// either — propagate so finalization picks the right status
				// and skips advancing lastRunAt.
				aborted = true;
			}
			knowledgeDocs.length = 0;
			chunkRunFileIds.length = 0;
		}

		this.logger.log(
			`[run:${taskRunId}] File processing complete: ${converted} converted, ${processed} uploaded, ${failed} failed, ${skipped} skipped`,
		);

		// 7. Finalize run.
		// "Ran to completion" = every file was attempted and the upsert
		// pipeline didn't abort. Partial-success runs (chunk-flush failed
		// mid-way, or dyno shutdown interrupted) get FAILED so lastRunAt
		// stays put and the next run re-attempts the un-tried files.
		// Files that DID succeed remain in WPP Open's knowledge base; the
		// next run idempotently re-uploads them (merge by fileName).
		//
		// COMPLETED requires either at least one upload OR a clean
		// skip-only run (every file legitimately size-skipped, no
		// failures). Without the skip-only branch, a folder of all
		// oversized files marks the run FAILED, lastRunAt does not
		// advance, and the next run re-lists and re-skips the same
		// files forever.
		const finalStatus = RunWorkerService.computeFinalStatus({
			aborted,
			isShuttingDown: this.isShuttingDown,
			processed,
			failed,
			skipped,
		});

		await this.runRepo.update(taskRunId, {
			status: finalStatus,
			completedAt: new Date(),
			filesProcessed: processed,
			filesFailed: failed,
			// `totalSkipped` carries the date-filter and prior-completion
			// skips from the file-listing phase; `skipped` is the size-cap
			// skips counted during file processing. Earlier code overwrote
			// the date count here, hiding it from the run summary.
			filesSkipped: totalSkipped + skipped,
			errorMessage:
				finalStatus === TaskRunStatus.FAILED
					? upsertErrorRaw
						? RunWorkerService.toRunErrorMessage(upsertErrorRaw)
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
	 * Files that complete conversion are left at CONVERTING status. The caller
	 * (the chunk-flush logic) is responsible for marking them COMPLETED or
	 * FAILED after the chunked upsert to WPP Open succeeds or fails. The
	 * caller tracks which runFile rows belong to the current chunk via
	 * `chunkRunFileIds` — pushed alongside `knowledgeDocs` so the two arrays
	 * stay aligned and a chunk flush can target exactly the rows it just
	 * uploaded.
	 */
	private async processFile(
		runFile: TaskRunFile,
		fileInfo: { id: string; name: string; size: number; extension: string },
		knowledgeDocs: WppOpenKnowledgeItem[],
		chunkRunFileIds: string[],
		taskRunId: string,
	): Promise<'converted' | 'skipped' | 'failed'> {
		const fileLabel = `${fileInfo.name} (${(fileInfo.size / 1024 / 1024).toFixed(1)}MB)`;
		try {
			// Size check — exceeds the per-file cap. This is bookkeeping, not
			// an error: the file will never be processable until it shrinks
			// or the cap is raised, so it gets `SKIPPED` (not `FAILED`) and
			// stays out of the user-actionable failures count.
			if (fileInfo.size > MAX_FILE_SIZE) {
				this.logger.warn(
					`[run:${taskRunId}] SKIP ${fileLabel} — exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
				);
				await this.runFileRepo.update(runFile.id, {
					status: TaskRunFileStatus.SKIPPED,
					errorMessage: `File too large (${Math.round(fileInfo.size / 1024 / 1024)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit)`,
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
			chunkRunFileIds.push(runFile.id);

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
	 * Upload a chunk of converted docs to WPP Open and update the matching
	 * per-file rows. Splitting upserts into chunks bounds peak memory by
	 * letting the worker free `knowledgeDocs` mid-run instead of holding
	 * every converted doc until the very end.
	 *
	 * On success: marks the chunk's runFile rows COMPLETED.
	 * On failure: marks them FAILED with a phase-aware message
	 * (`toFileErrorMessage` distinguishes pre-upload from upload errors).
	 *
	 * `docsFlushed` is returned so callers can update the run-level
	 * `processed` / `failed` counters with the right delta.
	 */
	private async flushChunk(
		taskRunId: string,
		docs: WppOpenKnowledgeItem[],
		chunkRunFileIds: string[],
		upsertProjectId: string,
		agentId: string,
		wppOpenToken: string,
		osContext: WppOpenOsContext | undefined,
	): Promise<
		| { ok: true; docsFlushed: number }
		| { ok: false; docsFlushed: number; error: unknown }
	> {
		if (docs.length === 0) return { ok: true, docsFlushed: 0 };
		const docsCount = docs.length;
		const contentKB = Math.round(
			docs.reduce((sum, d) => sum + d.content.length, 0) / 1024,
		);
		this.logger.log(
			`[run:${taskRunId}] Flushing chunk: ${docsCount} docs into agent ${agentId} (project: ${upsertProjectId}; ${contentKB}KB)`,
		);
		try {
			// Retry transient 5xx with exponential backoff. A single CS
			// hiccup used to abort the entire run; 3 attempts at 2s/4s/8s
			// covers most transient failures (gateway timeouts, brief
			// upstream issues, concurrent-write conflicts) without
			// blowing up runtime.
			const MAX_RETRIES = 3;
			let attempt = 0;
			while (true) {
				try {
					await this.wppOpenAgentService.upsertKnowledge(
						wppOpenToken,
						upsertProjectId,
						agentId,
						docs,
						osContext,
					);
					break;
				} catch (error) {
					attempt += 1;
					if (
						attempt >= MAX_RETRIES ||
						!RunWorkerService.isTransientUpsertError(error)
					) {
						throw error;
					}
					const delayMs = 1000 * 2 ** attempt;
					this.logger.warn(
						`[run:${taskRunId}] Chunk upsert transient failure (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delayMs}ms: ${
							error instanceof Error
								? error.message
								: String(error)
						}`,
					);
					await new Promise((resolve) =>
						setTimeout(resolve, delayMs),
					);
				}
			}
			this.logger.log(
				`[run:${taskRunId}] Chunk upsert OK — ${docsCount} docs uploaded`,
			);
			await this.runFileRepo
				.createQueryBuilder()
				.update(TaskRunFile)
				.set({
					status: TaskRunFileStatus.COMPLETED,
					processedAt: new Date(),
				})
				.where('id IN (:...ids)', { ids: chunkRunFileIds })
				.execute();
			return { ok: true, docsFlushed: docsCount };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			const preUpload = RunWorkerService.isPreUploadFailure(error);
			this.logger.error(
				`[run:${taskRunId}] Chunk upsert FAILED ${
					preUpload ? '(pre-upload)' : '(during upload)'
				}: ${message}`,
			);
			await this.runFileRepo
				.createQueryBuilder()
				.update(TaskRunFile)
				.set({
					status: TaskRunFileStatus.FAILED,
					errorMessage: RunWorkerService.toFileErrorMessage(error),
				})
				.where('id IN (:...ids)', { ids: chunkRunFileIds })
				.execute();
			return { ok: false, docsFlushed: docsCount, error };
		}
	}

	/**
	 * Return the set of `boxFileId`s already COMPLETED for any prior run of
	 * this task. Used to short-circuit re-processing of files that were
	 * successfully uploaded in a previous (possibly aborted) run.
	 *
	 * The CS API merges agent knowledge by `fileName` on every upsert, so
	 * re-running would simply re-PUT identical content — wasted Box quota,
	 * memory, and time on 1000+ file folders. Filtering here lets a retried
	 * run "pick up where it left off" instead.
	 *
	 * Read-only and bounded by the task's prior-COMPLETED count, so the cost
	 * is negligible compared to the network work it avoids.
	 */
	private async collectCompletedBoxFileIds(
		taskId: string,
	): Promise<Set<string>> {
		const rows = await this.runFileRepo
			.createQueryBuilder('file')
			.innerJoin(
				TaskRun,
				'run',
				'run.id = file."taskRunId" AND run."taskId" = :taskId',
				{ taskId },
			)
			.select('DISTINCT file."boxFileId"', 'boxFileId')
			.where('file.status = :status', {
				status: TaskRunFileStatus.COMPLETED,
			})
			.getRawMany<{ boxFileId: string }>();

		return new Set(rows.map((row) => row.boxFileId));
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
