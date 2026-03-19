import { isIP } from 'net';
import { lookup } from 'dns/promises';
import type { Page, Route } from 'playwright-core';

// ---------------------------------------------------------------------------
// SSRF Protection — prevents the browser from reaching private/internal IPs.
// Ported from scraper-worker.service.ts with IPv4-mapped IPv6 additions.
// ---------------------------------------------------------------------------

/**
 * Private/reserved IP ranges for SSRF protection.
 * Includes standard RFC 1918 ranges plus IPv4-mapped IPv6 addresses
 * (e.g., ::ffff:127.0.0.1) as flagged by the security review.
 */
const PRIVATE_IP_RANGES = [
	// IPv4 private ranges
	/^127\./,
	/^10\./,
	/^172\.(1[6-9]|2[0-9]|3[0-1])\./,
	/^192\.168\./,
	/^0\./,
	/^169\.254\./,
	// IPv6 loopback and private
	/^::1$/,
	/^fc00:/,
	/^fe80:/,
	/^fd/,
	// IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
	/^::ffff:127\./,
	/^::ffff:10\./,
	/^::ffff:172\.(1[6-9]|2[0-9]|3[0-1])\./,
	/^::ffff:192\.168\./,
	/^::ffff:0\./,
	/^::ffff:169\.254\./,
];

/**
 * Check if an IP address is private/reserved.
 */
export function isPrivateIP(ip: string): boolean {
	return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

/**
 * Check if a hostname resolves to a private IP.
 * Returns true if the hostname should be blocked.
 */
export async function resolvesToPrivateIP(hostname: string): Promise<boolean> {
	// If the hostname is already an IP, check directly
	if (isIP(hostname)) {
		return isPrivateIP(hostname);
	}

	try {
		const result = await lookup(hostname);
		return isPrivateIP(result.address);
	} catch {
		// DNS resolution failed — let the browser handle the error
		return false;
	}
}

/**
 * Install a Playwright page.route() interceptor that blocks requests
 * to private/internal IP addresses.
 *
 * Must be called before navigating to any URL.
 */
export async function installSsrfProtection(page: Page): Promise<void> {
	await page.route('**/*', async (route: Route) => {
		const requestUrl = route.request().url();

		try {
			const urlObj = new URL(requestUrl);
			const hostname = urlObj.hostname;

			if (isIP(hostname)) {
				if (isPrivateIP(hostname)) {
					console.warn(`SSRF blocked: direct IP ${hostname}`);
					await route.abort('blockedbyclient');
					return;
				}
			} else {
				try {
					const result = await lookup(hostname);
					if (isPrivateIP(result.address)) {
						console.warn(
							`SSRF blocked: ${hostname} resolves to private IP ${result.address}`,
						);
						await route.abort('blockedbyclient');
						return;
					}
				} catch {
					// DNS resolution failed — let the browser handle it
				}
			}
		} catch {
			// URL parsing failed — allow the request
		}

		await route.continue();
	});
}
