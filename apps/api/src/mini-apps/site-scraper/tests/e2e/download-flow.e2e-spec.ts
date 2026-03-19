/**
 * E2E Integration Test: Download Flow
 *
 * Tests the download endpoint behavior including headers, streaming,
 * HMAC token validation, and format filtering. Verifies the Safari fix
 * regression (clean response headers).
 */
import { createHmac } from 'crypto';
import { Readable } from 'stream';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

import { AwsS3Service, AwsSqsService } from '../../../../_platform/aws';
import { ScrapeJob } from '../../entities/scrape-job.entity';
import { ScrapedPage } from '../../entities/scraped-page.entity';
import { SiteScraperSseController } from '../../site-scraper-sse.controller';
import { SiteScraperExportService } from '../../services/site-scraper-export.service';
import { ScraperSseService } from '../../services/scraper-sse.service';
import { DOWNLOAD_TOKEN_SECRET } from '../../site-scraper.controller';
import { JobStatus, PageStatus } from '../../types/job-status.enum';

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------
function logStep(emoji: string, message: string, data?: any) {
	const timestamp = new Date().toISOString();
	console.log(`[${timestamp}] ${emoji} ${message}`);
	if (data) console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const TEST_ORG_ID = uuidv4();
const TEST_USER_ID = uuidv4();
const TEST_JOB_ID = uuidv4();
const TEST_URL = 'https://example.com';
const DOWNLOAD_PATH = `/organization/${TEST_ORG_ID}/apps/site-scraper/jobs/${TEST_JOB_ID}/download`;

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
function createValidToken(
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
		exp: Date.now() + 5 * 60 * 1000,
		...overrides,
	});
	const signature = createHmac('sha256', DOWNLOAD_TOKEN_SECRET)
		.update(payload)
		.digest('hex');
	return Buffer.from(payload).toString('base64url') + '.' + signature;
}

function createExpiredToken(): string {
	return createValidToken({ exp: Date.now() - 1000 });
}

function createTamperedToken(): string {
	const payload = JSON.stringify({
		jobId: TEST_JOB_ID,
		userId: TEST_USER_ID,
		orgId: TEST_ORG_ID,
		exp: Date.now() + 5 * 60 * 1000,
	});
	// Use wrong secret for signature
	const signature = createHmac('sha256', 'wrong-secret')
		.update(payload)
		.digest('hex');
	return Buffer.from(payload).toString('base64url') + '.' + signature;
}

function createWrongJobToken(): string {
	return createValidToken({ jobId: uuidv4() });
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------
function buildMockJob(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
	return Object.assign(new ScrapeJob(), {
		id: TEST_JOB_ID,
		url: TEST_URL,
		maxDepth: 3,
		viewports: [1920],
		status: JobStatus.COMPLETED,
		pagesDiscovered: 5,
		pagesCompleted: 5,
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
	}) as ScrapeJob;
}

function buildMockPage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
	return Object.assign(new ScrapedPage(), {
		id: uuidv4(),
		scrapeJobId: TEST_JOB_ID,
		url: `${TEST_URL}/page-1`,
		title: 'Test Page',
		htmlS3Key: `site-scraper/${TEST_JOB_ID}/page.html`,
		screenshots: [
			{
				viewport: 1920,
				s3Key: `site-scraper/${TEST_JOB_ID}/screenshot-1920w.jpg`,
			},
		],
		status: PageStatus.COMPLETED,
		errorMessage: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}) as ScrapedPage;
}

function createMockRepository() {
	return {
		findOne: jest.fn().mockResolvedValue(null),
		find: jest.fn().mockResolvedValue([]),
		findAndCount: jest.fn().mockResolvedValue([[], 0]),
	};
}

// ---------------------------------------------------------------------------
// Mock S3 service that returns streams
// ---------------------------------------------------------------------------
const mockS3Service = {
	download: jest
		.fn()
		.mockResolvedValue(Buffer.from('<html><body>Hello</body></html>')),
	getObjectStream: jest.fn().mockImplementation(() => {
		const stream = new Readable({
			read() {
				this.push(Buffer.from('<html>test page</html>'));
				this.push(null);
			},
		});
		return Promise.resolve(stream);
	}),
};

