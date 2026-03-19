import type {
	SQSEvent,
	SQSBatchResponse,
	SQSBatchItemFailure,
} from 'aws-lambda';

import {
	PageWorkMessageSchema,
	getEnvConfig,
	type PageWorkMessage,
	type CallbackPayload,
	type LambdaEnvConfig,
} from './types';
import { getBrowser, closeBrowser } from './browser';
import { captureAndUpload, uploadHtml } from './screenshots';
import { discoverLinks } from './link-discovery';
import { sendCallback, sendFailureCallback, isJobCancelled } from './callback';
import { installSsrfProtection } from './ssrf-protection';
import { injectAutoconsent, dismissCookies } from './cookie-dismissal';

// ---------------------------------------------------------------------------
// Lambda Handler — SQS event source with batch size 1
// ---------------------------------------------------------------------------

/** Environment config — read once on cold start, reused across invocations */
let envConfig: LambdaEnvConfig | null = null;

/**
 * Generate a UUID v4 for page IDs.
 */
function generatePageId(): string {
	const bytes = new Uint8Array(16);
	globalThis.crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Lambda handler for SQS page-work messages.
 *
 * Receives SQSEvent with batch size 1 (one page per invocation).
 * Returns SQSBatchResponse with batchItemFailures for partial failure reporting.
 *
 * Flow per message:
 * 1. Validate message with zod
 * 2. Check if job is cancelled (HEAD request to callback)
 * 3. Launch browser (reuse module-scope instance)
 * 4. Navigate to URL, wait for networkidle
 * 5. Dismiss cookie banners (autoconsent + manual selectors)
 * 6. Capture screenshots at each viewport -> S3
 * 7. Generate WebP thumbnails -> S3
 * 8. Upload page HTML -> S3
 * 9. Discover same-hostname links
 * 10. Callback to Heroku with page result + discovered links
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
	// Read env config on first invocation (cold start)
	if (!envConfig) {
		envConfig = getEnvConfig();
	}

	const batchItemFailures: SQSBatchItemFailure[] = [];

	for (const record of event.Records) {
		try {
			await processRecord(record.body, envConfig);
		} catch (error) {
			console.error(
				`Failed to process message ${record.messageId}: ${error}`,
			);

			// Attempt a failure callback (best-effort)
			try {
				const parsed = JSON.parse(record.body);
				if (parsed.jobId && parsed.url && parsed.urlHash) {
					const failurePayload: CallbackPayload = {
						jobId: parsed.jobId,
						urlHash: parsed.urlHash,
						url: parsed.url,
						title: null,
						htmlS3Key: null,
						screenshots: [],
						status: 'failed',
						errorMessage:
							error instanceof Error
								? error.message
								: String(error),
						discoveredLinks: [],
						depth: parsed.depth ?? 0,
					};
					await sendFailureCallback(failurePayload, envConfig);
				}
			} catch (callbackError) {
				console.error(
					`Failed to send failure callback: ${callbackError}`,
				);
			}

			batchItemFailures.push({
				itemIdentifier: record.messageId,
			});
		}
	}

	return { batchItemFailures };
}

/**
 * Process a single SQS record.
 * Separated for clarity and error boundary management.
 */
async function processRecord(
	body: string,
	config: LambdaEnvConfig,
): Promise<void> {
	// 1. Parse and validate the SQS message
	const raw = JSON.parse(body);
	const message: PageWorkMessage = PageWorkMessageSchema.parse(raw);

	console.log(
		`Processing page: ${message.url} (job: ${message.jobId}, depth: ${message.depth})`,
	);

	// 2. Check if job is cancelled before doing expensive work
	if (await isJobCancelled(message.jobId, config)) {
		console.log(`Job ${message.jobId} is cancelled — skipping page`);
		return;
	}

	// 3. Get or create browser instance (reused across warm invocations)
	let browser;
	try {
		browser = await getBrowser();
	} catch (error) {
		// If browser launch fails, close and retry once
		console.warn(`Browser launch failed, retrying: ${error}`);
		await closeBrowser();
		browser = await getBrowser();
	}

	// 4. Create a new page (close it when done, NOT the browser)
	const page = await browser.newPage();

	try {
		// 5. Install SSRF protection route interceptor
		await installSsrfProtection(page);

		// 6. Inject autoconsent script before navigation
		await injectAutoconsent(page);

		// 7. Navigate to the URL
		await page.goto(message.url, {
			waitUntil: 'domcontentloaded',
			timeout: 30_000,
		});

		// 8. Wait for network to settle
		try {
			await page.waitForLoadState('networkidle', { timeout: 15_000 });
		} catch {
			// Continue even if networkidle times out — page content is usually loaded
			console.log(
				`Network idle timeout for ${message.url}, continuing`,
			);
		}

		// 9. Give autoconsent time to detect and dismiss popups
		await page.waitForTimeout(1000);

		// 10. Fallback: try manual selectors for remaining cookie banners
		await dismissCookies(page);

		// 11. Generate a page ID for S3 key paths
		const pageId = generatePageId();

		// 12. Capture screenshots at each viewport and upload to S3
		const screenshots = await captureAndUpload(page, message, pageId);

		// 13. Get page HTML and upload to S3
		const htmlContent = await page.content();
		const htmlS3Key = `${message.s3Prefix}${pageId}/page.html`;
		await uploadHtml(htmlContent, htmlS3Key);

		// 14. Get page title
		const title = await page.title();

		// 15. Discover same-hostname links (only if below maxDepth)
		let discoveredLinks: string[] = [];
		if (message.depth < message.maxDepth) {
			discoveredLinks = await discoverLinks(page, message.seedHostname);
		}

		// 16. Close the page (NOT the browser — reused across invocations)
		await page.close();

		// 17. Callback to Heroku with the page result + discovered links
		const callbackPayload: CallbackPayload = {
			jobId: message.jobId,
			urlHash: message.urlHash,
			url: message.url,
			title: title || null,
			htmlS3Key,
			screenshots,
			status: 'completed',
			discoveredLinks,
			depth: message.depth,
		};

		await sendCallback(callbackPayload, config);

		console.log(
			`Completed page: ${message.url} (${screenshots.length} screenshots, ${discoveredLinks.length} links discovered)`,
		);
	} catch (error) {
		// Ensure page is closed even on error
		try {
			await page.close();
		} catch {
			// Page may already be closed if browser crashed
		}

		// If browser crashed, clear the instance so next invocation creates a fresh one
		if (
			error instanceof Error &&
			(error.message.includes('Target closed') ||
				error.message.includes('browser') ||
				error.message.includes('crash') ||
				error.message.includes('Protocol error'))
		) {
			console.warn('Browser appears crashed — clearing instance');
			await closeBrowser();
		}

		throw error;
	}
}
