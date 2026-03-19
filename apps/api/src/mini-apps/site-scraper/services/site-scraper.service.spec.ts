import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { PgBossService } from '../../../_platform/queue';
import { AwsS3Service, AwsSqsService } from '../../../_platform/aws';
import {
	JobNotFoundError,
	InvalidStatusTransitionError,
} from '../../../_platform/errors/domain.errors';
import { ScrapeJob } from '../entities/scrape-job.entity';
import { ScrapedPage } from '../entities/scraped-page.entity';
import { JobStatus, PageStatus } from '../types/job-status.enum';

import {
	SiteScraperService,
	SavePageResultInput,
} from './site-scraper.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockJob(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
	const job = new ScrapeJob();
	job.id = uuidv4();
	job.url = 'https://example.com';
	job.maxDepth = 3;
	job.viewports = [1920];
	job.status = JobStatus.PENDING;
	job.pagesDiscovered = 1;
	job.pagesCompleted = 0;
	job.pagesFailed = 0;
	job.pagesSkippedByDepth = 0;
	job.error = null;
	job.userId = uuidv4();
	job.organizationId = uuidv4();
	job.createdAt = new Date();
	job.updatedAt = new Date();
	job.startedAt = null as any;
	job.completedAt = null as any;
	Object.assign(job, overrides);
	return job;
}

function createMockPage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
	const page = Object.assign(new ScrapedPage(), {
		id: uuidv4(),
		scrapeJobId: uuidv4(),
		url: 'https://example.com/page',
		title: 'Test Page',
		htmlS3Key: 'html/test.html',
		screenshots: [{ viewport: 1920, s3Key: 'screenshots/test.jpg' }],
		status: PageStatus.COMPLETED,
		errorMessage: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	});
	return page;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function mockRepository() {
	return {
		create: jest.fn(),
		save: jest.fn(),
		findOne: jest.fn(),
		find: jest.fn(),
		findAndCount: jest.fn(),
		count: jest.fn(),
		remove: jest.fn(),
		delete: jest.fn(),
		createQueryBuilder: jest.fn(() => mockQueryBuilder()),
	};
}

