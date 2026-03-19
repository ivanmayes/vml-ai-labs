/**
 * The controller reads process.env.LAMBDA_CALLBACK_SECRET at request time,
 * so we can set it here and it will be picked up by verifyBearerToken().
 */
const VALID_SECRET = 'test-lambda-secret-1234';
process.env.LAMBDA_CALLBACK_SECRET = VALID_SECRET;

import { Test, TestingModule } from '@nestjs/testing';
import {
	BadRequestException,
	GoneException,
	UnauthorizedException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ScrapeJob } from './entities/scrape-job.entity';
import { JobStatus } from './types/job-status.enum';
import { ScraperSSEEventType } from './types/sse-events.types';
import { SiteScraperService } from './services/site-scraper.service';
import { ScraperSseService } from './services/scraper-sse.service';
import { SiteScraperInternalController } from './site-scraper-internal.controller';
import { LambdaPageResultDto } from './dtos/lambda-page-result.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockJob(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
	const job = Object.assign(new ScrapeJob(), {
		id: uuidv4(),
		url: 'https://example.com',
		maxDepth: 3,
		viewports: [1920],
		status: JobStatus.RUNNING,
		pagesDiscovered: 5,
		pagesCompleted: 3,
		pagesFailed: 0,
		pagesSkippedByDepth: 0,
		error: null,
		userId: uuidv4(),
		organizationId: uuidv4(),
		createdAt: new Date(),
		updatedAt: new Date(),
		startedAt: new Date(),
		completedAt: null,
		...overrides,
	});
	return job;
}

