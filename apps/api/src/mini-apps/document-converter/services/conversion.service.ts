import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { ConversionJob } from '../entities/conversion-job.entity';
import { JobStatus } from '../types/job-status.enum';
import { ConversionError } from '../types/conversion-error.types';
import { AwsS3Service } from '../../../_platform/aws';
import {
	JobNotFoundError,
	InvalidStatusTransitionError,
	MaxRetriesExceededError,
	DownloadExpiredError,
	ConcurrentUpdateError,
} from '../errors/domain.errors';

/**
 * Input for creating a new conversion job
 */
export interface CreateJobInput {
	fileName: string;
	originalFileName: string;
	fileSize: number;
	mimeType: string;
	fileExtension: string;
	userId: string;
	organizationId: string;
	idempotencyKey?: string;
	s3InputKey?: string;
}

/**
 * Options for listing jobs
 */
export interface ListJobsOptions {
	userId: string;
	organizationId: string;
	status?: JobStatus[];
	limit?: number;
	offset?: number;
	search?: string;
}

/**
 * Result of listing jobs
 */
export interface ListJobsResult {
	data: ConversionJob[];
	meta: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
}

/**
 * Download info for a completed job
 */
export interface DownloadInfo {
	downloadUrl: string;
	fileName: string;
	fileSize: number;
	expiresAt: Date;
	urlExpiresIn: number;
}

/**
 * ConversionService - Core service for managing document conversion jobs.
 *
 * Responsibilities:
 * - CRUD operations for ConversionJob entities
 * - Status transitions with state machine validation
 * - Idempotency handling for duplicate upload prevention
 * - S3 file cleanup on job deletion
 *
 * Authorization Note:
 * All methods that access jobs require userId + organizationId to ensure
 * users can only access their own jobs within their organization.
 */
@Injectable()
export class ConversionService {
	private readonly logger = new Logger(ConversionService.name);

	constructor(
		@InjectRepository(ConversionJob)
		private readonly jobRepository: Repository<ConversionJob>,
		private readonly s3Service: AwsS3Service,
		private readonly dataSource: DataSource,
	) {}

	/**
	 * Create a new conversion job.
	 *
	 * If an idempotencyKey is provided and a job with that key already exists,
	 * the existing job is returned instead of creating a duplicate.
	 *
	 * Uses optimistic approach: attempts INSERT and catches unique constraint
	 * violations to handle concurrent requests atomically (no TOCTOU race).
	 *
	 * @param input - Job creation data
	 * @returns Created or existing job
	 */
	async createJob(input: CreateJobInput): Promise<ConversionJob> {
		const job = this.jobRepository.create({
			fileName: input.fileName,
			originalFileName: input.originalFileName,
			fileSize: input.fileSize,
			mimeType: input.mimeType,
			fileExtension: input.fileExtension.toLowerCase(),
			userId: input.userId,
			organizationId: input.organizationId,
			idempotencyKey: input.idempotencyKey,
			s3InputKey: input.s3InputKey,
			status: JobStatus.PENDING,
		});

		try {
			const savedJob = await this.jobRepository.save(job);
			this.logger.log(`Created conversion job: ${savedJob.id}`);
			return savedJob;
		} catch (error) {
			// Handle unique constraint violation on idempotencyKey
			if (this.isIdempotencyKeyConflict(error) && input.idempotencyKey) {
				const existingJob = await this.findByIdempotencyKey(
					input.idempotencyKey,
					input.userId,
					input.organizationId,
				);
				if (existingJob) {
					this.logger.debug(
						`Returning existing job for idempotency key: ${input.idempotencyKey}`,
					);
					return existingJob;
				}
			}
			throw error;
		}
	}

	/**
	 * Check if an error is a unique constraint violation on idempotencyKey.
	 * PostgreSQL error code 23505 = unique_violation
	 */
	private isIdempotencyKeyConflict(error: unknown): boolean {
		if (error && typeof error === 'object') {
			const pgError = error as { code?: string; constraint?: string };
			// PostgreSQL unique violation with idempotency constraint
			return (
				pgError.code === '23505' &&
				!!(
					pgError.constraint?.includes('idempotency') ||
					pgError.constraint?.includes('idempotencyKey')
				)
			);
		}
		return false;
	}

