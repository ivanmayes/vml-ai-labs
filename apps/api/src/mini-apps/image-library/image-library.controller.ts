/**
 * Image Library Controller
 *
 * REST endpoints for the per-space image library mini-app. All routes are
 * gated by JWT, app-access (organization has the app enabled), and
 * space-access (caller is a member of the space).
 */
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpException,
	HttpStatus,
	Logger,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
	Res,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentOrg, RequiresApp } from '../../_platform/decorators';
import { DomainError } from '../../_platform/errors/domain.errors';
import { ImageFileValidationService } from '../../_platform/files';
import { ResponseEnvelope, ResponseStatus } from '../../_platform/models';
import { SpaceAccessGuard } from '../../space/guards/space-access.guard';

import { ListImagesQueryDto, TagSuggestQueryDto, UploadImageDto } from './dtos';
import { ImageLibraryService } from './services/image-library.service';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

interface AuthenticatedRequest extends Request {
	user: { id: string; organizationId: string };
}

@RequiresApp('image-library')
@UseGuards(AuthGuard('jwt'), SpaceAccessGuard)
@Controller('organization/:orgId/space/:spaceId/apps/image-library')
export class ImageLibraryController {
	private readonly logger = new Logger(ImageLibraryController.name);

	constructor(
		private readonly imageLibraryService: ImageLibraryService,
		private readonly imageFileValidationService: ImageFileValidationService,
	) {}

	@Post('images')
	@HttpCode(HttpStatus.CREATED)
	@UseInterceptors(
		FileInterceptor('file', {
			storage: memoryStorage(),
			limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
		}),
	)
	async upload(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('spaceId', new ParseUUIDPipe()) spaceId: string,
		@UploadedFile() file: Express.Multer.File,
		@Body() body: UploadImageDto,
	): Promise<ResponseEnvelope> {
		if (!file) {
			throw new BadRequestException('No file provided');
		}

		let validated;
		try {
			validated =
				await this.imageFileValidationService.validateFile(file);
		} catch (err) {
			throw this.mapDomainError(err);
		}

		const created = await this.imageLibraryService
			.createImage({
				orgId,
				spaceId,
				userId: req.user.id,
				file: validated,
				tags: body.tags ?? [],
			})
			.catch((err) => {
				throw this.mapDomainError(err);
			});

		return new ResponseEnvelope(ResponseStatus.Success, undefined, created);
	}

	@Get('images')
	async list(
		@CurrentOrg() orgId: string,
		@Param('spaceId', new ParseUUIDPipe()) spaceId: string,
		@Query() query: ListImagesQueryDto,
	): Promise<ResponseEnvelope> {
		const result = await this.imageLibraryService.listImages({
			orgId,
			spaceId,
			tags: query.tags,
			page: query.page,
			pageSize: query.pageSize,
			sort: query.sort,
		});
		return new ResponseEnvelope(ResponseStatus.Success, undefined, result);
	}

	@Get('images/:id/content')
	async streamImage(
		@CurrentOrg() orgId: string,
		@Param('spaceId', new ParseUUIDPipe()) spaceId: string,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Res() res: Response,
	): Promise<void> {
		const { stream, mime, filename } =
			await this.imageLibraryService.getImageStream(id, orgId, spaceId);
		res.setHeader('Content-Type', mime);
		res.setHeader(
			'Content-Disposition',
			`inline; filename="${filename.replace(/"/g, '')}"`,
		);
		res.setHeader('Cache-Control', 'private, max-age=300');
		stream.pipe(res);
	}

	@Delete('images/:id')
	async delete(
		@CurrentOrg() orgId: string,
		@Param('spaceId', new ParseUUIDPipe()) spaceId: string,
		@Param('id', new ParseUUIDPipe()) id: string,
	): Promise<ResponseEnvelope> {
		await this.imageLibraryService.deleteImage(id, orgId, spaceId);
		return new ResponseEnvelope(ResponseStatus.Success);
	}

	@Get('tags')
	async suggestTags(
		@CurrentOrg() orgId: string,
		@Param('spaceId', new ParseUUIDPipe()) spaceId: string,
		@Query() query: TagSuggestQueryDto,
	): Promise<ResponseEnvelope> {
		const result = await this.imageLibraryService.suggestTags(
			orgId,
			spaceId,
			query.q ?? '',
			query.limit ?? 20,
		);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, result);
	}

	private mapDomainError(err: unknown): HttpException {
		if (err instanceof DomainError) {
			return new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, err.message, {
					code: err.code,
				}),
				err.httpStatus,
			);
		}
		this.logger.error('Unexpected error in image-library', err as Error);
		return new HttpException(
			new ResponseEnvelope(ResponseStatus.Error, 'Internal server error'),
			HttpStatus.INTERNAL_SERVER_ERROR,
		);
	}
}
