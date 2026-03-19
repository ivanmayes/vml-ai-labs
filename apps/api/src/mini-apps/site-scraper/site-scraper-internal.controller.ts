/**
 * Site Scraper Internal Controller
 *
 * Receives page results from Lambda workers via HTTP callback.
 * This is a machine-to-machine endpoint — NO JWT auth guard.
 * Authentication is via Bearer token matching LAMBDA_CALLBACK_SECRET.
 *
 * Flow:
 * 1. Lambda processes a page (render, screenshot, upload to S3)
 * 2. Lambda POSTs result here with discovered links
 * 3. This controller deduplicates links, enqueues new ones to SQS
 * 4. Emits SSE events for real-time UI updates
 * 5. Checks if job is complete
 */
import { timingSafeEqual } from 'crypto';

import {
	Controller,
	Post,
	Body,
	Headers,
	HttpCode,
	HttpStatus,
	Logger,
	BadRequestException,
	GoneException,
	UnauthorizedException,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
} from '@nestjs/swagger';

import { LambdaPageResultDto } from './dtos/lambda-page-result.dto';
import { SiteScraperService } from './services/site-scraper.service';
import { ScraperSseService } from './services/scraper-sse.service';
import { JobStatus, isTerminalStatus } from './types/job-status.enum';
import { ScraperSSEEventType } from './types/sse-events.types';

@Controller('internal/scraper')
@ApiTags('Site Scraper Internal')
export class SiteScraperInternalController {
	private readonly logger = new Logger(SiteScraperInternalController.name);

	constructor(
		private readonly siteScraperService: SiteScraperService,
		private readonly sseService: ScraperSseService,
	) {}

	/**
	 * Receive a page result from a Lambda worker.
	 *
	 * Validates Bearer token, checks job status, upserts page result,
	 * deduplicates discovered links, enqueues new URLs to SQS,
	 * emits SSE events, and checks for job completion.
	 */
	@Post('page-result')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Receive page result from Lambda worker' })
	@ApiBearerAuth()
	@ApiResponse({ status: 200, description: 'Page result accepted' })
	@ApiResponse({ status: 400, description: 'Validation error' })
	@ApiResponse({
		status: 401,
		description: 'Invalid or missing Bearer token',
	})
	@ApiResponse({
		status: 410,
		description: 'Job cancelled or already completed',
	})
	async receivePageResult(
		@Headers('authorization') authHeader: string,
		@Body() dto: LambdaPageResultDto,
	): Promise<{ status: string; jobId: string }> {
		// 1. Verify Bearer token
		this.verifyBearerToken(authHeader);

		// 2. Validate S3 key prefixes to prevent path traversal
		this.validateS3Keys(dto);

		// 3. Check job exists and is RUNNING
		const job = await this.siteScraperService.getJobById(dto.jobId);

		if (!job) {
			throw new BadRequestException(`Job ${dto.jobId} not found`);
		}

		if (isTerminalStatus(job.status)) {
			throw new GoneException(
				`Job ${dto.jobId} is ${job.status} — no longer accepting results`,
			);
		}

		if (job.status !== JobStatus.RUNNING) {
			throw new BadRequestException(
				`Job ${dto.jobId} is in ${job.status} status — expected RUNNING`,
			);
		}

		// 4. Upsert page result (idempotent via INSERT ON CONFLICT DO UPDATE)
		await this.siteScraperService.upsertPageResult(dto.jobId, {
			url: dto.url,
			title: dto.title || null,
			htmlS3Key: dto.htmlS3Key || null,
			screenshots: dto.screenshots.map((s) => ({
				viewport: s.viewport,
				s3Key: s.s3Key,
				thumbnailS3Key: s.thumbnailS3Key,
			})),
			status: dto.status,
			errorMessage: dto.errorMessage || null,
		});

		// 5. Process discovered links: dedup + enqueue new ones to SQS
		let newUrlCount = 0;
		if (dto.discoveredUrls.length > 0) {
			newUrlCount = await this.siteScraperService.enqueueDiscoveredUrls(
				dto.jobId,
				dto.discoveredUrls,
				dto.depth,
				job.maxDepth,
				{
					maxPages: 1000,
					viewports: job.viewports,
					seedHostname: new URL(job.url).hostname,
					s3Prefix: `site-scraper/${dto.jobId}/`,
				},
			);
		}

		// 6. Emit SSE event
		if (dto.status === 'completed') {
			// Reload job to get updated counters
			const updatedJob = await this.siteScraperService.getJobById(
				dto.jobId,
			);
			if (updatedJob) {
				this.sseService.emitJobEvent(
					dto.jobId,
					job.userId,
					job.organizationId,
					ScraperSSEEventType.PAGE_COMPLETED,
					{
						id: dto.jobId,
						pageUrl: dto.url,
						title: dto.title || null,
						pagesCompleted: updatedJob.pagesCompleted,
						pagesDiscovered: updatedJob.pagesDiscovered,
					},
				);
			}
		}

		// Also emit pages:discovered if new URLs were found
		if (newUrlCount > 0) {
			const updatedJob = await this.siteScraperService.getJobById(
				dto.jobId,
			);
			if (updatedJob) {
				this.sseService.emitJobEvent(
					dto.jobId,
					job.userId,
					job.organizationId,
					ScraperSSEEventType.PAGES_DISCOVERED,
					{
						id: dto.jobId,
						newUrls: dto.discoveredUrls.slice(0, newUrlCount),
						totalDiscovered: updatedJob.pagesDiscovered,
					},
				);
			}
		}

		// 7. Check completion: pagesCompleted + pagesFailed >= pagesDiscovered
		//    AND no pending pages remain
		await this.siteScraperService.checkAndCompleteJob(dto.jobId);

		// If job just completed, emit the SSE event
		const finalJob = await this.siteScraperService.getJobById(dto.jobId);
		if (
			finalJob &&
			(finalJob.status === JobStatus.COMPLETED ||
				finalJob.status === JobStatus.COMPLETED_WITH_ERRORS)
		) {
			this.sseService.emitJobEvent(
				dto.jobId,
				job.userId,
				job.organizationId,
				ScraperSSEEventType.JOB_COMPLETED,
				{
					id: dto.jobId,
					status: finalJob.status,
					pagesCompleted: finalJob.pagesCompleted,
					pagesFailed: finalJob.pagesFailed,
					pagesDiscovered: finalJob.pagesDiscovered,
					pagesSkippedByDepth: finalJob.pagesSkippedByDepth,
				},
			);
		}

		return { status: 'ok', jobId: dto.jobId };
	}

