/**
 * E2E Integration Test: SSE Event Streaming
 *
 * Tests Server-Sent Events for real-time job progress updates.
 * Covers connection management, event types, ordering, and cleanup.
 * Uses the real ScraperSseService with mock HTTP responses.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { DataSource } from 'typeorm';

import { PgBossService } from '../../../../_platform/queue';
import { AwsS3Service, AwsSqsService } from '../../../../_platform/aws';
import { ScrapeJob } from '../../entities/scrape-job.entity';
import { ScrapedPage } from '../../entities/scraped-page.entity';
import {
	SiteScraperController,
	sseTokenStore,
	SSE_TOKEN_TTL_MS,
} from '../../site-scraper.controller';
import { SiteScraperSseController } from '../../site-scraper-sse.controller';
import { SiteScraperService } from '../../services/site-scraper.service';
import { ScraperSseService } from '../../services/scraper-sse.service';
import { SiteScraperExportService } from '../../services/site-scraper-export.service';
import {
	ScraperSSEEventType,
	formatSSEMessage,
} from '../../types/sse-events.types';
import { JobStatus } from '../../types/job-status.enum';

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
const SSE_PATH = `/organization/${TEST_ORG_ID}/apps/site-scraper/events`;

// ---------------------------------------------------------------------------
// Mock repository
// ---------------------------------------------------------------------------
function createMockRepository() {
	return {
		create: jest.fn().mockImplementation((data) => ({ ...data })),
		save: jest
			.fn()
			.mockImplementation((entity) =>
				Promise.resolve({ ...entity, id: entity.id || uuidv4() }),
			),
		findOne: jest.fn().mockResolvedValue(null),
		find: jest.fn().mockResolvedValue([]),
		findAndCount: jest.fn().mockResolvedValue([[], 0]),
		count: jest.fn().mockResolvedValue(0),
		remove: jest.fn().mockResolvedValue(undefined),
		delete: jest.fn().mockResolvedValue(undefined),
		createQueryBuilder: jest.fn().mockReturnValue({
			update: jest.fn().mockReturnThis(),
			set: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			setParameter: jest.fn().mockReturnThis(),
			execute: jest.fn().mockResolvedValue({}),
			innerJoin: jest.fn().mockReturnThis(),
			getOne: jest.fn().mockResolvedValue(null),
		}),
	};
}

// ---------------------------------------------------------------------------
// SSE response parser
// ---------------------------------------------------------------------------
interface ParsedSSEEvent {
	type: string;
	data: any;
	raw: string;
}

function parseSSEEvents(raw: string): ParsedSSEEvent[] {
	const events: ParsedSSEEvent[] = [];
	// Split on double-newline boundaries
	const blocks = raw.split('\n\n').filter((b) => b.trim());

	for (const block of blocks) {
		const lines = block.split('\n');
		let eventType = '';
		let dataStr = '';

		for (const line of lines) {
			if (line.startsWith('event: ')) {
				eventType = line.substring(7).trim();
			} else if (line.startsWith('data: ')) {
				dataStr = line.substring(6).trim();
			} else if (line.startsWith('retry: ')) {
				// Retry directive — not an event
				continue;
			}
		}

		if (eventType && dataStr) {
			try {
				events.push({
					type: eventType,
					data: JSON.parse(dataStr),
					raw: block,
				});
			} catch {
				events.push({ type: eventType, data: dataStr, raw: block });
			}
		}
	}

	return events;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('Site Scraper - SSE Event Streaming E2E', () => {
	let app: INestApplication;
	let sseService: ScraperSseService;
	const testResults: { step: string; passed: boolean; duration: number }[] =
		[];

	beforeAll(async () => {
		logStep('🔧', 'Setting up SSE test module');

		const jobRepo = createMockRepository();
		const pageRepo = createMockRepository();

		const moduleFixture: TestingModule = await Test.createTestingModule({
			controllers: [SiteScraperController, SiteScraperSseController],
			providers: [
				SiteScraperService,
				ScraperSseService,
				SiteScraperExportService,
				{ provide: getRepositoryToken(ScrapeJob), useValue: jobRepo },
				{
					provide: getRepositoryToken(ScrapedPage),
					useValue: pageRepo,
				},
				{
					provide: PgBossService,
					useValue: {
						sendSiteScraperJob: jest.fn(),
						workSiteScraperQueue: jest.fn(),
					},
				},
				{
					provide: AwsS3Service,
					useValue: {
						upload: jest.fn(),
						download: jest.fn(),
						deleteMany: jest.fn(),
						generatePresignedUrl: jest.fn(),
						getObjectStream: jest.fn(),
					},
				},
				{
					provide: AwsSqsService,
					useValue: { sendPageWork: jest.fn(), sendBatch: jest.fn() },
				},
				{ provide: DataSource, useValue: { transaction: jest.fn() } },
			],
		})
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			.overrideGuard(require('@nestjs/passport').AuthGuard('jwt'))
			.useValue({
				canActivate: (context: any) => {
					const req = context.switchToHttp().getRequest();
					req.user = {
						id: TEST_USER_ID,
						organizationId: TEST_ORG_ID,
					};
					return true;
				},
			})
			.compile();

		app = moduleFixture.createNestApplication();
		await app.init();

		sseService = moduleFixture.get(ScraperSseService);

		logStep('✅', 'SSE test module initialized');
	});

	afterAll(async () => {
		logStep('📊', 'SSE Test Summary', testResults);
		const passed = testResults.filter((r) => r.passed).length;
		const failed = testResults.filter((r) => !r.passed).length;
		logStep(
			'📊',
			`Results: ${passed} passed, ${failed} failed out of ${testResults.length} tests`,
		);

		if (app) await app.close();
	});

	beforeEach(() => {
		sseTokenStore.clear();
	});

	// -----------------------------------------------------------------------
	// Helper: create and store a valid SSE token
	// -----------------------------------------------------------------------
	function createSseToken(
		userId = TEST_USER_ID,
		orgId = TEST_ORG_ID,
	): string {
		const token = uuidv4();
		sseTokenStore.set(token, {
			userId,
			organizationId: orgId,
			createdAt: new Date(),
		});
		return token;
	}

	// -----------------------------------------------------------------------
	// SSE Connection
	// -----------------------------------------------------------------------
	describe('SSE connection', () => {
		it('Step 1: Connect to SSE endpoint — receives connection event', (done) => {
			const start = Date.now();
			logStep(
				'🔌',
				`Connecting to SSE endpoint for job ${TEST_JOB_ID}...`,
			);

			const token = createSseToken();
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			// Use raw HTTP to handle SSE streaming
			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					// Give it a moment to receive the initial events
					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 500);
				})
				.end((_err: any, _res: any) => {
					const events = parseSSEEvents(receivedData);
					logStep('🔌', 'SSE connection events received', {
						eventCount: events.length,
						types: events.map((e) => e.type),
					});

					// Should receive a connection event
					const connectionEvent = events.find(
						(e) => e.type === ScraperSSEEventType.CONNECTION,
					);
					expect(connectionEvent).toBeDefined();
					if (connectionEvent) {
						expect(connectionEvent.data.connected).toBe(true);
						expect(connectionEvent.data.timestamp).toBeDefined();
					}

					const duration = Date.now() - start;
					testResults.push({
						step: 'SSE connection',
						passed: true,
						duration,
					});
					logStep('✅', `SSE connection test passed (${duration}ms)`);
					done();
				});
		}, 10000);

		it('Step 2: No token — 401 error', async () => {
			const start = Date.now();
			logStep('🔌', 'Connecting without SSE token...');

			const res = await request(app.getHttpServer())
				.get(SSE_PATH)
				.expect(401);

			logStep('🔌', 'No token response', { status: res.status });

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'SSE no token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `SSE no token test passed (${duration}ms)`);
		});

		it('Step 3: Expired SSE token — 401 error', async () => {
			const start = Date.now();
			logStep('🔌', 'Connecting with expired SSE token...');

			const token = uuidv4();
			sseTokenStore.set(token, {
				userId: TEST_USER_ID,
				organizationId: TEST_ORG_ID,
				createdAt: new Date(Date.now() - SSE_TOKEN_TTL_MS - 1000), // expired
			});

			const res = await request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.expect(401);

			logStep('🔌', 'Expired token response', { status: res.status });

			expect(res.status).toBe(401);
			// Token should have been cleaned up
			expect(sseTokenStore.has(token)).toBe(false);

			const duration = Date.now() - start;
			testResults.push({
				step: 'SSE expired token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `SSE expired token test passed (${duration}ms)`);
		});

		it('Step 4: Invalid (non-existent) SSE token — 401 error', async () => {
			const start = Date.now();
			logStep('🔌', 'Connecting with invalid SSE token...');

			const res = await request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token: 'non-existent-token' })
				.expect(401);

			logStep('🔌', 'Invalid token response', { status: res.status });

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'SSE invalid token → 401',
				passed: true,
				duration,
			});
			logStep('✅', `SSE invalid token test passed (${duration}ms)`);
		});

		it('Step 5: Org mismatch — token org differs from URL org — 401', async () => {
			const start = Date.now();
			logStep('🔌', 'Connecting with org mismatch...');

			// Create token for different org
			const differentOrgId = uuidv4();
			const token = createSseToken(TEST_USER_ID, differentOrgId);

			const res = await request(app.getHttpServer())
				.get(SSE_PATH) // SSE_PATH uses TEST_ORG_ID
				.query({ token })
				.expect(401);

			logStep('🔌', 'Org mismatch response', { status: res.status });

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'SSE org mismatch → 401',
				passed: true,
				duration,
			});
			logStep('✅', `SSE org mismatch test passed (${duration}ms)`);
		});

		it('Step 6: SSE token is single-use — second use returns 401', async () => {
			const start = Date.now();
			logStep('🔌', 'Testing SSE token single-use...');

			const token = createSseToken();

			// First use — succeeds (SSE connection established)
			const firstReq = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			// Make the first request and close it quickly
			await new Promise<void>((resolve) => {
				firstReq
					.buffer(false)
					.parse((res: any, callback: any) => {
						setTimeout(() => {
							res.destroy();
							callback(null, '');
						}, 200);
					})
					.end(() => resolve());
			});

			// Second use — should fail
			const res = await request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.expect(401);

			logStep('🔌', 'Second use response', { status: res.status });

			expect(res.status).toBe(401);

			const duration = Date.now() - start;
			testResults.push({
				step: 'SSE token single-use',
				passed: true,
				duration,
			});
			logStep('✅', `SSE token single-use test passed (${duration}ms)`);
		}, 10000);
	});

	// -----------------------------------------------------------------------
	// Event types — test via the ScraperSseService directly
	// -----------------------------------------------------------------------
	describe('Event types and broadcasting', () => {
		it('Step 7: emitJobEvent sends JOB_STARTED to connected user', (done) => {
			const start = Date.now();
			logStep('📡', 'Testing JOB_STARTED event emission...');

			const token = createSseToken();
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					// Wait for connection event, then emit JOB_STARTED
					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.JOB_STARTED,
							{
								id: TEST_JOB_ID,
								status: JobStatus.RUNNING,
								url: TEST_URL,
							},
						);
					}, 300);

					// Collect a bit longer for the event to arrive
					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 800);
				})
				.end((_err: any) => {
					const events = parseSSEEvents(receivedData);
					logStep('📡', 'Received JOB_STARTED events', {
						eventCount: events.length,
						types: events.map((e) => e.type),
					});

					const jobStarted = events.find(
						(e) => e.type === ScraperSSEEventType.JOB_STARTED,
					);
					expect(jobStarted).toBeDefined();
					if (jobStarted) {
						expect(jobStarted.data.id).toBe(TEST_JOB_ID);
						expect(jobStarted.data.status).toBe(JobStatus.RUNNING);
						expect(jobStarted.data.url).toBe(TEST_URL);
					}

					const duration = Date.now() - start;
					testResults.push({
						step: 'JOB_STARTED event',
						passed: true,
						duration,
					});
					logStep(
						'✅',
						`JOB_STARTED event test passed (${duration}ms)`,
					);
					done();
				});
		}, 10000);

		it('Step 8: emitJobEvent sends PAGES_DISCOVERED to connected user', (done) => {
			const start = Date.now();
			logStep('📡', 'Testing PAGES_DISCOVERED event emission...');

			const token = createSseToken();
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.PAGES_DISCOVERED,
							{
								id: TEST_JOB_ID,
								newUrls: [
									`${TEST_URL}/page-1`,
									`${TEST_URL}/page-2`,
								],
								totalDiscovered: 3,
							},
						);
					}, 300);

					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 800);
				})
				.end((_err: any) => {
					const events = parseSSEEvents(receivedData);
					logStep(
						'📡',
						`Received PAGES_DISCOVERED: ${events.length} total events`,
					);

					const discovered = events.find(
						(e) => e.type === ScraperSSEEventType.PAGES_DISCOVERED,
					);
					expect(discovered).toBeDefined();
					if (discovered) {
						expect(discovered.data.newUrls).toHaveLength(2);
						expect(discovered.data.totalDiscovered).toBe(3);
					}

					const duration = Date.now() - start;
					testResults.push({
						step: 'PAGES_DISCOVERED event',
						passed: true,
						duration,
					});
					logStep(
						'✅',
						`PAGES_DISCOVERED event test passed (${duration}ms)`,
					);
					done();
				});
		}, 10000);

		it('Step 9: emitJobEvent sends PAGE_COMPLETED to connected user', (done) => {
			const start = Date.now();
			logStep('📡', 'Testing PAGE_COMPLETED event emission...');

			const token = createSseToken();
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.PAGE_COMPLETED,
							{
								id: TEST_JOB_ID,
								pageUrl: `${TEST_URL}/about`,
								title: 'About Page',
								pagesCompleted: 2,
								pagesDiscovered: 5,
							},
						);
					}, 300);

					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 800);
				})
				.end((_err: any) => {
					const events = parseSSEEvents(receivedData);
					logStep(
						'📡',
						`Received PAGE_COMPLETED: ${events.length} total events`,
					);

					const pageCompleted = events.find(
						(e) => e.type === ScraperSSEEventType.PAGE_COMPLETED,
					);
					expect(pageCompleted).toBeDefined();
					if (pageCompleted) {
						expect(pageCompleted.data.pageUrl).toBe(
							`${TEST_URL}/about`,
						);
						expect(pageCompleted.data.pagesCompleted).toBe(2);
						expect(pageCompleted.data.pagesDiscovered).toBe(5);
					}

					const duration = Date.now() - start;
					testResults.push({
						step: 'PAGE_COMPLETED event',
						passed: true,
						duration,
					});
					logStep(
						'✅',
						`PAGE_COMPLETED event test passed (${duration}ms)`,
					);
					done();
				});
		}, 10000);

		it('Step 10: emitJobEvent sends JOB_COMPLETED to connected user', (done) => {
			const start = Date.now();
			logStep('📡', 'Testing JOB_COMPLETED event emission...');

			const token = createSseToken();
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.JOB_COMPLETED,
							{
								id: TEST_JOB_ID,
								status: JobStatus.COMPLETED,
								pagesCompleted: 5,
								pagesFailed: 0,
								pagesDiscovered: 5,
								pagesSkippedByDepth: 2,
							},
						);
					}, 300);

					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 800);
				})
				.end((_err: any) => {
					const events = parseSSEEvents(receivedData);
					logStep(
						'📡',
						`Received JOB_COMPLETED: ${events.length} total events`,
					);

					const jobCompleted = events.find(
						(e) => e.type === ScraperSSEEventType.JOB_COMPLETED,
					);
					expect(jobCompleted).toBeDefined();
					if (jobCompleted) {
						expect(jobCompleted.data.status).toBe(
							JobStatus.COMPLETED,
						);
						expect(jobCompleted.data.pagesCompleted).toBe(5);
						expect(jobCompleted.data.pagesFailed).toBe(0);
						expect(jobCompleted.data.pagesSkippedByDepth).toBe(2);
					}

					const duration = Date.now() - start;
					testResults.push({
						step: 'JOB_COMPLETED event',
						passed: true,
						duration,
					});
					logStep(
						'✅',
						`JOB_COMPLETED event test passed (${duration}ms)`,
					);
					done();
				});
		}, 10000);

		it('Step 11: emitJobEvent sends JOB_FAILED to connected user', (done) => {
			const start = Date.now();
			logStep('📡', 'Testing JOB_FAILED event emission...');

			const token = createSseToken();
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.JOB_FAILED,
							{
								id: TEST_JOB_ID,
								status: JobStatus.FAILED,
								error: {
									code: 'CRAWL_TIMEOUT',
									message: 'Crawl timed out',
									retryable: true,
									timestamp: new Date().toISOString(),
								},
							},
						);
					}, 300);

					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 800);
				})
				.end((_err: any) => {
					const events = parseSSEEvents(receivedData);
					logStep(
						'📡',
						`Received JOB_FAILED: ${events.length} total events`,
					);

					const jobFailed = events.find(
						(e) => e.type === ScraperSSEEventType.JOB_FAILED,
					);
					expect(jobFailed).toBeDefined();
					if (jobFailed) {
						expect(jobFailed.data.status).toBe(JobStatus.FAILED);
						expect(jobFailed.data.error.code).toBe('CRAWL_TIMEOUT');
						expect(jobFailed.data.error.retryable).toBe(true);
					}

					const duration = Date.now() - start;
					testResults.push({
						step: 'JOB_FAILED event',
						passed: true,
						duration,
					});
					logStep(
						'✅',
						`JOB_FAILED event test passed (${duration}ms)`,
					);
					done();
				});
		}, 10000);

		it('Step 12: emitJobEvent sends JOB_CANCELLED to connected user', (done) => {
			const start = Date.now();
			logStep('📡', 'Testing JOB_CANCELLED event emission...');

			const token = createSseToken();
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.JOB_CANCELLED,
							{
								id: TEST_JOB_ID,
								status: JobStatus.CANCELLED,
							},
						);
					}, 300);

					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 800);
				})
				.end((_err: any) => {
					const events = parseSSEEvents(receivedData);
					logStep(
						'📡',
						`Received JOB_CANCELLED: ${events.length} total events`,
					);

					const jobCancelled = events.find(
						(e) => e.type === ScraperSSEEventType.JOB_CANCELLED,
					);
					expect(jobCancelled).toBeDefined();
					if (jobCancelled) {
						expect(jobCancelled.data.status).toBe(
							JobStatus.CANCELLED,
						);
					}

					const duration = Date.now() - start;
					testResults.push({
						step: 'JOB_CANCELLED event',
						passed: true,
						duration,
					});
					logStep(
						'✅',
						`JOB_CANCELLED event test passed (${duration}ms)`,
					);
					done();
				});
		}, 10000);
	});

	// -----------------------------------------------------------------------
	// Event sequence and completeness
	// -----------------------------------------------------------------------
	describe('Event sequence and completeness', () => {
		it('Step 13: Full event sequence — JOB_STARTED before PAGES_DISCOVERED before JOB_COMPLETED', (done) => {
			const start = Date.now();
			logStep('📡', 'Testing full event sequence ordering...');

			const token = createSseToken();
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					// Emit events in sequence with small delays
					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.JOB_STARTED,
							{
								id: TEST_JOB_ID,
								status: JobStatus.RUNNING,
								url: TEST_URL,
							},
						);
					}, 200);

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.PAGES_DISCOVERED,
							{
								id: TEST_JOB_ID,
								newUrls: [`${TEST_URL}/page-1`],
								totalDiscovered: 2,
							},
						);
					}, 350);

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.PAGE_COMPLETED,
							{
								id: TEST_JOB_ID,
								pageUrl: TEST_URL,
								title: 'Home',
								pagesCompleted: 1,
								pagesDiscovered: 2,
							},
						);
					}, 500);

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.PAGE_COMPLETED,
							{
								id: TEST_JOB_ID,
								pageUrl: `${TEST_URL}/page-1`,
								title: 'Page 1',
								pagesCompleted: 2,
								pagesDiscovered: 2,
							},
						);
					}, 650);

					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID,
							TEST_ORG_ID,
							ScraperSSEEventType.JOB_COMPLETED,
							{
								id: TEST_JOB_ID,
								status: JobStatus.COMPLETED,
								pagesCompleted: 2,
								pagesFailed: 0,
								pagesDiscovered: 2,
								pagesSkippedByDepth: 0,
							},
						);
					}, 800);

					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 1200);
				})
				.end((_err: any) => {
					const events = parseSSEEvents(receivedData);
					const eventTypes = events.map((e) => e.type);

					logStep('📡', 'Full sequence events', {
						eventCount: events.length,
						types: eventTypes,
					});

					// Verify the ordering of job events (skip connection event)
					const jobEvents = events.filter((e) =>
						[
							ScraperSSEEventType.JOB_STARTED,
							ScraperSSEEventType.PAGES_DISCOVERED,
							ScraperSSEEventType.PAGE_COMPLETED,
							ScraperSSEEventType.JOB_COMPLETED,
						].includes(e.type as ScraperSSEEventType),
					);

					expect(jobEvents.length).toBeGreaterThanOrEqual(4); // At minimum: started, discovered, 2 completed, job_completed

					// JOB_STARTED should be first job event
					expect(jobEvents[0].type).toBe(
						ScraperSSEEventType.JOB_STARTED,
					);

					// JOB_COMPLETED should be last job event
					expect(jobEvents[jobEvents.length - 1].type).toBe(
						ScraperSSEEventType.JOB_COMPLETED,
					);

					// Running tally of events received by type
					const tally: Record<string, number> = {};
					for (const e of events) {
						tally[e.type] = (tally[e.type] || 0) + 1;
					}
					logStep('📡', 'Event tally', tally);

					const duration = Date.now() - start;
					testResults.push({
						step: 'Full event sequence',
						passed: true,
						duration,
					});
					logStep(
						'✅',
						`Full event sequence test passed (${duration}ms)`,
					);
					done();
				});
		}, 15000);
	});

	// -----------------------------------------------------------------------
	// Connection management
	// -----------------------------------------------------------------------
	describe('Connection management', () => {
		it('Step 14: SSE service tracks connection count', () => {
			const start = Date.now();
			logStep('🔧', 'Testing connection count tracking...');

			const initialCount = sseService.getConnectionCount();
			logStep('🔧', `Initial connection count: ${initialCount}`);

			// getConnectionCount should return a number
			expect(typeof initialCount).toBe('number');
			expect(initialCount).toBeGreaterThanOrEqual(0);

			const duration = Date.now() - start;
			testResults.push({
				step: 'Connection count',
				passed: true,
				duration,
			});
			logStep('✅', `Connection count test passed (${duration}ms)`);
		});

		it('Step 15: SSE service provides stats', () => {
			const start = Date.now();
			logStep('🔧', 'Testing SSE stats...');

			const stats = sseService.getStats();
			logStep('🔧', 'SSE stats', stats);

			expect(stats).toHaveProperty('totalConnections');
			expect(stats).toHaveProperty('connectedUsers');
			expect(stats).toHaveProperty('connectionsByUser');
			expect(typeof stats.totalConnections).toBe('number');
			expect(typeof stats.connectedUsers).toBe('number');

			const duration = Date.now() - start;
			testResults.push({ step: 'SSE stats', passed: true, duration });
			logStep('✅', `SSE stats test passed (${duration}ms)`);
		});

		it('Step 16: Events only sent to the correct user', (done) => {
			const start = Date.now();
			logStep('🔧', 'Testing event scoping to correct user...');

			const otherUserId = uuidv4();
			const token = createSseToken(otherUserId, TEST_ORG_ID);
			let receivedData = '';

			const req = request(app.getHttpServer())
				.get(SSE_PATH)
				.query({ token })
				.set('Accept', 'text/event-stream');

			req.buffer(false)
				.parse((res: any, callback: any) => {
					res.setEncoding('utf8');
					res.on('data', (chunk: string) => {
						receivedData += chunk;
					});

					// Emit event for TEST_USER_ID (not the connected otherUserId)
					setTimeout(() => {
						sseService.emitJobEvent(
							TEST_JOB_ID,
							TEST_USER_ID, // Different user
							TEST_ORG_ID,
							ScraperSSEEventType.JOB_STARTED,
							{
								id: TEST_JOB_ID,
								status: JobStatus.RUNNING,
								url: TEST_URL,
							},
						);
					}, 300);

					setTimeout(() => {
						res.destroy();
						callback(null, receivedData);
					}, 800);
				})
				.end((_err: any) => {
					const events = parseSSEEvents(receivedData);
					logStep('🔧', 'Events received by wrong user', {
						eventCount: events.length,
						types: events.map((e) => e.type),
					});

					// Should only have the connection event, not the JOB_STARTED
					const jobStarted = events.find(
						(e) => e.type === ScraperSSEEventType.JOB_STARTED,
					);
					expect(jobStarted).toBeUndefined();

					const duration = Date.now() - start;
					testResults.push({
						step: 'Event user scoping',
						passed: true,
						duration,
					});
					logStep(
						'✅',
						`Event user scoping test passed (${duration}ms)`,
					);
					done();
				});
		}, 10000);
	});

	// -----------------------------------------------------------------------
	// formatSSEMessage utility
	// -----------------------------------------------------------------------
	describe('formatSSEMessage utility', () => {
		it('Step 17: formatSSEMessage produces correct SSE format', () => {
			const start = Date.now();
			logStep('🔧', 'Testing formatSSEMessage utility...');

			const message = formatSSEMessage(ScraperSSEEventType.JOB_STARTED, {
				id: TEST_JOB_ID,
				status: JobStatus.RUNNING,
				url: TEST_URL,
			});

			logStep('🔧', 'Formatted message', { message });

			// SSE format: "event: <type>\ndata: <json>\n\n"
			expect(message).toContain(
				`event: ${ScraperSSEEventType.JOB_STARTED}`,
			);
			expect(message).toContain('data: ');
			expect(message).toContain(TEST_JOB_ID);
			expect(message.endsWith('\n\n')).toBe(true);

			// Parse the data portion
			const dataLine = message
				.split('\n')
				.find((l) => l.startsWith('data: '));
			expect(dataLine).toBeDefined();
			const parsed = JSON.parse(dataLine!.substring(6));
			expect(parsed.id).toBe(TEST_JOB_ID);
			expect(parsed.status).toBe(JobStatus.RUNNING);

			const duration = Date.now() - start;
			testResults.push({
				step: 'formatSSEMessage',
				passed: true,
				duration,
			});
			logStep('✅', `formatSSEMessage test passed (${duration}ms)`);
		});

		it('Step 18: formatSSEMessage handles all event types', () => {
			const start = Date.now();
			logStep('🔧', 'Testing formatSSEMessage with all event types...');

			const eventPayloads: [ScraperSSEEventType, any][] = [
				[
					ScraperSSEEventType.CONNECTION,
					{ connected: true, timestamp: new Date().toISOString() },
				],
				[
					ScraperSSEEventType.HEARTBEAT,
					{ timestamp: new Date().toISOString() },
				],
				[
					ScraperSSEEventType.JOB_STARTED,
					{
						id: TEST_JOB_ID,
						status: JobStatus.RUNNING,
						url: TEST_URL,
					},
				],
				[
					ScraperSSEEventType.PAGES_DISCOVERED,
					{ id: TEST_JOB_ID, newUrls: [], totalDiscovered: 1 },
				],
				[
					ScraperSSEEventType.PAGE_COMPLETED,
					{
						id: TEST_JOB_ID,
						pageUrl: TEST_URL,
						title: null,
						pagesCompleted: 1,
						pagesDiscovered: 1,
					},
				],
				[
					ScraperSSEEventType.JOB_COMPLETED,
					{
						id: TEST_JOB_ID,
						status: JobStatus.COMPLETED,
						pagesCompleted: 1,
						pagesFailed: 0,
						pagesDiscovered: 1,
						pagesSkippedByDepth: 0,
					},
				],
				[
					ScraperSSEEventType.JOB_FAILED,
					{
						id: TEST_JOB_ID,
						status: JobStatus.FAILED,
						error: {
							code: 'CRAWL_FAILED',
							message: 'test',
							retryable: false,
							timestamp: new Date().toISOString(),
						},
					},
				],
				[
					ScraperSSEEventType.JOB_CANCELLED,
					{ id: TEST_JOB_ID, status: JobStatus.CANCELLED },
				],
			];

			for (const [eventType, payload] of eventPayloads) {
				const message = formatSSEMessage(eventType, payload);
				expect(message).toContain(`event: ${eventType}`);
				expect(message).toContain('data: ');
				expect(message.endsWith('\n\n')).toBe(true);

				logStep('🔧', `Verified format for event type: ${eventType}`);
			}

			const duration = Date.now() - start;
			testResults.push({
				step: 'All event types format',
				passed: true,
				duration,
			});
			logStep('✅', `All event types format test passed (${duration}ms)`);
		});
	});

	// -----------------------------------------------------------------------
	// SSE token generation via API
	// -----------------------------------------------------------------------
	describe('SSE token generation via API', () => {
		it('Step 19: POST sse-token returns valid token', async () => {
			const start = Date.now();
			logStep('🔑', 'Generating SSE token via API...');

			const res = await request(app.getHttpServer())
				.post(
					`/organization/${TEST_ORG_ID}/apps/site-scraper/sse-token`,
				)
				.expect(201);

			logStep('🔑', 'SSE token API response', {
				hasToken: !!res.body.data?.token,
				expiresIn: res.body.data?.expiresIn,
				expiresAt: res.body.data?.expiresAt,
			});

			expect(res.body.status).toBe('success');
			expect(res.body.data.token).toBeDefined();
			expect(res.body.data.expiresIn).toBe(300);
			expect(res.body.data.expiresAt).toBeDefined();

			// Token should be in the store
			const tokenData = sseTokenStore.get(res.body.data.token);
			expect(tokenData).toBeDefined();
			expect(tokenData!.userId).toBe(TEST_USER_ID);
			expect(tokenData!.organizationId).toBe(TEST_ORG_ID);

			// Clean up
			sseTokenStore.delete(res.body.data.token);

			const duration = Date.now() - start;
			testResults.push({ step: 'SSE token API', passed: true, duration });
			logStep('✅', `SSE token API test passed (${duration}ms)`);
		});
	});
});
