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
		chromium.use(stealthPlugin());

		// Register site scraper queue worker
		await this.pgBossService.workSiteScraperQueue(
			this.processJob.bind(this),
			{ batchSize: 1 },
		);
		this.logger.log('Registered scraper worker with batchSize: 1');
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

			let totalPagesProcessed = 0;
			let totalPagesFailed = 0;

			const crawler = new PlaywrightCrawler(
				{
					maxRequestsPerCrawl: 200,
					maxConcurrency: 2,
					requestHandlerTimeoutSecs: 60,
					navigationTimeoutSecs: 30,
					launchContext: {
						launcher: chromium,
						launchOptions: {
							headless: true,
							args: [
								'--no-sandbox',
								'--disable-dev-shm-usage',
								'--disable-gpu',
							],
						},
					},

					postNavigationHooks: [
						async ({ page }) => {
							// Attempt to dismiss cookie consent dialogs
							await this.dismissCookies(page);
						},
					],

					requestHandler: async ({
						request,
						page,
						enqueueLinks,
						log,
					}) => {
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
								type: 'png',
							});

							// Upload screenshot to S3 immediately
							const screenshotS3Key = `site-scraper/${jobId}/${pageId}/screenshot-${viewport}w.png`;
							await this.s3Service.upload({
								key: screenshotS3Key,
								buffer: Buffer.from(screenshotBuffer),
								contentType: 'image/png',
							});

							screenshots.push({
								viewport,
								s3Key: screenshotS3Key,
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
								pagesDiscovered: 0, // Will be updated by enqueueLinks
							},
						);

						// Enqueue links if we haven't reached max depth
						if (currentDepth < maxDepth) {
							const { processedRequests } = await enqueueLinks({
								strategy: 'same-hostname',
								userData: {
									depth: currentDepth + 1,
								},
							});

							const newRequests = processedRequests.filter(
								(r) => r.wasAlreadyPresent === false,
							);

							if (newRequests.length > 0) {
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
										totalDiscovered: newRequests.length,
									},
								);
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
	 */
	private async dismissCookies(page: any): Promise<void> {
		for (const selector of COOKIE_DISMISS_SELECTORS) {
			try {
				const button = await page.$(selector);
				if (button) {
					await button.click().catch(() => {
						// Ignore click errors
					});
					// Brief wait after clicking
					await page.waitForTimeout(300);
					return; // Found and clicked a button, stop trying
				}
			} catch {
				// Selector not found, try next one
			}
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
