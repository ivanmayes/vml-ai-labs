/**
 * SiteScraperService
 *
 * Core service for managing scrape job entities.
 * Handles CRUD operations, status transitions, page result persistence,
 * and S3 cleanup.
 *
 * Authorization Note:
 * All public methods require organizationId to ensure
 * users can only access jobs within their organization.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, LessThan } from 'typeorm';

import { PgBossService, SiteScraperJobData } from '../../../_platform/queue';
import { AwsS3Service } from '../../../_platform/aws';
import {
	ResponseEnvelopeFind,
	FindOptions,
	ResponseStatus,
} from '../../../_platform/models';
import {
	JobNotFoundError,
	InvalidStatusTransitionError,
} from '../../../_platform/errors/domain.errors';
import { ScrapeJob } from '../entities/scrape-job.entity';
import { ScrapedPage, ScreenshotRecord } from '../entities/scraped-page.entity';
import {
	JobStatus,
	PageStatus,
	isTerminalStatus,
	isRetryableStatus,
} from '../types/job-status.enum';
import { ScrapeError, createScrapeError } from '../types/scrape-error.types';

/**
 * Input data for saving a scraped page result.
 */
export interface SavePageResultInput {
	url: string;
	title: string | null;
	htmlS3Key: string | null;
	screenshots: ScreenshotRecord[];
	status: 'completed' | 'failed';
	errorMessage?: string | null;
}

@Injectable()
export class SiteScraperService {
	private readonly logger = new Logger(SiteScraperService.name);

	constructor(
		@InjectRepository(ScrapeJob)
		private readonly jobRepository: Repository<ScrapeJob>,
		@InjectRepository(ScrapedPage)
		private readonly pageRepository: Repository<ScrapedPage>,
		private readonly pgBossService: PgBossService,
		private readonly s3Service: AwsS3Service,
		private readonly dataSource: DataSource,
	) {}

	/**
	 * Create a new scrape job and queue it for processing.
	 *
	 * @param url - URL to start crawling from
	 * @param maxDepth - Maximum crawl depth
	 * @param viewports - Viewport widths for screenshots
	 * @param userId - User who initiated the job
	 * @param orgId - Organization context
	 * @returns Created scrape job
	 */
	async createJob(
		url: string,
		maxDepth: number,
		viewports: number[],
		userId: string,
		orgId: string,
	): Promise<ScrapeJob> {
		const job = this.jobRepository.create({
			url,
			maxDepth,
			viewports,
			userId,
			organizationId: orgId,
			status: JobStatus.PENDING,
			pagesDiscovered: 1, // seed URL counts as discovered
		});

		const savedJob = await this.jobRepository.save(job);
		this.logger.log(`Created scrape job: ${savedJob.id}`);

		// Queue the job for processing
		const jobData: SiteScraperJobData = {
			jobId: savedJob.id,
			url,
			maxDepth,
			viewports,
			userId,
			organizationId: orgId,
		};

		// Fire-and-forget: don't block the HTTP response waiting for pg-boss
		this.pgBossService.sendSiteScraperJob(jobData).catch((err) => {
			this.logger.error(
				`Failed to queue scrape job ${savedJob.id}: ${err}`,
			);
		});

		return savedJob;
	}

	/**
	 * Get paginated list of jobs for a user.
	 *
	 * @param userId - User ID for scoping
	 * @param orgId - Organization ID for scoping
	 * @param findOptions - Pagination options
	 * @returns Paginated response envelope
	 */
	async getJobs(
		userId: string,
		orgId: string,
		findOptions: FindOptions<ScrapeJob>,
	): Promise<ResponseEnvelopeFind<ScrapeJob>> {
		const { page, perPage } = findOptions;
		const skip = (page - 1) * perPage;

		const [results, totalResults] = await this.jobRepository.findAndCount({
			where: {
				userId,
				organizationId: orgId,
			},
			order: { createdAt: 'DESC' },
			skip,
			take: perPage,
		});

		const numPages = Math.ceil(totalResults / perPage);

		return new ResponseEnvelopeFind<ScrapeJob>(
			ResponseStatus.Success,
			undefined,
			{
				page,
				perPage,
				numPages,
				totalResults,
				results,
			},
		);
	}

	/**
	 * Get a single job by ID with org verification.
	 *
	 * @param jobId - Job UUID
	 * @param orgId - Organization ID for authorization
	 * @returns The job if found and authorized
	 * @throws JobNotFoundError if job doesn't exist or user lacks access
	 */
	async getJob(jobId: string, orgId: string): Promise<ScrapeJob> {
		const job = await this.jobRepository.findOne({
			where: {
				id: jobId,
				organizationId: orgId,
			},
		});

		if (!job) {
			throw new JobNotFoundError();
		}

		return job;
	}

