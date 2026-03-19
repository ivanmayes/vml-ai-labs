import type { CallbackPayload, LambdaEnvConfig } from '../types';

// =============================================================================
// Mock global fetch
// =============================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Ensure AbortSignal.timeout exists in test environment
if (!AbortSignal.timeout) {
	(AbortSignal as any).timeout = (ms: number) => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), ms);
		return controller.signal;
	};
}

import {
	sendCallback,
	sendFailureCallback,
	isJobCancelled,
} from '../callback';

// =============================================================================
// Test fixtures
// =============================================================================

const TEST_CONFIG: LambdaEnvConfig = {
	callbackUrl: 'https://api.example.com',
	callbackSecret: 'test-secret-token',
	queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
	s3Bucket: 'test-bucket',
};

const TEST_PAYLOAD: CallbackPayload = {
	jobId: '11111111-1111-1111-1111-111111111111',
	urlHash: 'abc123',
	url: 'https://example.com/page',
	title: 'Test Page',
	htmlS3Key: 'jobs/123/page.html',
	screenshots: [
		{
			viewport: 1440,
			s3Key: 'jobs/123/screenshot-1440w.jpg',
			thumbnailS3Key: 'jobs/123/screenshot-1440w-thumb.webp',
		},
	],
	status: 'completed',
	discoveredLinks: ['https://example.com/other'],
	depth: 0,
};

function createMockResponse(status: number, body = ''): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? 'OK' : 'Error',
		text: jest.fn().mockResolvedValue(body),
		headers: new Headers(),
		redirected: false,
		type: 'basic' as ResponseType,
		url: '',
		clone: jest.fn(),
		body: null,
		bodyUsed: false,
		arrayBuffer: jest.fn(),
		blob: jest.fn(),
		formData: jest.fn(),
		json: jest.fn(),
		bytes: jest.fn(),
	} as unknown as Response;
}

// =============================================================================
// sendCallback
// =============================================================================

describe('sendCallback', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('should send correct payload with Bearer token', async () => {
		mockFetch.mockResolvedValue(createMockResponse(200));

		await sendCallback(TEST_PAYLOAD, TEST_CONFIG);

		expect(mockFetch).toHaveBeenCalledTimes(1);

		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe(
			'https://api.example.com/internal/scraper/page-result',
		);
		expect(options.method).toBe('POST');
		expect(options.headers['Content-Type']).toBe('application/json');
		expect(options.headers['Authorization']).toBe(
			'Bearer test-secret-token',
		);
		expect(JSON.parse(options.body)).toEqual(TEST_PAYLOAD);
	});

	it('should succeed on 2xx response', async () => {
		mockFetch.mockResolvedValue(createMockResponse(201));

		await expect(
			sendCallback(TEST_PAYLOAD, TEST_CONFIG),
		).resolves.toBeUndefined();
	});

	it('should handle 410 Gone (cancelled job) gracefully', async () => {
		mockFetch.mockResolvedValue(createMockResponse(410));

		// Should NOT throw
		await expect(
			sendCallback(TEST_PAYLOAD, TEST_CONFIG),
		).resolves.toBeUndefined();

		// Should NOT retry
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('should handle 409 Conflict (duplicate) gracefully', async () => {
		mockFetch.mockResolvedValue(createMockResponse(409));

		// Should NOT throw
		await expect(
			sendCallback(TEST_PAYLOAD, TEST_CONFIG),
		).resolves.toBeUndefined();

		// Should NOT retry
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('should retry on 5xx responses with exponential backoff', async () => {
		// First two calls return 500/502, third returns 200
		mockFetch
			.mockResolvedValueOnce(
				createMockResponse(500, 'Internal Server Error'),
			)
			.mockResolvedValueOnce(createMockResponse(502, 'Bad Gateway'))
			.mockResolvedValueOnce(createMockResponse(200));

		await sendCallback(TEST_PAYLOAD, TEST_CONFIG);

		// 1 initial + 2 retries = 3 total calls
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it('should throw after exhausting retries on persistent 5xx', async () => {
		mockFetch.mockImplementation(() =>
			Promise.resolve(createMockResponse(500, 'Server Error')),
		);

		await expect(
			sendCallback(TEST_PAYLOAD, TEST_CONFIG),
		).rejects.toThrow('Callback failed with status 500');

		// 1 initial + 2 retries = 3 total
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it('should throw immediately on 4xx errors (non-409, non-410)', async () => {
		mockFetch.mockResolvedValue(createMockResponse(400, 'Bad Request'));

		await expect(
			sendCallback(TEST_PAYLOAD, TEST_CONFIG),
		).rejects.toThrow('Callback failed with status 400');

		// No retries
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('should include AbortSignal with 30s timeout', async () => {
		mockFetch.mockResolvedValue(createMockResponse(200));

		await sendCallback(TEST_PAYLOAD, TEST_CONFIG);

		const [, options] = mockFetch.mock.calls[0];
		expect(options.signal).toBeDefined();
	});
});

// =============================================================================
// sendFailureCallback
// =============================================================================

describe('sendFailureCallback', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('should call sendCallback internally', async () => {
		mockFetch.mockResolvedValue(createMockResponse(200));

		const failurePayload: CallbackPayload = {
			...TEST_PAYLOAD,
			status: 'failed',
			errorMessage: 'Browser crashed',
		};

		await sendFailureCallback(failurePayload, TEST_CONFIG);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.status).toBe('failed');
		expect(body.errorMessage).toBe('Browser crashed');
	});

	it('should not throw even if callback persistently fails', async () => {
		mockFetch.mockImplementation(() =>
			Promise.resolve(createMockResponse(500, 'Error')),
		);

		// sendFailureCallback is best-effort, should not throw
		await expect(
			sendFailureCallback(TEST_PAYLOAD, TEST_CONFIG),
		).resolves.toBeUndefined();
	});
});

// =============================================================================
// isJobCancelled
// =============================================================================

describe('isJobCancelled', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('should return true when server responds with 410 Gone', async () => {
		mockFetch.mockResolvedValue(createMockResponse(410));

		const result = await isJobCancelled(
			'11111111-1111-1111-1111-111111111111',
			TEST_CONFIG,
		);

		expect(result).toBe(true);
	});

	it('should return false when server responds with 200', async () => {
		mockFetch.mockResolvedValue(createMockResponse(200));

		const result = await isJobCancelled(
			'11111111-1111-1111-1111-111111111111',
			TEST_CONFIG,
		);

		expect(result).toBe(false);
	});

	it('should send HEAD request with Bearer auth', async () => {
		mockFetch.mockResolvedValue(createMockResponse(200));

		await isJobCancelled(
			'22222222-2222-2222-2222-222222222222',
			TEST_CONFIG,
		);

		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe(
			'https://api.example.com/internal/scraper/job-status/22222222-2222-2222-2222-222222222222',
		);
		expect(options.method).toBe('HEAD');
		expect(options.headers['Authorization']).toBe(
			'Bearer test-secret-token',
		);
	});

	it('should return false when fetch throws (network error)', async () => {
		mockFetch.mockRejectedValue(new TypeError('fetch failed'));

		const result = await isJobCancelled(
			'11111111-1111-1111-1111-111111111111',
			TEST_CONFIG,
		);

		expect(result).toBe(false);
	});

	it('should include AbortSignal with 5s timeout', async () => {
		mockFetch.mockResolvedValue(createMockResponse(200));

		await isJobCancelled(
			'11111111-1111-1111-1111-111111111111',
			TEST_CONFIG,
		);

		const [, options] = mockFetch.mock.calls[0];
		expect(options.signal).toBeDefined();
	});
});
