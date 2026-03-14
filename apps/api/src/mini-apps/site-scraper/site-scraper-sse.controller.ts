/**
 * Site Scraper SSE Controller
 *
 * Separate controller for the SSE events endpoint.
 * Does NOT use @RequiresApp because SSE connections authenticate
 * via short-lived tokens instead of JWT (EventSource API limitation).
 */
import {
	Controller,
	Get,
	Param,
	Query,
	Res,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';

import { ScraperSseService } from './services/scraper-sse.service';
import { sseTokenStore, SSE_TOKEN_TTL_MS } from './site-scraper.controller';

@Controller('organization/:orgId/apps/site-scraper')
@ApiTags('Site Scraper')
export class SiteScraperSseController {
	private readonly logger = new Logger(SiteScraperSseController.name);

	constructor(private readonly sseService: ScraperSseService) {}

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
}
