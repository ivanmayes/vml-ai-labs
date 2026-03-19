import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
	NotFoundException,
	BadRequestException,
	UnprocessableEntityException,
	ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { v4 as uuidv4 } from 'uuid';

import { AwsS3Service } from '../../_platform/aws';
import {
	JobNotFoundError,
	InvalidStatusTransitionError,
} from '../../_platform/errors/domain.errors';
import { ResponseStatus } from '../../_platform/models';

import { ScrapeJob } from './entities/scrape-job.entity';
import { ScrapedPage } from './entities/scraped-page.entity';
import { JobStatus, PageStatus } from './types/job-status.enum';
import { SiteScraperService } from './services/site-scraper.service';
import {
	SiteScraperController,
	sseTokenStore,
} from './site-scraper.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockJob(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
	const job = Object.assign(new ScrapeJob(), {
		id: uuidv4(),
		url: 'https://example.com',
		maxDepth: 3,
		viewports: [1920],
		status: JobStatus.COMPLETED,
		pagesDiscovered: 5,
		pagesCompleted: 5,
		pagesFailed: 0,
		pagesSkippedByDepth: 0,
		error: null,
		userId: uuidv4(),
		organizationId: uuidv4(),
		createdAt: new Date(),
		updatedAt: new Date(),
		startedAt: new Date(),
		completedAt: new Date(),
		...overrides,
	});
	return job;
}

