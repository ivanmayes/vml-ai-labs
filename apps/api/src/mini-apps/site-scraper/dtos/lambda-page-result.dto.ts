/**
 * Lambda Page Result DTO
 *
 * Request DTO for the internal Lambda callback endpoint.
 * Validates the page result payload sent by the Lambda worker
 * after processing a single page.
 */
import { Type } from 'class-transformer';
import {
	IsString,
	IsUUID,
	IsOptional,
	IsIn,
	IsArray,
	IsInt,
	Min,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Screenshot result from Lambda processing.
 */
export class ScreenshotResultDto {
	@ApiProperty({ description: 'Viewport width in pixels', example: 1920 })
	@IsInt()
	@Min(1)
	viewport: number;

	@ApiProperty({
		description: 'S3 object key for the screenshot',
		example: 'site-scraper/abc-123/screenshots/page-hash-1920.jpg',
	})
	@IsString()
	@MaxLength(1024)
	s3Key: string;

	@ApiPropertyOptional({
		description: 'S3 object key for the WebP thumbnail',
		example: 'site-scraper/abc-123/thumbnails/page-hash-1920.webp',
	})
	@IsOptional()
	@IsString()
	@MaxLength(1024)
	thumbnailS3Key?: string;

	@ApiPropertyOptional({
		description: 'Human-readable label from the hint that produced this screenshot',
		example: 'Expand FAQ accordion',
	})
	@IsOptional()
	@IsString()
	@MaxLength(100)
	hintLabel?: string;

	@ApiPropertyOptional({
		description: 'Index of the hint in the resolved hints array',
		example: 0,
	})
	@IsOptional()
	@IsInt()
	@Min(0)
	hintIndex?: number;

	@ApiPropertyOptional({
		description: 'Whether this screenshot is a baseline, before-hint, or after-hint capture',
		example: 'after',
	})
	@IsOptional()
	@IsIn(['baseline', 'before', 'after'])
	snapshotTiming?: string;
}

/**
 * Full callback payload from Lambda worker.
 */
export class LambdaPageResultDto {
	@ApiProperty({
		description: 'Scrape job UUID',
		example: '550e8400-e29b-41d4-a716-446655440000',
	})
	@IsUUID()
	jobId: string;

	@ApiProperty({
		description: 'URL that was scraped',
		example: 'https://example.com/about',
	})
	@IsString()
	@MaxLength(2048)
	url: string;

	@ApiPropertyOptional({
		description: 'Page title extracted from <title> tag',
		example: 'About Us - Example',
	})
	@IsOptional()
	@IsString()
	@MaxLength(500)
	title?: string;

	@ApiPropertyOptional({
		description: 'S3 key for the HTML snapshot',
		example: 'site-scraper/abc-123/html/page-hash.html',
	})
	@IsOptional()
	@IsString()
	@MaxLength(1024)
	htmlS3Key?: string;

	@ApiProperty({
		description: 'Screenshots captured at each viewport',
		type: [ScreenshotResultDto],
	})
	@ValidateNested({ each: true })
	@Type(() => ScreenshotResultDto)
	@IsArray()
	screenshots: ScreenshotResultDto[];

	@ApiProperty({
		description: 'Processing status for this page',
		enum: ['completed', 'failed'],
		example: 'completed',
	})
	@IsIn(['completed', 'failed'])
	status: 'completed' | 'failed';

	@ApiPropertyOptional({
		description: 'Error message if status is failed',
		example: 'Page timed out after 30 seconds',
	})
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	errorMessage?: string;

	@ApiProperty({
		description: 'URLs discovered on this page (same-origin links)',
		type: [String],
		example: ['https://example.com/contact', 'https://example.com/blog'],
	})
	@IsArray()
	@IsString({ each: true })
	discoveredUrls: string[];

	@ApiProperty({
		description: 'Crawl depth of this page from the seed URL',
		example: 1,
	})
	@IsInt()
	@Min(0)
	depth: number;

	@ApiPropertyOptional({
		description: 'S3 key for serialized session state (set when siteEntry hints capture auth)',
		example: 'site-scraper/abc-123/session-state.json',
	})
	@IsOptional()
	@IsString()
	@MaxLength(1024)
	sessionStateS3Key?: string;
}
