import type {
	SQSEvent,
	SQSBatchResponse,
	SQSBatchItemFailure,
} from 'aws-lambda';
import * as path from 'path';
import * as fs from 'fs';

import { PlaywrightCrawler, Configuration } from 'crawlee';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

import {
	PageWorkMessageSchema,
	getEnvConfig,
	type PageWorkMessage,
	type CallbackPayload,
	type ScreenshotRecord,
	type LambdaEnvConfig,
} from './types';
import { captureAndUpload, uploadHtml } from './screenshots';
import { sendCallback, sendFailureCallback, isJobCancelled } from './callback';
import { installSsrfProtection } from './ssrf-protection';

// ---------------------------------------------------------------------------
// Module-scope initialization (cold start, reused across warm invocations)
// ---------------------------------------------------------------------------

/** Register stealth plugin once (guarded by flag) */
let stealthRegistered = false;
if (!stealthRegistered) {
	try {
		chromium.use(stealthPlugin());
		stealthRegistered = true;
	} catch (error) {
		console.warn(`Failed to register stealth plugin: ${error}`);
	}
}

/** Lazy-init Ghostery adblocker (ESM-only, requires dynamic import) */
let adblocker: any = null;
let adblockerInitialized = false;

async function getAdblocker(): Promise<any> {
	if (adblockerInitialized) return adblocker;
	adblockerInitialized = true;
	try {
		const { PlaywrightBlocker } = await import(
			'@ghostery/adblocker-playwright'
		);
		adblocker = await PlaywrightBlocker.fromPrebuiltFull();
		console.log('Ghostery adblocker initialized');
	} catch (error) {
		console.warn(`Failed to initialize Ghostery adblocker: ${error}`);
	}
	return adblocker;
}

/** Resolve autoconsent script path */
let autoconsentScriptPath: string | null = null;
try {
	autoconsentScriptPath = path.join(
		path.dirname(
			require.resolve('@duckduckgo/autoconsent/rules/rules.json'),
		),
		'../dist/autoconsent.playwright.js',
	);
} catch {
	console.warn(
		'@duckduckgo/autoconsent not found — autoconsent injection disabled',
	);
}

// ---------------------------------------------------------------------------
// Helpers (absorbed from deleted modules: browser.ts, link-discovery.ts,
// cookie-dismissal.ts)
// ---------------------------------------------------------------------------

/** File extensions that trigger downloads instead of page navigation */
const DOWNLOAD_EXTENSIONS = new Set([
	'.pdf',
	'.zip',
	'.tar',
	'.gz',
	'.rar',
	'.7z',
	'.exe',
	'.dmg',
	'.iso',
	'.doc',
	'.docx',
	'.xls',
	'.xlsx',
	'.ppt',
	'.pptx',
	'.mp3',
	'.mp4',
	'.avi',
	'.mov',
	'.wmv',
]);

/** Check if a URL points to a downloadable file */
function isDownloadUrl(url: string): boolean {
	try {
		const urlPath = new URL(url).pathname;
		const ext = path.extname(urlPath).toLowerCase();
		return ext !== '' && DOWNLOAD_EXTENSIONS.has(ext);
	} catch {
		return false;
	}
}

/** Common CSS selectors for cookie consent dialogs */
const COOKIE_DISMISS_SELECTORS = [
	'[id*="cookie"] button[class*="accept"]',
	'[id*="cookie"] button[class*="close"]',
	'[class*="cookie"] button[class*="accept"]',
	'[class*="cookie"] button[class*="close"]',
	'[id*="consent"] button[class*="accept"]',
	'[id*="consent"] button[class*="close"]',
	'button[id*="accept-cookies"]',
	'button[id*="cookie-accept"]',
	'[aria-label*="cookie"] button',
	'[aria-label*="consent"] button',
	'.cookie-banner button',
	'.cookie-notice button',
	'#onetrust-accept-btn-handler',
	'.cc-dismiss',
	'.cc-accept',
	// CookieReports CMP (used by AstraZeneca/pharma sites)
	'#CookieReportsBannerAZ .wscrOk',
	'.wscrOk',
];

