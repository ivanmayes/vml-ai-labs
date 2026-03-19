/**
 * SiteScraperExportService
 *
 * Handles streaming ZIP export of scrape job data.
 * Assembles ZIP archives on-the-fly from S3 objects with support for:
 * - HTML snapshots (streamed from S3)
 * - Markdown conversion (via Turndown)
 * - Screenshots (streamed from S3, stored without compression)
 */
import { Readable, Writable } from 'stream';

import { Injectable, Logger } from '@nestjs/common';
import archiver from 'archiver';
import TurndownService from 'turndown';

import { AwsS3Service } from '../../../_platform/aws';
import { ScrapeJob } from '../entities/scrape-job.entity';
import { ScrapedPage } from '../entities/scraped-page.entity';

export type ExportFormat = 'html' | 'markdown' | 'screenshots';

@Injectable()
export class SiteScraperExportService {
	private readonly logger = new Logger(SiteScraperExportService.name);
	private readonly turndown: TurndownService;

	constructor(private readonly s3Service: AwsS3Service) {
		this.turndown = new TurndownService({
			headingStyle: 'atx',
			hr: '---',
			bulletListMarker: '-',
			codeBlockStyle: 'fenced',
			fence: '```',
			emDelimiter: '*',
			strongDelimiter: '**',
			linkStyle: 'inlined',
		});

		this.turndown.addRule('stripScripts', {
			filter: ['script', 'style', 'noscript', 'link', 'meta'],
			replacement: () => '',
		});
	}