	/**
	 * Get a job by ID with authorization check.
	 *
	 * Returns 404 for both non-existent jobs and unauthorized access
	 * to prevent job ID enumeration.
	 *
	 * @param jobId - Job UUID
	 * @param userId - User ID for authorization
	 * @param organizationId - Organization ID for authorization
	 * @returns The job if found and authorized
	 * @throws JobNotFoundError if job doesn't exist or user lacks access
	 */
	async getJob(
		jobId: string,
		userId: string,
		organizationId: string,
	): Promise<ConversionJob> {
		const job = await this.jobRepository.findOne({
			where: {
				id: jobId,
				userId,
				organizationId,
			},
		});

		if (!job) {
			throw new JobNotFoundError();
		}

		return job;
	}

	/**
	 * List jobs for a user with filtering and pagination.
	 *
	 * @param options - Filter and pagination options
	 * @returns Paginated list of jobs
	 */
	async listJobs(options: ListJobsOptions): Promise<ListJobsResult> {
		const {
			userId,
			organizationId,
			status,
			limit = 20,
			offset = 0,
			search,
		} = options;

		// Build query
		const queryBuilder = this.jobRepository
			.createQueryBuilder('job')
			.where('job.userId = :userId', { userId })
			.andWhere('job.organizationId = :organizationId', {
				organizationId,
			});

		// Filter by status (multiple)
		if (status && status.length > 0) {
			queryBuilder.andWhere('job.status IN (:...status)', { status });
		}

		// Search by filename (inline SQL LIKE escape to prevent injection)
		if (search) {
			const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
			queryBuilder.andWhere(
				'(job.fileName ILIKE :search OR job.originalFileName ILIKE :search)',
				{ search: `%${escapedSearch}%` },
			);
		}

		// Get total count
		const total = await queryBuilder.getCount();

		// Get paginated results
		const data = await queryBuilder
			.orderBy('job.createdAt', 'DESC')
			.skip(offset)
			.take(Math.min(limit, 100)) // Cap at 100
			.getMany();

		return {
			data,
			meta: {
				total,
				limit: Math.min(limit, 100),
				offset,
				hasMore: offset + data.length < total,
			},
		};
	}

	/**
	 * Update job status with state machine validation.
	 *
	 * Uses optimistic locking with version checking to handle concurrent updates.
	 * The update is performed in a transaction with a WHERE clause on the version
	 * column to detect and reject concurrent modifications.
	 *
	 * @param jobId - Job UUID
	 * @param newStatus - Target status
	 * @param userId - User ID for authorization
	 * @param organizationId - Organization ID for authorization
	 * @param additionalData - Optional additional fields to update
	 * @returns Updated job
	 * @throws JobNotFoundError if job doesn't exist
	 * @throws InvalidStatusTransitionError if transition is not allowed
	 * @throws ConcurrentUpdateError if another request modified the job
	 */
	async updateJobStatus(
		jobId: string,
		newStatus: JobStatus,
		userId: string,
		organizationId: string,
		additionalData?: Partial<
			Pick<
				ConversionJob,
				| 'engine'
				| 'error'
				| 's3OutputKey'
				| 'outputSize'
				| 'processingTimeMs'
				| 'pgBossJobId'
			>
		>,
	): Promise<ConversionJob> {
		// First, get the job to validate ownership and check state transition
		const job = await this.getJob(jobId, userId, organizationId);
		const currentVersion = job.version;

		try {
			// Use entity's state machine to validate transition
			job.transitionTo(newStatus);
		} catch (error) {
			if (
				error instanceof Error &&
				error.name === 'InvalidStatusTransitionError'
			) {
				throw new InvalidStatusTransitionError(
					error.message,
					job.status,
					newStatus,
				);
			}
			throw error;
		}

		// Apply additional data if provided
		if (additionalData) {
			if (additionalData.engine !== undefined)
				job.engine = additionalData.engine;
			if (additionalData.error !== undefined)
				job.error = additionalData.error;
			if (additionalData.s3OutputKey !== undefined)
				job.s3OutputKey = additionalData.s3OutputKey;
			if (additionalData.outputSize !== undefined)
				job.outputSize = additionalData.outputSize;
			if (additionalData.processingTimeMs !== undefined)
				job.processingTimeMs = additionalData.processingTimeMs;
			if (additionalData.pgBossJobId !== undefined)
				job.pgBossJobId = additionalData.pgBossJobId;
		}

		// Use transaction with optimistic locking via version check
		return this.dataSource.transaction(async (manager) => {
			const result = await manager
				.createQueryBuilder()
				.update(ConversionJob)
				.set({
					status: job.status,
					engine: job.engine,
					error: job.error,
					s3OutputKey: job.s3OutputKey,
					outputSize: job.outputSize,
					processingTimeMs: job.processingTimeMs,
					pgBossJobId: job.pgBossJobId,
					startedAt: job.startedAt,
					completedAt: job.completedAt,
					expiresAt: job.expiresAt,
					version: () => 'version + 1', // Increment version
				})
				.where('"id" = :id', { id: jobId })
				.andWhere('"version" = :version', { version: currentVersion }) // Optimistic lock check
				.execute();

			// If no rows updated, another request modified the job
			if (result.affected === 0) {
				this.logger.warn(
					`Concurrent update detected for job ${jobId} (version ${currentVersion})`,
				);
				throw new ConcurrentUpdateError('Job');
			}

			this.logger.log(`Updated job ${jobId} status to ${newStatus}`);

			// Fetch and return the updated job
			const updatedJob = await manager.findOne(ConversionJob, {
				where: { id: jobId },
			});

			if (!updatedJob) {
				throw new JobNotFoundError();
			}

			return updatedJob;
		});
	}

