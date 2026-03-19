import * as path from 'path';
import type { Page } from 'playwright-core';

// ---------------------------------------------------------------------------
// Link Discovery — extracts same-hostname links from a page.
// Ported from scraper-worker.service.ts enqueueLinks logic.
// ---------------------------------------------------------------------------

/**
 * File extensions that trigger downloads instead of page navigation.
 * Ported from DOWNLOAD_EXTENSIONS in scraper-worker.service.ts.
 */
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

/**
 * Check if a URL points to a downloadable file (PDF, ZIP, etc.)
 */
function isDownloadUrl(url: string): boolean {
	try {
		const urlPath = new URL(url).pathname;
		const ext = path.extname(urlPath).toLowerCase();
		return ext !== '' && DOWNLOAD_EXTENSIONS.has(ext);
	} catch {
		return false;
	}
}

/**
 * Normalize a URL for consistent comparison.
 * Removes fragment, trailing slash, and lowercases the hostname.
 */
function normalizeUrl(url: string): string {
	try {
		const u = new URL(url);
		// Remove fragment
		u.hash = '';
		// Remove trailing slash from pathname (except root)
		if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
			u.pathname = u.pathname.slice(0, -1);
		}
		return u.toString();
	} catch {
		return url;
	}
}

/**
 * Extract same-hostname links from a page.
 * Filters out download URLs, fragments-only links, and external hostnames.
 *
 * @param page - Playwright page after rendering
 * @param seedHostname - The seed URL's hostname for same-origin filtering
 * @returns Array of normalized, deduplicated URLs
 */
export async function discoverLinks(
	page: Page,
	seedHostname: string,
): Promise<string[]> {
	// Extract all anchor hrefs from the page DOM
	const rawLinks: string[] = await page.$$eval(
		'a[href]',
		(anchors: HTMLAnchorElement[], hostname: string) => {
			const urls: string[] = [];
			for (const a of anchors) {
				try {
					const u = new URL(a.href);
					// Same-hostname filter (browser resolves relative URLs)
					if (
						u.hostname === hostname &&
						(u.protocol === 'http:' || u.protocol === 'https:')
					) {
						urls.push(u.href);
					}
				} catch {
					// Skip invalid URLs
				}
			}
			return urls;
		},
		seedHostname,
	);

	// Deduplicate and filter in Node (more reliable than in-page)
	const seen = new Set<string>();
	const results: string[] = [];

	for (const raw of rawLinks) {
		if (isDownloadUrl(raw)) continue;

		const normalized = normalizeUrl(raw);
		if (!seen.has(normalized)) {
			seen.add(normalized);
			results.push(normalized);
		}
	}

	return results;
}
