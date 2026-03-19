import { discoverLinks } from '../link-discovery';

// =============================================================================
// Mock Playwright Page
// =============================================================================

function createMockPage(hrefs: string[]): any {
	return {
		$$eval: jest.fn(
			async (
				_selector: string,
				fn: (anchors: any[], hostname: string) => string[],
				hostname: string,
			) => {
				// Simulate the browser-side $$eval by creating mock anchor objects.
				// The real code runs inside the browser, so we simulate the filtering
				// the browser would do (same-hostname + http/https).
				const anchors = hrefs.map((href) => ({ href }));
				const result: string[] = [];
				for (const a of anchors) {
					try {
						const u = new URL(a.href);
						if (
							u.hostname === hostname &&
							(u.protocol === 'http:' || u.protocol === 'https:')
						) {
							result.push(u.href);
						}
					} catch {
						// skip invalid
					}
				}
				return result;
			},
		),
	};
}

// =============================================================================
// discoverLinks
// =============================================================================

describe('discoverLinks', () => {
	// -- Same-hostname extraction --

	describe('same-hostname extraction', () => {
		it('should extract same-hostname links', async () => {
			const page = createMockPage([
				'https://example.com/about',
				'https://example.com/contact',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toContain('https://example.com/about');
			expect(links).toContain('https://example.com/contact');
			expect(links).toHaveLength(2);
		});

		it('should include links with paths and query strings', async () => {
			const page = createMockPage([
				'https://example.com/search?q=test',
				'https://example.com/products/shoes',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toContain('https://example.com/search?q=test');
			expect(links).toContain('https://example.com/products/shoes');
		});
	});

	// -- Cross-origin filtering --

	describe('cross-origin filtering', () => {
		it('should filter out cross-origin links', async () => {
			const page = createMockPage([
				'https://example.com/about',
				'https://other.com/page',
				'https://cdn.example.com/resource',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toContain('https://example.com/about');
			expect(links).not.toContain('https://other.com/page');
			expect(links).not.toContain('https://cdn.example.com/resource');
			expect(links).toHaveLength(1);
		});

		it('should filter out links from subdomains', async () => {
			const page = createMockPage([
				'https://www.example.com/page',
				'https://blog.example.com/post',
				'https://example.com/home',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toContain('https://example.com/home');
			expect(links).not.toContain('https://www.example.com/page');
			expect(links).not.toContain('https://blog.example.com/post');
			expect(links).toHaveLength(1);
		});
	});

	// -- Download extension filtering --

	describe('download extension filtering', () => {
		it('should filter out PDF links', async () => {
			const page = createMockPage([
				'https://example.com/about',
				'https://example.com/report.pdf',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toContain('https://example.com/about');
			expect(links).not.toContain('https://example.com/report.pdf');
			expect(links).toHaveLength(1);
		});

		it('should filter out ZIP links', async () => {
			const page = createMockPage([
				'https://example.com/page',
				'https://example.com/archive.zip',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).not.toContain('https://example.com/archive.zip');
		});

		it('should filter out all common download extensions', async () => {
			const downloadLinks = [
				'https://example.com/file.pdf',
				'https://example.com/file.zip',
				'https://example.com/file.tar',
				'https://example.com/file.gz',
				'https://example.com/file.exe',
				'https://example.com/file.doc',
				'https://example.com/file.docx',
				'https://example.com/file.xls',
				'https://example.com/file.xlsx',
				'https://example.com/file.ppt',
				'https://example.com/file.pptx',
				'https://example.com/file.mp3',
				'https://example.com/file.mp4',
			];

			const page = createMockPage([
				'https://example.com/keep-this',
				...downloadLinks,
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toEqual(['https://example.com/keep-this']);
		});
	});

	// -- URL normalization --

	describe('URL normalization', () => {
		it('should remove fragments from URLs', async () => {
			const page = createMockPage([
				'https://example.com/page#section1',
				'https://example.com/page#section2',
			]);

			const links = await discoverLinks(page, 'example.com');

			// Both should normalize to the same URL, deduplicated to one
			expect(links).toHaveLength(1);
			expect(links[0]).toBe('https://example.com/page');
		});

		it('should remove trailing slashes (except root)', async () => {
			const page = createMockPage([
				'https://example.com/about/',
				'https://example.com/about',
			]);

			const links = await discoverLinks(page, 'example.com');

			// Both normalize to the same thing, deduplicated
			expect(links).toHaveLength(1);
			expect(links[0]).toBe('https://example.com/about');
		});

		it('should preserve root path trailing slash', async () => {
			const page = createMockPage(['https://example.com/']);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toHaveLength(1);
			// Root path "/" has length 1, so trailing slash is preserved
			expect(links[0]).toBe('https://example.com/');
		});
	});

	// -- Deduplication --

	describe('deduplication', () => {
		it('should deduplicate identical URLs', async () => {
			const page = createMockPage([
				'https://example.com/about',
				'https://example.com/about',
				'https://example.com/about',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toHaveLength(1);
			expect(links[0]).toBe('https://example.com/about');
		});

		it('should deduplicate URLs that differ only by fragment', async () => {
			const page = createMockPage([
				'https://example.com/page',
				'https://example.com/page#top',
				'https://example.com/page#bottom',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toHaveLength(1);
		});

		it('should deduplicate URLs that differ only by trailing slash', async () => {
			const page = createMockPage([
				'https://example.com/products/',
				'https://example.com/products',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toHaveLength(1);
		});
	});

	// -- Edge cases --

	describe('edge cases', () => {
		it('should return empty array when no links found', async () => {
			const page = createMockPage([]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toEqual([]);
		});

		it('should handle page with only external links', async () => {
			const page = createMockPage([
				'https://facebook.com/share',
				'https://twitter.com/intent/tweet',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toEqual([]);
		});

		it('should handle mixed valid and download links', async () => {
			const page = createMockPage([
				'https://example.com/home',
				'https://example.com/brochure.pdf',
				'https://example.com/products',
				'https://example.com/data.xlsx',
				'https://example.com/faq',
			]);

			const links = await discoverLinks(page, 'example.com');

			expect(links).toEqual([
				'https://example.com/home',
				'https://example.com/products',
				'https://example.com/faq',
			]);
		});
	});
});
