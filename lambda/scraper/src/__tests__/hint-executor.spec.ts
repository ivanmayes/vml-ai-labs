// =============================================================================
// Environment variables — must be set before imports
// =============================================================================

process.env.S3_BUCKET = 'test-bucket';

// =============================================================================
// Mocks — must be declared before imports that use them
// =============================================================================

const mockS3Send = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
	S3Client: jest.fn().mockImplementation(() => ({
		send: mockS3Send,
	})),
	PutObjectCommand: jest.fn().mockImplementation((params: any) => params),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { executeHints, executeAction } from '../hint-executor';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { EventHint, PageWorkMessage } from '../types';

// =============================================================================
// Mock Playwright Page
// =============================================================================

function createMockPage() {
	const mockLocator = {
		click: jest.fn().mockResolvedValue(undefined),
		hover: jest.fn().mockResolvedValue(undefined),
		fill: jest.fn().mockResolvedValue(undefined),
		blur: jest.fn().mockResolvedValue(undefined),
		evaluate: jest.fn().mockResolvedValue(undefined),
		press: jest.fn().mockResolvedValue(undefined),
	};
	return {
		locator: jest.fn().mockReturnValue(mockLocator),
		waitForTimeout: jest.fn().mockResolvedValue(undefined),
		setViewportSize: jest.fn().mockResolvedValue(undefined),
		screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
		_mockLocator: mockLocator,
	};
}

// =============================================================================
// Test helpers
// =============================================================================

const VALID_MESSAGE: PageWorkMessage = {
	jobId: '11111111-1111-1111-1111-111111111111',
	url: 'https://example.com/page',
	urlHash: 'abc123def456',
	depth: 0,
	maxDepth: 2,
	maxPages: 50,
	viewports: [1920, 768],
	seedHostname: 'example.com',
	s3Prefix: 'scraper-jobs/11111111/',
};

const PAGE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// =============================================================================
// Tests
// =============================================================================

