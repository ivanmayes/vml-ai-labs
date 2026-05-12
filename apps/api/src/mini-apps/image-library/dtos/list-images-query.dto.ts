import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Max,
	Min,
} from 'class-validator';

const MAX_TAG_FILTERS = 20;
const MAX_TAG_LENGTH = 40;

export class ListImagesQueryDto {
	@IsOptional()
	@Transform(({ value }) => {
		if (Array.isArray(value)) return value;
		if (typeof value === 'string' && value.length > 0) {
			return value
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return [];
	})
	@IsArray()
	@ArrayMaxSize(MAX_TAG_FILTERS)
	@IsString({ each: true })
	@MaxLength(MAX_TAG_LENGTH, { each: true })
	tags?: string[];

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	pageSize?: number = 25;

	@IsOptional()
	@IsIn(['newest', 'oldest'])
	sort?: 'newest' | 'oldest' = 'newest';
}
