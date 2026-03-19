/**
 * Site Scraper Controller
 *
 * REST endpoints for website scraping operations within the mini-app platform.
 * All endpoints require JWT authentication and scope access by user/organization.
 */
import { createHmac } from 'crypto';

import {
	Controller,
	Get,
	Post,
	Delete,
	Body,
	Param,
	Query,
	Req,
	UseGuards,
	ParseUUIDPipe,
	ParseIntPipe,
	DefaultValuePipe,
	HttpCode,
	HttpStatus,
	Logger,
	NotFoundException,
	ForbiddenException,
	BadRequestException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
} from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequiresApp, CurrentOrg } from '../../_platform/decorators';
import {
	ResponseEnvelope,
	ResponseEnvelopeFind,
	ResponseStatus,
	SortStrategy,
} from '../../_platform/models';
import { AwsS3Service } from '../../_platform/aws';
import {
	JobNotFoundError,
	InvalidStatusTransitionError,
} from '../../_platform/errors/domain.errors';
import { Roles } from '../../user/auth/roles.decorator';
import { RolesGuard } from '../../user/auth/roles.guard';
import { UserRole } from '../../user/user-role.enum';

import { ScrapeJob } from './entities/scrape-job.entity';
import { ScrapedPage } from './entities/scraped-page.entity';
import { CreateScrapeJobDto } from './dtos/create-scrape-job.dto';
import { JobStatus, isActiveStatus } from './types/job-status.enum';
import { SiteScraperService } from './services/site-scraper.service';

/**
 * In-memory SSE token store.
 * Maps token -> { userId, organizationId, createdAt }
 * Exported for use by the SSE events controller.
 */
export const sseTokenStore = new Map<
	string,
	{ userId: string; organizationId: string; createdAt: Date }
>();

/** SSE token expiry: 5 minutes */
export const SSE_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Download token expiry: 5 minutes */
const DOWNLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;

/** HMAC secret for download token signing/verification */
export const DOWNLOAD_TOKEN_SECRET =
	process.env.PII_SIGNING_KEY ||
	process.env.PRIVATE_KEY ||
	'download-token-secret';

// Periodic cleanup of expired tokens (every 60 seconds)
setInterval(() => {
	const now = Date.now();
	for (const [token, data] of sseTokenStore) {
		if (now - data.createdAt.getTime() > SSE_TOKEN_TTL_MS) {
			sseTokenStore.delete(token);
		}
	}
}, 60_000).unref();

/**
 * Request type with authenticated user
 */
interface AuthenticatedRequest extends Request {
	user: {
		id: string;
		organizationId: string;
		[key: string]: unknown;
	};
}

@RequiresApp('site-scraper')
@Controller('organization/:orgId/apps/site-scraper')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Site Scraper')
export class SiteScraperController {
	private readonly logger = new Logger(SiteScraperController.name);

	constructor(
		@InjectRepository(ScrapeJob)
		private readonly scrapeJobRepo: Repository<ScrapeJob>,
		@InjectRepository(ScrapedPage)
		private readonly scrapedPageRepo: Repository<ScrapedPage>,
		private readonly s3Service: AwsS3Service,
		private readonly siteScraperService: SiteScraperService,
	) {}