	/**
	 * Get all pages for a job.
	 *
	 * @param jobId - Job UUID
	 * @param orgId - Organization ID for authorization
	 * @returns Array of scraped pages
	 * @throws JobNotFoundError if job doesn't exist or user lacks access
	 */
	async getPages(jobId: string, orgId: string): Promise<ScrapedPage[]> {
		// Verify the job exists and belongs to the org
		await this.getJob(jobId, orgId);

		return this.pageRepository.find({
			where: { scrapeJobId: jobId },
			order: { createdAt: 'ASC' },
		});
	}

	/**
	 * Get a single page with org verification via join to ScrapeJob.
	 *
	 * @param pageId - Page UUID
	 * @param orgId - Organization ID for authorization
	 * @returns The page if found and authorized
	 * @throws JobNotFoundError if page doesn't exist or user lacks access
	 */
	async getPageWithAuth(pageId: string, orgId: string): Promise<ScrapedPage> {
		const page = await this.pageRepository
			.createQueryBuilder('page')
			.innerJoin('page.scrapeJob', 'job')
			.where('page.id = :pageId', { pageId })
			.andWhere('job.organizationId = :orgId', { orgId })
			.getOne();

		if (!page) {
			throw new JobNotFoundError();
		}

		return page;
	}

	/**
	 * Mark a job as running.
	 * Used by the worker when it picks up a job.
	 *
	 * @param jobId - Job UUID
	 * @param pgBossJobId - pg-boss job ID for tracking
	 * @returns Updated job or null if not found
	 */
	async markJobRunning(
		jobId: string,
		pgBossJobId: string,
	): Promise<ScrapeJob | null> {
		const job = await this.jobRepository.findOne({
			where: { id: jobId },
		});
		if (!job) return null;

		try {
			job.transitionTo(JobStatus.RUNNING);
			const savedJob = await this.jobRepository.save(job);
			this.logger.log(
				`Marked job ${jobId} as running (pg-boss: ${pgBossJobId})`,
			);
			return savedJob;
		} catch (e) {
			this.logger.error(`Failed to mark job ${jobId} as running`, e);
			return null;
		}
	}

	/**
	 * Mark a job as completed.
	 * Reconciles actual page counts from the database.
	 *
	 * @param jobId - Job UUID
	 * @returns Updated job or null if not found
	 */
	async markJobCompleted(jobId: string): Promise<ScrapeJob | null> {
		const job = await this.jobRepository.findOne({
			where: { id: jobId },
		});
		if (!job) return null;

		if (isTerminalStatus(job.status)) {
			this.logger.debug(
				`Job ${jobId} already in terminal state: ${job.status}, skipping markJobCompleted`,
			);
			return job;
		}

		try {
			// Reconcile actual page counts from DB
			const [completedCount, failedCount] = await Promise.all([
				this.pageRepository.count({
					where: { scrapeJobId: jobId, status: PageStatus.COMPLETED },
				}),
				this.pageRepository.count({
					where: { scrapeJobId: jobId, status: PageStatus.FAILED },
				}),
			]);

			job.pagesCompleted = completedCount;
			job.pagesFailed = failedCount;

			if (failedCount > 0) {
				job.transitionTo(JobStatus.COMPLETED_WITH_ERRORS);
			} else {
				job.transitionTo(JobStatus.COMPLETED);
			}

			return this.jobRepository.save(job);
		} catch (e) {
			this.logger.error(`Failed to mark job ${jobId} as completed`, e);
			return null;
		}
	}

	/**
	 * Mark a job as failed with error information.
	 *
	 * @param jobId - Job UUID
	 * @param error - Structured error information
	 * @returns Updated job or null if not found
	 */
	async markJobFailed(
		jobId: string,
		error: ScrapeError,
	): Promise<ScrapeJob | null> {
		const job = await this.jobRepository.findOne({
			where: { id: jobId },
		});
		if (!job) return null;

		if (isTerminalStatus(job.status)) {
			this.logger.debug(
				`Job ${jobId} already in terminal state: ${job.status}, skipping markJobFailed`,
			);
			return job;
		}

		try {
			job.transitionTo(JobStatus.FAILED);
			job.error = error;
			return this.jobRepository.save(job);
		} catch (e) {
			this.logger.error(`Failed to mark job ${jobId} as failed`, e);
			return null;
		}
	}

