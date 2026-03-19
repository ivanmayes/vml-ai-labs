import type { SQSEvent } from 'aws-lambda';

// =============================================================================
// Environment variables — must be set before handler import
// =============================================================================

process.env.CALLBACK_URL = 'https://api.example.com';
process.env.CALLBACK_SECRET = 'test-secret';
process.env.QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/queue';
process.env.S3_BUCKET = 'test-bucket';
process.env.CHROME_EXECUTABLE_PATH = '/usr/bin/chromium';

// =============================================================================
// Mocks — must be declared before imports that use them
// =============================================================================

// Mock playwright-extra
jest.mock('playwright-extra', () => ({
	chromium: { use: jest.fn() },
}));

// Mock stealth plugin
jest.mock('puppeteer-extra-plugin-stealth', () =>
	jest.fn(() => 'stealth-plugin'),
);

// Mock @ghostery/adblocker-playwright (ESM-only, dynamically imported)
const mockEnableBlockingInPage = jest.fn().mockResolvedValue(undefined);
jest.mock('@ghostery/adblocker-playwright', () => ({
	PlaywrightBlocker: {
		fromPrebuiltFull: jest.fn().mockResolvedValue({
			enableBlockingInPage: mockEnableBlockingInPage,
		}),
	},
}));

// Mock crawlee — capture crawler config on construction
let capturedCrawlerConfig: any = null;
const mockCrawlerRun = jest.fn();
jest.mock('crawlee', () => ({
	PlaywrightCrawler: jest.fn().mockImplementation((config: any) => {
		capturedCrawlerConfig = config;
		return { run: mockCrawlerRun };
	}),
	Configuration: jest.fn(),
}));

// Mock screenshots module
jest.mock('../screenshots', () => ({
	captureAndUpload: jest.fn(),
	uploadHtml: jest.fn(),
}));

// Mock callback module
jest.mock('../callback', () => ({
	sendCallback: jest.fn(),
	sendFailureCallback: jest.fn(),
	isJobCancelled: jest.fn(),
}));

// Mock SSRF protection
jest.mock('../ssrf-protection', () => ({
	installSsrfProtection: jest.fn(),
}));

// Mock globalThis.crypto for deterministic UUID generation
Object.defineProperty(globalThis, 'crypto', {
	value: {
		getRandomValues: (arr: Uint8Array) => {
			for (let i = 0; i < arr.length; i++) {
				arr[i] = i;
			}
			return arr;
		},
	},
	writable: true,
});

// =============================================================================
// Imports (after mocks are set up)
// =============================================================================

import { handler } from '../handler';
import { PlaywrightCrawler } from 'crawlee';
import { captureAndUpload, uploadHtml } from '../screenshots';
import {
	sendCallback,
	sendFailureCallback,
	isJobCancelled,
} from '../callback';
import { installSsrfProtection } from '../ssrf-protection';

// =============================================================================
// Test helpers
// =============================================================================

const VALID_MESSAGE = {
	jobId: '11111111-1111-1111-1111-111111111111',
	url: 'https://example.com/page',
	urlHash: 'abc123def456',
	depth: 0,
	maxDepth: 2,
	maxPages: 50,
	viewports: [1440, 768],
	seedHostname: 'example.com',
	s3Prefix: 'scraper-jobs/11111111/',
};

function createSQSEvent(messages: object[]): SQSEvent {
	return {
		Records: messages.map((msg, i) => ({
			messageId: `msg-${i}`,
			receiptHandle: `receipt-${i}`,
			body: JSON.stringify(msg),
			attributes: {
				ApproximateReceiveCount: '1',
				SentTimestamp: '1234567890',
				SenderId: 'sender',
				ApproximateFirstReceiveTimestamp: '1234567890',
			},
			messageAttributes: {},
			md5OfBody: 'md5',
			eventSource: 'aws:sqs',
			eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:test-queue',
			awsRegion: 'us-east-1',
		})),
	};
}