	/**
	 * Stream a ZIP export of a scrape job to the provided writable output.
	 * Fetches S3 objects per-page and pipes them through archiver.
	 *
	 * @param job - The scrape job entity
	 * @param pages - Completed pages to include
	 * @param formats - Set of requested formats
	 * @param output - Writable stream (Express response)
	 */
	async streamJobExport(
		job: ScrapeJob,
		pages: ScrapedPage[],
		formats: Set<ExportFormat>,
		output: Writable,
	): Promise<void> {
		const archive = archiver('zip', {
			zlib: { level: 1 },
			forceZip64: true,
		});

		let activeStream: Readable | null = null;
		const skippedFiles: { url: string; file: string; reason: string }[] =
			[];

		// Error handling BEFORE piping
		archive.on('error', (err) => {
			this.logger.error('Archive error:', err);
			if (!(output as any).destroyed) {
				(output as any).destroy();
			}
		});

		archive.on('warning', (err) => {
			if (err.code === 'ENOENT') {
				this.logger.warn(
					'Archive warning (missing file):',
					err.message,
				);
			} else {
				archive.emit('error', err);
			}
		});

		// Client disconnect handling
		output.on('close', () => {
			if (!(output as any).writableFinished) {
				archive.abort();
				archive.destroy();
				if (activeStream && !activeStream.destroyed) {
					activeStream.destroy();
				}
			}
		});

		archive.pipe(output);

		// Write manifest FIRST — ensures first byte within Heroku's 30s timeout
		const pathTracker = new Map<string, number>();
		const needsBoth = formats.has('html') && formats.has('markdown');
		const hostname = this.extractHostname(job.url);
		const prefix = `${hostname}-${job.id.substring(0, 8)}`;

		// Build initial manifest (will update with skipped files at end)
		const manifest = this.buildManifest(job, pages, formats);
		archive.append(JSON.stringify(manifest, null, 2), {
			name: `${prefix}/manifest.json`,
		});

		for (const page of pages) {
			if ((output as any).destroyed) break;

			const basePath = this.urlToFilePath(page.url, job.url, pathTracker);

			try {
				if (needsBoth && page.htmlS3Key) {
					// Cache HTML buffer when both formats requested (saves S3 round-trip)
					try {
						const htmlBuffer = await this.s3Service.download(
							page.htmlS3Key,
						);
						archive.append(htmlBuffer, {
							name: `${prefix}/html/${basePath}.html`,
						});

						const markdown = this.turndown.turndown(
							this.sanitizeHtmlForMarkdown(
								htmlBuffer.toString('utf-8'),
							),
						);
						archive.append(markdown, {
							name: `${prefix}/markdown/${basePath}.md`,
						});
					} catch (err) {
						this.logger.warn(
							`Skipping HTML+markdown for ${page.url}: ${(err as Error).message}`,
						);
						skippedFiles.push({
							url: page.url,
							file: `html/${basePath}.html`,
							reason: (err as Error).message,
						});
						skippedFiles.push({
							url: page.url,
							file: `markdown/${basePath}.md`,
							reason: (err as Error).message,
						});
					}
				} else {
					if (formats.has('html') && page.htmlS3Key) {
						try {
							activeStream = await this.s3Service.getObjectStream(
								page.htmlS3Key,
							);
							archive.append(activeStream, {
								name: `${prefix}/html/${basePath}.html`,
							});
							await this.waitForStreamEnd(activeStream);
							activeStream = null;
						} catch (err) {
							this.logger.warn(
								`Skipping HTML for ${page.url}: ${(err as Error).message}`,
							);
							skippedFiles.push({
								url: page.url,
								file: `html/${basePath}.html`,
								reason: (err as Error).message,
							});
							activeStream = null;
						}
					}

					if (formats.has('markdown') && page.htmlS3Key) {
						try {
							const htmlBuffer = await this.s3Service.download(
								page.htmlS3Key,
							);
							const markdown = this.turndown.turndown(
								this.sanitizeHtmlForMarkdown(
									htmlBuffer.toString('utf-8'),
								),
							);
							archive.append(markdown, {
								name: `${prefix}/markdown/${basePath}.md`,
							});
						} catch (err) {
							this.logger.warn(
								`Skipping markdown for ${page.url}: ${(err as Error).message}`,
							);
							skippedFiles.push({
								url: page.url,
								file: `markdown/${basePath}.md`,
								reason: (err as Error).message,
							});
						}
					}
				}

				if (formats.has('screenshots')) {
					for (const shot of page.screenshots || []) {
						if ((output as any).destroyed) break;
						try {
							activeStream = await this.s3Service.getObjectStream(
								shot.s3Key,
							);
							archive.append(activeStream, {
								name: `${prefix}/screenshots/${basePath}-${shot.viewport}w.jpg`,
								store: true, // No compression for PNGs
							});
							await this.waitForStreamEnd(activeStream);
							activeStream = null;
						} catch (err) {
							this.logger.warn(
								`Skipping screenshot for ${page.url} at ${shot.viewport}w: ${(err as Error).message}`,
							);
							skippedFiles.push({
								url: page.url,
								file: `screenshots/${basePath}-${shot.viewport}w.jpg`,
								reason: (err as Error).message,
							});
							activeStream = null;
						}
					}
				}
			} catch (err) {
				this.logger.warn(
					`Skipping page ${page.url}: ${(err as Error).message}`,
				);
				if (activeStream !== null) {
					try {
						(activeStream as Readable).destroy();
					} catch {
						/* ignore */
					}
					activeStream = null;
				}
			}
		}

		// If any files were skipped, append an errors log
		if (skippedFiles.length > 0) {
			const errorsContent = skippedFiles
				.map(
					(s) => `${s.url}\n  File: ${s.file}\n  Reason: ${s.reason}`,
				)
				.join('\n\n');
			archive.append(errorsContent, {
				name: `${prefix}/_skipped_files.txt`,
			});
		}

		await archive.finalize();
	}

