import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Page } from 'playwright-core';

import type { EventHint, PageWorkMessage, ScreenshotRecord } from './types';

// ---------------------------------------------------------------------------
// Hint Execution Engine
// Executes user-defined interactions (click, hover, fill, etc.) on a page
// and captures screenshots before/after each action.
// ---------------------------------------------------------------------------

/** Module-scope S3 client — reused across invocations */
const s3 = new S3Client({});

/** S3 bucket from env var — read once */
function getBucket(): string {
	const bucket = process.env.S3_BUCKET;
	if (!bucket) throw new Error('Missing env var: S3_BUCKET');
	return bucket;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Device breakpoints: smartphone < 768, tablet 768-1023, desktop >= 1024 */
const DEVICE_BREAKPOINTS = { smartphone: 768, tablet: 1024 };

/** Maximum hints executed per page */
const MAX_HINTS = 5;

/** Wall-clock budget for hint execution (ms) */
const HINT_BUDGET_MS = 55_000;

// ---------------------------------------------------------------------------
// Device Matching
// ---------------------------------------------------------------------------

/**
 * Determine whether a hint should execute at the given viewport width.
 * Returns true if the hint's device filter matches, or if no filter is set.
 */
function matchesDevice(
	hint: EventHint,
	viewportWidth: number,
): boolean {
	const device = hint.device ?? 'all';
	if (device === 'all') return true;

	if (device === 'smartphone') {
		return viewportWidth < DEVICE_BREAKPOINTS.smartphone;
	}
	if (device === 'tablet') {
		return (
			viewportWidth >= DEVICE_BREAKPOINTS.smartphone &&
			viewportWidth < DEVICE_BREAKPOINTS.tablet
		);
	}
	// desktop
	return viewportWidth >= DEVICE_BREAKPOINTS.tablet;
}

// ---------------------------------------------------------------------------
// Hint Sorting
// ---------------------------------------------------------------------------

/**
 * Sort hints: siteEntry first, then by `seq` ascending, then unsequenced.
 */
function sortHints(hints: EventHint[]): EventHint[] {
	return [...hints].sort((a, b) => {
		// siteEntry hints come first
		const aEntry = a.siteEntry ? 0 : 1;
		const bEntry = b.siteEntry ? 0 : 1;
		if (aEntry !== bEntry) return aEntry - bEntry;

		// Sequenced hints come before unsequenced
		const aSeq = a.seq ?? Number.MAX_SAFE_INTEGER;
		const bSeq = b.seq ?? Number.MAX_SAFE_INTEGER;
		return aSeq - bSeq;
	});
}

// ---------------------------------------------------------------------------
// Action Executor
// ---------------------------------------------------------------------------

/**
 * Execute a single hint action on the page.
 * All user selectors are prefixed with `css=` to prevent Playwright engine injection.
 */
export async function executeAction(
	page: Page,
	hint: EventHint,
): Promise<void> {
	const sel = hint.selector ? `css=${hint.selector}` : '';

	switch (hint.action) {
		case 'click': {
			const count = hint.count ?? 1;
			for (let i = 0; i < count; i++) {
				await page.locator(sel).click({ timeout: 5000 });
			}
			break;
		}
		case 'hover':
			await page.locator(sel).hover({ timeout: 5000 });
			break;
		case 'fill':
			await page.locator(sel).fill(hint.value ?? '', { timeout: 5000 });
			await page.locator(sel).blur();
			break;
		case 'fillSubmit':
			await page.locator(sel).fill(hint.value ?? '', { timeout: 5000 });
			await page.locator(sel).press('Enter');
			break;
		case 'wait':
			await page.waitForTimeout(hint.waitAfter ?? 1000);
			break;
		case 'remove':
			await page.locator(sel).evaluate((el) => el.remove());
			break;
	}
}

// ---------------------------------------------------------------------------
// Screenshot Capture (hint-specific, stream-and-upload)
// ---------------------------------------------------------------------------

/**
 * Capture a single screenshot for a hint action and upload immediately to S3.
 * Uses JPEG quality 60 (lower than baseline 85) and NO thumbnail generation.
 */
async function captureHintScreenshot(
	page: Page,
	viewport: number,
	message: PageWorkMessage,
	pageId: string,
	hintIndex: number,
	timing: 'before' | 'after',
	label: string,
): Promise<ScreenshotRecord> {
	const bucket = getBucket();

	// Set viewport and wait for reflow
	await page.setViewportSize({ width: viewport, height: 900 });
	await page.waitForTimeout(500);

	// Capture JPEG at quality 60 (lower than baseline 85)
	const screenshotBuffer = Buffer.from(
		await page.screenshot({
			fullPage: true,
			type: 'jpeg',
			quality: 60,
		}),
	);

	const s3Key = `${message.s3Prefix}${pageId}/screenshot-${viewport}w-hint${hintIndex}-${timing}.jpg`;

	// Stream-and-upload: upload immediately, don't accumulate buffers
	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: s3Key,
			Body: screenshotBuffer,
			ContentType: 'image/jpeg',
		}),
	);

	return {
		viewport,
		s3Key,
		// No thumbnail for hint screenshots
		hintLabel: label,
		hintIndex,
		snapshotTiming: timing,
	};
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Execute event hints on a page, capturing screenshots as configured.
 *
 * @param page - Playwright page after navigation and cookie dismissal
 * @param hints - Resolved hints for this specific page
 * @param primaryViewport - The primary viewport width for hint screenshots
 * @param message - The SQS message (for S3 prefix and job context)
 * @param pageId - UUID for this page's S3 directory
 * @returns Array of ScreenshotRecords from hint screenshots
 */
