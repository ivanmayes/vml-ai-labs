/**
 * Text Counter Extraction Controller
 *
 * Accepts a multipart image upload + `mode` (general | template) and
 * an optional `templateId`, runs the vision-extraction pipeline, and
 * returns the structured text. Nothing about the image or the
 * extracted text is persisted.
 *
 * Auth: JWT + `@RequiresApp('text-counter')` (HasAppAccessGuard runs
 * globally on the `RequiresApp` metadata).
 */

import {
	BadRequestException,
	Body,
	Controller,
	HttpCode,
	HttpException,
	HttpStatus,
	Logger,
	Post,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentOrg, RequiresApp } from '../../_platform/decorators';
import { DomainError } from '../../_platform/errors/domain.errors';
import { ResponseEnvelope, ResponseStatus } from '../../_platform/models';

import { ExtractRequestDto } from './dtos';
import { ExtractionService } from './services/extraction.service';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

@RequiresApp('text-counter')
@UseGuards(AuthGuard('jwt'))
@Controller('organization/:orgId/apps/text-counter')
export class ExtractionController {
	private readonly logger = new Logger(ExtractionController.name);

	constructor(private readonly extractionService: ExtractionService) {}

	@Post('extract')
	@HttpCode(HttpStatus.OK)
	@UseInterceptors(
		FileInterceptor('file', {
			storage: memoryStorage(),
			limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
		}),
	)
	async extract(
		@CurrentOrg() orgId: string,
		@UploadedFile() file: Express.Multer.File,
		@Body() body: ExtractRequestDto,
	): Promise<ResponseEnvelope> {
		if (!file) {
			throw new BadRequestException('No file provided');
		}

		try {
			const result = await this.extractionService.extract({
				dto: body,
				orgId,
				file,
			});
			return new ResponseEnvelope(
				ResponseStatus.Success,
				undefined,
				result,
			);
		} catch (err) {
			throw this.mapError(err);
		}
	}

	/**
	 * Map domain errors from file validation into the project's
	 * ResponseEnvelope-shaped HTTP responses. NestJS HttpExceptions
	 * (BadGatewayException, NotFoundException) propagate as-is — Nest
	 * already serializes them correctly. Unknown errors fall back to a
	 * generic 500 without leaking the underlying message.
	 */
	private mapError(err: unknown): HttpException | Error {
		if (err instanceof HttpException) {
			return err;
		}
		if (err instanceof DomainError) {
			return new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, err.message, {
					code: err.code,
				}),
				err.httpStatus,
			);
		}
		this.logger.error(
			'Unexpected error in text-counter extract',
			err as Error,
		);
		return new HttpException(
			new ResponseEnvelope(ResponseStatus.Error, 'Internal server error'),
			HttpStatus.INTERNAL_SERVER_ERROR,
		);
	}
}