	/**
	 * Cancel a pending or processing job.
	 *
	 * @param jobId - Job UUID
	 * @param userId - User ID for authorization
	 * @param organizationId - Organization ID for authorization
	 * @returns Cancelled job
	 */
	async cancelJob(
		jobId: string,
		userId: string,
		organizationId: string,
	): Promise<ConversionJob> {
		return this.updateJobStatus(
			jobId,
			JobStatus.CANCELLED,
			userId,
			organizationId,
		);
	}

	/**
	 * Retry a failed job.
	 *
	 * Resets status to PENDING and increments retry count.
	 *
	 * @param jobId - Job UUID
	 * @param userId - User ID for authorization
	 * @param organizationId - Organization ID for authorization
	 * @returns Job queued for retry
	 * @throws MaxRetriesExceededError if max retries reached
	 */
	async retryJob(
		jobId: string,
		userId: string,
		organizationId: string,
	): Promise<ConversionJob> {
		const job = await this.getJob(jobId, userId, organizationId);

		if (!job.canRetry()) {
			throw new MaxRetriesExceededError(job.retryCount, job.maxRetries);
		}

		// Transition back to pending and increment retry count
		job.transitionTo(JobStatus.PENDING);
		job.retryCount += 1;
		job.error = null;

		const savedJob = await this.jobRepository.save(job);
		this.logger.log(
			`Retried job ${jobId} (attempt ${savedJob.retryCount})`,
		);

		return savedJob;
	}

	/**
	 * Delete a job and clean up associated S3 files.
	 *
	 * @param jobId - Job UUID
	 * @param userId - User ID for authorization
	 * @param organizationId - Organization ID for authorization
	 */
	async deleteJob(
		jobId: string,
		userId: string,
		organizationId: string,
	): Promise<void> {
		const job = await this.getJob(jobId, userId, organizationId);

		// Clean up S3 files
		const keysToDelete: string[] = [];
		if (job.s3InputKey) keysToDelete.push(job.s3InputKey);
		if (job.s3OutputKey) keysToDelete.push(job.s3OutputKey);

		if (keysToDelete.length > 0) {
			try {
				await this.s3Service.deleteMany(keysToDelete);
				this.logger.debug(`Deleted S3 files for job ${jobId}`);
			} catch (error) {
				this.logger.error(
					`Failed to delete S3 files for job ${jobId}`,
					error,
				);
				// Continue with job deletion even if S3 cleanup fails
			}
		}

		await this.jobRepository.remove(job);
		this.logger.log(`Deleted job ${jobId}`);
	}

