import { Transform } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 40;

/**
 * Multipart upload body. `tags` arrives as either a JSON-stringified array
 * (preferred — the web client always sends this shape) or an already-parsed
 * array (tests, future API clients). The `@Transform` accepts both.
 */
export class UploadImageDto {
	@IsOptional()
	@Transform(({ value }) => {
		if (value === undefined || value === null || value === '') return [];
		if (Array.isArray(value)) return value;
		if (typeof value === 'string') {
			try {
				const parsed = JSON.parse(value);
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [];
			}
		}
		return [];
	})
	@IsArray()
	@ArrayMaxSize(MAX_TAGS)
	@IsString({ each: true })
	@MaxLength(MAX_TAG_LENGTH, { each: true })
	tags?: string[];
}
