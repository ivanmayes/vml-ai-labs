/**
 * Job Response DTOs
 *
 * Response DTOs for conversion job endpoints.
 * Uses class-transformer for serialization with proper type exposure.
 */
import { Expose, Type } from 'class-transformer';

import { JobStatus } from '../types/job-status.enum';
import { ConversionError } from '../types/conversion-error.types';

/**
 * Response DTO for upload endpoint and single job retrieval.
 */
export class JobResponseDto {
	@Expose()
	id: string;

	@Expose()
	fileName: string;

	@Expose()
	fileSize: number;

	@Expose()
	status: JobStatus;

	@Expose()
	engine?: string;

	@Expose()
	@Type(() => Date)
	createdAt: Date;

	@Expose()
	@Type(() => Date)
	startedAt?: Date;

	@Expose()
	@Type(() => Date)
	completedAt?: Date;

	@Expose()
	queuePosition?: number;

	@Expose()
	processingTimeMs?: number;

	@Expose()
	outputSize?: number;

	@Expose()
	error?: ConversionError;
}

/**
 * Response DTO for job upload - includes queue position.
 */
export class UploadJobResponseDto extends JobResponseDto {
	@Expose()
	override queuePosition: number;
}

/**
 * Pagination metadata for list responses.
 */
export class PaginationMetaDto {
	@Expose()
	total: number;

	@Expose()
	limit: number;

	@Expose()
	offset: number;

	@Expose()
	hasMore: boolean;
}

/**
 * Paginated list response for jobs.
 */
export class JobListResponseDto {
	@Expose()
	@Type(() => JobResponseDto)
	data: JobResponseDto[];

	@Expose()
	@Type(() => PaginationMetaDto)
	meta: PaginationMetaDto;
}