// ---------------------------------------------------------------------------
// Mock export service — provides controllable streamJobExport
// ---------------------------------------------------------------------------
let mockStreamFn: jest.Mock;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('Site Scraper - Download Flow E2E', () => {
	let app: INestApplication;
	let jobRepo: ReturnType<typeof createMockRepository>;
	let pageRepo: ReturnType<typeof createMockRepository>;
	const testResults: { step: string; passed: boolean; duration: number }[] =
		[];

	beforeAll(async () => {
		logStep('🔧', 'Setting up download flow test module');

		jobRepo = createMockRepository();
		pageRepo = createMockRepository();

		mockStreamFn = jest
			.fn()
			.mockImplementation(
				async (_job: any, _pages: any, _formats: any, output: any) => {
					// Simulate a minimal ZIP stream by writing bytes then ending
					output.write(Buffer.from('PK\x03\x04')); // ZIP local file header magic
					output.end();
				},
			);

		const moduleFixture: TestingModule = await Test.createTestingModule({
			controllers: [SiteScraperSseController],
			providers: [
				ScraperSseService,
				{
					provide: SiteScraperExportService,
					useValue: { streamJobExport: mockStreamFn },
				},
				{ provide: getRepositoryToken(ScrapeJob), useValue: jobRepo },
				{
					provide: getRepositoryToken(ScrapedPage),
					useValue: pageRepo,
				},
				{ provide: AwsS3Service, useValue: mockS3Service },
				{
					provide: AwsSqsService,
					useValue: { sendPageWork: jest.fn(), sendBatch: jest.fn() },
				},
			],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();

		logStep('✅', 'Download flow test module initialized');
	});

	afterAll(async () => {
		logStep('📊', 'Download Flow Test Summary', testResults);
		const passed = testResults.filter((r) => r.passed).length;
		const failed = testResults.filter((r) => !r.passed).length;
		logStep(
			'📊',
			`Results: ${passed} passed, ${failed} failed out of ${testResults.length} tests`,
		);

		if (app) await app.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// Response headers (regression tests for Safari fix)
	// -----------------------------------------------------------------------
	describe('Response headers — Safari fix regression', () => {
		const validToken = () => createValidToken();

		beforeEach(() => {
			jobRepo.findOne.mockResolvedValue(buildMockJob());
			pageRepo.find.mockResolvedValue([buildMockPage()]);
		});

		it('Step 1: Content-Type must be application/zip', async () => {
			const start = Date.now();
			logStep('📋', 'Checking Content-Type header...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: validToken(), format: 'html' });

			logStep('📋', 'Content-Type header', {
				contentType: res.headers['content-type'],
			});

			expect(res.headers['content-type']).toBe('application/zip');

			const duration = Date.now() - start;
			testResults.push({
				step: 'Content-Type header',
				passed: true,
				duration,
			});
			logStep('✅', `Content-Type check passed (${duration}ms)`);
		});

		it('Step 2: Content-Disposition must be attachment with correct filename', async () => {
			const start = Date.now();
			logStep('📋', 'Checking Content-Disposition header...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: validToken(), format: 'html' });

			const cd = res.headers['content-disposition'];
			logStep('📋', 'Content-Disposition header', {
				contentDisposition: cd,
			});

			expect(cd).toContain('attachment');
			expect(cd).toContain('filename=');
			// Should contain hostname and job ID prefix
			expect(cd).toContain('example.com');
			expect(cd).toContain(TEST_JOB_ID.substring(0, 8));
			expect(cd).toContain('.zip');

			const duration = Date.now() - start;
			testResults.push({
				step: 'Content-Disposition header',
				passed: true,
				duration,
			});
			logStep('✅', `Content-Disposition check passed (${duration}ms)`);
		});

		it('Step 3: Cache-Control must be no-store', async () => {
			const start = Date.now();
			logStep('📋', 'Checking Cache-Control header...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: validToken(), format: 'html' });

			logStep('📋', 'Cache-Control header', {
				cacheControl: res.headers['cache-control'],
			});

			expect(res.headers['cache-control']).toBe('no-store');

			const duration = Date.now() - start;
			testResults.push({
				step: 'Cache-Control header',
				passed: true,
				duration,
			});
			logStep('✅', `Cache-Control check passed (${duration}ms)`);
		});

		it('Step 4: Response has required security headers', async () => {
			const start = Date.now();
			logStep('📋', 'Checking security headers...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: validToken(), format: 'html' });

			logStep('📋', 'Security headers', {
				referrerPolicy: res.headers['referrer-policy'],
				xAccelBuffering: res.headers['x-accel-buffering'],
				contentEncoding: res.headers['content-encoding'],
			});

			// These headers ARE explicitly set by the controller
			expect(res.headers['x-accel-buffering']).toBe('no');
			expect(res.headers['referrer-policy']).toBe('no-referrer');
			expect(res.headers['content-encoding']).toBe('identity');

			const duration = Date.now() - start;
			testResults.push({
				step: 'Security headers',
				passed: true,
				duration,
			});
			logStep('✅', `Security headers check passed (${duration}ms)`);
		});
	});

	// -----------------------------------------------------------------------
	// Token validation
	// -----------------------------------------------------------------------
	describe('Token validation', () => {
		it('Step 5: Valid HMAC token — 200 with ZIP', async () => {
			const start = Date.now();
			logStep('🔑', 'Testing valid HMAC token...');

			jobRepo.findOne.mockResolvedValue(buildMockJob());
			pageRepo.find.mockResolvedValue([buildMockPage()]);

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'html' });

			logStep('🔑', 'Valid token response', { status: res.status });

			expect(res.status).toBe(200);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Valid token → 200',
				passed: true,
				duration,
			});
			logStep('✅', `Valid token test passed (${duration}ms)`);
		});

		it('Step 6: Expired token — 401', async () => {
			const start = Date.now();
			logStep('🔑', 'Testing expired token...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createExpiredToken(), format: 'html' });

			logStep('🔑', 'Expired token response', {
				status: res.status,
				message: res.body?.message,
			});

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Expired token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `Expired token test passed (${duration}ms)`);
		});

		it('Step 7: Tampered token — 401', async () => {
			const start = Date.now();
			logStep('🔑', 'Testing tampered token...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createTamperedToken(), format: 'html' });

			logStep('🔑', 'Tampered token response', {
				status: res.status,
				message: res.body?.message,
			});

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Tampered token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `Tampered token test passed (${duration}ms)`);
		});

		it('Step 8: Missing token — 401', async () => {
			const start = Date.now();
			logStep('🔑', 'Testing missing token...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ format: 'html' });

			logStep('🔑', 'Missing token response', {
				status: res.status,
				message: res.body?.message,
			});

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Missing token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `Missing token test passed (${duration}ms)`);
		});

		it('Step 9: Token for wrong job — 401', async () => {
			const start = Date.now();
			logStep('🔑', 'Testing token for wrong job...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createWrongJobToken(), format: 'html' });

			logStep('🔑', 'Wrong job token response', {
				status: res.status,
				message: res.body?.message,
			});

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Wrong job token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `Wrong job token test passed (${duration}ms)`);
		});

		it('Step 10: Malformed token (no dot separator) — 401', async () => {
			const start = Date.now();
			logStep('🔑', 'Testing malformed token (no dot)...');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: 'no-dot-separator', format: 'html' });

			logStep('🔑', 'Malformed token response', { status: res.status });

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Malformed token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `Malformed token test passed (${duration}ms)`);
		});

		it('Step 11: Token for wrong org — 401', async () => {
			const start = Date.now();
			logStep('🔑', 'Testing token for wrong org...');

			const wrongOrgToken = createValidToken({ orgId: uuidv4() });

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: wrongOrgToken, format: 'html' });

			logStep('🔑', 'Wrong org token response', { status: res.status });

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Wrong org token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `Wrong org token test passed (${duration}ms)`);
		});
	});

	// -----------------------------------------------------------------------
	// Format filtering
	// -----------------------------------------------------------------------
	describe('Format filtering', () => {
		beforeEach(() => {
			jobRepo.findOne.mockResolvedValue(buildMockJob());
			pageRepo.find.mockResolvedValue([buildMockPage()]);
		});

		it('Step 12: Single format (html only) — export called with html format', async () => {
			const start = Date.now();
			logStep('📁', 'Testing single format: html');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'html' });

			logStep('📁', 'Single format response', { status: res.status });

			expect(res.status).toBe(200);
			expect(mockStreamFn).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				new Set(['html']),
				expect.anything(),
			);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Single format html',
				passed: true,
				duration,
			});
			logStep('✅', `Single format test passed (${duration}ms)`);
		});

		it('Step 13: Multiple formats — export called with all requested formats', async () => {
			const start = Date.now();
			logStep(
				'📁',
				'Testing multiple formats: html,markdown,screenshots',
			);

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({
					token: createValidToken(),
					format: 'html,markdown,screenshots',
				});

			logStep('📁', 'Multiple formats response', { status: res.status });

			expect(res.status).toBe(200);
			expect(mockStreamFn).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				new Set(['html', 'markdown', 'screenshots']),
				expect.anything(),
			);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Multiple formats',
				passed: true,
				duration,
			});
			logStep('✅', `Multiple formats test passed (${duration}ms)`);
		});

		it('Step 14: No valid format — 400 error', async () => {
			const start = Date.now();
			logStep('📁', 'Testing no format parameter');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: '' });

			logStep('📁', 'No format response', {
				status: res.status,
				message: res.body?.message,
			});

			expect(res.status).toBe(400);

			const duration = Date.now() - start;
			testResults.push({
				step: 'No format → 400',
				passed: true,
				duration,
			});
			logStep('✅', `No format test passed (${duration}ms)`);
		});

		it('Step 15: Invalid format values ignored, valid ones used', async () => {
			const start = Date.now();
			logStep(
				'📁',
				'Testing mixed valid/invalid formats: html,invalid,jpeg',
			);

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({
					token: createValidToken(),
					format: 'html,invalid,jpeg',
				});

			logStep('📁', 'Mixed formats response', { status: res.status });

			expect(res.status).toBe(200);
			expect(mockStreamFn).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				new Set(['html']),
				expect.anything(),
			);

			const duration = Date.now() - start;
			testResults.push({ step: 'Mixed formats', passed: true, duration });
			logStep('✅', `Mixed formats test passed (${duration}ms)`);
		});

		it('Step 16: All invalid formats — 400 error', async () => {
			const start = Date.now();
			logStep('📁', 'Testing all invalid formats: pdf,txt,csv');

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'pdf,txt,csv' });

			logStep('📁', 'All invalid formats response', {
				status: res.status,
			});

			expect(res.status).toBe(400);

			const duration = Date.now() - start;
			testResults.push({
				step: 'All invalid formats → 400',
				passed: true,
				duration,
			});
			logStep('✅', `All invalid formats test passed (${duration}ms)`);
		});
	});

	// -----------------------------------------------------------------------
	// Streaming behavior
	// -----------------------------------------------------------------------
	describe('Streaming behavior', () => {
		it('Step 17: Small job — ZIP streams and response completes', async () => {
			const start = Date.now();
			logStep('📦', 'Streaming ZIP for small job (1 page)...');

			jobRepo.findOne.mockResolvedValue(buildMockJob());
			pageRepo.find.mockResolvedValue([buildMockPage()]);

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'html' })
				.buffer(true);

			logStep('📦', 'Small job stream response', {
				status: res.status,
				bodyLength: res.body?.length || 0,
				contentType: res.headers['content-type'],
			});

			expect(res.status).toBe(200);
			expect(mockStreamFn).toHaveBeenCalled();

			const duration = Date.now() - start;
			testResults.push({
				step: 'Small job streaming',
				passed: true,
				duration,
			});
			logStep('✅', `Small job streaming passed (${duration}ms)`);
		});

		it('Step 18: No completed pages — 422 error', async () => {
			const start = Date.now();
			logStep('📦', 'Streaming ZIP for job with no completed pages...');

			jobRepo.findOne.mockResolvedValue(buildMockJob());
			pageRepo.find.mockResolvedValue([]); // No completed pages

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'html' });

			logStep('📦', 'No completed pages response', {
				status: res.status,
				message: res.body?.message,
			});

			expect(res.status).toBe(422);

			const duration = Date.now() - start;
			testResults.push({
				step: 'No completed pages → 422',
				passed: true,
				duration,
			});
			logStep('✅', `No completed pages test passed (${duration}ms)`);
		});

		it('Step 19: Job not found — 404', async () => {
			const start = Date.now();
			logStep('📦', 'Downloading from non-existent job...');

			jobRepo.findOne.mockResolvedValue(null);

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'html' });

			logStep('📦', 'Job not found response', { status: res.status });

			expect(res.status).toBe(404);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Job not found → 404',
				passed: true,
				duration,
			});
			logStep('✅', `Job not found test passed (${duration}ms)`);
		});

		it('Step 20: Export service error — handled gracefully', async () => {
			const start = Date.now();
			logStep('📦', 'Simulating export service error...');

			jobRepo.findOne.mockResolvedValue(buildMockJob());
			pageRepo.find.mockResolvedValue([buildMockPage()]);

			// Override streamJobExport to throw after headers sent
			mockStreamFn.mockImplementationOnce(
				async (_job: any, _pages: any, _formats: any, _output: any) => {
					throw new Error('S3 download failed');
				},
			);

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'html' });

			logStep('📦', 'Export error response', { status: res.status });

			// The controller catches the error — either 500 or connection reset
			// Since headers aren't sent yet in our mock, it should be a JSON error
			expect([200, 500]).toContain(res.status);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Export error handling',
				passed: true,
				duration,
			});
			logStep('✅', `Export error handling passed (${duration}ms)`);
		});
	});

	// -----------------------------------------------------------------------
	// Filename generation
	// -----------------------------------------------------------------------
	describe('Filename generation', () => {
		it('Step 21: Filename includes hostname and job ID prefix', async () => {
			const start = Date.now();
			logStep('📄', 'Checking filename generation from job URL...');

			jobRepo.findOne.mockResolvedValue(
				buildMockJob({ url: 'https://www.test-site.co.uk/page' }),
			);
			pageRepo.find.mockResolvedValue([buildMockPage()]);

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'html' });

			const cd = res.headers['content-disposition'];
			logStep('📄', 'Filename from Content-Disposition', {
				contentDisposition: cd,
			});

			expect(cd).toContain('www.test-site.co.uk');
			expect(cd).toContain(TEST_JOB_ID.substring(0, 8));

			const duration = Date.now() - start;
			testResults.push({
				step: 'Filename generation',
				passed: true,
				duration,
			});
			logStep('✅', `Filename generation passed (${duration}ms)`);
		});

		it('Step 22: Invalid URL falls back to "export" hostname', async () => {
			const start = Date.now();
			logStep('📄', 'Checking filename with invalid URL...');

			// Force URL parsing to fail by using an object where url throws
			const jobWithBadUrl = buildMockJob({ url: 'not://[invalid' });
			jobRepo.findOne.mockResolvedValue(jobWithBadUrl);
			pageRepo.find.mockResolvedValue([buildMockPage()]);

			const res = await request(app.getHttpServer())
				.get(DOWNLOAD_PATH)
				.query({ token: createValidToken(), format: 'html' });

			const cd = res.headers['content-disposition'];
			logStep('📄', 'Fallback filename', { contentDisposition: cd });

			// Should use 'export' as fallback hostname
			expect(cd).toContain('export');

			const duration = Date.now() - start;
			testResults.push({
				step: 'Fallback filename',
				passed: true,
				duration,
			});
			logStep('✅', `Fallback filename passed (${duration}ms)`);
		});
	});
});