	/**
	 * Verify the Authorization header contains a valid Bearer token
	 * matching the LAMBDA_CALLBACK_SECRET environment variable.
	 */
	private verifyBearerToken(authHeader: string): void {
		const callbackSecret = process.env.LAMBDA_CALLBACK_SECRET || '';

		if (!callbackSecret) {
			this.logger.error(
				'LAMBDA_CALLBACK_SECRET is not configured — rejecting callback',
			);
			throw new UnauthorizedException(
				'Callback authentication not configured',
			);
		}

		if (!authHeader) {
			throw new UnauthorizedException('Missing Authorization header');
		}

		const parts = authHeader.split(' ');
		if (parts.length !== 2 || parts[0] !== 'Bearer') {
			throw new UnauthorizedException(
				'Invalid Authorization header format — expected Bearer <token>',
			);
		}

		const token = parts[1];

		// Constant-time comparison to prevent timing attacks
		try {
			const tokenBuf = Buffer.from(token, 'utf8');
			const secretBuf = Buffer.from(callbackSecret, 'utf8');

			if (
				tokenBuf.length !== secretBuf.length ||
				!timingSafeEqual(tokenBuf, secretBuf)
			) {
				throw new UnauthorizedException('Invalid Bearer token');
			}
		} catch (error) {
			if (error instanceof UnauthorizedException) {
				throw error;
			}
			throw new UnauthorizedException('Invalid Bearer token');
		}
	}

	/**
	 * Validate that all S3 keys in the DTO match the expected
	 * `site-scraper/{jobId}/` prefix. Prevents path traversal attacks
	 * where a malicious Lambda could write to arbitrary S3 keys.
	 */
	private validateS3Keys(dto: LambdaPageResultDto): void {
		const expectedPrefix = `site-scraper/${dto.jobId}/`;

		const keysToValidate: string[] = [];
		if (dto.htmlS3Key) {
			keysToValidate.push(dto.htmlS3Key);
		}
		for (const screenshot of dto.screenshots) {
			keysToValidate.push(screenshot.s3Key);
			if (screenshot.thumbnailS3Key) {
				keysToValidate.push(screenshot.thumbnailS3Key);
			}
		}

		for (const key of keysToValidate) {
			if (!key.startsWith(expectedPrefix)) {
				throw new BadRequestException(
					`S3 key "${key}" does not match expected prefix "${expectedPrefix}"`,
				);
			}
			// Block path traversal sequences
			if (key.includes('..') || key.includes('//')) {
				throw new BadRequestException(
					`S3 key "${key}" contains invalid path traversal characters`,
				);
			}
		}
	}
}
