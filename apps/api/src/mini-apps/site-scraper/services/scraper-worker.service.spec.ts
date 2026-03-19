import {
	isDownloadUrl,
	DOWNLOAD_EXTENSIONS,
	countNewPageRequests,
} from './scraper-worker.service';

// ============================================================================
// Task #1: isDownloadUrl() and URL classification logic
// ============================================================================

describe('isDownloadUrl', () => {
	beforeAll(() => {
		console.log('Test suite: isDownloadUrl() and URL classification');
	});

	// -- Valid download URLs (all extensions in DOWNLOAD_EXTENSIONS) --

	describe('valid download URLs', () => {
		const downloadExts = [
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
		];

		it.each(downloadExts)('should return true for %s extension', (ext) => {
			expect(isDownloadUrl(`https://example.com/file${ext}`)).toBe(true);
		});

		it('should match every entry in DOWNLOAD_EXTENSIONS', () => {
			for (const ext of DOWNLOAD_EXTENSIONS) {
				expect(
					isDownloadUrl(`https://example.com/document${ext}`),
				).toBe(true);
			}
		});
	});

	// -- Non-download URLs (web pages, scripts, assets) --

	describe('non-download URLs', () => {
		it('should return false for .html', () => {
			expect(isDownloadUrl('https://example.com/page.html')).toBe(false);
		});

		it('should return false for .htm', () => {
			expect(isDownloadUrl('https://example.com/page.htm')).toBe(false);
		});

		it('should return false for .php', () => {
			expect(isDownloadUrl('https://example.com/index.php')).toBe(false);
		});

		it('should return false for .asp', () => {
			expect(isDownloadUrl('https://example.com/page.asp')).toBe(false);
		});

		it('should return false for .js', () => {
			expect(isDownloadUrl('https://example.com/app.js')).toBe(false);
		});

		it('should return false for .css', () => {
			expect(isDownloadUrl('https://example.com/style.css')).toBe(false);
		});

		it('should return false for .json', () => {
			expect(isDownloadUrl('https://example.com/data.json')).toBe(false);
		});

		it('should return false for URL with no extension', () => {
			expect(isDownloadUrl('https://example.com/about')).toBe(false);
		});
	});

	// -- Edge cases: query strings, fragments, paths --

	describe('edge cases', () => {
		it('should return true for download URL with query string', () => {
			expect(
				isDownloadUrl('https://example.com/file.pdf?token=abc'),
			).toBe(true);
		});

		it('should return true for download URL with fragment', () => {
			expect(isDownloadUrl('https://example.com/file.pdf#page=2')).toBe(
				true,
			);
		});

		it('should return false for URL with no path', () => {
			expect(isDownloadUrl('https://example.com')).toBe(false);
		});

		it('should return false for URL with trailing slash', () => {
			expect(isDownloadUrl('https://example.com/path/')).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(isDownloadUrl('')).toBe(false);
		});

		it('should return false for just a path (no protocol)', () => {
			expect(isDownloadUrl('/files/report.pdf')).toBe(false);
		});

		it('should return false for protocol-relative URL', () => {
			// new URL('//example.com/file.pdf') throws, so returns false
			expect(isDownloadUrl('//example.com/file.pdf')).toBe(false);
		});

		it('should return false for malformed URL', () => {
			expect(isDownloadUrl('not-a-url')).toBe(false);
		});
	});

	// -- Case sensitivity --

	describe('case sensitivity', () => {
		it('should return true for uppercase .PDF', () => {
			expect(isDownloadUrl('https://example.com/file.PDF')).toBe(true);
		});

		it('should return true for mixed case .Zip', () => {
			expect(isDownloadUrl('https://example.com/file.Zip')).toBe(true);
		});

		it('should return true for mixed case .DocX', () => {
			expect(isDownloadUrl('https://example.com/file.DocX')).toBe(true);
		});

		it('should return true for all-caps .EXE', () => {
			expect(isDownloadUrl('https://example.com/setup.EXE')).toBe(true);
		});
	});

	// -- Double extensions --

	describe('double extensions', () => {
		it('should return true for .tar.gz (last ext is .gz)', () => {
			expect(isDownloadUrl('https://example.com/file.tar.gz')).toBe(true);
		});

		it('should return false for .pdf.html (last ext is .html)', () => {
			expect(isDownloadUrl('https://example.com/file.pdf.html')).toBe(
				false,
			);
		});
	});

	// -- Encoded URLs --

	describe('encoded URLs', () => {
		it('should return false for URL-encoded extension (%2E instead of .)', () => {
			// The encoded dot is in the path but path.extname sees "pdf" without leading dot
			expect(isDownloadUrl('https://example.com/file%2Epdf')).toBe(false);
		});

		it('should return true for URL with encoded spaces in path', () => {
			expect(
				isDownloadUrl('https://example.com/my%20files/report.pdf'),
			).toBe(true);
		});
	});

	// -- Deep paths --

	describe('deep paths', () => {
		it('should return true for nested path with download extension', () => {
			expect(isDownloadUrl('https://example.com/a/b/c/d/file.xlsx')).toBe(
				true,
			);
		});

		it('should return false for nested path with web extension', () => {
			expect(isDownloadUrl('https://example.com/a/b/c/d/page.html')).toBe(
				false,
			);
		});
	});
});

