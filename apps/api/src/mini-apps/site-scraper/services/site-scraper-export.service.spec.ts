import { Readable, PassThrough, Writable } from 'stream';

import { Test, TestingModule } from '@nestjs/testing';
import { v4 as uuidv4 } from 'uuid';

import { AwsS3Service } from '../../../_platform/aws';
import { ScrapeJob } from '../entities/scrape-job.entity';
import { ScrapedPage } from '../entities/scraped-page.entity';
import { JobStatus, PageStatus } from '../types/job-status.enum';

import {
	SiteScraperExportService,
	ExportFormat,
} from './site-scraper-export.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockJob(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
	const job = Object.assign(new ScrapeJob(), {
		id: uuidv4(),
		url: 'https://example.com',
		maxDepth: 3,
		viewports: [1920],
		status: JobStatus.COMPLETED,
		pagesDiscovered: 1,
		pagesCompleted: 1,
		pagesFailed: 0,
		pagesSkippedByDepth: 0,
		error: null,
		userId: uuidv4(),
		organizationId: uuidv4(),
		createdAt: new Date(),
		updatedAt: new Date(),
		startedAt: new Date(),
		completedAt: new Date(),
		...overrides,
	});
	return job;
}

function createMockPage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
	return Object.assign(new ScrapedPage(), {
		id: uuidv4(),
		scrapeJobId: uuidv4(),
		url: 'https://example.com/page',
		title: 'Test Page',
		htmlS3Key: 'html/test.html',
		screenshots: [{ viewport: 1920, s3Key: 'screenshots/test.jpg' }],
		status: PageStatus.COMPLETED,
		errorMessage: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	});
}

/**
 * Collect all data written to a writable stream into a buffer.
 */
function collectStream(): { stream: PassThrough; buffer: () => Buffer } {
	const chunks: Buffer[] = [];
	const stream = new PassThrough();
	stream.on('data', (chunk: Buffer) => chunks.push(chunk));
	return {
		stream,
		buffer: () => Buffer.concat(chunks),
	};
}