function createValidDto(
	jobId: string,
	overrides: Partial<LambdaPageResultDto> = {},
): LambdaPageResultDto {
	const dto = new LambdaPageResultDto();
	dto.jobId = jobId;
	dto.url = 'https://example.com/about';
	dto.title = 'About Us';
	dto.htmlS3Key = `site-scraper/${jobId}/html/about.html`;
	dto.screenshots = [
		{
			viewport: 1920,
			s3Key: `site-scraper/${jobId}/screenshots/about-1920.jpg`,
			thumbnailS3Key: `site-scraper/${jobId}/thumbnails/about-1920.webp`,
		},
	];
	dto.status = 'completed';
	dto.discoveredUrls = [];
	dto.depth = 1;
	return Object.assign(dto, overrides);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SiteScraperInternalController', () => {
	let controller: SiteScraperInternalController;
	let siteScraperService: Record<string, jest.Mock>;
	let sseService: Record<string, jest.Mock>;

	beforeEach(async () => {
		siteScraperService = {
			getJobById: jest.fn(),
			upsertPageResult: jest.fn().mockResolvedValue({}),
			enqueueDiscoveredUrls: jest.fn().mockResolvedValue(0),
			checkAndCompleteJob: jest.fn().mockResolvedValue(undefined),
		};

		sseService = {
			emitJobEvent: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [SiteScraperInternalController],
			providers: [
				{ provide: SiteScraperService, useValue: siteScraperService },
				{ provide: ScraperSseService, useValue: sseService },
			],
		}).compile();

		controller = module.get(SiteScraperInternalController);
	});

	// -----------------------------------------------------------------------
	// Bearer token authentication
	// -----------------------------------------------------------------------
	describe('Bearer token authentication', () => {
		it('rejects requests with missing Authorization header', async () => {
			const job = createMockJob();
			const dto = createValidDto(job.id);

			await expect(
				controller.receivePageResult(undefined as any, dto),
			).rejects.toThrow(UnauthorizedException);
		});

		it('rejects requests with empty Authorization header', async () => {
			const job = createMockJob();
			const dto = createValidDto(job.id);

			await expect(controller.receivePageResult('', dto)).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('rejects requests with non-Bearer scheme', async () => {
			const job = createMockJob();
			const dto = createValidDto(job.id);

			await expect(
				controller.receivePageResult('Basic dXNlcjpwYXNz', dto),
			).rejects.toThrow(UnauthorizedException);
		});

		it('rejects requests with invalid Bearer token', async () => {
			const job = createMockJob();
			const dto = createValidDto(job.id);

			await expect(
				controller.receivePageResult('Bearer wrong-token', dto),
			).rejects.toThrow(UnauthorizedException);
		});

		it('rejects requests with Bearer prefix but no token', async () => {
			const job = createMockJob();
			const dto = createValidDto(job.id);

			await expect(
				controller.receivePageResult('Bearer', dto),
			).rejects.toThrow(UnauthorizedException);
		});

		it('accepts requests with valid Bearer token', async () => {
			const job = createMockJob();
			siteScraperService.getJobById.mockResolvedValue(job);

			const dto = createValidDto(job.id);

			const result = await controller.receivePageResult(
				`Bearer ${VALID_SECRET}`,
				dto,
			);

			expect(result.status).toBe('ok');
			expect(result.jobId).toBe(job.id);
		});
	});

	// -----------------------------------------------------------------------
	// S3 key validation
	// -----------------------------------------------------------------------
	describe('S3 key validation', () => {
		it('rejects payloads with htmlS3Key not matching the expected prefix', async () => {
			const jobId = uuidv4();
			const dto = createValidDto(jobId, {
				htmlS3Key: `site-scraper/different-job-id/html/page.html`,
			});

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(BadRequestException);
		});

		it('rejects payloads with screenshot S3 key not matching the expected prefix', async () => {
			const jobId = uuidv4();
			const dto = createValidDto(jobId, {
				screenshots: [
					{
						viewport: 1920,
						s3Key: `site-scraper/wrong-id/screenshots/page-1920.jpg`,
					},
				],
			});

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(BadRequestException);
		});

		it('rejects payloads with thumbnail S3 key not matching the expected prefix', async () => {
			const jobId = uuidv4();
			const dto = createValidDto(jobId, {
				screenshots: [
					{
						viewport: 1920,
						s3Key: `site-scraper/${jobId}/screenshots/page-1920.jpg`,
						thumbnailS3Key: `site-scraper/wrong-id/thumbnails/page-1920.webp`,
					},
				],
			});

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(BadRequestException);
		});

		it('rejects payloads with path traversal via ".."', async () => {
			const jobId = uuidv4();
			const dto = createValidDto(jobId, {
				htmlS3Key: `site-scraper/${jobId}/../other-bucket/file.html`,
			});

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(BadRequestException);
		});

		it('rejects payloads with path traversal via "//"', async () => {
			const jobId = uuidv4();
			const dto = createValidDto(jobId, {
				htmlS3Key: `site-scraper/${jobId}//html/page.html`,
			});

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(BadRequestException);
		});

		it('allows payloads when all S3 keys match the expected prefix', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			const result = await controller.receivePageResult(
				`Bearer ${VALID_SECRET}`,
				dto,
			);

			expect(result.status).toBe('ok');
		});

		it('allows payloads with no optional S3 keys (htmlS3Key absent)', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id, {
				htmlS3Key: undefined,
				screenshots: [
					{
						viewport: 1920,
						s3Key: `site-scraper/${job.id}/screenshots/about-1920.jpg`,
					},
				],
			});

			const result = await controller.receivePageResult(
				`Bearer ${VALID_SECRET}`,
				dto,
			);

			expect(result.status).toBe('ok');
		});
	});

	// -----------------------------------------------------------------------
	// Job state transitions
	// -----------------------------------------------------------------------
	describe('Job state transitions', () => {
		it('returns 410 Gone for cancelled jobs', async () => {
			const job = createMockJob({ status: JobStatus.CANCELLED });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(GoneException);
		});

		it('returns 410 Gone for completed jobs', async () => {
			const job = createMockJob({ status: JobStatus.COMPLETED });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(GoneException);
		});

		it('returns 410 Gone for completed_with_errors jobs', async () => {
			const job = createMockJob({
				status: JobStatus.COMPLETED_WITH_ERRORS,
			});
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(GoneException);
		});

		it('returns 400 for non-existent jobs', async () => {
			siteScraperService.getJobById.mockResolvedValue(null);
			const dto = createValidDto(uuidv4());

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(BadRequestException);
		});

		it('returns 400 for PENDING jobs (expected RUNNING)', async () => {
			const job = createMockJob({ status: JobStatus.PENDING });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			await expect(
				controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto),
			).rejects.toThrow(BadRequestException);
		});

		it('processes results for RUNNING jobs', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			const result = await controller.receivePageResult(
				`Bearer ${VALID_SECRET}`,
				dto,
			);

			expect(result.status).toBe('ok');
			expect(result.jobId).toBe(job.id);
			expect(siteScraperService.upsertPageResult).toHaveBeenCalledWith(
				job.id,
				expect.objectContaining({
					url: dto.url,
					title: dto.title,
					status: dto.status,
				}),
			);
		});
	});

	// -----------------------------------------------------------------------
	// Idempotency
	// -----------------------------------------------------------------------
	describe('Idempotency', () => {
		it('handles duplicate callbacks gracefully (upsert is idempotent)', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			// First call
			const result1 = await controller.receivePageResult(
				`Bearer ${VALID_SECRET}`,
				dto,
			);
			expect(result1.status).toBe('ok');

			// Second call (duplicate) should also succeed
			const result2 = await controller.receivePageResult(
				`Bearer ${VALID_SECRET}`,
				dto,
			);
			expect(result2.status).toBe('ok');

			// upsertPageResult called both times (idempotent via ON CONFLICT)
			expect(siteScraperService.upsertPageResult).toHaveBeenCalledTimes(
				2,
			);
		});
	});

	// -----------------------------------------------------------------------
	// Completion detection
	// -----------------------------------------------------------------------
	describe('Completion detection', () => {
		it('calls checkAndCompleteJob after processing a page result', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(siteScraperService.checkAndCompleteJob).toHaveBeenCalledWith(
				job.id,
			);
		});

		it('emits JOB_COMPLETED SSE event when job transitions to COMPLETED', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			const completedJob = createMockJob({
				id: job.id,
				userId: job.userId,
				organizationId: job.organizationId,
				status: JobStatus.COMPLETED,
				pagesCompleted: 5,
				pagesFailed: 0,
				pagesDiscovered: 5,
				pagesSkippedByDepth: 0,
			});

			// getJobById calls: initial lookup, final check after checkAndCompleteJob
			siteScraperService.getJobById
				.mockResolvedValueOnce(job)
				.mockResolvedValueOnce(completedJob);

			const dto = createValidDto(job.id, {
				status: 'failed',
				discoveredUrls: [],
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(sseService.emitJobEvent).toHaveBeenCalledWith(
				job.id,
				job.userId,
				job.organizationId,
				ScraperSSEEventType.JOB_COMPLETED,
				expect.objectContaining({
					id: job.id,
					status: JobStatus.COMPLETED,
					pagesCompleted: 5,
					pagesFailed: 0,
					pagesDiscovered: 5,
					pagesSkippedByDepth: 0,
				}),
			);
		});

		it('emits JOB_COMPLETED SSE event when job transitions to COMPLETED_WITH_ERRORS', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			const completedJob = createMockJob({
				id: job.id,
				userId: job.userId,
				organizationId: job.organizationId,
				status: JobStatus.COMPLETED_WITH_ERRORS,
				pagesCompleted: 4,
				pagesFailed: 1,
				pagesDiscovered: 5,
				pagesSkippedByDepth: 0,
			});

			siteScraperService.getJobById
				.mockResolvedValueOnce(job)
				.mockResolvedValueOnce(completedJob);

			const dto = createValidDto(job.id, {
				status: 'failed',
				discoveredUrls: [],
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(sseService.emitJobEvent).toHaveBeenCalledWith(
				job.id,
				job.userId,
				job.organizationId,
				ScraperSSEEventType.JOB_COMPLETED,
				expect.objectContaining({
					id: job.id,
					status: JobStatus.COMPLETED_WITH_ERRORS,
				}),
			);
		});

		it('does not emit JOB_COMPLETED when job is still RUNNING', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);

			const dto = createValidDto(job.id, {
				status: 'failed',
				discoveredUrls: [],
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(sseService.emitJobEvent).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				ScraperSSEEventType.JOB_COMPLETED,
				expect.anything(),
			);
		});
	});

	// -----------------------------------------------------------------------
	// SSE emission
	// -----------------------------------------------------------------------
	describe('SSE emission', () => {
		it('emits PAGE_COMPLETED event when page status is completed', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			const updatedJob = createMockJob({
				id: job.id,
				userId: job.userId,
				organizationId: job.organizationId,
				status: JobStatus.RUNNING,
				pagesCompleted: 4,
				pagesDiscovered: 5,
			});

			// Call order: initial lookup, reload for PAGE_COMPLETED, final check
			siteScraperService.getJobById
				.mockResolvedValueOnce(job)
				.mockResolvedValueOnce(updatedJob)
				.mockResolvedValueOnce(job);

			const dto = createValidDto(job.id, {
				status: 'completed',
				title: 'About Page',
				discoveredUrls: [],
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(sseService.emitJobEvent).toHaveBeenCalledWith(
				job.id,
				job.userId,
				job.organizationId,
				ScraperSSEEventType.PAGE_COMPLETED,
				expect.objectContaining({
					id: job.id,
					pageUrl: dto.url,
					title: 'About Page',
					pagesCompleted: 4,
					pagesDiscovered: 5,
				}),
			);
		});

		it('does not emit PAGE_COMPLETED for failed page status', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);

			const dto = createValidDto(job.id, {
				status: 'failed',
				errorMessage: 'Timeout',
				discoveredUrls: [],
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(sseService.emitJobEvent).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				ScraperSSEEventType.PAGE_COMPLETED,
				expect.anything(),
			);
		});

		it('emits PAGES_DISCOVERED event when new URLs are enqueued', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			const updatedJob = createMockJob({
				id: job.id,
				userId: job.userId,
				organizationId: job.organizationId,
				status: JobStatus.RUNNING,
				pagesDiscovered: 8,
			});

			const discoveredUrls = [
				'https://example.com/contact',
				'https://example.com/blog',
				'https://example.com/team',
			];

			siteScraperService.enqueueDiscoveredUrls.mockResolvedValue(3);
			// Call order: initial lookup, reload for PAGES_DISCOVERED, final check
			siteScraperService.getJobById
				.mockResolvedValueOnce(job)
				.mockResolvedValueOnce(updatedJob)
				.mockResolvedValueOnce(job);

			const dto = createValidDto(job.id, {
				status: 'failed',
				discoveredUrls,
				depth: 1,
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(sseService.emitJobEvent).toHaveBeenCalledWith(
				job.id,
				job.userId,
				job.organizationId,
				ScraperSSEEventType.PAGES_DISCOVERED,
				expect.objectContaining({
					id: job.id,
					newUrls: discoveredUrls.slice(0, 3),
					totalDiscovered: 8,
				}),
			);
		});

		it('does not emit PAGES_DISCOVERED when no new URLs are enqueued', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.enqueueDiscoveredUrls.mockResolvedValue(0);
			siteScraperService.getJobById.mockResolvedValue(job);

			const dto = createValidDto(job.id, {
				status: 'failed',
				discoveredUrls: ['https://example.com/already-seen'],
				depth: 1,
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(sseService.emitJobEvent).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				ScraperSSEEventType.PAGES_DISCOVERED,
				expect.anything(),
			);
		});

		it('emits both PAGE_COMPLETED and PAGES_DISCOVERED when applicable', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			const updatedJob = createMockJob({
				id: job.id,
				userId: job.userId,
				organizationId: job.organizationId,
				status: JobStatus.RUNNING,
				pagesCompleted: 4,
				pagesDiscovered: 7,
			});

			siteScraperService.enqueueDiscoveredUrls.mockResolvedValue(2);
			// Call order: initial, PAGE_COMPLETED reload, PAGES_DISCOVERED reload, final
			siteScraperService.getJobById
				.mockResolvedValueOnce(job)
				.mockResolvedValueOnce(updatedJob)
				.mockResolvedValueOnce(updatedJob)
				.mockResolvedValueOnce(job);

			const dto = createValidDto(job.id, {
				status: 'completed',
				discoveredUrls: [
					'https://example.com/new1',
					'https://example.com/new2',
				],
				depth: 1,
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(sseService.emitJobEvent).toHaveBeenCalledWith(
				job.id,
				job.userId,
				job.organizationId,
				ScraperSSEEventType.PAGE_COMPLETED,
				expect.anything(),
			);
			expect(sseService.emitJobEvent).toHaveBeenCalledWith(
				job.id,
				job.userId,
				job.organizationId,
				ScraperSSEEventType.PAGES_DISCOVERED,
				expect.anything(),
			);
		});
	});

	// -----------------------------------------------------------------------
	// Service delegation details
	// -----------------------------------------------------------------------
	describe('service delegation', () => {
		it('passes correct arguments to upsertPageResult', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);

			const dto = createValidDto(job.id, {
				title: 'Test Title',
				htmlS3Key: `site-scraper/${job.id}/html/test.html`,
				status: 'completed',
				errorMessage: undefined,
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(siteScraperService.upsertPageResult).toHaveBeenCalledWith(
				job.id,
				{
					url: dto.url,
					title: 'Test Title',
					htmlS3Key: `site-scraper/${job.id}/html/test.html`,
					screenshots: [
						{
							viewport: 1920,
							s3Key: `site-scraper/${job.id}/screenshots/about-1920.jpg`,
							thumbnailS3Key: `site-scraper/${job.id}/thumbnails/about-1920.webp`,
						},
					],
					status: 'completed',
					errorMessage: null,
				},
			);
		});

		it('passes discovered URLs to enqueueDiscoveredUrls with correct config', async () => {
			const job = createMockJob({
				status: JobStatus.RUNNING,
				url: 'https://example.com',
				maxDepth: 3,
				viewports: [1920, 768],
			});
			siteScraperService.enqueueDiscoveredUrls.mockResolvedValue(2);
			siteScraperService.getJobById.mockResolvedValue(job);

			const discoveredUrls = [
				'https://example.com/page1',
				'https://example.com/page2',
			];
			const dto = createValidDto(job.id, {
				status: 'failed',
				discoveredUrls,
				depth: 1,
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(
				siteScraperService.enqueueDiscoveredUrls,
			).toHaveBeenCalledWith(job.id, discoveredUrls, 1, 3, {
				maxPages: 1000,
				viewports: [1920, 768],
				seedHostname: 'example.com',
				s3Prefix: `site-scraper/${job.id}/`,
			});
		});

		it('skips enqueueDiscoveredUrls when discoveredUrls is empty', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);

			const dto = createValidDto(job.id, {
				discoveredUrls: [],
				status: 'failed',
			});

			await controller.receivePageResult(`Bearer ${VALID_SECRET}`, dto);

			expect(
				siteScraperService.enqueueDiscoveredUrls,
			).not.toHaveBeenCalled();
		});

		it('returns { status: "ok", jobId } on success', async () => {
			const job = createMockJob({ status: JobStatus.RUNNING });
			siteScraperService.getJobById.mockResolvedValue(job);
			const dto = createValidDto(job.id);

			const result = await controller.receivePageResult(
				`Bearer ${VALID_SECRET}`,
				dto,
			);

			expect(result).toEqual({ status: 'ok', jobId: job.id });
		});
	});
});
