/**
 * ScraperWorkerService
 *
 * Processes site scraping jobs from the pg-boss queue.
 * Handles job lifecycle including:
 * - Picking up jobs from the queue
 * - Running Playwright crawler with stealth plugin
 * - Capturing screenshots at multiple viewports
 * - Uploading results to S3
 * - Updating job status
 * - Job cancellation via AbortController
 * - SSRF protection via DNS resolution checks
 * - Error handling and SSE event emission
 *
 * @remarks
 * This service registers as a pg-boss worker on module initialization.
 * It processes jobs one at a time (batchSize: 1) due to the heavy nature
 * of browser-based crawling.
 */
import { isIP } from 'net';
import { lookup } from 'dns/promises';
import * as path from 'path';

import {
	Injectable,
	OnModuleInit,
	OnModuleDestroy,
	Logger,
} from '@nestjs/common';
import PgBoss from 'pg-boss';
import { PlaywrightCrawler, Configuration } from 'crawlee';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import sharp from 'sharp';

import { PgBossService, SiteScraperJobData } from '../../../_platform/queue';
import { AwsS3Service } from '../../../_platform/aws';
import { JobStatus } from '../types/job-status.enum';
import { ScraperSSEEventType } from '../types/sse-events.types';
import { createScrapeError } from '../types/scrape-error.types';
import { ScreenshotRecord } from '../entities/scraped-page.entity';

import {
	SiteScraperService,
	SavePageResultInput,
} from './site-scraper.service';
import { ScraperSseService } from './scraper-sse.service';

/** Path to the autoconsent Playwright injection script */
const AUTOCONSENT_SCRIPT = path.join(
	path.dirname(require.resolve('@duckduckgo/autoconsent/rules/rules.json')),
	'../dist/autoconsent.playwright.js',
);

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

/** Check if a URL points to a downloadable file (PDF, ZIP, etc.) */
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

/** Private/reserved IP ranges for SSRF protection */
const PRIVATE_IP_RANGES = [
	/^127\./,
	/^10\./,
	/^172\.(1[6-9]|2[0-9]|3[0-1])\./,
	/^192\.168\./,
	/^0\./,
	/^169\.254\./,
	/^::1$/,
	/^fc00:/,
	/^fe80:/,
	/^fd/,
];