	/**
	 * Get download info for a completed job.
	 *
	 * @param jobId - Job UUID
	 * @param userId - User ID for authorization
	 * @param organizationId - Organization ID for authorization
	 * @returns Download URL and metadata
	 * @throws DownloadExpiredError if download has expired
	 */
	async getDownloadInfo(
		jobId: string,
		userId: string,
		organizationId: string,
	): Promise<DownloadInfo> {
		const job = await this.getJob(jobId, userId, organizationId);

		if (!job.isDownloadAvailable()) {
			throw new DownloadExpiredError();
		}

		// Generate presigned URL (1 hour expiry)
		const urlExpiresIn = 3600;
		const outputFileName = this.generateOutputFileName(
			job.originalFileName,
		);
		const downloadUrl = await this.s3Service.generateDownloadUrl(
			job.s3OutputKey,
			outputFileName,
			urlExpiresIn,
		);

		return {
			downloadUrl,
			fileName: outputFileName,
			fileSize: job.outputSize || 0,
			expiresAt: job.expiresAt,
			urlExpiresIn,
		};
	}

	/**
	 * Find a job by idempotency key.
	 *
	 * @param idempotencyKey - Client-provided idempotency key
	 * @param userId - User ID for scoping
	 * @param organizationId - Organization ID for scoping
	 * @returns Job if found, null otherwise
	 */
	async findByIdempotencyKey(
		idempotencyKey: string,
		userId: string,
		organizationId: string,
	): Promise<ConversionJob | null> {
		return this.jobRepository.findOne({
			where: {
				idempotencyKey,
				userId,
				organizationId,
			},
		});
	}

	/**
	 * Calculate queue position for a pending job.
	 *
	 * Uses ROW_NUMBER() window function for O(n) complexity instead of
	 * correlated subquery which was O(n²) when called for multiple jobs.
	 *
	 * @param jobId - Job UUID
	 * @returns Queue position (1-based) or 0 if not in queue
	 */
	async getQueuePosition(jobId: string): Promise<number> {
		// Use window function to compute position in a single pass
		const result = await this.jobRepository.manager.query(
			`
      SELECT position FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) as position
        FROM "document_converter"."conversion_jobs"
        WHERE status = $1
      ) ranked
      WHERE id = $2
      `,
			[JobStatus.PENDING, jobId],
		);

		return result.length > 0 ? parseInt(result[0].position, 10) : 0;
	}

	/**
	 * Calculate queue positions for multiple jobs in a single query.
	 *
	 * More efficient than calling getQueuePosition multiple times.
	 *
	 * @param jobIds - Array of job UUIDs
	 * @returns Map of jobId to queue position (1-based), missing entries = not in queue
	 */
	async getQueuePositions(jobIds: string[]): Promise<Map<string, number>> {
		if (jobIds.length === 0) {
			return new Map();
		}

		// Use window function to compute all positions in a single query
		const result = await this.jobRepository.manager.query(
			`
      SELECT id, position FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) as position
        FROM "document_converter"."conversion_jobs"
        WHERE status = $1
      ) ranked
      WHERE id = ANY($2)
      `,
			[JobStatus.PENDING, jobIds],
		);

		const positions = new Map<string, number>();
		for (const row of result) {
			positions.set(row.id, parseInt(row.position, 10));
		}
		return positions;
	}

	/**
	 * Generate output filename for converted file.
	 *
	 * @param originalFileName - Original input filename
	 * @returns Output filename with .txt extension (same base name)
	 */
	private generateOutputFileName(originalFileName: string): string {
		const nameWithoutExt = originalFileName.replace(/\.[^/.]+$/, '');
		return `${nameWithoutExt}.txt`;
	}

	/**
	 * Internal method to get a job without authorization check.
	 * Used by worker processes.
	 *
	 * @param jobId - Job UUID
	 * @returns Job or null
	 */
	async findJobById(jobId: string): Promise<ConversionJob | null> {
		return this.jobRepository.findOne({ where: { id: jobId } });
	}

	/**
	 * Internal method to update job without authorization.
	 * Used by worker processes.
	 *
	 * @param job - Job entity to save
	 * @returns Saved job
	 */
	async saveJob(job: ConversionJob): Promise<ConversionJob> {
		return this.jobRepository.save(job);
	}