/**
 * Dismiss cookie consent dialogs using common CSS selectors.
 * Uses JS .click() instead of Playwright .click() because some CMPs
 * (e.g., CookieReports) only respond to DOM click events.
 */
async function dismissCookies(page: any): Promise<void> {
	try {
		const dismissed = await page.evaluate((selectors: string[]) => {
			for (const selector of selectors) {
				const el = document.querySelector(
					selector,
				) as HTMLElement | null;
				if (el && el.offsetParent !== null) {
					el.click();
					return true;
				}
			}
			return false;
		}, COOKIE_DISMISS_SELECTORS);

		if (dismissed) {
			await page.waitForTimeout(300);
		}
	} catch {
		// Non-critical — cookie banner may not exist or page may have navigated
	}
}

/**
 * Resolve the Chrome executable path.
 * Checks CHROME_EXECUTABLE_PATH env var first, then the path file written
 * during Docker build.
 */
function findChromePath(): string {
	if (process.env.CHROME_EXECUTABLE_PATH) {
		return process.env.CHROME_EXECUTABLE_PATH;
	}

	const pathFile = path.join('/app', '.chrome-path');
	if (fs.existsSync(pathFile)) {
		return fs.readFileSync(pathFile, 'utf-8').trim();
	}

	const candidates = [
		'/root/.cache/puppeteer/chrome/linux-stable/chrome-linux64/chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium-browser',
		'/usr/bin/chromium',
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error(
		'Chrome executable not found. Set CHROME_EXECUTABLE_PATH env var.',
	);
}

/** Generate a UUID v4 for page IDs */
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

/** Chrome launch args optimized for Lambda container environment */
const CHROME_LAUNCH_ARGS = [
	// NOTE: --single-process removed — causes Chrome crashes on heavy pages (vml.com).
	'--no-sandbox',
	'--disable-setuid-sandbox',
	'--disable-dev-shm-usage',
	'--disable-gpu',
	'--no-zygote',
	'--use-angle=swiftshader',
	'--disable-background-networking',
	'--disable-default-apps',
	'--disable-extensions',
	'--disable-sync',
	'--disable-translate',
	'--mute-audio',
	'--hide-scrollbars',
	'--metrics-recording-only',
	'--no-first-run',
	'--safebrowsing-disable-auto-update',
];

// ---------------------------------------------------------------------------
// Lambda Handler — SQS event source with batch size 1
// ---------------------------------------------------------------------------

/** Environment config — read once on cold start, reused across invocations */
let envConfig: LambdaEnvConfig | null = null;

/**
 * Lambda handler for SQS page-work messages.
 *
 * Receives SQSEvent with batch size 1 (one page per invocation).
 * Uses Crawlee's PlaywrightCrawler with maxRequestsPerCrawl: 1 to process the
 * single page. enqueueLinks() discovers same-hostname links which are extracted
 * from processedRequests and sent to Heroku via callback.
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
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
				if (parsed.jobId && parsed.url) {
					const failurePayload: CallbackPayload = {
						jobId: parsed.jobId,
						url: parsed.url,
						title: null,
						htmlS3Key: null,
						screenshots: [],
						status: 'failed',
						errorMessage: (
							error instanceof Error
								? error.message
								: String(error)
						).slice(0, 1900),
						discoveredUrls: [],
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

// ---------------------------------------------------------------------------
// Process a single SQS record using PlaywrightCrawler
// ---------------------------------------------------------------------------

async function processRecord(
	body: string,
	config: LambdaEnvConfig,
): Promise<void> {
	const raw = JSON.parse(body);
	const message: PageWorkMessage = PageWorkMessageSchema.parse(raw);

	console.log(
		`Processing page: ${message.url} (job: ${message.jobId}, depth: ${message.depth})`,
	);

	// Check if job is cancelled before doing expensive work
	if (await isJobCancelled(message.jobId, config)) {
		console.log(`Job ${message.jobId} is cancelled — skipping page`);
		return;
	}

	// Initialize adblocker (lazy, cached after first invocation)
	const blocker = await getAdblocker();

	// Closure variables for collecting results from requestHandler
	let pageTitle: string | null = null;
	let htmlS3Key: string | null = null;
	let screenshots: ScreenshotRecord[] = [];
	let discoveredUrls: string[] = [];
	let crawlError: Error | null = null;

	const pageId = generatePageId();

	const crawleeConfig = new Configuration({
		persistStorage: false,
		purgeOnStart: true,
	});

	const crawler = new PlaywrightCrawler(
		{
			maxRequestsPerCrawl: 1,
			maxConcurrency: 1,
			maxRequestRetries: 0,
			requestHandlerTimeoutSecs: 60,
			navigationTimeoutSecs: 30,
			browserPoolOptions: { maxOpenPagesPerBrowser: 1 },

			launchContext: {
				launcher: chromium as any,
				launchOptions: {
					executablePath: findChromePath(),
					headless: true,
					args: CHROME_LAUNCH_ARGS,
				},
			},

			preNavigationHooks: [
				// 1. Skip download URLs (set request.skipNavigation)
				async ({ request }) => {
					if (isDownloadUrl(request.url)) {
						request.skipNavigation = true;
					}
				},
				// 2. Inject autoconsent script before navigation
				async ({ page }) => {
					if (autoconsentScriptPath) {
						await page.addInitScript({
							path: autoconsentScriptPath,
						});
					}
				},
				// 3. Enable Ghostery adblocker
				async ({ page }) => {
					if (blocker) {
						await blocker.enableBlockingInPage(page);
					}
				},
				// 4. Install SSRF protection
				async ({ page }) => {
					await installSsrfProtection(page);
				},
			],

			postNavigationHooks: [
				// Wait for autoconsent, then try manual selectors
				async ({ page }) => {
					await page.waitForTimeout(1000);
					await dismissCookies(page);
				},
			],

			requestHandler: async ({ page, enqueueLinks, request }) => {
				// Skip download URLs (navigation was already skipped)
				if (request.skipNavigation) return;

				// Wait for network to settle (non-fatal timeout)
				try {
					await page.waitForLoadState('networkidle', {
						timeout: 15_000,
					});
				} catch {
					console.log(
						`Network idle timeout for ${message.url}, continuing`,
					);
				}

				// Dismiss cookies again after full load
				await dismissCookies(page);

				// Capture screenshots at each viewport and upload to S3
				screenshots = await captureAndUpload(page, message, pageId);

				// Get page HTML and upload to S3
				const htmlContent = await page.content();
				htmlS3Key = `${message.s3Prefix}${pageId}/page.html`;
				await uploadHtml(htmlContent, htmlS3Key);

				// Get page title
				pageTitle = (await page.title()) || null;

				// Discover same-hostname links (only if below maxDepth)
				if (message.depth < message.maxDepth) {
					const { processedRequests } = await enqueueLinks({
						strategy: 'same-hostname',
						transformRequestFunction: (req: any) =>
							isDownloadUrl(req.url) ? false : req,
					});

					discoveredUrls = processedRequests
						.filter(
							(r: any) => !r.wasAlreadyPresent,
						)
						.map((r: any) => r.uniqueKey);
				}
			},

			failedRequestHandler: async (_context, error) => {
				crawlError =
					error instanceof Error
						? error
						: new Error(String(error));
			},
		},
		crawleeConfig,
	);

	await crawler.run([message.url]);

	// If the crawl failed, throw so the outer handler reports the failure
	if (crawlError) {
		throw crawlError;
	}

	// Build callback payload
	const callbackPayload: CallbackPayload = {
		jobId: message.jobId,
		url: message.url,
		title: pageTitle,
		htmlS3Key,
		screenshots,
		status: 'completed',
		discoveredUrls,
		depth: message.depth,
	};

	await sendCallback(callbackPayload, config);

	console.log(
		`Completed page: ${message.url} (${screenshots.length} screenshots, ${discoveredUrls.length} links discovered)`,
	);
}