	/**
	 * Mark a job as cancelled.
	 *
	 * @param jobId - Job UUID
	 * @returns Updated job or null if not found
	 */
	async markJobCancelled(jobId: string): Promise<ScrapeJob | null> {
		const job = await this.jobRepository.findOne({
			where: { id: jobId },
		});
		if (!job) return null;

		if (isTerminalStatus(job.status)) {
			this.logger.debug(
				`Job ${jobId} already in terminal state: ${job.status}, skipping markJobCancelled`,
			);
			return job;
		}

		try {
			job.transitionTo(JobStatus.CANCELLED);
			const savedJob = await this.jobRepository.save(job);
			this.logger.log(`Marked job ${jobId} as cancelled`);
			return savedJob;
		} catch (e) {
			this.logger.error(`Failed to mark job ${jobId} as cancelled`, e);
			return null;
		}
	}

	/**
	 * Save a scraped page result and atomically increment the pagesCompleted counter.
	 * Uses a transaction to ensure consistency between page insert and counter update.
	 *
	 * @param jobId - Job UUID
	 * @param data - Page result data
	 * @returns Saved page entity
	 */
	async savePageResult(
		jobId: string,
		data: SavePageResultInput,
	): Promise<ScrapedPage> {
		const pageEntity = this.pageRepository.create({
			scrapeJobId: jobId,
			url: data.url,
			title: data.title,
			htmlS3Key: data.htmlS3Key,
			screenshots: data.screenshots,
			status:
				data.status === 'completed'
					? PageStatus.COMPLETED
					: PageStatus.FAILED,
			errorMessage: data.errorMessage || null,
		});

		return this.dataSource.transaction(async (manager) => {
			const saved = await manager
				.getRepository(ScrapedPage)
				.save(pageEntity);

			if (data.status === 'completed') {
				await manager
					.createQueryBuilder()
					.update(ScrapeJob)
					.set({
						pagesCompleted: () => '"pagesCompleted" + 1',
					})
					.where('id = :jobId', { jobId })
					.execute();
			} else {
				await manager
					.createQueryBuilder()
					.update(ScrapeJob)
					.set({
						pagesFailed: () => '"pagesFailed" + 1',
					})
					.where('id = :jobId', { jobId })
					.execute();
			}

			return saved;
		});
	}

	/**
	 * Atomically increment the pagesDiscovered counter.
	 *
	 * @param jobId - Job UUID
	 * @param count - Number of pages discovered
	 */
	async incrementPagesDiscovered(
		jobId: string,
		count: number,
	): Promise<void> {
		await this.jobRepository
			.createQueryBuilder()
			.update(ScrapeJob)
			.set({
				pagesDiscovered: () => `"pagesDiscovered" + ${count}`,
			})
			.where('id = :jobId', { jobId })
			.execute();
	}

	/**
	 * Atomically increment the pagesSkippedByDepth counter.
	 *
	 * @param jobId - Job UUID
	 * @param count - Number of beyond-depth links found
	 */
	async incrementPagesSkippedByDepth(
		jobId: string,
		count: number,
	): Promise<void> {
		await this.jobRepository
			.createQueryBuilder()
			.update(ScrapeJob)
			.set({
				pagesSkippedByDepth: () => `"pagesSkippedByDepth" + ${count}`,
			})
			.where('id = :jobId', { jobId })
			.execute();
	}