	/**
	 * Mark job as failed with error details.
	 * Used by worker processes.
	 *
	 * @param jobId - Job UUID
	 * @param error - Conversion error details
	 * @returns Updated job or null if not found
	 */
	async markJobFailed(
		jobId: string,
		error: ConversionError,
	): Promise<ConversionJob | null> {
		const job = await this.findJobById(jobId);
		if (!job) return null;

		// Guard: Skip if already in terminal state (completed, cancelled, or already failed)
		if (this.isTerminalState(job.status)) {
			this.logger.debug(
				`Job ${jobId} already in terminal state: ${job.status}, skipping markJobFailed`,
			);
			return job;
		}

		try {
			job.transitionTo(JobStatus.FAILED);
			job.error = error;
			return this.saveJob(job);
		} catch (e) {
			this.logger.error(`Failed to mark job ${jobId} as failed`, e);
			return null;
		}
	}

	/**
	 * Mark job as completed with output details.
	 * Used by worker processes.
	 *
	 * @param jobId - Job UUID
	 * @param s3OutputKey - S3 key of converted file
	 * @param outputSize - Size of converted file
	 * @param processingTimeMs - Processing duration
	 * @returns Updated job or null if not found
	 */
	async markJobCompleted(
		jobId: string,
		s3OutputKey: string,
		outputSize: number,
		processingTimeMs: number,
	): Promise<ConversionJob | null> {
		const job = await this.findJobById(jobId);
		if (!job) return null;

		// Guard: Skip if already in terminal state
		if (this.isTerminalState(job.status)) {
			this.logger.debug(
				`Job ${jobId} already in terminal state: ${job.status}, skipping markJobCompleted`,
			);
			return job;
		}

		try {
			job.transitionTo(JobStatus.COMPLETED);
			job.s3OutputKey = s3OutputKey;
			job.outputSize = outputSize;
			job.processingTimeMs = processingTimeMs;
			return this.saveJob(job);
		} catch (e) {
			this.logger.error(`Failed to mark job ${jobId} as completed`, e);
			return null;
		}
	}

	/**
	 * Mark job as processing.
	 * Used by worker processes.
	 *
	 * @param jobId - Job UUID
	 * @param engine - Conversion engine being used
	 * @param pgBossJobId - pg-boss job ID
	 * @returns Updated job or null if not found
	 */
	async markJobProcessing(
		jobId: string,
		engine: string,
		pgBossJobId?: string,
	): Promise<ConversionJob | null> {
		const job = await this.findJobById(jobId);
		if (!job) return null;

		try {
			job.transitionTo(JobStatus.PROCESSING);
			job.engine = engine;
			if (pgBossJobId) job.pgBossJobId = pgBossJobId;
			return this.saveJob(job);
		} catch (e) {
			this.logger.error(`Failed to mark job ${jobId} as processing`, e);
			return null;
		}
	}

	/**
	 * Mark job as cancelled.
	 * Used by worker processes when job is aborted via AbortController.
	 *
	 * @param jobId - Job UUID
	 * @returns Updated job or null if not found/already in terminal state
	 */
	async markJobCancelled(jobId: string): Promise<ConversionJob | null> {
		const job = await this.findJobById(jobId);
		if (!job) return null;

		// Guard: Skip if already in terminal state
		if (this.isTerminalState(job.status)) {
			this.logger.debug(
				`Job ${jobId} already in terminal state: ${job.status}, skipping markJobCancelled`,
			);
			return job;
		}

		try {
			job.transitionTo(JobStatus.CANCELLED);
			const savedJob = await this.saveJob(job);
			this.logger.log(`Marked job ${jobId} as cancelled`);
			return savedJob;
		} catch (e) {
			this.logger.error(`Failed to mark job ${jobId} as cancelled`, e);
			return null;
		}
	}

	/**
	 * Check if a job is in a cancelled state.
	 * Used by worker processes to check if they should stop processing.
	 *
	 * @param jobId - Job UUID
	 * @returns true if job is cancelled
	 */
	async isJobCancelled(jobId: string): Promise<boolean> {
		const job = await this.findJobById(jobId);
		return job?.status === JobStatus.CANCELLED;
	}

	/**
	 * Check if a job status is a terminal state.
	 * Terminal states are: COMPLETED, FAILED, CANCELLED
	 *
	 * @param status - Job status to check
	 * @returns true if status is terminal
	 */
	private isTerminalState(status: JobStatus): boolean {
		return [
			JobStatus.COMPLETED,
			JobStatus.FAILED,
			JobStatus.CANCELLED,
		].includes(status);
	}
}
