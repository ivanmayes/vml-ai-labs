/**
 * Job List Query DTO
 *
 * Query parameter validation for the job list endpoint.
 * Supports filtering, pagination, and search.
 */
import {
	IsOptional,
	IsEnum,
	IsInt,
	Min,
	Max,
	IsString,
	MaxLength,
	Matches,
	IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

import { JobStatus } from '../types/job-status.enum';

/**
 * Query DTO for GET /api/conversion/jobs
 *
 * Validates and transforms query parameters for job listing.
 */
export class JobListQueryDto {
	/**
	 * Filter by job status(es).
	 * Can be a single status or comma-separated list.
	 */
	@IsOptional()
	@Transform(({ value }) => {
		if (typeof value === 'string') {
			return value.split(',').map((s) => s.trim());
		}
		return Array.isArray(value) ? value : [value];
	})
	@IsArray()
	@IsEnum(JobStatus, { each: true })
	status?: JobStatus[];

	/**
	 * Maximum number of results (1-100).
	 */
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number = 20;

	/**
	 * Pagination offset (0-10000).
	 */
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(10000)
	offset?: number = 0;

	/**
	 * Sort field and direction.
	 * Format: field:direction (e.g., createdAt:desc)
	 */
	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Matches(/^[a-zA-Z]+:(asc|desc)$/, {
		message:
			'Sort must be in format field:direction (e.g., createdAt:desc)',
	})
	sort?: string = 'createdAt:desc';

	/**
	 * Search filename.
	 * Alphanumeric characters only, max 100 chars.
	 */
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Matches(/^[a-zA-Z0-9\s._-]*$/, {
		message: 'Search contains invalid characters',
	})
	search?: string;
}
