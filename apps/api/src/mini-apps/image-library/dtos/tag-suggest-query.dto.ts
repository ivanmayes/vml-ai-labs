import { Type } from 'class-transformer';
import {
	IsInt,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';

export class TagSuggestQueryDto {
	@IsOptional()
	@IsString()
	@MaxLength(100)
	q?: string = '';

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(50)
	limit?: number = 20;
}
