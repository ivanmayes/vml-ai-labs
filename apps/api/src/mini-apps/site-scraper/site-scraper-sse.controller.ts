/**
 * Site Scraper SSE Controller
 *
 * Separate controller for the SSE events endpoint.
 * Does NOT use @RequiresApp because SSE connections authenticate
 * via short-lived tokens instead of JWT (EventSource API limitation).
 */
import { createHmac, timingSafeEqual } from 'crypto';

import {
	Controller,
	Get,
	Param,
	Query,
	Res,
	Logger,
	UnauthorizedException,
	NotFoundException,
	BadRequestException,
	UnprocessableEntityException,
	ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';

import { ScrapeJob } from './entities/scrape-job.entity';
import { ScrapedPage } from './entities/scraped-page.entity';
import { PageStatus } from './types/job-status.enum';
import { ScraperSseService } from './services/scraper-sse.service';
import {
	SiteScraperExportService,
	ExportFormat,
} from './services/site-scraper-export.service';
import {
	sseTokenStore,
	SSE_TOKEN_TTL_MS,
	DOWNLOAD_TOKEN_SECRET,
} from './site-scraper.controller';

@Controller('organization/:orgId/apps/site-scraper')
@ApiTags('Site Scraper')
export class SiteScraperSseController {
	private readonly logger = new Logger(SiteScraperSseController.name);

	constructor(
		private readonly sseService: ScraperSseService,
		private readonly exportService: SiteScraperExportService,
		@InjectRepository(ScrapeJob)
		private readonly scrapeJobRepo: Repository<ScrapeJob>,
		@InjectRepository(ScrapedPage)
		private readonly scrapedPageRepo: Repository<ScrapedPage>,
	) {}

	/**
	 * SSE endpoint for real-time scrape job status updates.
	 *
	 * Uses token-based authentication instead of JWT because the browser's
	 * EventSource API doesn't support custom headers.
	 * Token is obtained from POST /apps/site-scraper/sse-token (JWT-authenticated).
	 */
	@Get('events')
	@ApiOperation({
		summary: 'SSE endpoint for real-time scrape job updates',
	})
	@ApiResponse({
		status: 200,
		description: 'SSE stream established',
	})
	@ApiResponse({
		status: 401,
		description: 'Invalid or expired SSE token',
	})
	@ApiQuery({ name: 'token', required: true, type: String })
	async events(
		@Param('orgId') orgId: string,
		@Query('token') token: string,
		@Res() res: Response,
	): Promise<void> {
		if (!token) {
			throw new UnauthorizedException('SSE token is required');
		}

		const tokenData = sseTokenStore.get(token);

		if (!tokenData) {
			throw new UnauthorizedException('Invalid or expired SSE token');
		}

		const age = Date.now() - tokenData.createdAt.getTime();
		if (age > SSE_TOKEN_TTL_MS) {
			sseTokenStore.delete(token);
			throw new UnauthorizedException('SSE token has expired');
		}

		// Verify the orgId in the URL matches the token's organization
		if (tokenData.organizationId !== orgId) {
			sseTokenStore.delete(token);
			throw new UnauthorizedException(
				'Token organization does not match request',
			);
		}

		// Consume the token (single use)
		sseTokenStore.delete(token);

		const { userId, organizationId } = tokenData;
		this.logger.debug(`SSE connection from user ${userId}`);

		const connectionId = this.sseService.addConnection(
			res,
			userId,
			organizationId,
		);

		this.logger.log(`SSE connection established: ${connectionId}`);
	}

	/**
	 * Stream a ZIP export of job pages.
	 * Uses HMAC token auth (no JWT) — same pattern as SSE events endpoint.
	 */
	@Get('jobs/:jobId/download')
	@ApiOperation({ summary: 'Download bulk export as streaming ZIP' })
	@ApiResponse({ status: 200, description: 'Streaming ZIP file' })
	@ApiResponse({ status: 400, description: 'Invalid format parameter' })
	@ApiResponse({
		status: 401,
		description: 'Invalid or expired download token',
	})
	@ApiResponse({ status: 404, description: 'Job not found' })
	async streamDownload(
		@Res() res: Response,
		@Param('orgId') orgId: string,
		@Param('jobId', ParseUUIDPipe) jobId: string,
		@Query('token') token: string,
		@Query('format') format: string,
	): Promise<void> {
		// 1. Validate HMAC token
		if (!token) {
			throw new UnauthorizedException('Download token required');
		}

		const dotIndex = token.lastIndexOf('.');
		if (dotIndex === -1) {
			throw new UnauthorizedException('Invalid download token');
		}

		const payloadB64 = token.substring(0, dotIndex);
		const sig = token.substring(dotIndex + 1);

		let tokenData: {
			jobId: string;
			userId: string;
			orgId: string;
			exp: number;
		};
		try {
			const payload = Buffer.from(payloadB64, 'base64url').toString();
			const expected = createHmac('sha256', DOWNLOAD_TOKEN_SECRET)
				.update(payload)
				.digest('hex');

			const sigBuf = Buffer.from(sig, 'hex');
			const expectedBuf = Buffer.from(expected, 'hex');

			if (
				sigBuf.length !== expectedBuf.length ||
				!timingSafeEqual(sigBuf, expectedBuf)
			) {
				throw new Error('Invalid signature');
			}

			tokenData = JSON.parse(payload);
		} catch {
			throw new UnauthorizedException('Invalid download token');
		}

		if (tokenData.exp < Date.now()) {
			throw new UnauthorizedException('Download token expired');
		}

		if (tokenData.jobId !== jobId || tokenData.orgId !== orgId) {
			throw new UnauthorizedException('Token does not match this job');
		}

		// 2. Validate format parameter
		const VALID_FORMATS: ExportFormat[] = [
			'html',
			'markdown',
			'screenshots',
		];
		const requestedFormats = (format || '')
			.split(',')
			.map((f) => f.trim().toLowerCase())
			.filter((f) => VALID_FORMATS.includes(f as ExportFormat));

		if (requestedFormats.length === 0) {
			throw new BadRequestException(
				'At least one valid format required. Allowed: html, markdown, screenshots',
			);
		}

		const formats = new Set<ExportFormat>(
			requestedFormats as ExportFormat[],
		);

		// 3. Load job and pages
		const job = await this.scrapeJobRepo.findOne({
			where: {
				id: jobId,
				userId: tokenData.userId,
				organizationId: orgId,
			},
		});

		if (!job) {
			throw new NotFoundException(`Job ${jobId} not found`);
		}

		const pages = await this.scrapedPageRepo.find({
			where: {
				scrapeJobId: jobId,
				status: PageStatus.COMPLETED,
			},
			order: { createdAt: 'ASC' },
		});

		if (pages.length === 0) {
			throw new UnprocessableEntityException(
				'No completed pages to download',
			);
		}

		// 4. Set response headers BEFORE piping
		let hostname: string;
		try {
			hostname = new URL(job.url).hostname.replace(
				/[^a-zA-Z0-9.-]/g,
				'-',
			);
		} catch {
			hostname = 'export';
		}
		const filename = `${hostname}-${jobId.substring(0, 8)}.zip`;

		res.set({
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no',
			'Referrer-Policy': 'no-referrer',
			'Content-Encoding': 'identity',
		});

		// 5. Stream the ZIP
		try {
			await this.exportService.streamJobExport(job, pages, formats, res);
		} catch (err) {
			this.logger.error(`Download stream error for job ${jobId}:`, err);
			if (!res.headersSent) {
				res.status(500).json({ error: 'Download failed' });
			} else if (!(res as any).destroyed) {
				res.destroy();
			}
		}
	}
}
