import { createHmac } from 'crypto';

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
	UnauthorizedException,
	BadRequestException,
	NotFoundException,
	UnprocessableEntityException,
} from '@nestjs/common';

import { SiteScraperSseController } from './site-scraper-sse.controller';
import { ScraperSseService } from './services/scraper-sse.service';
import { SiteScraperExportService } from './services/site-scraper-export.service';
import { ScrapeJob } from './entities/scrape-job.entity';
import { ScrapedPage } from './entities/scraped-page.entity';
import { PageStatus, JobStatus } from './types/job-status.enum';
import {
	sseTokenStore,
	SSE_TOKEN_TTL_MS,
	DOWNLOAD_TOKEN_SECRET,
} from './site-scraper.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000001';
const TEST_USER_ID = '00000000-0000-4000-8000-000000000002';
const TEST_JOB_ID = '00000000-0000-4000-8000-000000000003';

/** Build a valid HMAC download token for testing */
function buildDownloadToken(
	overrides: Partial<{
		jobId: string;
		userId: string;
		orgId: string;
		exp: number;
	}> = {},
): string {
	const payload = JSON.stringify({
		jobId: TEST_JOB_ID,
		userId: TEST_USER_ID,
		orgId: TEST_ORG_ID,
		exp: Date.now() + 5 * 60_000,
		...overrides,
	});
	const payloadB64 = Buffer.from(payload).toString('base64url');
	const sig = createHmac('sha256', DOWNLOAD_TOKEN_SECRET)
		.update(payload)
		.digest('hex');
	return `${payloadB64}.${sig}`;
}

/** Create a mock Express Response */
function mockResponse() {
	const res: any = {
		set: jest.fn().mockReturnThis(),
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
		destroy: jest.fn(),
		headersSent: false,
		destroyed: false,
	};
	return res;
}

/** Create a minimal ScrapeJob fixture */
function buildJob(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
	return {
		id: TEST_JOB_ID,
		url: 'https://example.com',
		maxDepth: 3,
		viewports: [1920],
		status: JobStatus.COMPLETED,
		pagesDiscovered: 1,
		pagesCompleted: 1,
		pagesFailed: 0,
		pagesSkippedByDepth: 0,
		error: null,
		userId: TEST_USER_ID,
		organizationId: TEST_ORG_ID,
		createdAt: new Date(),
		updatedAt: new Date(),
		startedAt: new Date(),
		completedAt: new Date(),
		...overrides,
	} as ScrapeJob;
}