describe('hint-executor', () => {
	let mockPage: ReturnType<typeof createMockPage>;

	beforeEach(() => {
		mockPage = createMockPage();
		mockS3Send.mockClear();
		(PutObjectCommand as unknown as jest.Mock).mockClear();
	});

	// ---- Action Execution ----

	describe('executeAction', () => {
		it('should call locator.click() for click action', async () => {
			const hint: EventHint = { action: 'click', selector: '.btn' };
			await executeAction(mockPage as any, hint);

			expect(mockPage.locator).toHaveBeenCalledWith('css=.btn');
			expect(mockPage._mockLocator.click).toHaveBeenCalledWith({ timeout: 5000 });
		});

		it('should call locator.hover() for hover action', async () => {
			const hint: EventHint = { action: 'hover', selector: '.menu-item' };
			await executeAction(mockPage as any, hint);

			expect(mockPage.locator).toHaveBeenCalledWith('css=.menu-item');
			expect(mockPage._mockLocator.hover).toHaveBeenCalledWith({ timeout: 5000 });
		});

		it('should call locator.fill() then locator.blur() for fill action', async () => {
			const hint: EventHint = { action: 'fill', selector: '#email', value: 'test@example.com' };
			await executeAction(mockPage as any, hint);

			expect(mockPage.locator).toHaveBeenCalledWith('css=#email');
			expect(mockPage._mockLocator.fill).toHaveBeenCalledWith('test@example.com', { timeout: 5000 });
			expect(mockPage._mockLocator.blur).toHaveBeenCalled();
		});

		it('should call locator.fill() then press Enter for fillSubmit action', async () => {
			const hint: EventHint = { action: 'fillSubmit', selector: '#submit-btn', value: 'test' };
			await executeAction(mockPage as any, hint);

			expect(mockPage.locator).toHaveBeenCalledWith('css=#submit-btn');
			expect(mockPage._mockLocator.fill).toHaveBeenCalledWith('test', { timeout: 5000 });
			expect(mockPage._mockLocator.press).toHaveBeenCalledWith('Enter');
		});

		it('should call page.waitForTimeout() for wait action', async () => {
			const hint: EventHint = { action: 'wait', waitAfter: 2000 };
			await executeAction(mockPage as any, hint);

			expect(mockPage.waitForTimeout).toHaveBeenCalledWith(2000);
		});

		it('should call locator.evaluate() for remove action', async () => {
			const hint: EventHint = { action: 'remove', selector: '.overlay' };
			await executeAction(mockPage as any, hint);

			expect(mockPage.locator).toHaveBeenCalledWith('css=.overlay');
			expect(mockPage._mockLocator.evaluate).toHaveBeenCalledWith(expect.any(Function));
		});
	});

	// ---- CSS prefix ----

	describe('CSS selector prefix', () => {
		it('should prefix all selectors with css= before passing to Playwright', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.accordion' },
				{ action: 'hover', selector: '#nav-item' },
				{ action: 'fill', selector: 'input[name="email"]', value: 'x' },
				{ action: 'remove', selector: 'div.banner' },
			];

			for (const hint of hints) {
				mockPage.locator.mockClear();
				await executeAction(mockPage as any, hint);
				expect(mockPage.locator).toHaveBeenCalledWith(`css=${hint.selector}`);
			}
		});
	});

	// ---- Click count ----

	describe('click count', () => {
		it('should call click 3 times when count is 3', async () => {
			const hint: EventHint = { action: 'click', selector: '.next', count: 3 };
			await executeAction(mockPage as any, hint);

			expect(mockPage._mockLocator.click).toHaveBeenCalledTimes(3);
		});

		it('should default to 1 click when count is not specified', async () => {
			const hint: EventHint = { action: 'click', selector: '.next' };
			await executeAction(mockPage as any, hint);

			expect(mockPage._mockLocator.click).toHaveBeenCalledTimes(1);
		});
	});

	// ---- Fill + blur ----

	describe('fill + blur', () => {
		it('should call fill then blur in order', async () => {
			const callOrder: string[] = [];
			mockPage._mockLocator.fill.mockImplementation(async () => {
				callOrder.push('fill');
			});
			mockPage._mockLocator.blur.mockImplementation(async () => {
				callOrder.push('blur');
			});

			const hint: EventHint = { action: 'fill', selector: '#input', value: 'hello' };
			await executeAction(mockPage as any, hint);

			expect(callOrder).toEqual(['fill', 'blur']);
		});
	});

	// ---- Remove ----

	describe('remove action', () => {
		it('should call locator.evaluate with a function that removes the element', async () => {
			const hint: EventHint = { action: 'remove', selector: '.popup' };
			await executeAction(mockPage as any, hint);

			expect(mockPage._mockLocator.evaluate).toHaveBeenCalledTimes(1);
			// Verify the callback passed to evaluate calls el.remove()
			const evaluateCallback = mockPage._mockLocator.evaluate.mock.calls[0][0];
			const mockEl = { remove: jest.fn() };
			evaluateCallback(mockEl);
			expect(mockEl.remove).toHaveBeenCalled();
		});
	});

	// ---- Execution order ----

	describe('execution order', () => {
		it('should execute siteEntry hints first, then by seq ascending, then unsequenced', async () => {
			const executionOrder: string[] = [];

			// Override click to track execution order by label
			mockPage._mockLocator.click.mockImplementation(async () => {
				// We'll track via the selector, which encodes the label
			});
			mockPage.locator.mockImplementation((selector: string) => {
				executionOrder.push(selector);
				return mockPage._mockLocator;
			});

			const hints: EventHint[] = [
				{ action: 'click', selector: 'unsequenced-1', snapshot: 'never' },
				{ action: 'click', selector: 'seq-10', seq: 10, snapshot: 'never' },
				{ action: 'click', selector: 'site-entry', siteEntry: true, snapshot: 'never' },
				{ action: 'click', selector: 'seq-1', seq: 1, snapshot: 'never' },
				{ action: 'click', selector: 'unsequenced-2', snapshot: 'never' },
			];

			await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(executionOrder).toEqual([
				'css=site-entry',
				'css=seq-1',
				'css=seq-10',
				'css=unsequenced-1',
				'css=unsequenced-2',
			]);
		});
	});

	// ---- Device targeting ----

	describe('device targeting', () => {
		it('should skip hints with device=smartphone when viewport is 1920', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.mobile-only', device: 'smartphone', snapshot: 'never' },
			];

			await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(mockPage._mockLocator.click).not.toHaveBeenCalled();
		});

		it('should execute hints with device=desktop when viewport is 1920', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.desktop-btn', device: 'desktop', snapshot: 'never' },
			];

			await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(mockPage._mockLocator.click).toHaveBeenCalled();
		});

		it('should execute hints with device=all regardless of viewport', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.universal', device: 'all', snapshot: 'never' },
			];

			await executeHints(mockPage as any, hints, 400, VALID_MESSAGE, PAGE_ID);
			expect(mockPage._mockLocator.click).toHaveBeenCalled();
		});

		it('should execute hints with no device filter at any viewport', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.no-filter', snapshot: 'never' },
			];

			await executeHints(mockPage as any, hints, 500, VALID_MESSAGE, PAGE_ID);
			expect(mockPage._mockLocator.click).toHaveBeenCalled();
		});

		it('should execute smartphone hints when viewport is 400', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.mobile-btn', device: 'smartphone', snapshot: 'never' },
			];

			await executeHints(mockPage as any, hints, 400, VALID_MESSAGE, PAGE_ID);
			expect(mockPage._mockLocator.click).toHaveBeenCalled();
		});

		it('should execute tablet hints when viewport is 800', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.tablet-btn', device: 'tablet', snapshot: 'never' },
			];

			await executeHints(mockPage as any, hints, 800, VALID_MESSAGE, PAGE_ID);
			expect(mockPage._mockLocator.click).toHaveBeenCalled();
		});
	});

	// ---- Budget enforcement ----

	describe('budget enforcement', () => {
		it('should skip remaining hints when cumulative time exceeds 55s', async () => {
			// Mock Date.now to simulate time passing
			const realDateNow = Date.now;
			let callCount = 0;
			const startTime = 1000000;

			jest.spyOn(Date, 'now').mockImplementation(() => {
				callCount++;
				// First call is the start time
				if (callCount === 1) return startTime;
				// Subsequent calls simulate exceeding the budget
				return startTime + 56_000;
			});

			const hints: EventHint[] = [
				{ action: 'click', selector: '.first', snapshot: 'never' },
				{ action: 'click', selector: '.second', snapshot: 'never' },
			];

			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

			await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			// Only the budget check fires before the first hint, so none execute
			// (start time is recorded, then next check sees 56s elapsed)
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Hint budget exceeded'),
			);

			warnSpy.mockRestore();
			jest.spyOn(Date, 'now').mockRestore();
		});
	});

	// ---- 5-hint cap ----

	describe('5-hint cap', () => {
		it('should only execute first 5 hints when more than 5 are provided', async () => {
			const hints: EventHint[] = Array.from({ length: 8 }, (_, i) => ({
				action: 'click' as const,
				selector: `.item-${i}`,
				seq: i,
				snapshot: 'never' as const,
			}));

			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

			await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			// Should have been called 5 times total (once per hint, 1 click each)
			expect(mockPage._mockLocator.click).toHaveBeenCalledTimes(5);

			// Should warn about truncation
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('exceeds max 5'),
			);

			warnSpy.mockRestore();
		});
	});

	// ---- Failure isolation ----

	describe('failure isolation', () => {
		it('should continue executing remaining hints when one hint throws', async () => {
			const executedSelectors: string[] = [];

			mockPage.locator.mockImplementation((selector: string) => {
				executedSelectors.push(selector);
				if (selector === 'css=.will-fail') {
					return {
						click: jest.fn().mockRejectedValue(new Error('Selector not found')),
						hover: jest.fn(),
						fill: jest.fn(),
						blur: jest.fn(),
						evaluate: jest.fn(),
					};
				}
				return mockPage._mockLocator;
			});

			const hints: EventHint[] = [
				{ action: 'click', selector: '.first', seq: 1, snapshot: 'never' },
				{ action: 'click', selector: '.will-fail', seq: 2, snapshot: 'never' },
				{ action: 'click', selector: '.third', seq: 3, snapshot: 'never' },
			];

			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

			await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			// All three should have been attempted
			expect(executedSelectors).toContain('css=.first');
			expect(executedSelectors).toContain('css=.will-fail');
			expect(executedSelectors).toContain('css=.third');

			// Warning for the failed hint
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('failed: Selector not found'),
			);

			warnSpy.mockRestore();
		});
	});

	// ---- Snapshot timing ----

	describe('snapshot timing', () => {
		it('should capture screenshot before action when snapshot=before', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.btn', snapshot: 'before', label: 'Before click' },
			];

			const records = await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(records).toHaveLength(1);
			expect(records[0].snapshotTiming).toBe('before');
		});

		it('should capture screenshot after action when snapshot=after', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.btn', snapshot: 'after', label: 'After click' },
			];

			const records = await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(records).toHaveLength(1);
			expect(records[0].snapshotTiming).toBe('after');
		});

		it('should capture two screenshots when snapshot=both', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.btn', snapshot: 'both', label: 'Both' },
			];

			const records = await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(records).toHaveLength(2);
			expect(records[0].snapshotTiming).toBe('before');
			expect(records[1].snapshotTiming).toBe('after');
		});

		it('should capture no screenshots when snapshot=never', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.btn', snapshot: 'never' },
			];

			const records = await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(records).toHaveLength(0);
			expect(mockPage.screenshot).not.toHaveBeenCalled();
		});

		it('should default to after snapshot when snapshot is not specified', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.btn' },
			];

			const records = await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(records).toHaveLength(1);
			expect(records[0].snapshotTiming).toBe('after');
		});
	});

	// ---- Screenshot metadata ----

	describe('screenshot metadata', () => {
		it('should return ScreenshotRecords with correct hintLabel, hintIndex, and snapshotTiming', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.accordion', snapshot: 'after', label: 'Click accordion' },
			];

			const records = await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({
				viewport: 1920,
				hintLabel: 'Click accordion',
				hintIndex: 0,
				snapshotTiming: 'after',
			});
			expect(records[0].s3Key).toContain('hint0-after');
		});

		it('should use default label hint-N when label is not specified', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.btn', snapshot: 'after' },
			];

			const records = await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			expect(records[0].hintLabel).toBe('hint-0');
		});
	});

	// ---- S3 upload ----

	describe('S3 upload', () => {
		it('should upload each screenshot to S3 immediately via PutObjectCommand', async () => {
			const hints: EventHint[] = [
				{ action: 'click', selector: '.btn1', snapshot: 'after', seq: 1 },
				{ action: 'click', selector: '.btn2', snapshot: 'after', seq: 2 },
			];

			await executeHints(mockPage as any, hints, 1920, VALID_MESSAGE, PAGE_ID);

			// Two screenshots, two S3 uploads
			expect(mockS3Send).toHaveBeenCalledTimes(2);
			expect(PutObjectCommand).toHaveBeenCalledTimes(2);

			// Verify the first upload params
			const firstCall = (PutObjectCommand as unknown as jest.Mock).mock.calls[0][0];
			expect(firstCall.Bucket).toBe('test-bucket');
			expect(firstCall.Key).toContain('hint0-after.jpg');
			expect(firstCall.ContentType).toBe('image/jpeg');
		});
	});

	// ---- Empty hints ----

	describe('empty hints', () => {
		it('should return empty array when hints array is empty', async () => {
			const records = await executeHints(mockPage as any, [], 1920, VALID_MESSAGE, PAGE_ID);

			expect(records).toEqual([]);
			expect(mockPage.locator).not.toHaveBeenCalled();
		});
	});
});
