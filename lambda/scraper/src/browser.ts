import { chromium, Browser } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Module-scope browser instance — reused across warm Lambda invocations.
// This saves 2-4 seconds per invocation by avoiding Chrome cold start.
// Close PAGES, not the browser, after each invocation.
// ---------------------------------------------------------------------------

let browserInstance: Browser | null = null;

/** Chrome launch args optimized for Lambda container environment */
const CHROME_LAUNCH_ARGS = [
	'--single-process',
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

/**
 * Resolve the Chrome executable path.
 * Checks CHROME_EXECUTABLE_PATH env var first, then the path file written during Docker build.
 */
function findChromePath(): string {
	// Explicit env var takes priority
	if (process.env.CHROME_EXECUTABLE_PATH) {
		return process.env.CHROME_EXECUTABLE_PATH;
	}

	// Read from file written during Docker build
	const pathFile = path.join('/app', '.chrome-path');
	if (fs.existsSync(pathFile)) {
		return fs.readFileSync(pathFile, 'utf-8').trim();
	}

	// Fallback: common locations
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

/**
 * Get or create a browser instance.
 * Reuses the existing browser if it is still connected.
 * Creates a new one if the browser was closed or crashed.
 */
export async function getBrowser(): Promise<Browser> {
	if (browserInstance && browserInstance.isConnected()) {
		return browserInstance;
	}

	const executablePath = findChromePath();

	browserInstance = await chromium.launch({
		executablePath,
		headless: true,
		args: CHROME_LAUNCH_ARGS,
	});

	// If the browser disconnects unexpectedly, clear the reference
	browserInstance.on('disconnected', () => {
		browserInstance = null;
	});

	return browserInstance;
}

/**
 * Force-close the browser instance.
 * Only call this if absolutely necessary (e.g., unrecoverable error).
 */
export async function closeBrowser(): Promise<void> {
	if (browserInstance) {
		try {
			await browserInstance.close();
		} catch {
			// Already closed or crashed — that's fine
		}
		browserInstance = null;
	}
}