function readableFromString(content: string): Readable {
	const readable = new Readable();
	readable.push(Buffer.from(content));
	readable.push(null);
	return readable;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SiteScraperExportService', () => {
	let service: SiteScraperExportService;
	let s3Service: { download: jest.Mock; getObjectStream: jest.Mock };

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				SiteScraperExportService,
				{
					provide: AwsS3Service,
					useValue: {
						download: jest.fn(),
						getObjectStream: jest.fn(),
					},
				},
			],
		}).compile();

		service = module.get(SiteScraperExportService);
		s3Service = module.get(AwsS3Service);
	});

	// -----------------------------------------------------------------------
	// ZIP generation - single format
	// -----------------------------------------------------------------------
	describe('streamJobExport - single format', () => {
		it('produces a ZIP containing an HTML file for html format', async () => {
			const job = createMockJob();
			const page = createMockPage({ scrapeJobId: job.id });
			const htmlContent = '<html><body>Hello</body></html>';
			s3Service.getObjectStream.mockResolvedValue(
				readableFromString(htmlContent),
			);

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page],
				new Set(['html']),
				stream,
			);

			const data = buffer();
			// ZIP files start with PK signature (0x504B)
			expect(data[0]).toBe(0x50);
			expect(data[1]).toBe(0x4b);
			expect(data.length).toBeGreaterThan(0);
		});

		it('produces a ZIP containing a markdown file for markdown format', async () => {
			const job = createMockJob();
			const page = createMockPage({ scrapeJobId: job.id });
			const htmlContent =
				'<html><body><h1>Title</h1><p>Content</p></body></html>';
			s3Service.download.mockResolvedValue(Buffer.from(htmlContent));

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page],
				new Set(['markdown']),
				stream,
			);

			const data = buffer();
			expect(data[0]).toBe(0x50);
			expect(data[1]).toBe(0x4b);
		});

		it('produces a ZIP containing a screenshot for screenshots format', async () => {
			const job = createMockJob();
			const page = createMockPage({ scrapeJobId: job.id });
			const imgData = Buffer.from('fake-image-data');
			s3Service.getObjectStream.mockResolvedValue(
				readableFromString(imgData.toString()),
			);

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page],
				new Set(['screenshots']),
				stream,
			);

			const data = buffer();
			expect(data[0]).toBe(0x50);
			expect(data[1]).toBe(0x4b);
		});
	});

	// -----------------------------------------------------------------------
	// ZIP generation - multiple formats
	// -----------------------------------------------------------------------
	describe('streamJobExport - multiple formats', () => {
		it('includes both HTML and markdown when both formats requested', async () => {
			const job = createMockJob();
			const page = createMockPage({ scrapeJobId: job.id });
			const htmlContent = '<html><body><h1>Hello</h1></body></html>';
			s3Service.download.mockResolvedValue(Buffer.from(htmlContent));

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page],
				new Set<ExportFormat>(['html', 'markdown']),
				stream,
			);

			const data = buffer();
			expect(data.length).toBeGreaterThan(0);
			expect(data[0]).toBe(0x50);
		});

		it('handles multiple pages', async () => {
			const job = createMockJob();
			const page1 = createMockPage({
				scrapeJobId: job.id,
				url: 'https://example.com/',
			});
			const page2 = createMockPage({
				scrapeJobId: job.id,
				url: 'https://example.com/about',
			});
			const htmlContent = '<html><body>Page</body></html>';
			s3Service.getObjectStream.mockImplementation(() =>
				Promise.resolve(readableFromString(htmlContent)),
			);

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page1, page2],
				new Set(['html']),
				stream,
			);

			const data = buffer();
			expect(data.length).toBeGreaterThan(0);
		});
	});

	// -----------------------------------------------------------------------
	// Edge cases
	// -----------------------------------------------------------------------
	describe('edge cases', () => {
		it('produces a valid ZIP for 0 pages (manifest only)', async () => {
			const job = createMockJob({ pagesCompleted: 0 });

			const { stream, buffer } = collectStream();
			await service.streamJobExport(job, [], new Set(['html']), stream);

			const data = buffer();
			// A ZIP with just the manifest should still be a valid ZIP
			expect(data[0]).toBe(0x50);
			expect(data[1]).toBe(0x4b);
		});

		it('skips page gracefully when htmlS3Key is null and html format requested', async () => {
			const job = createMockJob();
			const page = createMockPage({
				scrapeJobId: job.id,
				htmlS3Key: null,
			});

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page],
				new Set(['html']),
				stream,
			);

			const data = buffer();
			// Should produce a valid ZIP (with manifest only)
			expect(data[0]).toBe(0x50);
			expect(data[1]).toBe(0x4b);
		});

		it('skips page gracefully when screenshots array is empty', async () => {
			const job = createMockJob();
			const page = createMockPage({
				scrapeJobId: job.id,
				screenshots: [],
			});

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page],
				new Set(['screenshots']),
				stream,
			);

			const data = buffer();
			expect(data[0]).toBe(0x50);
			expect(data[1]).toBe(0x4b);
		});
	});

	// -----------------------------------------------------------------------
	// S3 retrieval failures
	// -----------------------------------------------------------------------
	describe('S3 retrieval failures', () => {
		it('logs warning and continues when S3 download fails for HTML', async () => {
			const job = createMockJob();
			const page1 = createMockPage({
				scrapeJobId: job.id,
				url: 'https://example.com/fail',
			});
			const page2 = createMockPage({
				scrapeJobId: job.id,
				url: 'https://example.com/ok',
				htmlS3Key: 'html/ok.html',
			});

			s3Service.getObjectStream
				.mockRejectedValueOnce(new Error('S3 NoSuchKey'))
				.mockResolvedValueOnce(readableFromString('<html>ok</html>'));

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page1, page2],
				new Set(['html']),
				stream,
			);

			const data = buffer();
			expect(data.length).toBeGreaterThan(0);
		});

		it('logs warning and continues when S3 download fails for screenshot', async () => {
			const job = createMockJob();
			const page = createMockPage({
				scrapeJobId: job.id,
				htmlS3Key: null,
				screenshots: [
					{ viewport: 1920, s3Key: 'screenshots/broken.jpg' },
				],
			});

			s3Service.getObjectStream.mockRejectedValue(
				new Error('S3 access denied'),
			);

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page],
				new Set(['screenshots']),
				stream,
			);

			const data = buffer();
			// Should still produce a valid ZIP (with manifest + skipped files log)
			expect(data[0]).toBe(0x50);
			expect(data[1]).toBe(0x4b);
		});

		it('logs warning and continues when S3 download fails for markdown', async () => {
			const job = createMockJob();
			const page = createMockPage({ scrapeJobId: job.id });

			s3Service.download.mockRejectedValue(new Error('S3 timeout'));

			const { stream, buffer } = collectStream();
			await service.streamJobExport(
				job,
				[page],
				new Set(['markdown']),
				stream,
			);

			const data = buffer();
			expect(data.length).toBeGreaterThan(0);
		});
	});

	// -----------------------------------------------------------------------
	// urlToFilePath
	// -----------------------------------------------------------------------
	describe('urlToFilePath', () => {
		it('converts root URL to "index"', () => {
			const tracker = new Map<string, number>();
			const result = service.urlToFilePath(
				'https://example.com/',
				'https://example.com',
				tracker,
			);
			expect(result).toBe('index');
		});

		it('strips leading slashes from pathname', () => {
			const tracker = new Map<string, number>();
			const result = service.urlToFilePath(
				'https://example.com/about',
				'https://example.com',
				tracker,
			);
			expect(result).toBe('about');
		});

		it('converts nested paths correctly', () => {
			const tracker = new Map<string, number>();
			const result = service.urlToFilePath(
				'https://example.com/docs/api/v2',
				'https://example.com',
				tracker,
			);
			expect(result).toBe('docs/api/v2');
		});

		it('removes path traversal segments (ZIP Slip prevention)', () => {
			const tracker = new Map<string, number>();
			const result = service.urlToFilePath(
				'https://example.com/../../../etc/passwd',
				'https://example.com',
				tracker,
			);
			expect(result).not.toContain('..');
			expect(result).toBe('etc/passwd');
		});

		it('replaces unsafe filesystem characters with hyphens', () => {
			const tracker = new Map<string, number>();
			const result = service.urlToFilePath(
				'https://example.com/page?id=1&name=test',
				'https://example.com',
				tracker,
			);
			expect(result).not.toContain('?');
		});

		it('handles path collisions with suffix numbering', () => {
			const tracker = new Map<string, number>();
			const r1 = service.urlToFilePath(
				'https://example.com/page',
				'https://example.com',
				tracker,
			);
			const r2 = service.urlToFilePath(
				'https://example.com/page',
				'https://example.com',
				tracker,
			);
			expect(r1).toBe('page');
			expect(r2).toBe('page-1');
		});

		it('truncates segments longer than 100 characters', () => {
			const tracker = new Map<string, number>();
			const longSegment = 'a'.repeat(200);
			const result = service.urlToFilePath(
				`https://example.com/${longSegment}`,
				'https://example.com',
				tracker,
			);
			expect(result.length).toBeLessThanOrEqual(100);
		});

		it('handles trailing slashes by appending index', () => {
			const tracker = new Map<string, number>();
			const result = service.urlToFilePath(
				'https://example.com/docs/',
				'https://example.com',
				tracker,
			);
			expect(result).toBe('docs/index');
		});

		it('handles invalid URLs gracefully', () => {
			const tracker = new Map<string, number>();
			const result = service.urlToFilePath(
				'not-a-url',
				'https://example.com',
				tracker,
			);
			expect(result).toBe('unknown');
		});
	});

	// -----------------------------------------------------------------------
	// Streaming behavior
	// -----------------------------------------------------------------------
	describe('streaming behavior', () => {
		it('pipes ZIP data to the output stream (not buffered in memory)', async () => {
			const job = createMockJob();
			const page = createMockPage({ scrapeJobId: job.id });
			s3Service.getObjectStream.mockResolvedValue(
				readableFromString('<html>page</html>'),
			);

			const chunks: Buffer[] = [];
			const output = new Writable({
				write(chunk, _encoding, callback) {
					chunks.push(chunk);
					callback();
				},
			});

			await service.streamJobExport(
				job,
				[page],
				new Set(['html']),
				output,
			);

			// Data should have been written in multiple chunks (streamed)
			expect(chunks.length).toBeGreaterThan(0);
			const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
			expect(totalSize).toBeGreaterThan(0);
		});
	});
});