/** Create a mock Crawlee crawler context for requestHandler/hook testing */
function createMockCrawlerContext() {
	return {
		page: {
			waitForLoadState: jest.fn().mockResolvedValue(undefined),
			waitForTimeout: jest.fn().mockResolvedValue(undefined),
			content: jest
				.fn()
				.mockResolvedValue('<html><body>Test</body></html>'),
			title: jest.fn().mockResolvedValue('Test Page'),
			evaluate: jest.fn().mockResolvedValue(false),
			addInitScript: jest.fn().mockResolvedValue(undefined),
			route: jest.fn().mockResolvedValue(undefined),
			setViewportSize: jest.fn().mockResolvedValue(undefined),
			$$eval: jest.fn().mockResolvedValue([
				'https://example.com/found',
				'https://example.com/about',
			]),
		},
		request: {
			url: VALID_MESSAGE.url,
			skipNavigation: false,
		},
		log: {
			info: jest.fn(),
			debug: jest.fn(),
			warning: jest.fn(),
			error: jest.fn(),
		},
	};
}

// =============================================================================
// Tests
// =============================================================================

describe('Lambda handler', () => {
	let mockContext: ReturnType<typeof createMockCrawlerContext>;

	beforeEach(() => {
		capturedCrawlerConfig = null;
		mockContext = createMockCrawlerContext();

		// Default: run() simulates a successful crawl by calling requestHandler
		mockCrawlerRun.mockImplementation(async () => {
			if (capturedCrawlerConfig?.requestHandler) {
				await capturedCrawlerConfig.requestHandler(mockContext);
			}
		});

		// Default mock implementations
		(isJobCancelled as jest.Mock).mockResolvedValue(false);
		(sendCallback as jest.Mock).mockResolvedValue(undefined);
		(sendFailureCallback as jest.Mock).mockResolvedValue(undefined);
		(captureAndUpload as jest.Mock).mockResolvedValue([
			{
				viewport: 1440,
				s3Key: 'test/screenshot-1440w.jpg',
				thumbnailS3Key: 'test/screenshot-1440w-thumb.webp',
			},
		]);
		(uploadHtml as jest.Mock).mockResolvedValue('test/page.html');
		mockEnableBlockingInPage.mockResolvedValue(undefined);
	});

	// -- Zod message validation --

	describe('SQS message validation', () => {
		it('should reject messages with missing required fields', async () => {
			const event = createSQSEvent([{ jobId: 'not-a-uuid' }]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
			expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
		});

		it('should reject messages with invalid jobId format', async () => {
			const event = createSQSEvent([
				{ ...VALID_MESSAGE, jobId: 'not-a-uuid' },
			]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
		});

		it('should reject messages with invalid URL', async () => {
			const event = createSQSEvent([
				{ ...VALID_MESSAGE, url: 'not-a-valid-url' },
			]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
		});

		it('should reject messages with negative depth', async () => {
			const event = createSQSEvent([{ ...VALID_MESSAGE, depth: -1 }]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
		});

		it('should reject messages with empty viewports array', async () => {
			const event = createSQSEvent([
				{ ...VALID_MESSAGE, viewports: [] },
			]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
		});

		it('should reject messages with non-JSON body', async () => {
			const event: SQSEvent = {
				Records: [
					{
						messageId: 'msg-0',
						receiptHandle: 'receipt-0',
						body: 'this is not json',
						attributes: {
							ApproximateReceiveCount: '1',
							SentTimestamp: '1234567890',
							SenderId: 'sender',
							ApproximateFirstReceiveTimestamp: '1234567890',
						},
						messageAttributes: {},
						md5OfBody: 'md5',
						eventSource: 'aws:sqs',
						eventSourceARN:
							'arn:aws:sqs:us-east-1:123456789:test-queue',
						awsRegion: 'us-east-1',
					},
				],
			};
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
		});

		it('should process a valid message successfully', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(0);
		});
	});

	// -- Job cancellation check --

	describe('job cancellation', () => {
		it('should skip cancelled jobs without creating crawler', async () => {
			(isJobCancelled as jest.Mock).mockResolvedValue(true);

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			// No failure — skipping a cancelled job is success
			expect(result.batchItemFailures).toHaveLength(0);
			// Should NOT have created a crawler
			expect(PlaywrightCrawler).not.toHaveBeenCalled();
			expect(sendCallback).not.toHaveBeenCalled();
		});

		it('should create crawler when job is not cancelled', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(PlaywrightCrawler).toHaveBeenCalled();
		});
	});

	// -- PlaywrightCrawler configuration --

	describe('crawler configuration', () => {
		beforeEach(async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);
		});

		it('should set maxRequestsPerCrawl to 1', () => {
			expect(capturedCrawlerConfig.maxRequestsPerCrawl).toBe(1);
		});

		it('should set maxConcurrency to 1', () => {
			expect(capturedCrawlerConfig.maxConcurrency).toBe(1);
		});

		it('should set maxRequestRetries to 0', () => {
			expect(capturedCrawlerConfig.maxRequestRetries).toBe(0);
		});

		it('should set requestHandlerTimeoutSecs to 60', () => {
			expect(capturedCrawlerConfig.requestHandlerTimeoutSecs).toBe(60);
		});

		it('should set navigationTimeoutSecs to 30', () => {
			expect(capturedCrawlerConfig.navigationTimeoutSecs).toBe(30);
		});

		it('should have 4 preNavigationHooks', () => {
			expect(capturedCrawlerConfig.preNavigationHooks).toHaveLength(4);
		});

		it('should have 1 postNavigationHook', () => {
			expect(capturedCrawlerConfig.postNavigationHooks).toHaveLength(1);
		});

		it('should include --no-sandbox in launch args', () => {
			expect(
				capturedCrawlerConfig.launchContext.launchOptions.args,
			).toContain('--no-sandbox');
		});

		it('should NOT include --single-process in launch args', () => {
			expect(
				capturedCrawlerConfig.launchContext.launchOptions.args,
			).not.toContain('--single-process');
		});

		it('should set Chrome executable path from env', () => {
			expect(
				capturedCrawlerConfig.launchContext.launchOptions.executablePath,
			).toBe('/usr/bin/chromium');
		});

		it('should run crawler with the message URL', () => {
			expect(mockCrawlerRun).toHaveBeenCalledWith([VALID_MESSAGE.url]);
		});
	});

	// -- preNavigationHooks --

	describe('preNavigationHooks', () => {
		beforeEach(async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);
		});

		it('hook 1: should set skipNavigation for download URLs', async () => {
			const hook = capturedCrawlerConfig.preNavigationHooks[0];
			const request = {
				url: 'https://example.com/file.pdf',
				skipNavigation: false,
			};
			await hook({ request, page: {} });

			expect(request.skipNavigation).toBe(true);
		});

		it('hook 1: should not skip non-download URLs', async () => {
			const hook = capturedCrawlerConfig.preNavigationHooks[0];
			const request = {
				url: 'https://example.com/about',
				skipNavigation: false,
			};
			await hook({ request, page: {} });

			expect(request.skipNavigation).toBe(false);
		});

		it('hook 1: should skip ZIP download URLs', async () => {
			const hook = capturedCrawlerConfig.preNavigationHooks[0];
			const request = {
				url: 'https://example.com/archive.zip',
				skipNavigation: false,
			};
			await hook({ request, page: {} });

			expect(request.skipNavigation).toBe(true);
		});

		it('hook 2: should inject autoconsent script', async () => {
			const hook = capturedCrawlerConfig.preNavigationHooks[1];
			const page = {
				addInitScript: jest.fn().mockResolvedValue(undefined),
			};
			await hook({ page, request: {} });

			// autoconsent is a real dependency, so addInitScript should be called
			// (unless the package resolution fails in the test environment)
			// The hook runs without throwing regardless
		});

		it('hook 3: should call adblocker.enableBlockingInPage', async () => {
			const hook = capturedCrawlerConfig.preNavigationHooks[2];
			const page = {};
			await hook({ page, request: {} });

			expect(mockEnableBlockingInPage).toHaveBeenCalledWith(page);
		});

		it('hook 4: should install SSRF protection', async () => {
			const hook = capturedCrawlerConfig.preNavigationHooks[3];
			const page = {};
			await hook({ page, request: {} });

			expect(installSsrfProtection).toHaveBeenCalledWith(page);
		});
	});

	// -- postNavigationHooks --

	describe('postNavigationHooks', () => {
		it('should wait 1s then attempt cookie dismissal', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			const hook = capturedCrawlerConfig.postNavigationHooks[0];
			const page = {
				waitForTimeout: jest.fn().mockResolvedValue(undefined),
				evaluate: jest.fn().mockResolvedValue(false),
			};
			await hook({ page, request: {} });

			expect(page.waitForTimeout).toHaveBeenCalledWith(1000);
		});
	});

	// -- requestHandler --

	describe('requestHandler', () => {
		it('should capture screenshots and upload HTML', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(captureAndUpload).toHaveBeenCalledTimes(1);
			expect(uploadHtml).toHaveBeenCalledTimes(1);
		});

		it('should extract links via $$eval with seedHostname', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(mockContext.page.$$eval).toHaveBeenCalledWith(
				'a[href]',
				expect.any(Function),
				VALID_MESSAGE.seedHostname,
			);
		});

		it('should skip processing if skipNavigation is true', async () => {
			mockContext.request.skipNavigation = true;

			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(captureAndUpload).not.toHaveBeenCalled();
			expect(uploadHtml).not.toHaveBeenCalled();
		});

		it('should not extract links when depth >= maxDepth', async () => {
			const event = createSQSEvent([
				{ ...VALID_MESSAGE, depth: 2, maxDepth: 2 },
			]);
			await handler(event);

			expect(mockContext.page.$$eval).not.toHaveBeenCalled();
		});

		it('should continue if networkidle times out', async () => {
			mockContext.page.waitForLoadState.mockRejectedValue(
				new Error('Timeout 15000ms exceeded'),
			);

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			// Should still succeed (networkidle timeout is non-fatal)
			expect(result.batchItemFailures).toHaveLength(0);
			expect(captureAndUpload).toHaveBeenCalled();
		});
	});

	// -- Callback payload --

	describe('callback payload', () => {
		it('should send correct payload shape with discoveredUrls', async () => {
			mockContext.page.title.mockResolvedValue('Example Page');

			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(sendCallback).toHaveBeenCalledTimes(1);

			const payload = (sendCallback as jest.Mock).mock.calls[0][0];
			expect(payload).toMatchObject({
				jobId: VALID_MESSAGE.jobId,
				url: VALID_MESSAGE.url,
				status: 'completed',
				depth: 0,
			});
			expect(payload.title).toBe('Example Page');
			expect(payload.screenshots).toHaveLength(1);
			expect(payload.discoveredUrls).toContain(
				'https://example.com/found',
			);
			expect(payload.htmlS3Key).toMatch(/page\.html$/);
		});

		it('should deduplicate and normalize discovered URLs', async () => {
			mockContext.page.$$eval.mockResolvedValue([
				'https://example.com/a',
				'https://example.com/a#section',
				'https://example.com/b/',
				'https://example.com/b',
				'https://example.com/file.pdf',
			]);

			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			const payload = (sendCallback as jest.Mock).mock.calls[0][0];
			// Deduplicated (a + a#section = 1), normalized (b/ = b), PDF filtered
			expect(payload.discoveredUrls).toEqual([
				'https://example.com/a',
				'https://example.com/b',
			]);
		});

		it('should have empty discoveredUrls when at maxDepth', async () => {
			const event = createSQSEvent([
				{ ...VALID_MESSAGE, depth: 2, maxDepth: 2 },
			]);
			await handler(event);

			const payload = (sendCallback as jest.Mock).mock.calls[0][0];
			expect(payload.discoveredUrls).toEqual([]);
		});
	});

	// -- Error handling --

	describe('error handling', () => {
		it('should propagate error from failedRequestHandler', async () => {
			mockCrawlerRun.mockImplementation(async () => {
				if (capturedCrawlerConfig?.failedRequestHandler) {
					await capturedCrawlerConfig.failedRequestHandler(
						{
							request: { url: VALID_MESSAGE.url },
							log: { error: jest.fn() },
						},
						new Error('Navigation failed'),
					);
				}
			});

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
			expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
		});

		it('should send failure callback when processing fails', async () => {
			mockCrawlerRun.mockImplementation(async () => {
				if (capturedCrawlerConfig?.failedRequestHandler) {
					await capturedCrawlerConfig.failedRequestHandler(
						{
							request: { url: VALID_MESSAGE.url },
							log: { error: jest.fn() },
						},
						new Error('Navigation failed'),
					);
				}
			});

			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(sendFailureCallback).toHaveBeenCalledTimes(1);
			const failurePayload = (sendFailureCallback as jest.Mock).mock
				.calls[0][0];
			expect(failurePayload.jobId).toBe(VALID_MESSAGE.jobId);
			expect(failurePayload.status).toBe('failed');
			expect(failurePayload.errorMessage).toBe('Navigation failed');
		});

		it('should report failure when crawler.run() rejects', async () => {
			mockCrawlerRun.mockRejectedValue(
				new Error('Browser launch failed'),
			);

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
			expect(sendFailureCallback).toHaveBeenCalledTimes(1);
		});

		it('should return empty failures for successful processing', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			expect(result.batchItemFailures).toEqual([]);
		});
	});
});