function createMockPage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
	return Object.assign(new ScrapedPage(), {
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
}

function mockReq(userId: string, orgId?: string): any {
	return {
		user: { id: userId, organizationId: orgId || uuidv4() },
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SiteScraperController', () => {
	let controller: SiteScraperController;
	let scrapeJobRepo: any;
	let scrapedPageRepo: any;
	let s3Service: any;
	let siteScraperService: any;

	beforeEach(async () => {
		scrapeJobRepo = {
			findOne: jest.fn(),
			findAndCount: jest.fn(),
			save: jest.fn(),
			remove: jest.fn(),
		};
		scrapedPageRepo = {
			findOne: jest.fn(),
			find: jest.fn(),
			findAndCount: jest.fn(),
		};
		s3Service = {
			deleteMany: jest.fn().mockResolvedValue(undefined),
			generatePresignedUrl: jest
				.fn()
				.mockResolvedValue('https://s3.example.com/presigned'),
		};
		siteScraperService = {
			createJob: jest.fn(),
			getQueuePositions: jest.fn().mockResolvedValue(new Map()),
			retryJob: jest.fn(),
			requeueJob: jest.fn(),
			adminCancelJob: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [SiteScraperController],
			providers: [
				{
					provide: getRepositoryToken(ScrapeJob),
					useValue: scrapeJobRepo,
				},
				{
					provide: getRepositoryToken(ScrapedPage),
					useValue: scrapedPageRepo,
				},
				{ provide: AwsS3Service, useValue: s3Service },
				{ provide: SiteScraperService, useValue: siteScraperService },
			],
		})
			.overrideGuard(AuthGuard('jwt'))
			.useValue({ canActivate: () => true })
			.compile();

		controller = module.get(SiteScraperController);
	});

	afterEach(() => {
		sseTokenStore.clear();
	});

	// -----------------------------------------------------------------------
	// POST /jobs (createJob)
	// -----------------------------------------------------------------------
	describe('createJob', () => {
		it('creates and returns a new job on valid input', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const mockJob = createMockJob({
				userId,
				organizationId: orgId,
				status: JobStatus.PENDING,
			});
			siteScraperService.createJob.mockResolvedValue(mockJob);

			const result = await controller.createJob(
				mockReq(userId, orgId),
				orgId,
				{ url: 'https://example.com', maxDepth: 3, viewports: [1920] },
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data.id).toBe(mockJob.id);
			expect(siteScraperService.createJob).toHaveBeenCalledWith(
				'https://example.com',
				3,
				[1920],
				userId,
				orgId,
			);
		});

		it('uses default maxDepth and viewports when not provided', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const mockJob = createMockJob({ userId, organizationId: orgId });
			siteScraperService.createJob.mockResolvedValue(mockJob);

			await controller.createJob(mockReq(userId, orgId), orgId, {
				url: 'https://example.com',
			} as any);

			expect(siteScraperService.createJob).toHaveBeenCalledWith(
				'https://example.com',
				3,
				[1920],
				userId,
				orgId,
			);
		});
	});

	// -----------------------------------------------------------------------
	// GET /jobs (listJobs)
	// -----------------------------------------------------------------------
	describe('listJobs', () => {
		it('returns paginated jobs scoped to user and organization', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const jobs = [createMockJob({ userId, organizationId: orgId })];
			scrapeJobRepo.findAndCount.mockResolvedValue([jobs, 1]);

			const result = await controller.listJobs(
				mockReq(userId, orgId),
				orgId,
				1,
				10,
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data.results).toEqual(jobs);
			expect(scrapeJobRepo.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { userId, organizationId: orgId },
				}),
			);
		});

		it('caps perPage at 50', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			scrapeJobRepo.findAndCount.mockResolvedValue([[], 0]);

			await controller.listJobs(mockReq(userId, orgId), orgId, 1, 100);

			expect(scrapeJobRepo.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({ take: 50 }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// GET /jobs/:jobId (getJob)
	// -----------------------------------------------------------------------
	describe('getJob', () => {
		it('returns job details with queue position for active jobs', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const job = createMockJob({
				userId,
				organizationId: orgId,
				status: JobStatus.RUNNING,
			});
			scrapeJobRepo.findOne.mockResolvedValue(job);
			siteScraperService.getQueuePositions.mockResolvedValue(
				new Map([[job.id, 0]]),
			);

			const result = await controller.getJob(
				mockReq(userId, orgId),
				orgId,
				job.id,
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data.queuePosition).toBe(0);
		});

		it('throws NotFoundException for non-existent job', async () => {
			scrapeJobRepo.findOne.mockResolvedValue(null);

			await expect(
				controller.getJob(mockReq(uuidv4()), uuidv4(), uuidv4()),
			).rejects.toThrow(NotFoundException);
		});
	});

	// -----------------------------------------------------------------------
	// DELETE /jobs/:jobId (deleteJob)
	// -----------------------------------------------------------------------
	describe('deleteJob', () => {
		it('cancels active job, cleans up S3, and deletes', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const job = createMockJob({
				userId,
				organizationId: orgId,
				status: JobStatus.RUNNING,
			});
			scrapeJobRepo.findOne.mockResolvedValue(job);
			scrapeJobRepo.save.mockResolvedValue(job);
			scrapedPageRepo.find.mockResolvedValue([
				createMockPage({
					scrapeJobId: job.id,
					htmlS3Key: 'html/p.html',
					screenshots: [{ viewport: 1920, s3Key: 'ss/p.jpg' }],
				}),
			]);

			const result = await controller.deleteJob(
				mockReq(userId, orgId),
				orgId,
				job.id,
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(s3Service.deleteMany).toHaveBeenCalledWith(
				expect.arrayContaining(['html/p.html', 'ss/p.jpg']),
			);
			expect(scrapeJobRepo.remove).toHaveBeenCalledWith(job);
		});

		it('throws NotFoundException for non-existent job', async () => {
			scrapeJobRepo.findOne.mockResolvedValue(null);

			await expect(
				controller.deleteJob(mockReq(uuidv4()), uuidv4(), uuidv4()),
			).rejects.toThrow(NotFoundException);
		});

		it('skips cancellation for already-terminal jobs', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const job = createMockJob({
				userId,
				organizationId: orgId,
				status: JobStatus.COMPLETED,
			});
			scrapeJobRepo.findOne.mockResolvedValue(job);
			scrapedPageRepo.find.mockResolvedValue([]);

			await controller.deleteJob(mockReq(userId, orgId), orgId, job.id);

			// save should NOT be called for status transition since already terminal
			expect(scrapeJobRepo.save).not.toHaveBeenCalled();
			expect(scrapeJobRepo.remove).toHaveBeenCalledWith(job);
		});
	});

	// -----------------------------------------------------------------------
	// POST /jobs/:jobId/retry (retryJob)
	// -----------------------------------------------------------------------
	describe('retryJob', () => {
		it('delegates to service and returns updated job', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const updatedJob = createMockJob({ status: JobStatus.PENDING });
			siteScraperService.retryJob.mockResolvedValue(updatedJob);

			const result = await controller.retryJob(
				mockReq(userId, orgId),
				orgId,
				updatedJob.id,
			);

			expect(result.status).toBe(ResponseStatus.Success);
		});

		it('throws NotFoundException when job not found', async () => {
			siteScraperService.retryJob.mockRejectedValue(
				new JobNotFoundError(),
			);

			await expect(
				controller.retryJob(mockReq(uuidv4()), uuidv4(), uuidv4()),
			).rejects.toThrow(NotFoundException);
		});

		it('throws BadRequestException for invalid status transition', async () => {
			siteScraperService.retryJob.mockRejectedValue(
				new InvalidStatusTransitionError('Cannot retry'),
			);

			await expect(
				controller.retryJob(mockReq(uuidv4()), uuidv4(), uuidv4()),
			).rejects.toThrow(BadRequestException);
		});
	});

	// -----------------------------------------------------------------------
	// POST /jobs/:jobId/requeue (requeueJob)
	// -----------------------------------------------------------------------
	describe('requeueJob', () => {
		it('delegates to service and returns success', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const job = createMockJob({
				userId,
				organizationId: orgId,
				status: JobStatus.PENDING,
			});
			siteScraperService.requeueJob.mockResolvedValue(job);

			const result = await controller.requeueJob(
				mockReq(userId, orgId),
				orgId,
				job.id,
			);

			expect(result.status).toBe(ResponseStatus.Success);
		});

		it('throws NotFoundException for non-existent job', async () => {
			siteScraperService.requeueJob.mockRejectedValue(
				new JobNotFoundError(),
			);

			await expect(
				controller.requeueJob(mockReq(uuidv4()), uuidv4(), uuidv4()),
			).rejects.toThrow(NotFoundException);
		});

		it('throws BadRequestException for non-PENDING job', async () => {
			siteScraperService.requeueJob.mockRejectedValue(
				new InvalidStatusTransitionError('Not PENDING'),
			);

			await expect(
				controller.requeueJob(mockReq(uuidv4()), uuidv4(), uuidv4()),
			).rejects.toThrow(BadRequestException);
		});
	});

	// -----------------------------------------------------------------------
	// POST /jobs/:jobId/admin/cancel (adminCancelJob)
	// -----------------------------------------------------------------------
	describe('adminCancelJob', () => {
		it('cancels active job and returns it', async () => {
			const orgId = uuidv4();
			const job = createMockJob({ status: JobStatus.CANCELLED });
			siteScraperService.adminCancelJob.mockResolvedValue(job);

			const result = await controller.adminCancelJob(orgId, job.id);

			expect(result.status).toBe(ResponseStatus.Success);
		});

		it('throws NotFoundException for non-existent job', async () => {
			siteScraperService.adminCancelJob.mockRejectedValue(
				new JobNotFoundError(),
			);

			await expect(
				controller.adminCancelJob(uuidv4(), uuidv4()),
			).rejects.toThrow(NotFoundException);
		});

		it('throws BadRequestException for terminal job', async () => {
			siteScraperService.adminCancelJob.mockRejectedValue(
				new InvalidStatusTransitionError('Already completed'),
			);

			await expect(
				controller.adminCancelJob(uuidv4(), uuidv4()),
			).rejects.toThrow(BadRequestException);
		});
	});

	// -----------------------------------------------------------------------
	// GET /jobs/:jobId/pages (getPages)
	// -----------------------------------------------------------------------
	describe('getPages', () => {
		it('returns paginated pages for a job', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const job = createMockJob({ userId, organizationId: orgId });
			scrapeJobRepo.findOne.mockResolvedValue(job);

			const pages = [createMockPage({ scrapeJobId: job.id })];
			scrapedPageRepo.findAndCount.mockResolvedValue([pages, 1]);

			const result = await controller.getPages(
				mockReq(userId, orgId),
				orgId,
				job.id,
				1,
				20,
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data.results).toEqual(pages);
		});

		it('throws NotFoundException when job not found', async () => {
			scrapeJobRepo.findOne.mockResolvedValue(null);

			await expect(
				controller.getPages(
					mockReq(uuidv4()),
					uuidv4(),
					uuidv4(),
					1,
					20,
				),
			).rejects.toThrow(NotFoundException);
		});
	});

	// -----------------------------------------------------------------------
	// GET /pages/:pageId/screenshot (getScreenshot)
	// -----------------------------------------------------------------------
	describe('getScreenshot', () => {
		it('returns presigned URL for the requested viewport', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const page = createMockPage({
				screenshots: [{ viewport: 1920, s3Key: 'ss/test.jpg' }],
			});
			page.scrapeJob = createMockJob({
				userId,
				organizationId: orgId,
			}) as any;
			scrapedPageRepo.findOne.mockResolvedValue(page);

			const result = await controller.getScreenshot(
				mockReq(userId, orgId),
				orgId,
				page.id,
				1920,
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data.presignedUrl).toBeDefined();
		});

		it('throws NotFoundException when page not found', async () => {
			scrapedPageRepo.findOne.mockResolvedValue(null);

			await expect(
				controller.getScreenshot(
					mockReq(uuidv4()),
					uuidv4(),
					uuidv4(),
					1920,
				),
			).rejects.toThrow(NotFoundException);
		});

		it('throws ForbiddenException when org does not match', async () => {
			const page = createMockPage();
			page.scrapeJob = createMockJob({
				userId: uuidv4(),
				organizationId: uuidv4(),
			}) as any;
			scrapedPageRepo.findOne.mockResolvedValue(page);

			await expect(
				controller.getScreenshot(
					mockReq(uuidv4()),
					'different-org',
					page.id,
					1920,
				),
			).rejects.toThrow(ForbiddenException);
		});

		it('throws NotFoundException when viewport not found', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const page = createMockPage({ screenshots: [] });
			page.scrapeJob = createMockJob({
				userId,
				organizationId: orgId,
			}) as any;
			scrapedPageRepo.findOne.mockResolvedValue(page);

			await expect(
				controller.getScreenshot(
					mockReq(userId, orgId),
					orgId,
					page.id,
					768,
				),
			).rejects.toThrow(NotFoundException);
		});
	});

	// -----------------------------------------------------------------------
	// GET /pages/:pageId/html (getHtml)
	// -----------------------------------------------------------------------
	describe('getHtml', () => {
		it('returns presigned URL for HTML download', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const page = createMockPage({ htmlS3Key: 'html/test.html' });
			page.scrapeJob = createMockJob({
				userId,
				organizationId: orgId,
			}) as any;
			scrapedPageRepo.findOne.mockResolvedValue(page);

			const result = await controller.getHtml(
				mockReq(userId, orgId),
				orgId,
				page.id,
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data.presignedUrl).toBeDefined();
			expect(s3Service.generatePresignedUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					responseContentDisposition:
						expect.stringContaining('attachment'),
					responseContentType: 'text/plain',
				}),
			);
		});

		it('throws NotFoundException when htmlS3Key is null', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const page = createMockPage({ htmlS3Key: null });
			page.scrapeJob = createMockJob({
				userId,
				organizationId: orgId,
			}) as any;
			scrapedPageRepo.findOne.mockResolvedValue(page);

			await expect(
				controller.getHtml(mockReq(userId, orgId), orgId, page.id),
			).rejects.toThrow(NotFoundException);
		});
	});

	// -----------------------------------------------------------------------
	// POST /sse-token (generateSseToken)
	// -----------------------------------------------------------------------
	describe('generateSseToken', () => {
		it('generates a token and stores it in the token store', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();

			const result = await controller.generateSseToken(
				mockReq(userId, orgId),
				orgId,
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data.token).toBeDefined();
			expect(sseTokenStore.has(result.data.token)).toBe(true);
		});

		it('stores correct userId and organizationId in token data', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();

			const result = await controller.generateSseToken(
				mockReq(userId, orgId),
				orgId,
			);

			const tokenData = sseTokenStore.get(result.data.token);
			expect(tokenData!.userId).toBe(userId);
			expect(tokenData!.organizationId).toBe(orgId);
		});
	});

	// -----------------------------------------------------------------------
	// POST /jobs/:jobId/download-token (generateDownloadToken)
	// -----------------------------------------------------------------------
	describe('generateDownloadToken', () => {
		it('generates an HMAC-signed token for a valid job', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const job = createMockJob({
				userId,
				organizationId: orgId,
				pagesCompleted: 5,
			});
			scrapeJobRepo.findOne.mockResolvedValue(job);

			const result = await controller.generateDownloadToken(
				mockReq(userId, orgId),
				orgId,
				job.id,
			);

			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data.token).toBeDefined();
			// Token format: base64url_payload.hex_signature
			expect(result.data.token).toContain('.');
		});

		it('throws NotFoundException for non-existent job', async () => {
			scrapeJobRepo.findOne.mockResolvedValue(null);

			await expect(
				controller.generateDownloadToken(
					mockReq(uuidv4()),
					uuidv4(),
					uuidv4(),
				),
			).rejects.toThrow(NotFoundException);
		});

		it('throws UnprocessableEntityException when no completed pages', async () => {
			const userId = uuidv4();
			const orgId = uuidv4();
			const job = createMockJob({
				userId,
				organizationId: orgId,
				pagesCompleted: 0,
			});
			scrapeJobRepo.findOne.mockResolvedValue(job);

			await expect(
				controller.generateDownloadToken(
					mockReq(userId, orgId),
					orgId,
					job.id,
				),
			).rejects.toThrow(UnprocessableEntityException);
		});
	});
});
