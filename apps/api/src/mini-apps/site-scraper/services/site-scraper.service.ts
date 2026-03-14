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
import { Repository, DataSource } from 'typeorm';

import { PgBossService, SiteScraperJobData } from '../../../_platform/queue';
import { AwsS3Service } from '../../../_platform/aws';
import {
	ResponseEnvelopeFind,
	FindOptions,
	ResponseStatus,
} from '../../../_platform/models';
import { JobNotFoundError } from '../../../_platform/errors/domain.errors';
import { ScrapeJob } from '../entities/scrape-job.entity';
import { ScrapedPage, ScreenshotRecord } from '../entities/scraped-page.entity';
import {
	JobStatus,
	PageStatus,
	isTerminalStatus,
} from '../types/job-status.enum';
import { ScrapeError } from '../types/scrape-error.types';

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

		await this.pgBossService.sendSiteScraperJob(jobData);

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
}
