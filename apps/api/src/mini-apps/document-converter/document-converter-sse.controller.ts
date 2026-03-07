/**
 * Document Converter SSE Controller
 *
 * Separate controller for the SSE events endpoint.
 * Does NOT use @RequiresApp because SSE connections authenticate
 * via short-lived tokens instead of JWT (EventSource API limitation).
 */
import {
	Controller,
	Get,
	Query,
	Res,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';

import { ConversionSseService } from './services/conversion-sse.service';
import {
	sseTokenStore,
	SSE_TOKEN_TTL_MS,
} from './document-converter.controller';

@Controller('apps/document-converter')
export class DocumentConverterSseController {
	private readonly logger = new Logger(DocumentConverterSseController.name);

	constructor(private readonly sseService: ConversionSseService) {}

	/**
	 * SSE endpoint for real-time job status updates.
	 *
	 * Uses token-based authentication instead of JWT because the browser's
	 * EventSource API doesn't support custom headers.
	 * Token is obtained from POST /apps/document-converter/sse-token (JWT-authenticated).
	 */
	@Get('events')
	async events(
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