function mockQueryBuilder() {
	const qb: any = {
		update: jest.fn().mockReturnThis(),
		set: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		setParameter: jest.fn().mockReturnThis(),
		execute: jest.fn().mockResolvedValue({ affected: 1 }),
		innerJoin: jest.fn().mockReturnThis(),
		getOne: jest.fn(),
	};
	return qb;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SiteScraperService', () => {
	let service: SiteScraperService;
	let jobRepo: jest.Mocked<Repository<ScrapeJob>>;
	let pageRepo: jest.Mocked<Repository<ScrapedPage>>;
	let pgBossService: { sendSiteScraperJob: jest.Mock };
	let s3Service: { deleteMany: jest.Mock };
	let dataSource: { transaction: jest.Mock };

	beforeEach(async () => {
		const jobRepoToken = getRepositoryToken(ScrapeJob);
		const pageRepoToken = getRepositoryToken(ScrapedPage);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				SiteScraperService,
				{ provide: jobRepoToken, useFactory: mockRepository },
				{ provide: pageRepoToken, useFactory: mockRepository },
				{
					provide: PgBossService,
					useValue: {
						sendSiteScraperJob: jest
							.fn()
							.mockResolvedValue('pgboss-id'),
					},
				},
				{
					provide: AwsS3Service,
					useValue: {
						deleteMany: jest.fn().mockResolvedValue(undefined),
					},
				},
				{
					provide: AwsSqsService,
					useValue: {
						sendPageWork: jest.fn().mockResolvedValue(undefined),
						sendBatch: jest.fn().mockResolvedValue(undefined),
					},
				},
				{
					provide: DataSource,
					useValue: {
						transaction: jest.fn(),
					},
				},
			],
		}).compile();

		service = module.get(SiteScraperService);
		jobRepo = module.get(jobRepoToken);
		pageRepo = module.get(pageRepoToken);
		pgBossService = module.get(PgBossService);
		s3Service = module.get(AwsS3Service);
		dataSource = module.get(DataSource);
	});

	// -----------------------------------------------------------------------
	// createJob
	// -----------------------------------------------------------------------
	describe('createJob', () => {
		it('creates job with correct defaults (pagesDiscovered: 1, status: pending)', async () => {
			const mockJob = createMockJob();
			jobRepo.create.mockReturnValue(mockJob);
			jobRepo.save.mockResolvedValue(mockJob);

			const result = await service.createJob(
				'https://example.com',
				3,
				[1920],
				mockJob.userId,
				mockJob.organizationId,
			);

			expect(jobRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					pagesDiscovered: 1,
					status: JobStatus.PENDING,
				}),
			);
			expect(result).toBe(mockJob);
		});

		it('associates job with organization and user', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const mockJob = createMockJob({ userId, organizationId: orgId });
			jobRepo.create.mockReturnValue(mockJob);
			jobRepo.save.mockResolvedValue(mockJob);

			await service.createJob(
				'https://example.com',
				3,
				[1920],
				userId,
				orgId,
			);

			expect(jobRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					userId,
					organizationId: orgId,
				}),
			);
		});

		it('queues the job via PgBossService after saving', async () => {
			const mockJob = createMockJob();
			jobRepo.create.mockReturnValue(mockJob);
			jobRepo.save.mockResolvedValue(mockJob);

			await service.createJob(
				mockJob.url,
				mockJob.maxDepth,
				mockJob.viewports,
				mockJob.userId,
				mockJob.organizationId,
			);

			expect(pgBossService.sendSiteScraperJob).toHaveBeenCalledWith(
				expect.objectContaining({
					jobId: mockJob.id,
					url: mockJob.url,
				}),
			);
		});

		it('marks job as FAILED when queuing fails', async () => {
			const mockJob = createMockJob();
			jobRepo.create.mockReturnValue(mockJob);
			jobRepo.save.mockResolvedValue(mockJob);
			pgBossService.sendSiteScraperJob.mockRejectedValue(
				new Error('Queue down'),
			);

			const result = await service.createJob(
				mockJob.url,
				mockJob.maxDepth,
				mockJob.viewports,
				mockJob.userId,
				mockJob.organizationId,
			);

			// save called twice: once for initial create, once for failed state
			expect(jobRepo.save).toHaveBeenCalledTimes(2);
			expect(result.error).toBeDefined();
			expect(result.error!.code).toBe('QUEUE_FAILED');
		});
	});

	// -----------------------------------------------------------------------
	// getJob
	// -----------------------------------------------------------------------
	describe('getJob', () => {
		it('returns job when found with matching orgId', async () => {
			const mockJob = createMockJob();
			jobRepo.findOne.mockResolvedValue(mockJob);

			const result = await service.getJob(
				mockJob.id,
				mockJob.organizationId,
			);

			expect(result).toBe(mockJob);
			expect(jobRepo.findOne).toHaveBeenCalledWith({
				where: {
					id: mockJob.id,
					organizationId: mockJob.organizationId,
				},
			});
		});

		it('throws JobNotFoundError when job does not exist', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			await expect(service.getJob(uuidv4(), uuidv4())).rejects.toThrow(
				JobNotFoundError,
			);
		});

		it('filters by organizationId to prevent cross-org access', async () => {
			jobRepo.findOne.mockResolvedValue(null);
			const jobId = uuidv4();
			const wrongOrgId = uuidv4();

			await expect(service.getJob(jobId, wrongOrgId)).rejects.toThrow(
				JobNotFoundError,
			);

			expect(jobRepo.findOne).toHaveBeenCalledWith({
				where: { id: jobId, organizationId: wrongOrgId },
			});
		});
	});

	// -----------------------------------------------------------------------
	// getJobs
	// -----------------------------------------------------------------------
	describe('getJobs', () => {
		it('returns paginated results scoped to user and organization', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const jobs = [createMockJob({ userId, organizationId: orgId })];
			jobRepo.findAndCount.mockResolvedValue([jobs, 1]);

			const result = await service.getJobs(userId, orgId, {
				page: 1,
				perPage: 10,
			} as any);

			expect(result.data.results).toEqual(jobs);
			expect(result.data.totalResults).toBe(1);
			expect(jobRepo.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { userId, organizationId: orgId },
				}),
			);
		});
	});

	// -----------------------------------------------------------------------
	// getPages
	// -----------------------------------------------------------------------
	describe('getPages', () => {
		it('returns pages for a job after verifying org ownership', async () => {
			const mockJob = createMockJob();
			const pages = [createMockPage({ scrapeJobId: mockJob.id })];
			jobRepo.findOne.mockResolvedValue(mockJob);
			pageRepo.find.mockResolvedValue(pages);

			const result = await service.getPages(
				mockJob.id,
				mockJob.organizationId,
			);

			expect(result).toEqual(pages);
		});

		it('throws JobNotFoundError if job does not exist', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			await expect(service.getPages(uuidv4(), uuidv4())).rejects.toThrow(
				JobNotFoundError,
			);
		});
	});

	// -----------------------------------------------------------------------
	// markJobRunning
	// -----------------------------------------------------------------------
	describe('markJobRunning', () => {
		it('transitions job to RUNNING status', async () => {
			const mockJob = createMockJob({ status: JobStatus.PENDING });
			jobRepo.findOne.mockResolvedValue(mockJob);
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const result = await service.markJobRunning(
				mockJob.id,
				'pgboss-123',
			);

			expect(result!.status).toBe(JobStatus.RUNNING);
			expect(result!.startedAt).toBeDefined();
		});

		it('returns null when job is not found', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			const result = await service.markJobRunning(uuidv4(), 'pgboss-123');

			expect(result).toBeNull();
		});

		it('returns null when transition is invalid (e.g. COMPLETED to RUNNING)', async () => {
			const mockJob = createMockJob({ status: JobStatus.COMPLETED });
			mockJob.completedAt = new Date();
			jobRepo.findOne.mockResolvedValue(mockJob);

			const result = await service.markJobRunning(
				mockJob.id,
				'pgboss-123',
			);

			expect(result).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// markJobCompleted
	// -----------------------------------------------------------------------
	describe('markJobCompleted', () => {
		it('transitions job to COMPLETED and reconciles page counts', async () => {
			const mockJob = createMockJob({ status: JobStatus.RUNNING });
			mockJob.startedAt = new Date();
			jobRepo.findOne.mockResolvedValue(mockJob);
			pageRepo.count
				.mockResolvedValueOnce(5) // completed count
				.mockResolvedValueOnce(0); // failed count
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const result = await service.markJobCompleted(mockJob.id);

			expect(result!.status).toBe(JobStatus.COMPLETED);
			expect(result!.pagesCompleted).toBe(5);
			expect(result!.pagesFailed).toBe(0);
			expect(result!.completedAt).toBeDefined();
		});

		it('transitions to COMPLETED_WITH_ERRORS when there are failed pages', async () => {
			const mockJob = createMockJob({ status: JobStatus.RUNNING });
			mockJob.startedAt = new Date();
			jobRepo.findOne.mockResolvedValue(mockJob);
			pageRepo.count
				.mockResolvedValueOnce(3) // completed count
				.mockResolvedValueOnce(2); // failed count
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const result = await service.markJobCompleted(mockJob.id);

			expect(result!.status).toBe(JobStatus.COMPLETED_WITH_ERRORS);
			expect(result!.pagesFailed).toBe(2);
		});

		it('returns job unchanged if already in terminal state', async () => {
			const mockJob = createMockJob({ status: JobStatus.COMPLETED });
			jobRepo.findOne.mockResolvedValue(mockJob);

			const result = await service.markJobCompleted(mockJob.id);

			expect(result).toBe(mockJob);
			expect(jobRepo.save).not.toHaveBeenCalled();
		});

		it('returns null when job is not found', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			const result = await service.markJobCompleted(uuidv4());

			expect(result).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// markJobFailed
	// -----------------------------------------------------------------------
	describe('markJobFailed', () => {
		it('transitions job to FAILED with error information', async () => {
			const mockJob = createMockJob({ status: JobStatus.RUNNING });
			mockJob.startedAt = new Date();
			jobRepo.findOne.mockResolvedValue(mockJob);
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const error = {
				code: 'CRAWL_FAILED' as const,
				message: 'Something went wrong',
				retryable: false,
				timestamp: new Date().toISOString(),
			};

			const result = await service.markJobFailed(mockJob.id, error);

			expect(result!.status).toBe(JobStatus.FAILED);
			expect(result!.error).toBe(error);
			expect(result!.completedAt).toBeDefined();
		});

		it('skips transition if already in terminal state', async () => {
			const mockJob = createMockJob({ status: JobStatus.CANCELLED });
			jobRepo.findOne.mockResolvedValue(mockJob);

			const error = {
				code: 'CRAWL_FAILED' as const,
				message: 'Error',
				retryable: false,
				timestamp: new Date().toISOString(),
			};

			const result = await service.markJobFailed(mockJob.id, error);

			expect(result).toBe(mockJob);
			expect(jobRepo.save).not.toHaveBeenCalled();
		});

		it('returns null when job is not found', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			const error = {
				code: 'CRAWL_FAILED' as const,
				message: 'Error',
				retryable: false,
				timestamp: new Date().toISOString(),
			};

			const result = await service.markJobFailed(uuidv4(), error);

			expect(result).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// markJobCancelled
	// -----------------------------------------------------------------------
	describe('markJobCancelled', () => {
		it('transitions RUNNING job to CANCELLED', async () => {
			const mockJob = createMockJob({ status: JobStatus.RUNNING });
			mockJob.startedAt = new Date();
			jobRepo.findOne.mockResolvedValue(mockJob);
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const result = await service.markJobCancelled(mockJob.id);

			expect(result!.status).toBe(JobStatus.CANCELLED);
		});

		it('skips transition if already in terminal state', async () => {
			const mockJob = createMockJob({ status: JobStatus.COMPLETED });
			jobRepo.findOne.mockResolvedValue(mockJob);

			const result = await service.markJobCancelled(mockJob.id);

			expect(result).toBe(mockJob);
			expect(jobRepo.save).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// savePageResult
	// -----------------------------------------------------------------------
	describe('savePageResult', () => {
		it('saves a completed page and increments pagesCompleted counter', async () => {
			const jobId = uuidv4();
			const pageData: SavePageResultInput = {
				url: 'https://example.com/about',
				title: 'About',
				htmlS3Key: 'html/about.html',
				screenshots: [
					{ viewport: 1920, s3Key: 'screenshots/about.jpg' },
				],
				status: 'completed',
			};

			const savedPage = createMockPage({ scrapeJobId: jobId });
			const mockManager = {
				getRepository: jest.fn().mockReturnValue({
					save: jest.fn().mockResolvedValue(savedPage),
				}),
				createQueryBuilder: jest.fn().mockReturnValue({
					update: jest.fn().mockReturnThis(),
					set: jest.fn().mockReturnThis(),
					where: jest.fn().mockReturnThis(),
					execute: jest.fn().mockResolvedValue({ affected: 1 }),
				}),
			};
			dataSource.transaction.mockImplementation(async (cb: any) =>
				cb(mockManager),
			);

			const result = await service.savePageResult(jobId, pageData);

			expect(result).toBe(savedPage);
			expect(mockManager.createQueryBuilder).toHaveBeenCalled();
		});

		it('increments pagesFailed counter for failed pages', async () => {
			const jobId = uuidv4();
			const pageData: SavePageResultInput = {
				url: 'https://example.com/broken',
				title: null,
				htmlS3Key: null,
				screenshots: [],
				status: 'failed',
				errorMessage: 'Timeout',
			};

			const savedPage = createMockPage({
				scrapeJobId: jobId,
				status: PageStatus.FAILED,
			});
			const setMock = jest.fn().mockReturnThis();
			const mockManager = {
				getRepository: jest.fn().mockReturnValue({
					save: jest.fn().mockResolvedValue(savedPage),
				}),
				createQueryBuilder: jest.fn().mockReturnValue({
					update: jest.fn().mockReturnThis(),
					set: setMock,
					where: jest.fn().mockReturnThis(),
					execute: jest.fn().mockResolvedValue({ affected: 1 }),
				}),
			};
			dataSource.transaction.mockImplementation(async (cb: any) =>
				cb(mockManager),
			);

			await service.savePageResult(jobId, pageData);

			// The set call should reference pagesFailed, not pagesCompleted
			const setArg = setMock.mock.calls[0][0];
			expect(setArg).toHaveProperty('pagesFailed');
		});
	});

	// -----------------------------------------------------------------------
	// incrementPagesDiscovered
	// -----------------------------------------------------------------------
	describe('incrementPagesDiscovered', () => {
		it('executes SQL increment with the given count', async () => {
			const jobId = uuidv4();
			const qb = mockQueryBuilder();
			jobRepo.createQueryBuilder.mockReturnValue(qb as any);

			await service.incrementPagesDiscovered(jobId, 5);

			expect(qb.update).toHaveBeenCalledWith(ScrapeJob);
			expect(qb.setParameter).toHaveBeenCalledWith('count', 5);
			expect(qb.where).toHaveBeenCalledWith('id = :jobId', { jobId });
			expect(qb.execute).toHaveBeenCalled();
		});

		it('handles count of 0 gracefully', async () => {
			const jobId = uuidv4();
			const qb = mockQueryBuilder();
			jobRepo.createQueryBuilder.mockReturnValue(qb as any);

			await service.incrementPagesDiscovered(jobId, 0);

			expect(qb.setParameter).toHaveBeenCalledWith('count', 0);
			expect(qb.execute).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// incrementPagesSkippedByDepth
	// -----------------------------------------------------------------------
	describe('incrementPagesSkippedByDepth', () => {
		it('executes SQL increment with the given count', async () => {
			const jobId = uuidv4();
			const qb = mockQueryBuilder();
			jobRepo.createQueryBuilder.mockReturnValue(qb as any);

			await service.incrementPagesSkippedByDepth(jobId, 3);

			expect(qb.update).toHaveBeenCalledWith(ScrapeJob);
			expect(qb.setParameter).toHaveBeenCalledWith('count', 3);
			expect(qb.execute).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// deleteJob
	// -----------------------------------------------------------------------
	describe('deleteJob', () => {
		it('deletes S3 files and removes the job', async () => {
			const mockJob = createMockJob();
			jobRepo.findOne.mockResolvedValue(mockJob);
			const pages = [
				createMockPage({
					scrapeJobId: mockJob.id,
					htmlS3Key: 'html/page1.html',
					screenshots: [
						{ viewport: 1920, s3Key: 'screenshots/page1.jpg' },
					],
				}),
			];
			pageRepo.find.mockResolvedValue(pages);

			await service.deleteJob(mockJob.id, mockJob.organizationId);

			expect(s3Service.deleteMany).toHaveBeenCalledWith([
				'html/page1.html',
				'screenshots/page1.jpg',
			]);
			expect(jobRepo.remove).toHaveBeenCalledWith(mockJob);
		});

		it('continues with job deletion even if S3 cleanup fails', async () => {
			const mockJob = createMockJob();
			jobRepo.findOne.mockResolvedValue(mockJob);
			const pages = [
				createMockPage({
					scrapeJobId: mockJob.id,
					htmlS3Key: 'html/test.html',
				}),
			];
			pageRepo.find.mockResolvedValue(pages);
			s3Service.deleteMany.mockRejectedValue(new Error('S3 down'));

			await service.deleteJob(mockJob.id, mockJob.organizationId);

			expect(jobRepo.remove).toHaveBeenCalledWith(mockJob);
		});

		it('skips S3 cleanup when there are no keys to delete', async () => {
			const mockJob = createMockJob();
			jobRepo.findOne.mockResolvedValue(mockJob);
			pageRepo.find.mockResolvedValue([
				createMockPage({
					scrapeJobId: mockJob.id,
					htmlS3Key: null,
					screenshots: [],
				}),
			]);

			await service.deleteJob(mockJob.id, mockJob.organizationId);

			expect(s3Service.deleteMany).not.toHaveBeenCalled();
			expect(jobRepo.remove).toHaveBeenCalledWith(mockJob);
		});

		it('throws JobNotFoundError when job does not exist', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			await expect(service.deleteJob(uuidv4(), uuidv4())).rejects.toThrow(
				JobNotFoundError,
			);
		});
	});

	// -----------------------------------------------------------------------
	// isJobCancelled
	// -----------------------------------------------------------------------
	describe('isJobCancelled', () => {
		it('returns true when job status is CANCELLED', async () => {
			jobRepo.findOne.mockResolvedValue(
				createMockJob({ status: JobStatus.CANCELLED }),
			);

			expect(await service.isJobCancelled(uuidv4())).toBe(true);
		});

		it('returns false when job is in any other status', async () => {
			jobRepo.findOne.mockResolvedValue(
				createMockJob({ status: JobStatus.RUNNING }),
			);

			expect(await service.isJobCancelled(uuidv4())).toBe(false);
		});

		it('returns false when job does not exist', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			expect(await service.isJobCancelled(uuidv4())).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// retryJob
	// -----------------------------------------------------------------------
	describe('retryJob', () => {
		it('resets a FAILED job to PENDING and re-queues it', async () => {
			const mockJob = createMockJob({ status: JobStatus.FAILED });
			jobRepo.findOne.mockResolvedValue(mockJob);
			pageRepo.find.mockResolvedValue([]); // no failed pages
			pageRepo.count.mockResolvedValue(0); // no completed pages
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const result = await service.retryJob(
				mockJob.id,
				mockJob.organizationId,
				mockJob.userId,
			);

			expect(result.status).toBe(JobStatus.PENDING);
			expect(result.error).toBeNull();
			expect(pgBossService.sendSiteScraperJob).toHaveBeenCalled();
		});

		it('cleans up failed pages and their S3 artifacts', async () => {
			const mockJob = createMockJob({ status: JobStatus.FAILED });
			jobRepo.findOne.mockResolvedValue(mockJob);

			const failedPages = [
				createMockPage({
					scrapeJobId: mockJob.id,
					status: PageStatus.FAILED,
					htmlS3Key: 'html/failed.html',
					screenshots: [
						{ viewport: 1920, s3Key: 'screenshots/failed.jpg' },
					],
				}),
			];
			pageRepo.find.mockResolvedValue(failedPages);
			pageRepo.count.mockResolvedValue(2); // 2 remaining completed pages
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const result = await service.retryJob(
				mockJob.id,
				mockJob.organizationId,
				mockJob.userId,
			);

			expect(s3Service.deleteMany).toHaveBeenCalledWith([
				'html/failed.html',
				'screenshots/failed.jpg',
			]);
			expect(pageRepo.delete).toHaveBeenCalled();
			expect(result.pagesDiscovered).toBe(2);
			expect(result.pagesCompleted).toBe(2);
		});

		it('throws JobNotFoundError when job does not exist', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			await expect(
				service.retryJob(uuidv4(), uuidv4(), uuidv4()),
			).rejects.toThrow(JobNotFoundError);
		});

		it('throws InvalidStatusTransitionError for non-retryable status', async () => {
			const mockJob = createMockJob({ status: JobStatus.RUNNING });
			mockJob.startedAt = new Date();
			jobRepo.findOne.mockResolvedValue(mockJob);

			await expect(
				service.retryJob(
					mockJob.id,
					mockJob.organizationId,
					mockJob.userId,
				),
			).rejects.toThrow(InvalidStatusTransitionError);
		});
	});

	// -----------------------------------------------------------------------
	// adminCancelJob
	// -----------------------------------------------------------------------
	describe('adminCancelJob', () => {
		it('cancels an active job without userId check', async () => {
			const mockJob = createMockJob({ status: JobStatus.RUNNING });
			mockJob.startedAt = new Date();
			jobRepo.findOne.mockResolvedValue(mockJob);
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const result = await service.adminCancelJob(
				mockJob.id,
				mockJob.organizationId,
			);

			expect(result.status).toBe(JobStatus.CANCELLED);
		});

		it('throws JobNotFoundError for non-existent job', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			await expect(
				service.adminCancelJob(uuidv4(), uuidv4()),
			).rejects.toThrow(JobNotFoundError);
		});

		it('throws InvalidStatusTransitionError for terminal job', async () => {
			const mockJob = createMockJob({ status: JobStatus.COMPLETED });
			jobRepo.findOne.mockResolvedValue(mockJob);

			await expect(
				service.adminCancelJob(mockJob.id, mockJob.organizationId),
			).rejects.toThrow(InvalidStatusTransitionError);
		});
	});

	// -----------------------------------------------------------------------
	// requeueJob
	// -----------------------------------------------------------------------
	describe('requeueJob', () => {
		it('re-queues a PENDING job', async () => {
			const mockJob = createMockJob({ status: JobStatus.PENDING });
			jobRepo.findOne.mockResolvedValue(mockJob);

			const result = await service.requeueJob(
				mockJob.id,
				mockJob.organizationId,
				mockJob.userId,
			);

			expect(result).toBe(mockJob);
			expect(pgBossService.sendSiteScraperJob).toHaveBeenCalledWith(
				expect.objectContaining({ jobId: mockJob.id }),
			);
		});

		it('throws InvalidStatusTransitionError for non-PENDING job', async () => {
			const mockJob = createMockJob({ status: JobStatus.RUNNING });
			mockJob.startedAt = new Date();
			jobRepo.findOne.mockResolvedValue(mockJob);

			await expect(
				service.requeueJob(
					mockJob.id,
					mockJob.organizationId,
					mockJob.userId,
				),
			).rejects.toThrow(InvalidStatusTransitionError);
		});

		it('throws JobNotFoundError for non-existent job', async () => {
			jobRepo.findOne.mockResolvedValue(null);

			await expect(
				service.requeueJob(uuidv4(), uuidv4(), uuidv4()),
			).rejects.toThrow(JobNotFoundError);
		});
	});

	// -----------------------------------------------------------------------
	// failOrphanedRunningJobs
	// -----------------------------------------------------------------------
	describe('failOrphanedRunningJobs', () => {
		it('marks all RUNNING jobs as FAILED with WORKER_RESTART error', async () => {
			const jobs = [
				createMockJob({ status: JobStatus.RUNNING }),
				createMockJob({ status: JobStatus.RUNNING }),
			];
			jobs.forEach((j) => (j.startedAt = new Date()));
			jobRepo.find.mockResolvedValue(jobs);
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const count = await service.failOrphanedRunningJobs();

			expect(count).toBe(2);
			expect(jobRepo.save).toHaveBeenCalledTimes(2);
			expect(jobs[0].status).toBe(JobStatus.FAILED);
			expect(jobs[0].error!.code).toBe('WORKER_RESTART');
		});

		it('returns 0 when no running jobs exist', async () => {
			jobRepo.find.mockResolvedValue([]);

			const count = await service.failOrphanedRunningJobs();

			expect(count).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// failStaleRunningJobs
	// -----------------------------------------------------------------------
	describe('failStaleRunningJobs', () => {
		it('marks stale RUNNING jobs as FAILED (excludes active jobs)', async () => {
			const staleJob = createMockJob({ status: JobStatus.RUNNING });
			staleJob.startedAt = new Date();
			const activeJob = createMockJob({ status: JobStatus.RUNNING });
			activeJob.startedAt = new Date();

			jobRepo.find.mockResolvedValue([staleJob, activeJob]);
			jobRepo.save.mockImplementation(async (j) => j as ScrapeJob);

			const activeJobIds = new Set([activeJob.id]);
			const count = await service.failStaleRunningJobs(activeJobIds);

			expect(count).toBe(1);
			expect(staleJob.status).toBe(JobStatus.FAILED);
			expect(staleJob.error!.code).toBe('CRAWL_TIMEOUT');
			expect(activeJob.status).toBe(JobStatus.RUNNING);
		});
	});

	// -----------------------------------------------------------------------
	// getQueuePositions
	// -----------------------------------------------------------------------
	describe('getQueuePositions', () => {
		it('assigns position 0 to RUNNING jobs and 1+ to PENDING jobs', async () => {
			const running = createMockJob({ status: JobStatus.RUNNING });
			running.startedAt = new Date();
			const pending1 = createMockJob({ status: JobStatus.PENDING });
			const pending2 = createMockJob({ status: JobStatus.PENDING });

			jobRepo.find.mockResolvedValue([running, pending1, pending2]);

			const positions = await service.getQueuePositions();

			expect(positions.get(running.id)).toBe(0);
			expect(positions.get(pending1.id)).toBe(1);
			expect(positions.get(pending2.id)).toBe(2);
		});
	});

	// -----------------------------------------------------------------------
	// getCompletedPageUrls
	// -----------------------------------------------------------------------
	describe('getCompletedPageUrls', () => {
		it('returns URLs of completed pages', async () => {
			const pages = [
				createMockPage({ url: 'https://example.com/a' }),
				createMockPage({ url: 'https://example.com/b' }),
			];
			pageRepo.find.mockResolvedValue(pages);

			const urls = await service.getCompletedPageUrls(uuidv4());

			expect(urls).toEqual([
				'https://example.com/a',
				'https://example.com/b',
			]);
		});
	});

	// -----------------------------------------------------------------------
	// requeueStaleJobs
	// -----------------------------------------------------------------------
	describe('requeueStaleJobs', () => {
		it('re-queues stale PENDING jobs', async () => {
			const staleJobs = [
				createMockJob({ status: JobStatus.PENDING }),
				createMockJob({ status: JobStatus.PENDING }),
			];
			jobRepo.find.mockResolvedValue(staleJobs);

			const count = await service.requeueStaleJobs();

			expect(count).toBe(2);
			expect(pgBossService.sendSiteScraperJob).toHaveBeenCalledTimes(2);
		});

		it('returns 0 when no stale jobs exist', async () => {
			jobRepo.find.mockResolvedValue([]);

			const count = await service.requeueStaleJobs();

			expect(count).toBe(0);
			expect(pgBossService.sendSiteScraperJob).not.toHaveBeenCalled();
		});
	});
});
