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
	IsString,
	IsBoolean,
	IsIn,
	ArrayMinSize,
	ArrayMaxSize,
	Min,
	Max,
	MaxLength,
	ValidateNested,
	Validate,
	ValidatorConstraint,
	ValidatorConstraintInterface,
	ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Custom validator to reject dangerous selector patterns.
 * Prevents Playwright engine injection via selectors containing
 * >>, text=, xpath=, javascript:, backticks, or expression(.
 */
@ValidatorConstraint({ name: 'safeCssSelector', async: false })
export class SafeCssSelectorConstraint implements ValidatorConstraintInterface {
	private static readonly FORBIDDEN_PATTERNS = [
		'>>', // Playwright chaining operator
		'text=', // Playwright text selector engine
		'xpath=', // Playwright XPath selector engine
		'javascript:', // JavaScript URI scheme
		'`', // Backticks (template literals)
		'expression(', // CSS expression injection
	];

	validate(value: unknown): boolean {
		if (value === undefined || value === null) {
			return true; // Optional field — other decorators handle required checks
		}
		if (typeof value !== 'string') {
			return false;
		}
		const lower = value.toLowerCase();
		return !SafeCssSelectorConstraint.FORBIDDEN_PATTERNS.some((pattern) =>
			lower.includes(pattern.toLowerCase()),
		);
	}

	defaultMessage(args: ValidationArguments): string {
		return `${args.property} contains a forbidden pattern. Selectors must not include >>, text=, xpath=, javascript:, backticks, or expression(`;
	}
}

/**
 * A single event hint describing an interaction to perform on a page.
 */
export class EventHintDto {
	@ApiProperty({
		description: 'Action to perform on the page',
		enum: ['click', 'hover', 'fill', 'fillSubmit', 'wait', 'remove'],
		example: 'click',
	})
	@IsIn(['click', 'hover', 'fill', 'fillSubmit', 'wait', 'remove'])
	action: 'click' | 'hover' | 'fill' | 'fillSubmit' | 'wait' | 'remove';

	@ApiPropertyOptional({
		description:
			'CSS selector targeting the element (not required for wait)',
		example: '.accordion-header',
		maxLength: 500,
	})
	@IsOptional()
	@IsString()
	@MaxLength(500)
	@Validate(SafeCssSelectorConstraint)
	selector?: string;

	@ApiPropertyOptional({
		description: 'For click: number of times to click (default: 1)',
		minimum: 1,
		maximum: 100,
		example: 1,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	count?: number;

	@ApiPropertyOptional({
		description: 'For fill: text value to enter',
		maxLength: 1000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	value?: string;

	@ApiPropertyOptional({
		description:
			'For wait: duration in ms. For others: pause after action (ms)',
		minimum: 0,
		maximum: 30000,
		example: 1000,
	})
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(30000)
	waitAfter?: number;

	@ApiPropertyOptional({
		description:
			'Execution order (lower runs first). Unsequenced hints run last.',
		minimum: 0,
		example: 0,
	})
	@IsOptional()
	@IsInt()
	@Min(0)
	seq?: number;

	@ApiPropertyOptional({
		description:
			'Screenshot behavior: before action, after action, both, or never',
		enum: ['before', 'after', 'both', 'never'],
		example: 'after',
	})
	@IsOptional()
	@IsIn(['before', 'after', 'both', 'never'])
	snapshot?: 'before' | 'after' | 'both' | 'never';

	@ApiPropertyOptional({
		description: 'Device filter: only execute at matching viewport widths',
		enum: ['smartphone', 'tablet', 'desktop', 'all'],
		example: 'all',
	})
	@IsOptional()
	@IsIn(['smartphone', 'tablet', 'desktop', 'all'])
	device?: 'smartphone' | 'tablet' | 'desktop' | 'all';

	@ApiPropertyOptional({
		description:
			'If true, executes once on the first page only (login/modal dismiss)',
		example: false,
	})
	@IsOptional()
	@IsBoolean()
	siteEntry?: boolean;

	@ApiPropertyOptional({
		description: "Human-readable label for this hint's screenshots",
		maxLength: 100,
		example: 'Expand FAQ accordion',
	})
	@IsOptional()
	@IsString()
	@MaxLength(100)
	label?: string;
}

/**
 * A group of hints applied to pages matching a URL glob pattern.
 */
export class UrlHintGroupDto {
	@ApiProperty({
		description:
			'Glob pattern matched against page URL pathname (e.g., "/products/*")',
		maxLength: 200,
		example: '/products/*',
	})
	@IsString()
	@MaxLength(200)
	pattern: string;

	@ApiProperty({
		description: 'Hints for pages matching this pattern',
		type: [EventHintDto],
	})
	@IsArray()
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => EventHintDto)
	hints: EventHintDto[];
}

/**
 * Top-level hint configuration for a scrape job.
 */
export class HintConfigDto {
	@ApiPropertyOptional({
		description: 'Hints applied to every page in the crawl',
		type: [EventHintDto],
		default: [],
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => EventHintDto)
	global: EventHintDto[] = [];

	@ApiPropertyOptional({
		description:
			'Hints applied only to pages matching the URL pattern',
		type: [UrlHintGroupDto],
		default: [],
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(20)
	@ValidateNested({ each: true })
	@Type(() => UrlHintGroupDto)
	perUrl: UrlHintGroupDto[] = [];
}

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

	/**
	 * Optional event hint configuration for page interactions.
	 * Allows specifying clicks, hovers, fills, and other actions
	 * to execute before/between screenshots.
	 */
	@ApiPropertyOptional({
		description:
			'Event hint configuration for page interactions (clicks, hovers, fills, etc.)',
		type: HintConfigDto,
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => HintConfigDto)
	hints?: HintConfigDto;
}
