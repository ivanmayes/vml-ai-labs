/**
 * Document Converter Controller
 *
 * REST endpoints for document conversion operations within the mini-app platform.
 * All endpoints require JWT authentication and scope access by user/organization.
 */
import {
	Controller,
	Get,
	Post,
	Delete,
	Param,
	Body,
	Query,
	Req,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	ParseUUIDPipe,
	HttpCode,
	HttpStatus,
	Logger,
	BadRequestException,
	HttpException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiConsumes,
	ApiParam,
	ApiBearerAuth,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';

import { RequiresApp, CurrentOrg } from '../../_platform/decorators';
import { ResponseEnvelope, ResponseStatus } from '../../_platform/models';
import { PgBossService } from '../../_platform/queue';
import { AwsS3Service } from '../../_platform/aws';
import { DomainError } from '../../_platform/errors/domain.errors';

import { ConversionService } from './services/conversion.service';
import { FileValidationService } from './services/file-validation.service';
import { UploadFileDto } from './dtos/upload-file.dto';
import { JobListQueryDto } from './dtos/job-list-query.dto';

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

@ApiTags('Document Converter')
@ApiBearerAuth()
@RequiresApp('document-converter')
@Controller('organization/:orgId/apps/document-converter')
export class DocumentConverterController {
	private readonly logger = new Logger(DocumentConverterController.name);

	constructor(
		private readonly conversionService: ConversionService,
		private readonly fileValidationService: FileValidationService,
		private readonly s3Service: AwsS3Service,
		private readonly pgBossService: PgBossService,
	) {}

	/**
	 * Upload a file for conversion.
	 *
	 * Accepts multipart form data with a single file.
	 * Validates the file, uploads to S3, and creates a conversion job.
	 * Supports idempotency via idempotencyKey form field.
	 */
	@Post()
	@UseGuards(AuthGuard('jwt'))
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({ summary: 'Upload a document for conversion' })
	@ApiConsumes('multipart/form-data')
	@ApiResponse({ status: 201, description: 'File uploaded and job created' })
	@ApiResponse({
		status: 400,
		description: 'Invalid file or validation error',
	})
	@UseInterceptors(
		FileInterceptor('file', {
			storage: memoryStorage(),
			limits: {
				fileSize: 50 * 1024 * 1024, // 50MB
				files: 1,
			},
		}),
	)
	async uploadFile(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@UploadedFile() file: Express.Multer.File,
		@Body() body: UploadFileDto,
	): Promise<ResponseEnvelope> {
		this.logger.log(
			`Upload request from user ${req.user.id}: ${file?.originalname || 'no file'}`,
		);

		if (!file) {
			throw new BadRequestException('No file provided');
		}

		let validatedFile;
		try {
			// Validate the uploaded file
			validatedFile = await this.fileValidationService.validateFile(file);
		} catch (error) {
			throw this.mapDomainError(error);
		}

		// Generate S3 key with document-converter prefix and upload
		const s3Key = this.s3Service.generateKey(
			'document-converter/uploads',
			validatedFile.sanitizedName,
		);
		await this.s3Service.upload({
			key: s3Key,
			buffer: validatedFile.buffer,
			contentType: validatedFile.mimeType,
			metadata: {
				originalName: validatedFile.originalName,
				userId: req.user.id,
			},
		});

		// Create conversion job with S3 cleanup on failure
		let job;
		try {
			job = await this.conversionService.createJob({
				fileName: validatedFile.sanitizedName,
				originalFileName: validatedFile.originalName,
				fileSize: validatedFile.size,
				mimeType: validatedFile.mimeType,
				fileExtension: validatedFile.extension,
				userId: req.user.id,
				organizationId: orgId,
				s3InputKey: s3Key,
				idempotencyKey: body.idempotencyKey,
			});

			// Queue the job for processing via pg-boss
			await this.pgBossService.sendConversionJob({
				jobId: job.id,
				userId: req.user.id,
				organizationId: orgId,
				fileExtension: validatedFile.extension,
				s3InputKey: s3Key,
				originalFileName: validatedFile.originalName,
				retryCount: 0,
			});
		} catch (error) {
			// Clean up orphaned S3 object on job creation failure
			this.logger.warn(
				`Job creation failed, cleaning up S3 object: ${s3Key}`,
			);
			try {
				await this.s3Service.delete(s3Key);
			} catch (s3Error) {
				this.logger.error(
					`Failed to clean up S3 object ${s3Key}:`,
					s3Error,
				);
			}
			throw this.mapDomainError(error);
		}

		this.logger.log(
			`Created job ${job.id} for file ${validatedFile.sanitizedName}`,
		);

		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			id: job.id,
			fileName: job.fileName,
			fileSize: job.fileSize,
			status: job.status,
			createdAt: job.createdAt,
		});
	}

	/**
	 * List conversion jobs for current user with optional filters.
	 */
	@Get('jobs')
	@UseGuards(AuthGuard('jwt'))
	@ApiOperation({ summary: 'List conversion jobs' })
	@ApiResponse({ status: 200, description: 'Paginated list of jobs' })
	async listJobs(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Query() query: JobListQueryDto,
	): Promise<ResponseEnvelope> {
		const result = await this.conversionService.listJobs({
			userId: req.user.id,
			organizationId: orgId,
			status: query.status,
			limit: query.limit,
			offset: query.offset,
			search: query.search,
		});

		return new ResponseEnvelope(ResponseStatus.Success, undefined, result);
	}

	/**
	 * Get job details by ID.
	 */
	@Get('jobs/:id')
	@UseGuards(AuthGuard('jwt'))
	@ApiOperation({ summary: 'Get job details by ID' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Job details' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	async getJob(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseEnvelope> {
		try {
			const job = await this.conversionService.getJob(
				id,
				req.user.id,
				orgId,
			);
			return new ResponseEnvelope(ResponseStatus.Success, undefined, job);
		} catch (error) {
			throw this.mapDomainError(error);
		}
	}

	/**
	 * Get download URL for completed job.
	 * Returns a presigned S3 URL valid for 1 hour.
	 */
	@Get('jobs/:id/download')
	@UseGuards(AuthGuard('jwt'))
	@ApiOperation({ summary: 'Get presigned download URL for completed job' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Download URL' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	@ApiResponse({ status: 410, description: 'Download expired' })
	async getDownloadUrl(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseEnvelope> {
		try {
			const downloadInfo = await this.conversionService.getDownloadInfo(
				id,
				req.user.id,
				orgId,
			);

			return new ResponseEnvelope(
				ResponseStatus.Success,
				undefined,
				downloadInfo,
			);
		} catch (error) {
			throw this.mapDomainError(error);
		}
	}

	/**
	 * Cancel a pending or processing job.
	 */
	@Delete('jobs/:id')
	@UseGuards(AuthGuard('jwt'))
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Cancel a job' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Job cancelled' })
	@ApiResponse({ status: 400, description: 'Invalid status transition' })
	@ApiResponse({ status: 404, description: 'Job not found' })
	async cancelJob(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseEnvelope> {
		try {
			const job = await this.conversionService.cancelJob(
				id,
				req.user.id,
				orgId,
			);

			return new ResponseEnvelope(
				ResponseStatus.Success,
				'Job cancelled successfully',
				{
					id: job.id,
					status: job.status,
				},
			);
		} catch (error) {
			throw this.mapDomainError(error);
		}
	}

	/**
	 * Retry a failed job.
	 */
	@Post('jobs/:id/retry')
	@UseGuards(AuthGuard('jwt'))
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Retry a failed job' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Job requeued' })
	@ApiResponse({
		status: 400,
		description: 'Max retries exceeded or invalid status',
	})
	@ApiResponse({ status: 404, description: 'Job not found' })
	async retryJob(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseEnvelope> {
		try {
			const job = await this.conversionService.retryJob(
				id,
				req.user.id,
				orgId,
			);

			// Re-queue the job for processing via pg-boss
			await this.pgBossService.sendConversionJob({
				jobId: job.id,
				userId: job.userId,
				organizationId: job.organizationId,
				fileExtension: job.fileExtension,
				s3InputKey: job.s3InputKey,
				originalFileName: job.originalFileName,
				retryCount: job.retryCount,
			});

			return new ResponseEnvelope(
				ResponseStatus.Success,
				'Job requeued for processing',
				{
					id: job.id,
					status: job.status,
					retryCount: job.retryCount,
				},
			);
		} catch (error) {
			throw this.mapDomainError(error);
		}
	}

	/**
	 * Generate a short-lived token for SSE connection.
	 *
	 * Returns a UUID token that can be used to connect to the SSE endpoint.
	 * Token is stored in memory and valid for 5 minutes.
	 */
	@Post('sse-token')
	@UseGuards(AuthGuard('jwt'))
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({ summary: 'Generate SSE authentication token' })
	@ApiResponse({ status: 201, description: 'Token generated' })
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
	 * Maps DomainError instances to NestJS HttpExceptions so that the correct
	 * HTTP status code and message are returned to the client.
	 * Non-DomainError errors are returned unchanged.
	 */
	private mapDomainError(error: unknown): Error {
		if (error instanceof DomainError) {
			return new HttpException(
				{
					statusCode: error.httpStatus,
					code: error.code,
					message: error.message,
					retryable: error.retryable,
				},
				error.httpStatus,
			);
		}
		if (error instanceof Error) {
			return error;
		}
		return new Error(String(error));
	}
}
