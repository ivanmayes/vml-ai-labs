/**
 * Create Scrape Job DTO
 *
 * Request DTO for the scrape job creation endpoint.
 * Uses class-validator for request validation and Swagger decorators for API docs.
 */
import {
	IsUrl,
	IsOptional,
	IsInt,
	IsArray,
	ArrayMinSize,
	ArrayMaxSize,
	Min,
	Max,
	MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScrapeJobDto {
	/**
	 * The URL to start crawling from.
	 */
	@ApiProperty({
		description: 'The URL to start crawling from',
		example: 'https://example.com',
		maxLength: 2048,
	})
	@IsUrl({}, { message: 'url must be a valid URL' })
	@MaxLength(2048)
	url: string;

	/**
	 * Maximum crawl depth from the starting URL.
	 * Defaults to 3 if not specified.
	 */
	@ApiPropertyOptional({
		description: 'Maximum crawl depth from the starting URL',
		minimum: 1,
		maximum: 5,
		default: 3,
		example: 3,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(5)
	maxDepth?: number = 3;

	/**
	 * Viewport widths in pixels for screenshots.
	 * Defaults to [1920] if not specified.
	 */
	@ApiPropertyOptional({
		description: 'Viewport widths in pixels for screenshots',
		type: [Number],
		default: [1920],
		example: [1920, 768, 375],
	})
	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(5)
	@IsInt({ each: true })
	@Min(320, { each: true })
	@Max(3840, { each: true })
	viewports?: number[] = [1920];
}
