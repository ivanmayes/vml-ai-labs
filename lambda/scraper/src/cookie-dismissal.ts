import * as path from 'path';
import type { Page } from 'playwright-core';

// ---------------------------------------------------------------------------
// Cookie Consent Dismissal
// Ported from scraper-worker.service.ts — autoconsent + manual selectors.
// ---------------------------------------------------------------------------

/**
 * Path to the autoconsent Playwright injection script.
 * This script auto-detects and dismisses cookie/privacy consent popups
 * from hundreds of known CMP (Consent Management Platform) providers.
 */
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

/**
 * Common CSS selectors for cookie consent dialogs.
 * Used as a fallback when autoconsent doesn't catch the banner.
 */
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
 * Inject the autoconsent script into a page before navigation.
 * Call this via page.addInitScript() before page.goto().
 */
export async function injectAutoconsent(page: Page): Promise<void> {
	if (autoconsentScriptPath) {
		try {
			await page.addInitScript({ path: autoconsentScriptPath });
		} catch (error) {
			console.warn(`Failed to inject autoconsent script: ${error}`);
		}
	}
}

/**
 * Attempt to dismiss cookie consent dialogs using common CSS selectors.
 * Uses JS .click() instead of Playwright .click() because some CMPs
 * (e.g., CookieReports) only respond to DOM click events.
 *
 * Call this after page load + a brief wait for banners to appear.
 */
export async function dismissCookies(page: Page): Promise<void> {
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
			// Brief wait for the banner dismiss animation
			await page.waitForTimeout(300);
		}
	} catch {
		// Non-critical — cookie banner may not exist or page may have navigated
	}
}