// ============================================================================
// Task #2: Page count accuracy (countNewPageRequests filtering)
// ============================================================================

describe('countNewPageRequests', () => {
	beforeAll(() => {
		console.log('Test suite: countNewPageRequests (page count filtering)');
	});

	// -- Counting excludes download URLs --

	describe('download URL filtering', () => {
		it('should count only non-download URLs', () => {
			const requests = [
				{
					uniqueKey: 'https://example.com/page1.html',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/file.pdf',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/page2.html',
					wasAlreadyPresent: false,
				},
			];
			expect(countNewPageRequests(requests)).toBe(2);
		});

		it('should return 0 when all URLs are downloads', () => {
			const requests = [
				{
					uniqueKey: 'https://example.com/file.pdf',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/archive.zip',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/video.mp4',
					wasAlreadyPresent: false,
				},
			];
			expect(countNewPageRequests(requests)).toBe(0);
		});
	});

	// -- Already-present URL filtering --

	describe('already-present filtering', () => {
		it('should exclude URLs with wasAlreadyPresent: true', () => {
			const requests = [
				{
					uniqueKey: 'https://example.com/page1.html',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/page2.html',
					wasAlreadyPresent: true,
				},
				{
					uniqueKey: 'https://example.com/page3.html',
					wasAlreadyPresent: false,
				},
			];
			expect(countNewPageRequests(requests)).toBe(2);
		});

		it('should return 0 when all URLs are already present', () => {
			const requests = [
				{
					uniqueKey: 'https://example.com/page1.html',
					wasAlreadyPresent: true,
				},
				{
					uniqueKey: 'https://example.com/page2.html',
					wasAlreadyPresent: true,
				},
			];
			expect(countNewPageRequests(requests)).toBe(0);
		});
	});

	// -- Combined filter (downloads + already-present) --

	describe('combined filtering', () => {
		it('should exclude both downloads and already-present URLs', () => {
			const requests = [
				{
					uniqueKey: 'https://example.com/new-page.html',
					wasAlreadyPresent: false,
				}, // counted
				{
					uniqueKey: 'https://example.com/file.pdf',
					wasAlreadyPresent: false,
				}, // excluded: download
				{
					uniqueKey: 'https://example.com/old-page.html',
					wasAlreadyPresent: true,
				}, // excluded: already present
				{
					uniqueKey: 'https://example.com/archive.zip',
					wasAlreadyPresent: true,
				}, // excluded: both
				{
					uniqueKey: 'https://example.com/another-page',
					wasAlreadyPresent: false,
				}, // counted
			];
			expect(countNewPageRequests(requests)).toBe(2);
		});

		it('should handle download URL that is also already present', () => {
			const requests = [
				{
					uniqueKey: 'https://example.com/report.pdf',
					wasAlreadyPresent: true,
				},
			];
			expect(countNewPageRequests(requests)).toBe(0);
		});
	});

	// -- Empty results --

	describe('empty and edge cases', () => {
		it('should return 0 for empty processedRequests array', () => {
			expect(countNewPageRequests([])).toBe(0);
		});

		it('should return 0 when all new URLs are filtered out', () => {
			const requests = [
				{
					uniqueKey: 'https://example.com/doc.docx',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/seen.html',
					wasAlreadyPresent: true,
				},
			];
			expect(countNewPageRequests(requests)).toBe(0);
		});
	});

	// -- Accumulation simulation --

	describe('totalPagesDiscovered accumulation', () => {
		it('should produce correct totals across multiple rounds', () => {
			let totalPagesDiscovered = 1; // seed URL

			// Round 1: discover 3 pages, 1 download
			const round1 = [
				{
					uniqueKey: 'https://example.com/a',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/b',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/c.pdf',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/d',
					wasAlreadyPresent: false,
				},
			];
			totalPagesDiscovered += countNewPageRequests(round1);
			expect(totalPagesDiscovered).toBe(4); // 1 + 3

			// Round 2: 2 already present, 1 new, 1 download
			const round2 = [
				{ uniqueKey: 'https://example.com/a', wasAlreadyPresent: true },
				{ uniqueKey: 'https://example.com/b', wasAlreadyPresent: true },
				{
					uniqueKey: 'https://example.com/e',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/f.zip',
					wasAlreadyPresent: false,
				},
			];
			totalPagesDiscovered += countNewPageRequests(round2);
			expect(totalPagesDiscovered).toBe(5); // 4 + 1

			// Round 3: all already present
			const round3 = [
				{ uniqueKey: 'https://example.com/a', wasAlreadyPresent: true },
				{ uniqueKey: 'https://example.com/e', wasAlreadyPresent: true },
			];
			totalPagesDiscovered += countNewPageRequests(round3);
			expect(totalPagesDiscovered).toBe(5); // no change
		});
	});

	// -- URLs without extensions (no-ext paths) --

	describe('URLs without file extensions', () => {
		it('should count clean path URLs as pages', () => {
			const requests = [
				{
					uniqueKey: 'https://example.com/about',
					wasAlreadyPresent: false,
				},
				{
					uniqueKey: 'https://example.com/contact',
					wasAlreadyPresent: false,
				},
				{ uniqueKey: 'https://example.com/', wasAlreadyPresent: false },
			];
			expect(countNewPageRequests(requests)).toBe(3);
		});
	});
});