	/**
	 * Wait for a readable stream to end or error.
	 * Provides manual backpressure for archiver — one stream at a time.
	 */
	private waitForStreamEnd(stream: Readable): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			stream.on('end', resolve);
			stream.on('error', (err) => reject(err));
		});
	}

	/**
	 * Convert a page URL to a safe ZIP file path.
	 * Sanitizes against ZIP Slip, unsafe characters, and path collisions.
	 */
	urlToFilePath(
		pageUrl: string,
		_siteOrigin: string,
		pathTracker: Map<string, number>,
	): string {
		let pathname: string;
		try {
			pathname = decodeURIComponent(new URL(pageUrl).pathname);
		} catch {
			pathname = '/unknown';
		}

		// Strip leading slashes
		pathname = pathname.replace(/^\/+/, '');

		// CRITICAL: Remove path traversal segments (ZIP Slip prevention)
		pathname = pathname
			.split('/')
			.filter((seg) => seg !== '..' && seg !== '.')
			.join('/');

		// Handle empty/root path and trailing slashes
		if (!pathname || pathname === '/') {
			pathname = 'index';
		} else if (pathname.endsWith('/')) {
			pathname = pathname + 'index';
		}

		// Sanitize each segment
		const segments = pathname
			.split('/')
			.map((seg) => {
				// Replace unsafe filesystem chars with hyphens
				seg = seg.replace(/[\\:*?"<>|#%]/g, '-');
				// Replace spaces
				seg = seg.replace(/\s+/g, '-');
				// Remove null bytes and control chars
				// eslint-disable-next-line no-control-regex
				seg = seg.replace(/[\x00-\x1f\x7f]/g, '');
				// Trim trailing dots/spaces (Windows)
				seg = seg.replace(/[. ]+$/, '');
				// Windows reserved names
				if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(seg)) {
					seg = '_' + seg;
				}
				// Truncate segments to 100 chars
				if (seg.length > 100) seg = seg.substring(0, 100);
				// Collapse consecutive hyphens
				seg = seg.replace(/-{2,}/g, '-');
				return seg;
			})
			.filter(Boolean);

		let result = segments.join('/') || 'index';

		// Case-insensitive collision detection (Windows/macOS)
		const normalized = result.toLowerCase();
		if (pathTracker.has(normalized)) {
			const count = pathTracker.get(normalized)! + 1;
			pathTracker.set(normalized, count);
			result = `${result}-${count}`;
		} else {
			pathTracker.set(normalized, 0);
		}

		return result;
	}

	/**
	 * Strip script tags, style tags, noscript, and other non-content elements
	 * from HTML before markdown conversion.
	 */
	private sanitizeHtmlForMarkdown(html: string): string {
		return (
			html
				// Remove entire <script>...</script> blocks (including inline JS)
				.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
				// Remove entire <style>...</style> blocks
				.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
				// Remove <noscript>...</noscript>
				.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
				// Remove <link> tags (stylesheets, preloads)
				.replace(/<link\b[^>]*\/?>/gi, '')
				// Remove <meta> tags
				.replace(/<meta\b[^>]*\/?>/gi, '')
				// Remove HTML comments
				.replace(/<!--[\s\S]*?-->/g, '')
				// Remove SVG blocks (often large inline icons)
				.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
				// Remove event handler attributes (onclick, onload, etc.)
				.replace(/\s+on\w+="[^"]*"/gi, '')
				.replace(/\s+on\w+='[^']*'/gi, '')
		);
	}

	/**
	 * Extract hostname from URL for ZIP filename prefix.
	 */
	private extractHostname(url: string): string {
		try {
			return new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, '-');
		} catch {
			return 'unknown-site';
		}
	}

	/**
	 * Build manifest.json content for the ZIP archive.
	 */
	private buildManifest(
		job: ScrapeJob,
		pages: ScrapedPage[],
		formats: Set<ExportFormat>,
	): Record<string, unknown> {
		return {
			exportedAt: new Date().toISOString(),
			job: {
				id: job.id,
				url: job.url,
				maxDepth: job.maxDepth,
				viewports: job.viewports,
				pagesCompleted: job.pagesCompleted,
				pagesFailed: job.pagesFailed,
				createdAt: job.createdAt,
				completedAt: job.completedAt,
			},
			formats: Array.from(formats),
			pages: pages.map((p) => ({
				url: p.url,
				title: p.title,
				status: p.status,
			})),
		};
	}
}