	/**
	 * Delete a job and clean up associated S3 files.
	 * Collects all S3 keys from pages, deletes them in batches of 1000,
	 * then deletes the job (CASCADE deletes pages).
	 *
	 * @param jobId - Job UUID
	 * @param orgId - Organization ID for authorization
	 * @throws JobNotFoundError if job doesn't exist or user lacks access
	 */
	async deleteJob(jobId: string, orgId: string): Promise<void> {
		const job = await this.getJob(jobId, orgId);

		// Collect all S3 keys from pages
		const pages = await this.pageRepository.find({
			where: { scrapeJobId: jobId },
			select: ['htmlS3Key', 'screenshots'],
		});

		const keysToDelete: string[] = [];
		for (const page of pages) {
			if (page.htmlS3Key) {
				keysToDelete.push(page.htmlS3Key);
			}
			if (page.screenshots && page.screenshots.length > 0) {
				for (const screenshot of page.screenshots) {
					keysToDelete.push(screenshot.s3Key);
				}
			}
		}

		// Delete S3 files in batches of 1000
		if (keysToDelete.length > 0) {
			try {
				const batchSize = 1000;
				for (let i = 0; i < keysToDelete.length; i += batchSize) {
					const batch = keysToDelete.slice(i, i + batchSize);
					await this.s3Service.deleteMany(batch);
				}
				this.logger.debug(
					`Deleted ${keysToDelete.length} S3 files for job ${jobId}`,
				);
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
	 * Check if a job has been cancelled.
	 * Used by the worker to detect API-initiated cancellations.
	 *
	 * @param jobId - Job UUID
	 * @returns true if job is cancelled
	 */
	async isJobCancelled(jobId: string): Promise<boolean> {
		const job = await this.jobRepository.findOne({
			where: { id: jobId },
			select: ['id', 'status'],
		});
		return job?.status === JobStatus.CANCELLED;
	}

	/**
	 * Retry a failed/errored/cancelled job.
	 * Cleans up failed pages and their S3 artifacts, resets counters,
	 * transitions back to PENDING, and re-queues for processing.
	 *
	 * @param jobId - Job UUID
	 * @param orgId - Organization ID for authorization
	 * @param userId - User ID for authorization and re-queuing
	 * @returns Updated job entity
	 * @throws JobNotFoundError if job doesn't exist or user lacks access
	 * @throws InvalidStatusTransitionError if job is not in a retryable status
	 */
	async retryJob(
		jobId: string,
		orgId: string,
		userId: string,
	): Promise<ScrapeJob> {
		const job = await this.jobRepository.findOne({
			where: { id: jobId, organizationId: orgId, userId },
		});

		if (!job) {
			throw new JobNotFoundError();
		}

		if (!isRetryableStatus(job.status)) {
			throw new InvalidStatusTransitionError(
				`Cannot retry job in ${job.status} status`,
			);
		}

		// Find failed pages and clean up their S3 artifacts
		const failedPages = await this.pageRepository.find({
			where: { scrapeJobId: jobId, status: PageStatus.FAILED },
			select: ['id', 'htmlS3Key', 'screenshots'],
		});

		if (failedPages.length > 0) {
			const keysToDelete: string[] = [];
			for (const page of failedPages) {
				if (page.htmlS3Key) {
					keysToDelete.push(page.htmlS3Key);
				}
				if (page.screenshots?.length) {
					for (const screenshot of page.screenshots) {
						keysToDelete.push(screenshot.s3Key);
					}
				}
			}

			if (keysToDelete.length > 0) {
				try {
					await this.s3Service.deleteMany(keysToDelete);
				} catch (error) {
					this.logger.error(
						`Failed to delete S3 files for failed pages of job ${jobId}`,
						error,
					);
				}
			}

			// Delete failed page rows
			const failedPageIds = failedPages.map((p) => p.id);
			await this.pageRepository.delete(failedPageIds);
		}

		// Count remaining completed pages
		const completedCount = await this.pageRepository.count({
			where: { scrapeJobId: jobId, status: PageStatus.COMPLETED },
		});

		// Reset job counters
		job.pagesCompleted = completedCount;
		job.pagesFailed = 0;
		job.pagesDiscovered = completedCount;
		job.pagesSkippedByDepth = 0;
		job.error = null;
		job.completedAt = null as any;
		job.startedAt = null as any;

		// Transition back to PENDING
		job.transitionTo(JobStatus.PENDING);
		const savedJob = await this.jobRepository.save(job);

		// Re-queue to pg-boss
		const jobData: SiteScraperJobData = {
			jobId: savedJob.id,
			url: savedJob.url,
			maxDepth: savedJob.maxDepth,
			viewports: savedJob.viewports,
			userId,
			organizationId: orgId,
		};

		await this.pgBossService.sendSiteScraperJob(jobData);

		this.logger.log(
			`Retried job ${jobId} with ${completedCount} existing completed pages`,
		);

		return savedJob;
	}

	/**
	 * Get URLs of all completed pages for a job.
	 * Used by the worker to skip already-completed pages on retry.
	 *
	 * @param jobId - Job UUID
	 * @returns Array of completed page URLs
	 */
	async getCompletedPageUrls(jobId: string): Promise<string[]> {
		const pages = await this.pageRepository.find({
			where: { scrapeJobId: jobId, status: PageStatus.COMPLETED },
			select: ['url'],
		});

		return pages.map((p) => p.url);
	}

	/**
	 * Cancel any active job in the org (admin, no userId check).
	 *
	 * @param jobId - Job UUID
	 * @param orgId - Organization ID for authorization
	 * @returns Updated job
	 * @throws JobNotFoundError if job doesn't exist in the org
	 * @throws InvalidStatusTransitionError if job is already terminal
	 */
	async adminCancelJob(jobId: string, orgId: string): Promise<ScrapeJob> {
		const job = await this.jobRepository.findOne({
			where: { id: jobId, organizationId: orgId },
		});

		if (!job) {
			throw new JobNotFoundError();
		}

		if (isTerminalStatus(job.status)) {
			throw new InvalidStatusTransitionError(
				`Cannot cancel job in ${job.status} status`,
			);
		}

		job.transitionTo(JobStatus.CANCELLED);
		const savedJob = await this.jobRepository.save(job);
		this.logger.log(`Admin cancelled job ${jobId}`);
		return savedJob;
	}

	/**
	 * Re-queue a single PENDING job that was never picked up by pg-boss.
	 * Used by the manual "Requeue" button in the UI.
	 *
	 * @param jobId - Job UUID
	 * @param orgId - Organization ID for authorization
	 * @param userId - User ID for authorization
	 * @returns The job entity
	 * @throws JobNotFoundError if job doesn't exist or user lacks access
	 * @throws InvalidStatusTransitionError if job is not in PENDING status
	 */
	async requeueJob(
		jobId: string,
		orgId: string,
		userId: string,
	): Promise<ScrapeJob> {
		const job = await this.jobRepository.findOne({
			where: { id: jobId, organizationId: orgId, userId },
		});

		if (!job) {
			throw new JobNotFoundError();
		}

		if (job.status !== JobStatus.PENDING) {
			throw new InvalidStatusTransitionError(
				`Cannot requeue job in ${job.status} status — only PENDING jobs can be requeued`,
			);
		}

		await this.pgBossService.sendSiteScraperJob({
			jobId: job.id,
			url: job.url,
			maxDepth: job.maxDepth,
			viewports: job.viewports,
			userId: job.userId,
			organizationId: job.organizationId,
		});

		this.logger.log(`Manually re-queued PENDING job ${jobId}`);
		return job;
	}

	/**
	 * Fail orphaned RUNNING jobs on startup.
	 * When the process restarts, any RUNNING jobs are orphaned —
	 * the worker that was processing them is gone.
	 *
	 * @returns Number of orphaned jobs marked as failed
	 */
	async failOrphanedRunningJobs(): Promise<number> {
		const runningJobs = await this.jobRepository.find({
			where: { status: JobStatus.RUNNING },
		});

		for (const job of runningJobs) {
			job.transitionTo(JobStatus.FAILED);
			job.error = createScrapeError(
				'WORKER_RESTART',
				'Worker process restarted while job was running — use Retry to re-run',
			);
			await this.jobRepository.save(job);
		}

		if (runningJobs.length > 0) {
			this.logger.log(
				`Marked ${runningJobs.length} orphaned RUNNING jobs as FAILED`,
			);
		}

		return runningJobs.length;
	}

	/**
	 * Get queue positions for all active (RUNNING + PENDING) jobs.
	 * RUNNING jobs get position 0, PENDING jobs get 1, 2, 3... by creation order.
	 *
	 * @returns Map of jobId → queue position
	 */
	async getQueuePositions(): Promise<Map<string, number>> {
		const activeJobs = await this.jobRepository.find({
			where: { status: In([JobStatus.RUNNING, JobStatus.PENDING]) },
			order: { createdAt: 'ASC' },
			select: ['id', 'status'],
		});

		const positions = new Map<string, number>();
		let pendingPosition = 0;

		for (const job of activeJobs) {
			if (job.status === JobStatus.RUNNING) {
				positions.set(job.id, 0);
			}
		}

		for (const job of activeJobs) {
			if (job.status === JobStatus.PENDING) {
				pendingPosition++;
				positions.set(job.id, pendingPosition);
			}
		}

		return positions;
	}

	/**
	 * Re-queue PENDING jobs that were never picked up by pg-boss.
	 * Recovers from fire-and-forget queue failures on startup.
	 *
	 * @returns Number of stale jobs re-queued
	 */
	async requeueStaleJobs(): Promise<number> {
		const staleThreshold = new Date(Date.now() - 60_000); // 1 minute old
		const staleJobs = await this.jobRepository.find({
			where: {
				status: JobStatus.PENDING,
				createdAt: LessThan(staleThreshold),
			},
		});

		for (const job of staleJobs) {
			await this.pgBossService.sendSiteScraperJob({
				jobId: job.id,
				url: job.url,
				maxDepth: job.maxDepth,
				viewports: job.viewports,
				userId: job.userId,
				organizationId: job.organizationId,
			});
		}

		if (staleJobs.length > 0) {
			this.logger.log(`Re-queued ${staleJobs.length} stale PENDING jobs`);
		}

		return staleJobs.length;
	}
}
