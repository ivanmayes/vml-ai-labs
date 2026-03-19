import type { SQSEvent } from 'aws-lambda';

// =============================================================================
// Mocks — must be declared before imports that use them
// =============================================================================

// Mock environment variables
process.env.CALLBACK_URL = 'https://api.example.com';
process.env.CALLBACK_SECRET = 'test-secret';
process.env.QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/queue';
process.env.S3_BUCKET = 'test-bucket';

// Mock browser module
jest.mock('../browser', () => ({
	getBrowser: jest.fn(),
	closeBrowser: jest.fn(),
}));

// Mock screenshots module
jest.mock('../screenshots', () => ({
	captureAndUpload: jest.fn(),
	uploadHtml: jest.fn(),
}));

// Mock link discovery
jest.mock('../link-discovery', () => ({
	discoverLinks: jest.fn(),
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

// Mock cookie dismissal
jest.mock('../cookie-dismissal', () => ({
	injectAutoconsent: jest.fn(),
	dismissCookies: jest.fn(),
}));

// Mock globalThis.crypto for UUID generation
Object.defineProperty(globalThis, 'crypto', {
	value: {
		getRandomValues: (arr: Uint8Array) => {
			for (let i = 0; i < arr.length; i++) {
				arr[i] = Math.floor(Math.random() * 256);
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
import { getBrowser, closeBrowser } from '../browser';
import { captureAndUpload, uploadHtml } from '../screenshots';
import { discoverLinks } from '../link-discovery';
import {
	sendCallback,
	sendFailureCallback,
	isJobCancelled,
} from '../callback';
import { installSsrfProtection } from '../ssrf-protection';
import { injectAutoconsent, dismissCookies } from '../cookie-dismissal';

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

/** Create a mock Playwright page with all required methods */
function createMockPage() {
	return {
		goto: jest.fn().mockResolvedValue(undefined),
		waitForLoadState: jest.fn().mockResolvedValue(undefined),
		waitForTimeout: jest.fn().mockResolvedValue(undefined),
		setViewportSize: jest.fn().mockResolvedValue(undefined),
		screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
		content: jest.fn().mockResolvedValue('<html><body>Test</body></html>'),
		title: jest.fn().mockResolvedValue('Test Page'),
		close: jest.fn().mockResolvedValue(undefined),
		addInitScript: jest.fn().mockResolvedValue(undefined),
		$$eval: jest.fn().mockResolvedValue([]),
		route: jest.fn().mockResolvedValue(undefined),
	};
}

// =============================================================================
// Tests
// =============================================================================

describe('Lambda handler', () => {
	let mockPage: ReturnType<typeof createMockPage>;
	let mockBrowser: { newPage: jest.Mock };

	beforeEach(() => {
		mockPage = createMockPage();
		mockBrowser = { newPage: jest.fn().mockResolvedValue(mockPage) };

		// Re-establish all mock implementations on every test
		(getBrowser as jest.Mock).mockResolvedValue(mockBrowser);
		(closeBrowser as jest.Mock).mockResolvedValue(undefined);
		(isJobCancelled as jest.Mock).mockResolvedValue(false);
		(sendCallback as jest.Mock).mockResolvedValue(undefined);
		(sendFailureCallback as jest.Mock).mockResolvedValue(undefined);
		(installSsrfProtection as jest.Mock).mockResolvedValue(undefined);
		(injectAutoconsent as jest.Mock).mockResolvedValue(undefined);
		(dismissCookies as jest.Mock).mockResolvedValue(undefined);
		(captureAndUpload as jest.Mock).mockResolvedValue([
			{
				viewport: 1440,
				s3Key: 'jobs/test/screenshot-1440w.jpg',
				thumbnailS3Key: 'jobs/test/screenshot-1440w-thumb.webp',
			},
		]);
		(uploadHtml as jest.Mock).mockResolvedValue('jobs/test/page.html');
		(discoverLinks as jest.Mock).mockResolvedValue([
			'https://example.com/discovered',
		]);
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
		it('should skip cancelled jobs', async () => {
			(isJobCancelled as jest.Mock).mockResolvedValue(true);

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			// No failure — skipping a cancelled job is success
			expect(result.batchItemFailures).toHaveLength(0);

			// Should NOT have launched browser or done any work
			expect(getBrowser).not.toHaveBeenCalled();
			expect(captureAndUpload).not.toHaveBeenCalled();
			expect(sendCallback).not.toHaveBeenCalled();
		});

		it('should proceed if job is not cancelled', async () => {
			(isJobCancelled as jest.Mock).mockResolvedValue(false);

			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(getBrowser).toHaveBeenCalled();
		});
	});

	// -- Batch item failure reporting --

	describe('batch item failure reporting', () => {
		it('should return empty failures for successful processing', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);

			const result = await handler(event);

			expect(result.batchItemFailures).toEqual([]);
		});

		it('should report failed message in batchItemFailures', async () => {
			(getBrowser as jest.Mock).mockRejectedValue(
				new Error('Chrome crash'),
			);

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
			expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
		});

		it('should attempt failure callback when processing fails', async () => {
			(getBrowser as jest.Mock).mockRejectedValue(
				new Error('Chrome crash'),
			);

			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(sendFailureCallback).toHaveBeenCalledTimes(1);

			const failurePayload = (sendFailureCallback as jest.Mock).mock
				.calls[0][0];
			expect(failurePayload.jobId).toBe(VALID_MESSAGE.jobId);
			expect(failurePayload.status).toBe('failed');
			expect(failurePayload.errorMessage).toBe('Chrome crash');
		});
	});

	// -- Processing pipeline order --

	describe('processing pipeline', () => {
		it('should call all steps in the correct order', async () => {
			const callOrder: string[] = [];

			(installSsrfProtection as jest.Mock).mockImplementation(
				async () => {
					callOrder.push('ssrf');
				},
			);
			(injectAutoconsent as jest.Mock).mockImplementation(async () => {
				callOrder.push('autoconsent');
			});
			mockPage.goto.mockImplementation(async () => {
				callOrder.push('goto');
			});
			mockPage.waitForLoadState.mockImplementation(async () => {
				callOrder.push('waitForLoadState');
			});
			(dismissCookies as jest.Mock).mockImplementation(async () => {
				callOrder.push('dismissCookies');
			});
			(captureAndUpload as jest.Mock).mockImplementation(async () => {
				callOrder.push('captureAndUpload');
				return [];
			});
			(uploadHtml as jest.Mock).mockImplementation(async () => {
				callOrder.push('uploadHtml');
				return 'key';
			});
			(discoverLinks as jest.Mock).mockImplementation(async () => {
				callOrder.push('discoverLinks');
				return [];
			});
			(sendCallback as jest.Mock).mockImplementation(async () => {
				callOrder.push('sendCallback');
			});

			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(callOrder).toEqual([
				'ssrf',
				'autoconsent',
				'goto',
				'waitForLoadState',
				'dismissCookies',
				'captureAndUpload',
				'uploadHtml',
				'discoverLinks',
				'sendCallback',
			]);
		});

		it('should navigate to the message URL with correct options', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(mockPage.goto).toHaveBeenCalledWith(
				'https://example.com/page',
				{
					waitUntil: 'domcontentloaded',
					timeout: 30_000,
				},
			);
		});

		it('should close the page after processing', async () => {
			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(mockPage.close).toHaveBeenCalledTimes(1);
		});

		it('should call sendCallback with correct payload shape', async () => {
			(captureAndUpload as jest.Mock).mockResolvedValue([
				{
					viewport: 1440,
					s3Key: 'test/screenshot-1440w.jpg',
					thumbnailS3Key: 'test/screenshot-1440w-thumb.webp',
				},
			]);
			(discoverLinks as jest.Mock).mockResolvedValue([
				'https://example.com/found',
			]);
			mockPage.title.mockResolvedValue('Example Page');

			const event = createSQSEvent([VALID_MESSAGE]);
			await handler(event);

			expect(sendCallback).toHaveBeenCalledTimes(1);

			const payload = (sendCallback as jest.Mock).mock.calls[0][0];
			expect(payload.jobId).toBe(VALID_MESSAGE.jobId);
			expect(payload.url).toBe(VALID_MESSAGE.url);
			expect(payload.urlHash).toBe(VALID_MESSAGE.urlHash);
			expect(payload.title).toBe('Example Page');
			expect(payload.status).toBe('completed');
			expect(payload.screenshots).toHaveLength(1);
			expect(payload.discoveredLinks).toContain(
				'https://example.com/found',
			);
			expect(payload.depth).toBe(0);
			expect(payload.htmlS3Key).toMatch(/page\.html$/);
		});
	});

	// -- Link discovery depth gating --

	describe('link discovery depth control', () => {
		it('should discover links when depth < maxDepth', async () => {
			const event = createSQSEvent([
				{ ...VALID_MESSAGE, depth: 0, maxDepth: 2 },
			]);
			await handler(event);

			expect(discoverLinks).toHaveBeenCalled();
		});

		it('should NOT discover links when depth >= maxDepth', async () => {
			const event = createSQSEvent([
				{ ...VALID_MESSAGE, depth: 2, maxDepth: 2 },
			]);
			await handler(event);

			expect(discoverLinks).not.toHaveBeenCalled();

			// Verify the callback was sent with empty discoveredLinks
			expect(sendCallback).toHaveBeenCalledTimes(1);
			const payload = (sendCallback as jest.Mock).mock.calls[0][0];
			expect(payload.discoveredLinks).toEqual([]);
		});
	});

	// -- Browser error handling --

	describe('browser error recovery', () => {
		it('should retry browser launch on first failure', async () => {
			(getBrowser as jest.Mock)
				.mockRejectedValueOnce(new Error('Launch failed'))
				.mockResolvedValueOnce(mockBrowser);

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(0);
			expect(closeBrowser).toHaveBeenCalledTimes(1);
			expect(getBrowser).toHaveBeenCalledTimes(2);
		});

		it('should clear browser on crash errors during page processing', async () => {
			mockPage.goto.mockRejectedValue(
				new Error('Target closed unexpectedly'),
			);

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			expect(result.batchItemFailures).toHaveLength(1);
			expect(closeBrowser).toHaveBeenCalled();
		});
	});

	// -- networkidle timeout tolerance --

	describe('network idle timeout', () => {
		it('should continue even if networkidle times out', async () => {
			mockPage.waitForLoadState.mockRejectedValue(
				new Error('Timeout 15000ms exceeded'),
			);

			const event = createSQSEvent([VALID_MESSAGE]);
			const result = await handler(event);

			// Should still succeed (networkidle timeout is non-fatal)
			expect(result.batchItemFailures).toHaveLength(0);
			expect(captureAndUpload).toHaveBeenCalled();
		});
	});
});