/** Create a minimal ScrapedPage fixture */
function buildPage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
	return {
		id: '00000000-0000-4000-8000-000000000099',
		scrapeJobId: TEST_JOB_ID,
		url: 'https://example.com',
		title: 'Example',
		htmlS3Key: 'site-scraper/job/page/page.html',
		screenshots: [],
		status: PageStatus.COMPLETED,
		errorMessage: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	} as ScrapedPage;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SiteScraperSseController', () => {
	let controller: SiteScraperSseController;
	let exportService: jest.Mocked<SiteScraperExportService>;
	let sseService: jest.Mocked<ScraperSseService>;
	let jobRepo: { findOne: jest.Mock };
	let pageRepo: { find: jest.Mock };

	beforeAll(() => {
		console.log(
			'Test suite: SiteScraperSseController (download endpoint and headers)',
		);
	});

	beforeEach(async () => {
		// Clear the SSE token store between tests
		sseTokenStore.clear();

		jobRepo = { findOne: jest.fn() };
		pageRepo = { find: jest.fn() };

		const module: TestingModule = await Test.createTestingModule({
			controllers: [SiteScraperSseController],
			providers: [
				{
					provide: ScraperSseService,
					useValue: {
						addConnection: jest.fn().mockReturnValue('conn-1'),
					},
				},
				{
					provide: SiteScraperExportService,
					useValue: {
						streamJobExport: jest.fn().mockResolvedValue(undefined),
					},
				},
				{
					provide: getRepositoryToken(ScrapeJob),
					useValue: jobRepo,
				},
				{
					provide: getRepositoryToken(ScrapedPage),
					useValue: pageRepo,
				},
			],
		}).compile();

		controller = module.get(SiteScraperSseController);
		exportService = module.get(SiteScraperExportService);
		sseService = module.get(ScraperSseService);
	});

	// ======================================================================
	// HMAC token validation
	// ======================================================================

	describe('HMAC token validation', () => {
		it('should throw UnauthorizedException when token is missing', async () => {
			const res = mockResponse();
			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					'',
					'html',
				),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when token has no dot separator', async () => {
			const res = mockResponse();
			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					'nodot',
					'html',
				),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when signature is tampered', async () => {
			const token = buildDownloadToken();
			// Replace last char of signature
			const tampered =
				token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');

			const res = mockResponse();
			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					tampered,
					'html',
				),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when token is expired', async () => {
			const token = buildDownloadToken({ exp: Date.now() - 1000 });
			const res = mockResponse();
			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					token,
					'html',
				),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when jobId does not match token', async () => {
			const token = buildDownloadToken({
				jobId: '99999999-9999-4000-8000-999999999999',
			});
			const res = mockResponse();
			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					token,
					'html',
				),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when orgId does not match token', async () => {
			const token = buildDownloadToken({
				orgId: '99999999-9999-4000-8000-999999999999',
			});
			const res = mockResponse();
			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					token,
					'html',
				),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should proceed with valid token', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			expect(exportService.streamJobExport).toHaveBeenCalled();
		});
	});

	// ======================================================================
	// Format validation
	// ======================================================================

	describe('format validation', () => {
		it('should accept html format', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			expect(exportService.streamJobExport).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				new Set(['html']),
				res,
			);
		});

		it('should accept markdown format', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'markdown',
			);

			expect(exportService.streamJobExport).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				new Set(['markdown']),
				res,
			);
		});

		it('should accept screenshots format', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'screenshots',
			);

			expect(exportService.streamJobExport).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				new Set(['screenshots']),
				res,
			);
		});

		it('should accept comma-separated formats', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html,markdown,screenshots',
			);

			expect(exportService.streamJobExport).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				new Set(['html', 'markdown', 'screenshots']),
				res,
			);
		});

		it('should throw BadRequestException for empty format', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();

			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					token,
					'',
				),
			).rejects.toThrow(BadRequestException);
		});

		it('should throw BadRequestException for invalid format string', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();

			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					token,
					'invalid',
				),
			).rejects.toThrow(BadRequestException);
		});

		it('should ignore invalid formats mixed with valid ones', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html,invalid,markdown',
			);

			expect(exportService.streamJobExport).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				new Set(['html', 'markdown']),
				res,
			);
		});
	});

	// ======================================================================
	// Job and page lookup
	// ======================================================================

	describe('job and page lookup', () => {
		it('should throw NotFoundException when job is not found', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(null);

			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					token,
					'html',
				),
			).rejects.toThrow(NotFoundException);
		});

		it('should throw UnprocessableEntityException when no completed pages exist', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([]);

			await expect(
				controller.streamDownload(
					res,
					TEST_ORG_ID,
					TEST_JOB_ID,
					token,
					'html',
				),
			).rejects.toThrow(UnprocessableEntityException);
		});
	});

	// ======================================================================
	// Response headers
	// ======================================================================

	describe('response headers', () => {
		it('should set Content-Type to application/zip', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			expect(setCall['Content-Type']).toBe('application/zip');
		});

		it('should set Content-Disposition with attachment and sanitized filename', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			expect(setCall['Content-Disposition']).toMatch(
				/^attachment; filename="/,
			);
			expect(setCall['Content-Disposition']).toContain(
				TEST_JOB_ID.substring(0, 8),
			);
		});

		it('should set Cache-Control to no-store', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			expect(setCall['Cache-Control']).toBe('no-store');
		});

		it('should set X-Accel-Buffering header', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			expect(setCall['X-Accel-Buffering']).toBe('no');
		});

		it('should set Content-Encoding to identity', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			expect(setCall['Content-Encoding']).toBe('identity');
		});

		it('should set Referrer-Policy header', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			expect(setCall['Referrer-Policy']).toBe('no-referrer');
		});

		it('should NOT set Transfer-Encoding header', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			expect(setCall['Transfer-Encoding']).toBeUndefined();
		});
	});

	// ======================================================================
	// Filename generation
	// ======================================================================

	describe('filename generation', () => {
		it('should derive filename from job URL hostname', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(
				buildJob({ url: 'https://example.com/path' }),
			);
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			const expected = `example.com-${TEST_JOB_ID.substring(0, 8)}.zip`;
			expect(setCall['Content-Disposition']).toBe(
				`attachment; filename="${expected}"`,
			);
		});

		it('should sanitize special characters in hostname', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			// Hostname with underscore (rare but valid in some contexts via the URL constructor)
			jobRepo.findOne.mockResolvedValue(
				buildJob({ url: 'https://my_site.example.com' }),
			);
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			// Underscores are replaced by the regex [^a-zA-Z0-9.-]
			expect(setCall['Content-Disposition']).toContain(
				'my-site.example.com',
			);
		});

		it('should fallback to "export" when URL parsing fails', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(
				buildJob({ url: 'not-a-valid-url' }),
			);
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			const expected = `export-${TEST_JOB_ID.substring(0, 8)}.zip`;
			expect(setCall['Content-Disposition']).toBe(
				`attachment; filename="${expected}"`,
			);
		});

		it('should use first 8 chars of jobId in filename', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			const setCall = res.set.mock.calls[0][0];
			expect(setCall['Content-Disposition']).toContain(
				TEST_JOB_ID.substring(0, 8),
			);
			expect(setCall['Content-Disposition']).toMatch(/\.zip"$/);
		});
	});

	// ======================================================================
	// Stream error handling
	// ======================================================================

	describe('stream error handling', () => {
		it('should return 500 JSON if export throws before headers sent', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			res.headersSent = false;
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);
			exportService.streamJobExport.mockRejectedValue(
				new Error('S3 timeout'),
			);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({
				error: 'Download failed',
			});
		});

		it('should destroy response if export throws after headers sent', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			res.headersSent = true;
			res.destroyed = false;
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);
			exportService.streamJobExport.mockRejectedValue(
				new Error('Mid-stream failure'),
			);

			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			expect(res.destroy).toHaveBeenCalled();
			expect(res.status).not.toHaveBeenCalled();
		});

		it('should not crash if response is already destroyed', async () => {
			const token = buildDownloadToken();
			const res = mockResponse();
			res.headersSent = true;
			res.destroyed = true;
			jobRepo.findOne.mockResolvedValue(buildJob());
			pageRepo.find.mockResolvedValue([buildPage()]);
			exportService.streamJobExport.mockRejectedValue(
				new Error('Already gone'),
			);

			// Should not throw
			await controller.streamDownload(
				res,
				TEST_ORG_ID,
				TEST_JOB_ID,
				token,
				'html',
			);

			expect(res.destroy).not.toHaveBeenCalled();
		});
	});

	// ======================================================================
	// SSE events endpoint
	// ======================================================================

	describe('events endpoint', () => {
		it('should throw UnauthorizedException when token is missing', async () => {
			const res = mockResponse();
			await expect(
				controller.events(TEST_ORG_ID, '', res),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when token is invalid', async () => {
			const res = mockResponse();
			await expect(
				controller.events(TEST_ORG_ID, 'invalid-token', res),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when token is expired', async () => {
			const token = 'expired-token';
			sseTokenStore.set(token, {
				userId: TEST_USER_ID,
				organizationId: TEST_ORG_ID,
				createdAt: new Date(Date.now() - SSE_TOKEN_TTL_MS - 1000),
			});

			const res = mockResponse();
			await expect(
				controller.events(TEST_ORG_ID, token, res),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when orgId does not match token', async () => {
			const token = 'org-mismatch-token';
			sseTokenStore.set(token, {
				userId: TEST_USER_ID,
				organizationId: 'different-org-id',
				createdAt: new Date(),
			});

			const res = mockResponse();
			await expect(
				controller.events(TEST_ORG_ID, token, res),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should establish SSE connection with valid token', async () => {
			const token = 'valid-sse-token';
			sseTokenStore.set(token, {
				userId: TEST_USER_ID,
				organizationId: TEST_ORG_ID,
				createdAt: new Date(),
			});

			const res = mockResponse();
			await controller.events(TEST_ORG_ID, token, res);

			expect(sseService.addConnection).toHaveBeenCalledWith(
				res,
				TEST_USER_ID,
				TEST_ORG_ID,
			);
		});

		it('should consume token after use (single-use)', async () => {
			const token = 'single-use-token';
			sseTokenStore.set(token, {
				userId: TEST_USER_ID,
				organizationId: TEST_ORG_ID,
				createdAt: new Date(),
			});

			const res = mockResponse();
			await controller.events(TEST_ORG_ID, token, res);

			// Token should be removed from store
			expect(sseTokenStore.has(token)).toBe(false);
		});
	});
});