	/**
	 * Create a new scrape job.
	 *
	 * Validates the DTO, creates a job record, and queues it for processing.
	 */
	@Post('jobs')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({ summary: 'Create a new scrape job' })
	@ApiResponse({ status: 201, description: 'Job created successfully' })
	@ApiResponse({ status: 400, description: 'Invalid request body' })
	async createJob(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Body() dto: CreateScrapeJobDto,
	): Promise<ResponseEnvelope> {
		this.logger.log(
			`Create job request from user ${req.user.id}: ${dto.url}`,
		);

		const saved = await this.siteScraperService.createJob(
			dto.url,
			dto.maxDepth ?? 3,
			dto.viewports ?? [1920],
			req.user.id,
			orgId,
			dto.hints ?? null,
		);

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			id: saved.id,
			url: saved.url,
			maxDepth: saved.maxDepth,
			viewports: saved.viewports,
			status: saved.status,
			createdAt: saved.createdAt,
		});
	}

	/**
	 * List scrape jobs for current user with pagination.
	 */
	@Get('jobs')
	@ApiOperation({ summary: 'List scrape jobs for the current user' })
	@ApiResponse({ status: 200, description: 'Paginated list of jobs' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'perPage', required: false, type: Number })
	@ApiQuery({ name: 'sortBy', required: false, type: String })
	@ApiQuery({ name: 'order', required: false, enum: SortStrategy })
	async listJobs(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('perPage', new DefaultValuePipe(10), ParseIntPipe)
		perPage: number,
		@Query('sortBy') sortBy?: string,
		@Query('order', new DefaultValuePipe('DESC'))
		sortOrder?: SortStrategy,
	): Promise<ResponseEnvelope> {
		perPage = perPage > 50 ? 50 : perPage;

		const ALLOWED_SORT_FIELDS: (keyof ScrapeJob)[] = [
			'createdAt',
			'updatedAt',
			'status',
			'url',
			'pagesCompleted',
			'pagesDiscovered',
		];
		const validSortBy: keyof ScrapeJob =
			sortBy && ALLOWED_SORT_FIELDS.includes(sortBy as keyof ScrapeJob)
				? (sortBy as keyof ScrapeJob)
				: 'createdAt';

		const [results, totalResults] = await this.scrapeJobRepo.findAndCount({
			where: {
				userId: req.user.id,
				organizationId: orgId,
			},
			order: {
				[validSortBy]: sortOrder || SortStrategy.DESC,
			},
			skip: (page - 1) * perPage,
			take: perPage,
		});

		const queuePositions =
			await this.siteScraperService.getQueuePositions();

		// Build positions map for jobs on this page only
		const queuePositionsMap: Record<string, number> = {};
		for (const job of results) {
			if (queuePositions.has(job.id)) {
				queuePositionsMap[job.id] = queuePositions.get(job.id)!;
			}
		}

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			page,
			perPage,
			numPages: Math.ceil(totalResults / perPage) || 1,
			totalResults,
			results,
			queuePositions: queuePositionsMap,
		});
	}

	/**
	 * List ALL scrape jobs in the organization (admin only).
	 */
	@Get('jobs/admin')
	@UseGuards(RolesGuard)
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@ApiOperation({
		summary: 'List all scrape jobs in the organization (admin)',
	})
	@ApiResponse({ status: 200, description: 'Paginated list of all org jobs' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'perPage', required: false, type: Number })
	async listAdminJobs(
		@CurrentOrg() orgId: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('perPage', new DefaultValuePipe(20), ParseIntPipe)
		perPage: number,
	): Promise<ResponseEnvelope> {
		perPage = perPage > 50 ? 50 : perPage;

		const [results, totalResults] = await this.scrapeJobRepo.findAndCount({
			where: { organizationId: orgId },
			relations: ['user'],
			order: { createdAt: 'DESC' },
			skip: (page - 1) * perPage,
			take: perPage,
		});

		const queuePositions =
			await this.siteScraperService.getQueuePositions();

		const queuePositionsMap: Record<string, number> = {};
		for (const job of results) {
			if (queuePositions.has(job.id)) {
				queuePositionsMap[job.id] = queuePositions.get(job.id)!;
			}
		}

		// Map user info onto results
		const mappedResults = results.map((job) => ({
			...job,
			userEmail: job.user?.email ?? null,
			user: undefined,
		}));

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			page,
			perPage,
			numPages: Math.ceil(totalResults / perPage) || 1,
			totalResults,
			results: mappedResults,
			queuePositions: queuePositionsMap,
		});
	}

	/**
	 * Cancel any active job in the organization (admin only).
	 */
	@Post('jobs/:jobId/admin/cancel')
	@HttpCode(HttpStatus.OK)
	@UseGuards(RolesGuard)
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@ApiOperation({ summary: 'Cancel any active job in the org (admin)' })
	@ApiResponse({ status: 200, description: 'Job cancelled' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiParam({ name: 'jobId', type: String, format: 'uuid' })
	async adminCancelJob(
		@CurrentOrg() orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
	): Promise<ResponseEnvelope> {
		try {
			const job = await this.siteScraperService.adminCancelJob(
				jobId,
				orgId,
			);

			return new ResponseEnvelope(
				ResponseStatus.Success,
				'Job cancelled',
				job,
			);
		} catch (error) {
			if (error instanceof JobNotFoundError) {
				throw new NotFoundException(error.message);
			}
			if (error instanceof InvalidStatusTransitionError) {
				throw new BadRequestException(error.message);
			}
			throw error;
		}
	}

	/**
	 * Get a single scrape job by ID.
	 */
	@Get('jobs/:jobId')
	@ApiOperation({ summary: 'Get scrape job details by ID' })
	@ApiResponse({ status: 200, description: 'Job details' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiParam({ name: 'jobId', type: String, format: 'uuid' })
	async getJob(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
	): Promise<ResponseEnvelope> {
		const job = await this.scrapeJobRepo.findOne({
			where: {
				id: jobId,
				userId: req.user.id,
				organizationId: orgId,
			},
		});

		if (!job) {
			throw new NotFoundException(`Job ${jobId} not found`);
		}

		let queuePosition: number | null = null;
		if (isActiveStatus(job.status)) {
			const positions = await this.siteScraperService.getQueuePositions();
			queuePosition = positions.get(jobId) ?? null;
		}

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			...job,
			queuePosition,
		});
	}

	/**
	 * Delete a scrape job.
	 * Cancels the job if it is still running, then deletes it along with
	 * associated pages and S3 objects.
	 */
	@Delete('jobs/:jobId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Delete a scrape job and clean up S3 artifacts' })
	@ApiResponse({ status: 200, description: 'Job deleted successfully' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiParam({ name: 'jobId', type: String, format: 'uuid' })
	async deleteJob(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
	): Promise<ResponseEnvelope> {
		const job = await this.scrapeJobRepo.findOne({
			where: {
				id: jobId,
				userId: req.user.id,
				organizationId: orgId,
			},
		});

		if (!job) {
			throw new NotFoundException(`Job ${jobId} not found`);
		}

		// Cancel if still active
		if (isActiveStatus(job.status)) {
			job.transitionTo(JobStatus.CANCELLED);
			await this.scrapeJobRepo.save(job);
		}

		// Collect S3 keys to clean up
		const pages = await this.scrapedPageRepo.find({
			where: { scrapeJobId: jobId },
		});

		const s3Keys: string[] = [];
		for (const page of pages) {
			if (page.htmlS3Key) {
				s3Keys.push(page.htmlS3Key);
			}
			for (const screenshot of page.screenshots) {
				s3Keys.push(screenshot.s3Key);
				if (screenshot.thumbnailS3Key) {
					s3Keys.push(screenshot.thumbnailS3Key);
				}
			}
		}

		// Delete S3 objects in batch
		if (s3Keys.length > 0) {
			try {
				await this.s3Service.deleteMany(s3Keys);
			} catch (error) {
				this.logger.error(
					`Failed to clean up S3 objects for job ${jobId}:`,
					error,
				);
			}
		}

		// Delete the job (cascades to pages)
		await this.scrapeJobRepo.remove(job);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Job deleted successfully',
			{ id: jobId },
		);
	}

	/**
	 * Retry a failed, errored, or cancelled scrape job.
	 * Cleans up failed pages, resets the job, and re-queues it.
	 */
	@Post('jobs/:jobId/retry')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Retry a failed or cancelled scrape job' })
	@ApiResponse({ status: 200, description: 'Job retried successfully' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiResponse({
		status: 400,
		description: 'Job is not in a retryable status',
	})
	@ApiParam({ name: 'jobId', type: String, format: 'uuid' })
	async retryJob(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
	): Promise<ResponseEnvelope> {
		try {
			const updatedJob = await this.siteScraperService.retryJob(
				jobId,
				orgId,
				req.user.id,
			);

			return new ResponseEnvelope(
				ResponseStatus.Success,
				undefined,
				updatedJob,
			);
		} catch (error) {
			if (error instanceof JobNotFoundError) {
				throw new NotFoundException(error.message);
			}
			if (error instanceof InvalidStatusTransitionError) {
				throw new BadRequestException(error.message);
			}
			throw error;
		}
	}

	/**
	 * Re-queue a PENDING job that was never picked up by pg-boss.
	 */
	@Post('jobs/:jobId/requeue')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Re-queue a stuck PENDING job' })
	@ApiResponse({ status: 200, description: 'Job re-queued successfully' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiResponse({
		status: 400,
		description: 'Job is not in PENDING status',
	})
	@ApiParam({ name: 'jobId', type: String, format: 'uuid' })
	async requeueJob(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
	): Promise<ResponseEnvelope> {
		try {
			const updatedJob = await this.siteScraperService.requeueJob(
				jobId,
				orgId,
				req.user.id,
			);

			return new ResponseEnvelope(
				ResponseStatus.Success,
				'Job re-queued successfully',
				updatedJob,
			);
		} catch (error) {
			if (error instanceof JobNotFoundError) {
				throw new NotFoundException(error.message);
			}
			if (error instanceof InvalidStatusTransitionError) {
				throw new BadRequestException(error.message);
			}
			throw error;
		}
	}

	/**
	 * List scraped pages for a specific job with pagination.
	 */
	@Get('jobs/:jobId/pages')
	@ApiOperation({ summary: 'List scraped pages for a job' })
	@ApiResponse({ status: 200, description: 'Paginated list of pages' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiParam({ name: 'jobId', type: String, format: 'uuid' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'perPage', required: false, type: Number })
	async getPages(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('perPage', new DefaultValuePipe(20), ParseIntPipe)
		perPage: number,
	): Promise<ResponseEnvelopeFind<ScrapedPage>> {
		// Verify job ownership
		const job = await this.scrapeJobRepo.findOne({
			where: {
				id: jobId,
				userId: req.user.id,
				organizationId: orgId,
			},
		});

		if (!job) {
			throw new NotFoundException(`Job ${jobId} not found`);
		}

		perPage = perPage > 100 ? 100 : perPage;

		const [results, totalResults] = await this.scrapedPageRepo.findAndCount(
			{
				where: { scrapeJobId: jobId },
				order: { createdAt: 'ASC' },
				skip: (page - 1) * perPage,
				take: perPage,
			},
		);

		return new ResponseEnvelopeFind(ResponseStatus.Success, undefined, {
			page,
			perPage,
			numPages: Math.ceil(totalResults / perPage) || 1,
			totalResults,
			results,
		});
	}

	/**
	 * Get batch presigned URLs for screenshots in a job.
	 * Used by the gallery view to load screenshot thumbnails efficiently.
	 */
	@Get('jobs/:jobId/presigned-urls')
	@ApiOperation({
		summary: 'Get batch presigned URLs for job screenshots',
	})
	@ApiResponse({
		status: 200,
		description: 'Batch of presigned screenshot URLs',
	})
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiParam({ name: 'jobId', type: String, format: 'uuid' })
	@ApiQuery({ name: 'viewport', required: true, type: Number })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'pageSize', required: false, type: Number })
	async getBatchPresignedUrls(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
		@Query('viewport', ParseIntPipe) viewport: number,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('pageSize', new DefaultValuePipe(20), ParseIntPipe)
		pageSize: number,
	): Promise<ResponseEnvelope> {
		// Verify job ownership
		const job = await this.scrapeJobRepo.findOne({
			where: {
				id: jobId,
				userId: req.user.id,
				organizationId: orgId,
			},
		});

		if (!job) {
			throw new NotFoundException(`Job ${jobId} not found`);
		}

		pageSize = pageSize > 50 ? 50 : pageSize;

		const [pages, totalResults] = await this.scrapedPageRepo.findAndCount({
			where: { scrapeJobId: jobId },
			order: { createdAt: 'ASC' },
			skip: (page - 1) * pageSize,
			take: pageSize,
		});

		// Generate presigned URLs for the requested viewport (baseline only)
		const urls = await Promise.all(
			pages.map(async (scrapedPage) => {
				// Prefer baseline screenshot; fall back to first matching viewport
				const screenshot =
					scrapedPage.screenshots.find(
						(s) =>
							s.viewport === viewport &&
							(!s.snapshotTiming ||
								s.snapshotTiming === 'baseline'),
					) ||
					scrapedPage.screenshots.find(
						(s) => s.viewport === viewport,
					);

				if (!screenshot) {
					return {
						pageId: scrapedPage.id,
						url: scrapedPage.url,
						title: scrapedPage.title,
						presignedUrl: null,
					};
				}

				// Prefer thumbnail for gallery view, fall back to full-res
				const s3Key = screenshot.thumbnailS3Key || screenshot.s3Key;
				const presignedUrl = await this.s3Service.generatePresignedUrl({
					key: s3Key,
					expiresIn: 3600,
				});

				return {
					pageId: scrapedPage.id,
					url: scrapedPage.url,
					title: scrapedPage.title,
					presignedUrl,
				};
			}),
		);

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			viewport,
			page,
			pageSize,
			totalResults,
			numPages: Math.ceil(totalResults / pageSize) || 1,
			urls,
		});
	}

	/**
	 * Get a presigned URL for a page screenshot.
	 * Verifies organization ownership through the parent job.
	 */
	@Get('pages/:pageId/screenshot')
	@ApiOperation({
		summary: 'Get presigned URL for a page screenshot',
	})
	@ApiResponse({ status: 200, description: 'Presigned screenshot URL' })
	@ApiResponse({ status: 404, description: 'Page or screenshot not found' })
	@ApiParam({ name: 'pageId', type: String, format: 'uuid' })
	@ApiQuery({ name: 'viewport', required: true, type: Number })
	@ApiQuery({
		name: 's3Key',
		required: false,
		type: String,
		description:
			'Specific S3 key to fetch (for hint screenshots). Must belong to this page.',
	})
	async getScreenshot(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('pageId', ParseUUIDPipe) pageId: string,
		@Query('viewport', ParseIntPipe) viewport: number,
		@Query('s3Key') s3Key?: string,
	): Promise<ResponseEnvelope> {
		// Verify org ownership by joining through the parent job
		const page = await this.scrapedPageRepo.findOne({
			where: { id: pageId },
			relations: ['scrapeJob'],
		});

		if (!page) {
			throw new NotFoundException(`Page ${pageId} not found`);
		}

		if (
			page.scrapeJob.organizationId !== orgId ||
			page.scrapeJob.userId !== req.user.id
		) {
			throw new ForbiddenException('You do not have access to this page');
		}

		let screenshot;
		if (s3Key) {
			// Find by exact S3 key — used for hint screenshots
			screenshot = page.screenshots.find((s) => s.s3Key === s3Key);
		} else {
			// Default: find the baseline screenshot for the viewport
			screenshot = page.screenshots.find(
				(s) =>
					s.viewport === viewport &&
					(!s.snapshotTiming || s.snapshotTiming === 'baseline'),
			);
			// Fallback to first matching viewport (backward compat)
			if (!screenshot) {
				screenshot = page.screenshots.find(
					(s) => s.viewport === viewport,
				);
			}
		}

		if (!screenshot) {
			throw new NotFoundException(
				`No screenshot found for viewport ${viewport}`,
			);
		}

		const presignedUrl = await this.s3Service.generatePresignedUrl({
			key: screenshot.s3Key,
			expiresIn: 3600,
		});

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			pageId: page.id,
			viewport,
			presignedUrl,
		});
	}

	/**
	 * Get a presigned URL for downloading a page's HTML snapshot.
	 * Forces Content-Disposition: attachment for security (prevents XSS).
	 * Content-Type set to text/plain to prevent browser interpretation.
	 */
	@Get('pages/:pageId/html')
	@ApiOperation({
		summary: 'Get presigned URL for a page HTML snapshot download',
	})
	@ApiResponse({
		status: 200,
		description: 'Presigned HTML download URL',
	})
	@ApiResponse({ status: 404, description: 'Page or HTML not found' })
	@ApiParam({ name: 'pageId', type: String, format: 'uuid' })
	async getHtml(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('pageId', ParseUUIDPipe) pageId: string,
	): Promise<ResponseEnvelope> {
		// Verify org ownership by joining through the parent job
		const page = await this.scrapedPageRepo.findOne({
			where: { id: pageId },
			relations: ['scrapeJob'],
		});

		if (!page) {
			throw new NotFoundException(`Page ${pageId} not found`);
		}

		if (
			page.scrapeJob.organizationId !== orgId ||
			page.scrapeJob.userId !== req.user.id
		) {
			throw new ForbiddenException('You do not have access to this page');
		}

		if (!page.htmlS3Key) {
			throw new NotFoundException(
				`No HTML snapshot available for page ${pageId}`,
			);
		}

		// Generate a safe filename from the page URL
		const hostname = new URL(page.url).hostname;
		const safeFilename = `${hostname}-${pageId.slice(0, 8)}.html`;

		const presignedUrl = await this.s3Service.generatePresignedUrl({
			key: page.htmlS3Key,
			expiresIn: 3600,
			// Force download attachment to prevent XSS via served HTML
			responseContentDisposition: `attachment; filename="${safeFilename}"`,
			// Serve as text/plain to prevent browser from rendering HTML
			responseContentType: 'text/plain',
		});

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			pageId: page.id,
			filename: safeFilename,
			presignedUrl,
		});
	}

	/**
	 * Generate a short-lived token for SSE connection.
	 *
	 * Returns a UUID token that can be used to connect to the SSE endpoint.
	 * Token is stored in memory and valid for 5 minutes.
	 */
	@Post('sse-token')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary: 'Generate a single-use token for SSE connection',
	})
	@ApiResponse({
		status: 201,
		description: 'SSE token generated successfully',
	})
	async generateSseToken(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
	): Promise<ResponseEnvelope> {
		this.logger.debug(`SSE token requested by user ${req.user.id}`);

		const token = uuidv4();
		const createdAt = new Date();

		sseTokenStore.set(token, {
			userId: req.user.id,
			organizationId: orgId,
			createdAt,
		});

		const expiresAt = new Date(createdAt.getTime() + SSE_TOKEN_TTL_MS);

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			token,
			expiresAt,
			expiresIn: SSE_TOKEN_TTL_MS / 1000,
		});
	}

	/**
	 * Generate an HMAC-signed download token for bulk export.
	 * The token is stateless and works on any dyno.
	 */
	@Post('jobs/:jobId/download-token')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Generate a download token for bulk export' })
	@ApiResponse({ status: 200, description: 'Download token generated' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiResponse({ status: 422, description: 'No completed pages to download' })
	async generateDownloadToken(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
	): Promise<ResponseEnvelope> {
		const job = await this.scrapeJobRepo.findOne({
			where: {
				id: jobId,
				userId: req.user.id,
				organizationId: orgId,
			},
		});

		if (!job) {
			throw new NotFoundException(`Job ${jobId} not found`);
		}

		if (job.pagesCompleted === 0) {
			throw new UnprocessableEntityException(
				'No completed pages to download',
			);
		}

		// HMAC-sign the token payload — stateless, works on any dyno
		const payload = JSON.stringify({
			jobId,
			userId: req.user.id,
			orgId,
			exp: Date.now() + DOWNLOAD_TOKEN_TTL_MS,
		});
		const signature = createHmac('sha256', DOWNLOAD_TOKEN_SECRET)
			.update(payload)
			.digest('hex');
		const token =
			Buffer.from(payload).toString('base64url') + '.' + signature;

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			token,
		});
	}
}