export async function executeHints(
	page: Page,
	hints: EventHint[],
	primaryViewport: number,
	message: PageWorkMessage,
	pageId: string,
): Promise<ScreenshotRecord[]> {
	if (!hints.length) return [];

	const startTime = Date.now();
	const records: ScreenshotRecord[] = [];

	// Sort hints: siteEntry first, then by seq ascending, then unsequenced
	const sorted = sortHints(hints);

	// Cap at MAX_HINTS
	if (sorted.length > MAX_HINTS) {
		console.warn(
			`Hint count ${sorted.length} exceeds max ${MAX_HINTS}, truncating to first ${MAX_HINTS}`,
		);
	}
	const capped = sorted.slice(0, MAX_HINTS);

	for (let i = 0; i < capped.length; i++) {
		// Wall-clock budget check before each hint
		if (Date.now() - startTime > HINT_BUDGET_MS) {
			console.warn(
				`Hint budget exceeded after ${i} hints, skipping remaining ${capped.length - i}`,
			);
			break;
		}

		const hint = capped[i];
		const label = hint.label ?? `hint-${i}`;

		try {
			// Check device filter
			if (!matchesDevice(hint, primaryViewport)) {
				console.log(
					`Skipping hint ${i} (${hint.action}): device filter "${hint.device}" does not match viewport ${primaryViewport}px`,
				);
				continue;
			}

			// Determine snapshot behavior (default is 'after')
			const snapshot = hint.snapshot ?? 'after';

			// Before screenshot
			if (snapshot === 'before' || snapshot === 'both') {
				const record = await captureHintScreenshot(
					page,
					primaryViewport,
					message,
					pageId,
					i,
					'before',
					label,
				);
				records.push(record);
			}

			// Execute the action
			if (hint.action === 'fill') {
				// Redact fill values in logs
				console.log(
					`Executing hint ${i}: ${hint.action} on "${hint.selector ?? ''}" (value redacted)`,
				);
			} else {
				console.log(
					`Executing hint ${i}: ${hint.action} on "${hint.selector ?? ''}"`,
				);
			}
			await executeAction(page, hint);

			// Wait after action if specified (and action is not 'wait', which handles its own waiting)
			if (hint.waitAfter && hint.action !== 'wait') {
				await page.waitForTimeout(hint.waitAfter);
			}

			// After screenshot (default snapshot behavior is 'after')
			if (snapshot === 'after' || snapshot === 'both') {
				const record = await captureHintScreenshot(
					page,
					primaryViewport,
					message,
					pageId,
					i,
					'after',
					label,
				);
				records.push(record);
			}
		} catch (error) {
			const errorMsg =
				error instanceof Error ? error.message : String(error);
			console.warn(
				`Hint ${i} (${hint.action} on "${hint.selector ?? ''}") failed: ${errorMsg}`,
			);
			// Continue with next hint — failures are non-fatal
		}
	}

	console.log(
		`Hint execution complete: ${records.length} screenshots captured in ${Date.now() - startTime}ms`,
	);

	return records;
}
