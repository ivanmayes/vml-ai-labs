/**
 * ConversionWorkerService
 *
 * Processes document conversion jobs from the pg-boss queue.
 * Handles job lifecycle including:
 * - Picking up jobs from the queue
 * - Running appropriate converters
 * - Uploading results to S3
 * - Updating job status
 * - Job cancellation via AbortController
 * - Error handling and SSE event emission
 *
 * @remarks
 * This service registers as a pg-boss worker on module initialization.
 * It processes jobs in batches and supports graceful shutdown.
 */
import { createHash } from 'crypto';

import {
	Injectable,
	OnModuleInit,
	OnModuleDestroy,
	Logger,
} from '@nestjs/common';
import PgBoss from 'pg-boss';

import {
	PgBossService,
	ConversionJobData,
	WORKER_CONFIG,
} from '../../../_platform/queue';
import { ConverterFactory } from '../converters';
import { AwsS3Service } from '../../../_platform/aws';
import { ConversionError } from '../types/conversion-error.types';
import { SSEEventType } from '../types/sse-events.types';
import { JobStatus } from '../types/job-status.enum';

import { ConversionSseService } from './conversion-sse.service';
import { ConversionService } from './conversion.service';

@Injectable()
export class ConversionWorkerService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ConversionWorkerService.name);

	/**
	 * Map of jobId -> AbortController for cancellation support.
	 * When a cancel request comes in, we signal the controller
	 * which the converter can check periodically.
	 */
	private readonly abortControllers = new Map<string, AbortController>();

	/**
	 * Track active jobs for graceful shutdown
	 */
	private readonly activeJobs = new Set<string>();

	/**
	 * Flag to track if we're shutting down
	 */
	private isShuttingDown = false;

	constructor(
		private readonly pgBossService: PgBossService,
		private readonly conversionService: ConversionService,
		private readonly converterFactory: ConverterFactory,
		private readonly s3Service: AwsS3Service,
		private readonly sseService: ConversionSseService,
	) {}

	/**
	 * Register as a queue worker on module initialization.
	 */
	async onModuleInit(): Promise<void> {
		this.logger.log('Starting ConversionWorkerService...');

		// Register main conversion queue worker
		await this.pgBossService.workConversionQueue(
			this.processJob.bind(this),
			{
				batchSize: WORKER_CONFIG.teamSize,
			},
		);
		this.logger.log(
			`Registered conversion worker with teamSize: ${WORKER_CONFIG.teamSize}`,
		);
	}

	/**
	 * Graceful shutdown - wait for active jobs to complete.
	 */
	async onModuleDestroy(): Promise<void> {
		this.logger.log('Shutting down ConversionWorkerService...');
		this.isShuttingDown = true;

		// Cancel all in-flight jobs
		for (const [jobId, controller] of this.abortControllers) {
			this.logger.warn(`Aborting job ${jobId} due to shutdown`);
			controller.abort();
		}

		// Wait for active jobs to finish (with timeout)
		const shutdownTimeout = 30000; // 30 seconds
		const startTime = Date.now();

		while (
			this.activeJobs.size > 0 &&
			Date.now() - startTime < shutdownTimeout
		) {
			this.logger.log(
				`Waiting for ${this.activeJobs.size} active jobs to complete...`,
			);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (this.activeJobs.size > 0) {
			this.logger.warn(
				`Shutdown timeout reached with ${this.activeJobs.size} jobs still active`,
			);
		}

		this.logger.log('ConversionWorkerService shutdown complete');
	}

	/**
	 * Main job processor - called by pg-boss for each batch of jobs.
	 * In pg-boss v10+, handlers receive arrays.
	 *
	 * @param jobs - Array of pg-boss jobs with ConversionJobData payload
	 */
	async processJob(jobs: PgBoss.Job<ConversionJobData>[]): Promise<void> {
		// Process each job in the batch
		for (const job of jobs) {
			await this.processSingleJob(job);
		}
	}

	/**
	 * Process a single conversion job.
	 *
	 * @param job - The pg-boss job with ConversionJobData payload
	 */
	private async processSingleJob(
		job: PgBoss.Job<ConversionJobData>,
	): Promise<void> {
		const { id: pgBossJobId, data } = job;
		const { jobId, fileExtension, s3InputKey, originalFileName } = data;
		const startTime = Date.now();

		this.logger.log(`Processing job ${jobId} (pg-boss: ${pgBossJobId})`);

		// Track this job as active
		this.activeJobs.add(jobId);

		// Create AbortController for cancellation support
		const abortController = new AbortController();
		this.abortControllers.set(jobId, abortController);

		try {
			// Check if already shutting down
			if (this.isShuttingDown) {
				throw new Error('Worker is shutting down');
			}

			// Determine converter engine name
			const converter = this.converterFactory.getConverter(fileExtension);
			const engine = converter?.engineName || 'unknown';

			// Mark job as processing in the database
			await this.conversionService.markJobProcessing(
				jobId,
				engine,
				pgBossJobId,
			);
			this.logger.debug(
				`Using converter: ${engine} for ${fileExtension}`,
			);

			// Emit SSE event for job started
			this.sseService.emitJobEvent(
				jobId,
				data.userId,
				data.organizationId,
				SSEEventType.JOB_STARTED,
				{
					id: jobId,
					status: JobStatus.PROCESSING,
					engine,
				},
			);

			// Check for cancellation before download
			if (await this.shouldCancelJob(jobId, abortController)) {
				this.logger.log(`Job ${jobId} was cancelled before processing`);
				await this.conversionService.markJobCancelled(jobId);
				return;
			}

			// Download file from S3
			const fileBuffer = await this.s3Service.download(s3InputKey);
			this.logger.debug(`Downloaded ${fileBuffer.length} bytes from S3`);

			// Check for cancellation after download
			if (await this.shouldCancelJob(jobId, abortController)) {
				this.logger.log(`Job ${jobId} was cancelled after download`);
				await this.conversionService.markJobCancelled(jobId);
				return;
			}

			// Run conversion using the factory
			const result = await this.converterFactory.convert(
				fileBuffer,
				fileExtension,
				{
					fileName: originalFileName,
					signal: abortController.signal,
					timeoutMs: 120000, // 2 minutes for PDFs
				},
			);

			// Check for cancellation before upload
			if (await this.shouldCancelJob(jobId, abortController)) {
				this.logger.log(`Job ${jobId} was cancelled after conversion`);
				await this.conversionService.markJobCancelled(jobId);
				return;
			}

			// Wrap content with YAML front matter
			const wrappedContent = this.wrapWithFrontMatter(
				result.content,
				originalFileName,
				fileBuffer,
				result.engine,
			);

			// Upload converted result to S3
			const s3OutputKey = await this.uploadToS3(
				jobId,
				wrappedContent,
				originalFileName,
			);
			this.logger.debug(`Uploaded result to S3: ${s3OutputKey}`);

			const processingTimeMs = Date.now() - startTime;

			// Mark job as completed
			await this.conversionService.markJobCompleted(
				jobId,
				s3OutputKey,
				result.outputSize,
				processingTimeMs,
			);

			// Emit SSE event for job completed
			this.sseService.emitJobEvent(
				jobId,
				data.userId,
				data.organizationId,
				SSEEventType.JOB_COMPLETED,
				{
					id: jobId,
					status: JobStatus.COMPLETED,
					outputSize: result.outputSize,
					processingTimeMs,
				},
			);

			this.logger.log(
				`Job ${jobId} completed successfully (${processingTimeMs}ms, ${result.outputSize} bytes)`,
			);
		} catch (error) {
			// Handle job failure
			await this.handleJobError(job, error);
		} finally {
			// Cleanup tracking
			this.activeJobs.delete(jobId);
			this.abortControllers.delete(jobId);
		}
	}

	/**
	 * Upload conversion result to S3 with document-converter prefix.
	 */
	private async uploadToS3(
		jobId: string,
		content: string,
		originalFileName: string,
	): Promise<string> {
		const outputFileName =
			originalFileName.replace(/\.[^/.]+$/, '') + '.txt';
		const s3OutputKey = `document-converter/converted/${jobId}/${outputFileName}`;

		await this.s3Service.upload({
			key: s3OutputKey,
			buffer: Buffer.from(content, 'utf-8'),
			contentType: 'text/plain; charset=utf-8',
		});

		return s3OutputKey;
	}

	/**
	 * Wrap converted content with YAML front matter.
	 * Adds metadata about the source file for traceability.
	 */
	private wrapWithFrontMatter(
		content: string,
		originalFileName: string,
		originalBuffer: Buffer,
		engine: string,
	): string {
		const title = originalFileName.replace(/\.[^/.]+$/, '');
		const checksum = createHash('sha256')
			.update(originalBuffer)
			.digest('hex');
		const timestamp = new Date().toISOString();

		const frontMatter = [
			'---',
			`title: "${title}"`,
			`source_path: "${originalFileName}"`,
			`checksum_sha256: "${checksum}"`,
			`converted_at: "${timestamp}"`,
			`converted_with: "${engine}"`,
			'---',
			'',
		].join('\n');

		return frontMatter + content;
	}

	/**
	 * Handle errors during job processing.
	 */
	private async handleJobError(
		job: PgBoss.Job<ConversionJobData>,
		error: unknown,
	): Promise<void> {
		const { data } = job;
		const { jobId } = data;

		const errorMessage =
			error instanceof Error ? error.message : String(error);
		this.logger.error(`Job ${jobId} failed: ${errorMessage}`);

		// Check if this is a cancellation (AbortError)
		const abortController = this.abortControllers.get(jobId);
		if (abortController?.signal.aborted || this.isAbortError(error)) {
			this.logger.log(`Job ${jobId} was cancelled via AbortController`);
			await this.conversionService.markJobCancelled(jobId);
			return;
		}

		// Determine if error is retryable
		const conversionError = this.createConversionError(error);

		// Mark job as failed
		await this.conversionService.markJobFailed(jobId, conversionError);

		// Emit SSE event for job failed
		this.sseService.emitJobEvent(
			jobId,
			data.userId,
			data.organizationId,
			SSEEventType.JOB_FAILED,
			{
				id: jobId,
				status: JobStatus.FAILED,
				error: conversionError,
			},
		);
	}

	/**
	 * Create a structured ConversionError from any error.
	 */
	private createConversionError(error: unknown): ConversionError {
		if (error instanceof Error) {
			// Check for known error types
			if (error.message.includes('timeout')) {
				return {
					code: 'CONVERSION_TIMEOUT',
					message: 'Conversion timed out',
					retryable: true,
					timestamp: new Date().toISOString(),
				};
			}

			if (
				error.message.includes('corrupted') ||
				error.message.includes('parse')
			) {
				return {
					code: 'FILE_CORRUPTED',
					message: error.message,
					retryable: false,
					timestamp: new Date().toISOString(),
				};
			}

			return {
				code: 'CONVERSION_FAILED',
				message: error.message,
				retryable: true,
				timestamp: new Date().toISOString(),
			};
		}

		return {
			code: 'CONVERSION_FAILED',
			message: String(error),
			retryable: true,
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Cancel a running job.
	 *
	 * @param jobId - Database job ID (not pg-boss job ID)
	 * @returns true if the job was found and cancellation was signaled
	 */
	cancelJob(jobId: string): boolean {
		const controller = this.abortControllers.get(jobId);
		if (controller) {
			controller.abort();
			this.logger.log(`Cancellation signaled for job ${jobId}`);
			return true;
		}
		return false;
	}

	/**
	 * Check if a job is currently being processed.
	 */
	isJobActive(jobId: string): boolean {
		return this.activeJobs.has(jobId);
	}

	/**
	 * Get number of active jobs.
	 */
	getActiveJobCount(): number {
		return this.activeJobs.size;
	}

	/**
	 * Check if an error is an AbortError.
	 * AbortErrors are thrown when an AbortController's signal is aborted.
	 *
	 * @param error - Error to check
	 * @returns true if the error is an AbortError
	 */
	private isAbortError(error: unknown): boolean {
		if (error instanceof Error) {
			return (
				error.name === 'AbortError' ||
				error.message === 'AbortError' ||
				error.message.includes('aborted') ||
				error.message.includes('cancelled')
			);
		}
		return false;
	}

	/**
	 * Check if job is cancelled (via AbortController or DB status).
	 * This provides defense-in-depth: even if the AbortController isn't triggered,
	 * we can still detect cancellation via the database.
	 *
	 * @param jobId - Job UUID
	 * @param abortController - AbortController for this job
	 * @returns true if job should be cancelled
	 */
	private async shouldCancelJob(
		jobId: string,
		abortController: AbortController,
	): Promise<boolean> {
		// Fast path: check AbortController first (local, no DB round-trip)
		if (abortController.signal.aborted) {
			return true;
		}

		// Slow path: check DB status (for API-initiated cancellations)
		const isCancelledInDb =
			await this.conversionService.isJobCancelled(jobId);
		if (isCancelledInDb) {
			// Also signal the AbortController so any in-progress operations are interrupted
			abortController.abort();
			return true;
		}

		return false;
	}
}