@Injectable()
export class ScraperWorkerService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ScraperWorkerService.name);

	/**
	 * Map of jobId -> AbortController for cancellation support.
	 * When a cancel request comes in, we signal the controller
	 * which the crawler can check periodically.
	 */
	private readonly abortControllers = new Map<string, AbortController>();

	/**
	 * Track active jobs for graceful shutdown
	 */
	private readonly activeJobs = new Set<string>();

	/**
	 * Flag to track if we're shutting down
	 */
	private isShuttingDown = false;

	/**
	 * Ghostery adblocker instance for hiding cookie banners via CSS cosmetic rules.
	 * Initialized in onModuleInit via dynamic import (ESM-only package).
	 */
	private adblocker: any = null;

	constructor(
		private readonly pgBossService: PgBossService,
		private readonly scraperService: SiteScraperService,
		private readonly s3Service: AwsS3Service,
		private readonly sseService: ScraperSseService,
	) {}

	/**
	 * Register as a queue worker on module initialization.
	 */
	async onModuleInit(): Promise<void> {
		this.logger.log('Starting ScraperWorkerService...');

		// Register stealth plugin to avoid bot detection
		try {
			chromium.use(stealthPlugin());
		} catch (error) {
			this.logger.error(`Failed to register stealth plugin: ${error}`);
		}

		// Initialize Ghostery adblocker for cookie banner CSS hiding
		try {
			const { PlaywrightBlocker } =
				await import('@ghostery/adblocker-playwright');
			this.adblocker = await PlaywrightBlocker.fromPrebuiltFull();
			this.logger.log('Ghostery adblocker initialized');
		} catch (error) {
			this.logger.warn(
				`Failed to initialize Ghostery adblocker: ${error}`,
			);
		}

		// Clean up orphaned jobs from previous process before registering worker
		try {
			await this.scraperService.failOrphanedRunningJobs();
		} catch (error) {
			this.logger.error(`Failed to clean up orphaned jobs: ${error}`);
		}

		// Re-queue any orphaned PENDING jobs from previous crashes
		try {
			await this.scraperService.requeueStaleJobs();
		} catch (error) {
			this.logger.error(`Failed to re-queue stale jobs: ${error}`);
		}

		// Register site scraper queue worker (teamSize: 1 enforced in pgBossService)
		try {
			await this.pgBossService.workSiteScraperQueue(
				this.processJob.bind(this),
				{ batchSize: 1 },
			);
			this.logger.log('Registered scraper worker with batchSize: 1');
		} catch (error) {
			this.logger.error(`Failed to register scraper worker: ${error}`);
		}
	}

	/**
	 * Graceful shutdown - wait for active jobs to complete.
	 */
	async onModuleDestroy(): Promise<void> {
		this.logger.log('Shutting down ScraperWorkerService...');
		this.isShuttingDown = true;

		// Cancel all in-flight jobs
		for (const [jobId, controller] of this.abortControllers) {
			this.logger.warn(`Aborting job ${jobId} due to shutdown`);
			controller.abort();
		}

		// Wait for active jobs to finish (with timeout)
		const shutdownTimeout = 30000; // 30 seconds
		const startTime = Date.now();

		while (
			this.activeJobs.size > 0 &&
			Date.now() - startTime < shutdownTimeout
		) {
			this.logger.log(
				`Waiting for ${this.activeJobs.size} active jobs to complete...`,
			);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (this.activeJobs.size > 0) {
			this.logger.warn(
				`Shutdown timeout reached with ${this.activeJobs.size} jobs still active`,
			);
		}

		this.logger.log('ScraperWorkerService shutdown complete');
	}

	/**
	 * Main job processor - called by pg-boss for each batch of jobs.
	 * In pg-boss v10+, handlers receive arrays.
	 *
	 * @param jobs - Array of pg-boss jobs with SiteScraperJobData payload
	 */
	async processJob(jobs: PgBoss.Job<SiteScraperJobData>[]): Promise<void> {
		await Promise.allSettled(jobs.map((job) => this.processSingleJob(job)));
	}

	/**
	 * Process a single scraping job.
	 *
	 * @param job - The pg-boss job with SiteScraperJobData payload
	 */
	private async processSingleJob(
		job: PgBoss.Job<SiteScraperJobData>,
	): Promise<void> {
		const { id: pgBossJobId, data } = job;
		const { jobId, url, maxDepth, viewports, userId, organizationId } =
			data;

		this.logger.log(
			`Processing scrape job ${jobId} (pg-boss: ${pgBossJobId})`,
		);

		// Track this job as active
		this.activeJobs.add(jobId);

		// Create AbortController for cancellation support
		const abortController = new AbortController();
		this.abortControllers.set(jobId, abortController);

		try {
			// Check if already shutting down
			if (this.isShuttingDown) {
				throw new Error('Worker is shutting down');
			}

			// Mark job as running in the database
			await this.scraperService.markJobRunning(jobId, pgBossJobId);

			// Query completed pages for retry/resume support
			const completedPages =
				await this.scraperService.getCompletedPageUrls(jobId);
			const completedUrlSet = new Set(completedPages);
			const isRetry = completedUrlSet.size > 0;

			if (isRetry) {
				this.logger.log(
					`Retry detected for job ${jobId}: ${completedUrlSet.size} pages already completed`,
				);
			}

			// Emit SSE event for job started
			this.sseService.emitJobEvent(
				jobId,
				userId,
				organizationId,
				ScraperSSEEventType.JOB_STARTED,
				{
					id: jobId,
					status: JobStatus.RUNNING,
					url,
				},
			);

			// Configure crawlee to not persist storage
			const crawleeConfig = new Configuration({
				persistStorage: false,
				purgeOnStart: true,
			});

			let totalPagesProcessed = completedUrlSet.size;
			let totalPagesDiscovered =
				completedUrlSet.size > 0 ? completedUrlSet.size : 1; // seed URL
			let totalPagesFailed = 0;

			// Track all URLs the crawler knows about (for accurate beyond-depth counting)
			const knownUrls = new Set<string>(completedUrlSet);
			knownUrls.add(url); // seed URL
			const beyondDepthUrls = new Set<string>();

			const crawler = new PlaywrightCrawler(
				{
					maxRequestsPerCrawl:
						1000 + (isRetry ? completedUrlSet.size : 0),
					maxConcurrency: 1,
					requestHandlerTimeoutSecs: 60,
					navigationTimeoutSecs: 30,
					launchContext: {
						launcher: chromium,
						launchOptions: {
							headless: true,
							args: [
								'--no-sandbox',
								'--disable-setuid-sandbox',
								'--disable-dev-shm-usage',
								'--disable-gpu',
							],
						},
					},

					postNavigationHooks: [
						async ({ page }) => {
							// Give autoconsent time to detect and dismiss popups
							await page.waitForTimeout(1000);
							// Fallback: try manual selectors for any remaining popups
							await this.dismissCookies(page);
						},
					],

					requestHandler: async ({
						request,
						page,
						enqueueLinks,
						log,
					}) => {
						// Skip download URLs (navigation was already skipped in preNavigationHooks)
						if (request.skipNavigation) {
							log.info(
								`Skipped non-HTML resource: ${request.url}`,
							);
							return;
						}

						// Check for cancellation
						if (abortController.signal.aborted) {
							log.info(
								`Job ${jobId} cancelled, skipping ${request.url}`,
							);
							return;
						}

						// Check DB for API-initiated cancellation
						if (
							await this.shouldCancelJob(jobId, abortController)
						) {
							log.info(
								`Job ${jobId} cancelled via API, stopping crawl`,
							);
							return;
						}

						const currentDepth =
							(request.userData?.depth as number) ?? 0;

						// Skip already-completed pages on retry (but still discover links)
						if (completedUrlSet.has(request.url)) {
							log.info(`Skipping completed page: ${request.url}`);
							if (currentDepth < maxDepth) {
								const { processedRequests } =
									await enqueueLinks({
										strategy: 'same-hostname',
										transformRequestFunction: (req) =>
											isDownloadUrl(req.url)
												? false
												: req,
										userData: {
											depth: currentDepth + 1,
										},
									});

								for (const r of processedRequests)
									knownUrls.add(r.uniqueKey);

								const newRequests = processedRequests.filter(
									(r) => r.wasAlreadyPresent === false,
								);

								if (newRequests.length > 0) {
									totalPagesDiscovered += newRequests.length;

									await this.scraperService.incrementPagesDiscovered(
										jobId,
										newRequests.length,
									);
								}
							}
							return;
						}

						log.info(
							`Scraping ${request.url} (depth: ${currentDepth})`,
						);

						// Wait for network to settle
						try {
							await page.waitForLoadState('networkidle', {
								timeout: 15000,
							});
						} catch {
							// Continue even if networkidle times out
							log.debug(
								`Network idle timeout for ${request.url}, continuing`,
							);
						}

						// Try to dismiss cookies again after page load
						await this.dismissCookies(page);

						// Generate a page entity ID upfront for S3 keys
						const pageId = this.generateUUID();

						// Take screenshots for each viewport and upload immediately
						const screenshots: ScreenshotRecord[] = [];
						for (const viewport of viewports) {
							if (abortController.signal.aborted) break;

							await page.setViewportSize({
								width: viewport,
								height: 900,
							});
							// Brief wait for layout reflow
							await page.waitForTimeout(500);

							const screenshotBuffer = await page.screenshot({
								fullPage: true,
								type: 'jpeg',
								quality: 85,
							});

							// Upload full-res screenshot to S3
							const screenshotS3Key = `site-scraper/${jobId}/${pageId}/screenshot-${viewport}w.jpg`;
							await this.s3Service.upload({
								key: screenshotS3Key,
								buffer: Buffer.from(screenshotBuffer),
								contentType: 'image/jpeg',
							});

							// Generate and upload WebP thumbnail
							let thumbnailS3Key: string | undefined;
							try {
								const thumbnailBuffer = await sharp(
									Buffer.from(screenshotBuffer),
								)
									.resize({ width: 480 })
									.webp({ quality: 80 })
									.toBuffer();

								thumbnailS3Key = `site-scraper/${jobId}/${pageId}/screenshot-${viewport}w-thumb.webp`;
								await this.s3Service.upload({
									key: thumbnailS3Key,
									buffer: thumbnailBuffer,
									contentType: 'image/webp',
								});
							} catch (thumbError) {
								log.warning(
									`Failed to generate thumbnail for ${request.url} at ${viewport}w: ${thumbError}`,
								);
							}

							screenshots.push({
								viewport,
								s3Key: screenshotS3Key,
								thumbnailS3Key,
							});
						}

						if (abortController.signal.aborted) return;

						// Get page HTML content and upload to S3
						const htmlContent = await page.content();
						const htmlS3Key = `site-scraper/${jobId}/${pageId}/page.html`;
						await this.s3Service.upload({
							key: htmlS3Key,
							buffer: Buffer.from(htmlContent, 'utf-8'),
							contentType: 'text/html; charset=utf-8',
						});

						// Get page title
						const title = await page.title();

						// Save page result to database
						const pageData: SavePageResultInput = {
							url: request.url,
							title: title || null,
							htmlS3Key,
							screenshots,
							status: 'completed',
						};

						await this.scraperService.savePageResult(
							jobId,
							pageData,
						);
						totalPagesProcessed++;

						// Emit SSE event for page completed
						this.sseService.emitJobEvent(
							jobId,
							userId,
							organizationId,
							ScraperSSEEventType.PAGE_COMPLETED,
							{
								id: jobId,
								pageUrl: request.url,
								title: title || null,
								pagesCompleted: totalPagesProcessed,
								pagesDiscovered: totalPagesDiscovered,
							},
						);

						// Enqueue links if we haven't reached max depth
						if (currentDepth < maxDepth) {
							const { processedRequests } = await enqueueLinks({
								strategy: 'same-hostname',
								transformRequestFunction: (req) =>
									isDownloadUrl(req.url) ? false : req,
								userData: {
									depth: currentDepth + 1,
								},
							});

							for (const r of processedRequests)
								knownUrls.add(r.uniqueKey);

							const newRequests = processedRequests.filter(
								(r) => r.wasAlreadyPresent === false,
							);

							if (newRequests.length > 0) {
								totalPagesDiscovered += newRequests.length;

								await this.scraperService.incrementPagesDiscovered(
									jobId,
									newRequests.length,
								);

								// Emit SSE event for pages discovered
								// ProcessedRequest only has uniqueKey, not url
								const newKeys = newRequests.map(
									(r) => r.uniqueKey,
								);
								this.sseService.emitJobEvent(
									jobId,
									userId,
									organizationId,
									ScraperSSEEventType.PAGES_DISCOVERED,
									{
										id: jobId,
										newUrls: newKeys,
										totalDiscovered: totalPagesDiscovered,
									},
								);
							}
						} else {
							// At max depth — collect unique outbound links as "beyond depth"
							try {
								const currentHostname = new URL(request.url)
									.hostname;
								const links: string[] = await page.$$eval(
									'a[href]',
									(
										anchors: HTMLAnchorElement[],
										hostname: string,
									) => {
										const urls: string[] = [];
										for (const a of anchors) {
											try {
												const u = new URL(a.href);
												if (u.hostname === hostname)
													urls.push(u.href);
											} catch {
												/* skip invalid */
											}
										}
										return urls;
									},
									currentHostname,
								);

								let newCount = 0;
								for (const link of links) {
									if (
										!isDownloadUrl(link) &&
										!knownUrls.has(link) &&
										!beyondDepthUrls.has(link)
									) {
										beyondDepthUrls.add(link);
										newCount++;
									}
								}

								if (newCount > 0) {
									await this.scraperService.incrementPagesSkippedByDepth(
										jobId,
										newCount,
									);
								}
							} catch {
								// Non-critical — skip counting on error
							}
						}
					},

					failedRequestHandler: async ({ request, log }, error) => {
						log.error(`Failed to scrape ${request.url}: ${error}`);

						totalPagesFailed++;

						// Save failed page result
						const pageData: SavePageResultInput = {
							url: request.url,
							title: null,
							htmlS3Key: null,
							screenshots: [],
							status: 'failed',
							errorMessage:
								error instanceof Error
									? error.message
									: String(error),
						};

						try {
							await this.scraperService.savePageResult(
								jobId,
								pageData,
							);
						} catch (saveError) {
							log.error(
								`Failed to save error result for ${request.url}: ${saveError}`,
							);
						}
					},

					preNavigationHooks: [
						async ({ request, log }) => {
							// Safety net: skip download URLs that slipped past transformRequestFunction
							if (isDownloadUrl(request.url)) {
								log.info(
									`Skipping download URL: ${request.url}`,
								);
								request.skipNavigation = true;
							}
						},
						async ({ page }) => {
							// Inject autoconsent script to auto-dismiss cookie/privacy popups
							await page.addInitScript({
								path: AUTOCONSENT_SCRIPT,
							});
						},
						async ({ page }) => {
							// Ghostery adblocker: hide cookie banners via CSS cosmetic rules
							if (this.adblocker) {
								await this.adblocker.enableBlockingInPage(page);
							}
						},
						async ({ page }) => {
							// SSRF protection: intercept all requests and block private IPs
							await page.route('**/*', async (route: any) => {
								const requestUrl = route.request().url();
								try {
									const urlObj = new URL(requestUrl);
									const hostname = urlObj.hostname;

									// Check if hostname is already an IP
									if (isIP(hostname)) {
										if (this.isPrivateIP(hostname)) {
											this.logger.warn(
												`SSRF blocked: direct IP ${hostname}`,
											);
											await route.abort(
												'blockedbyclient',
											);
											return;
										}
									} else {
										// Resolve DNS and check
										try {
											const result =
												await lookup(hostname);
											if (
												this.isPrivateIP(result.address)
											) {
												this.logger.warn(
													`SSRF blocked: ${hostname} resolves to private IP ${result.address}`,
												);
												await route.abort(
													'blockedbyclient',
												);
												return;
											}
										} catch {
											// DNS resolution failed, allow the request
											// The browser will handle DNS errors
										}
									}
								} catch {
									// URL parsing failed, allow the request
								}

								await route.continue();
							});
						},
					],
				},
				crawleeConfig,
			);

			// Run the crawler
			await crawler.run([
				{
					url,
					userData: { depth: 0 },
				},
			]);

			// Check if job was cancelled during crawl
			if (abortController.signal.aborted) {
				await this.scraperService.markJobCancelled(jobId);
				this.sseService.emitJobEvent(
					jobId,
					userId,
					organizationId,
					ScraperSSEEventType.JOB_CANCELLED,
					{
						id: jobId,
						status: JobStatus.CANCELLED,
					},
				);
				return;
			}

			// Mark job as completed
			const completedJob =
				await this.scraperService.markJobCompleted(jobId);

			if (completedJob) {
				const finalStatus =
					completedJob.pagesFailed > 0
						? JobStatus.COMPLETED_WITH_ERRORS
						: JobStatus.COMPLETED;

				this.sseService.emitJobEvent(
					jobId,
					userId,
					organizationId,
					ScraperSSEEventType.JOB_COMPLETED,
					{
						id: jobId,
						status: finalStatus,
						pagesCompleted: completedJob.pagesCompleted,
						pagesFailed: completedJob.pagesFailed,
						pagesDiscovered: completedJob.pagesDiscovered,
						pagesSkippedByDepth: completedJob.pagesSkippedByDepth,
					},
				);
			}

			this.logger.log(
				`Job ${jobId} completed: ${totalPagesProcessed} pages scraped, ${totalPagesFailed} failed`,
			);
		} catch (error) {
			// Handle job failure
			const abortCtrl = this.abortControllers.get(jobId);
			if (abortCtrl?.signal.aborted || this.isAbortError(error)) {
				this.logger.log(
					`Job ${jobId} was cancelled via AbortController`,
				);
				await this.scraperService.markJobCancelled(jobId);
				this.sseService.emitJobEvent(
					jobId,
					userId,
					organizationId,
					ScraperSSEEventType.JOB_CANCELLED,
					{
						id: jobId,
						status: JobStatus.CANCELLED,
					},
				);
				return;
			}

			const errorMessage =
				error instanceof Error ? error.message : String(error);
			this.logger.error(`Job ${jobId} failed: ${errorMessage}`);

			const scrapeError = this.classifyError(error);
			await this.scraperService.markJobFailed(jobId, scrapeError);

			this.sseService.emitJobEvent(
				jobId,
				userId,
				organizationId,
				ScraperSSEEventType.JOB_FAILED,
				{
					id: jobId,
					status: JobStatus.FAILED,
					error: scrapeError,
				},
			);
		} finally {
			// Cleanup tracking
			this.activeJobs.delete(jobId);
			this.abortControllers.delete(jobId);
		}
	}

	/**
	 * Cancel a running job.
	 *
	 * @param jobId - Database job ID
	 * @returns true if the job was found and cancellation was signaled
	 */
	cancelJob(jobId: string): boolean {
		const controller = this.abortControllers.get(jobId);
		if (controller) {
			controller.abort();
			this.logger.log(`Cancellation signaled for job ${jobId}`);
			return true;
		}
		return false;
	}

	/**
	 * Check if a job is currently being processed.
	 */
	isJobActive(jobId: string): boolean {
		return this.activeJobs.has(jobId);
	}

	/**
	 * Check if job should be cancelled (via AbortController or DB status).
	 * Provides defense-in-depth: even if the AbortController isn't triggered,
	 * we can still detect cancellation via the database.
	 *
	 * @param jobId - Job UUID
	 * @param abortController - AbortController for this job
	 * @returns true if job should be cancelled
	 */
	private async shouldCancelJob(
		jobId: string,
		abortController: AbortController,
	): Promise<boolean> {
		// Fast path: check AbortController first (local, no DB round-trip)
		if (abortController.signal.aborted) {
			return true;
		}

		// Slow path: check DB status (for API-initiated cancellations)
		const isCancelledInDb = await this.scraperService.isJobCancelled(jobId);
		if (isCancelledInDb) {
			// Also signal the AbortController so any in-progress operations are interrupted
			abortController.abort();
			return true;
		}

		return false;
	}

	/**
	 * Check if an error is an AbortError.
	 * AbortErrors are thrown when an AbortController's signal is aborted.
	 *
	 * @param error - Error to check
	 * @returns true if the error is an AbortError
	 */
	private isAbortError(error: unknown): boolean {
		if (error instanceof Error) {
			return (
				error.name === 'AbortError' ||
				error.message === 'AbortError' ||
				error.message.includes('aborted') ||
				error.message.includes('cancelled')
			);
		}
		return false;
	}

	/**
	 * Classify an error into a structured ScrapeError.
	 */
	private classifyError(error: unknown) {
		if (error instanceof Error) {
			if (error.message.includes('timeout')) {
				return createScrapeError('CRAWL_TIMEOUT', 'Crawl timed out');
			}
			if (
				error.message.includes('SSRF') ||
				error.message.includes('private IP')
			) {
				return createScrapeError(
					'SSRF_BLOCKED',
					'Request blocked by SSRF protection',
				);
			}
			if (
				error.message.includes('S3') ||
				error.message.includes('upload failed')
			) {
				return createScrapeError(
					'S3_ERROR',
					`Storage error: ${error.message}`,
				);
			}
			if (
				error.message.includes('browser') ||
				error.message.includes('crash') ||
				error.message.includes('Target closed')
			) {
				return createScrapeError(
					'BROWSER_CRASH',
					'Browser crashed during crawl',
				);
			}
			if (
				error.message.includes('ERR_NAME_NOT_RESOLVED') ||
				error.message.includes('ERR_CONNECTION_REFUSED') ||
				error.message.includes('net::ERR')
			) {
				return createScrapeError(
					'SITE_UNREACHABLE',
					`Site unreachable: ${error.message}`,
				);
			}

			return createScrapeError('CRAWL_FAILED', error.message);
		}

		return createScrapeError('CRAWL_FAILED', String(error));
	}

	/**
	 * Attempt to dismiss cookie consent dialogs using common CSS selectors.
	 * Uses JS .click() instead of Playwright .click() because some CMPs
	 * (e.g., CookieReports) only respond to DOM click events.
	 */
	private async dismissCookies(page: any): Promise<void> {
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
	}

	/**
	 * Check if an IP address is private/reserved.
	 */
	private isPrivateIP(ip: string): boolean {
		return PRIVATE_IP_RANGES.some((range) => range.test(ip));
	}

	/**
	 * Generate a UUID v4.
	 * Uses crypto for randomness.
	 */
	private generateUUID(): string {
		const bytes = new Uint8Array(16);
		globalThis.crypto.getRandomValues(bytes);
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;

		const hex = Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
}
