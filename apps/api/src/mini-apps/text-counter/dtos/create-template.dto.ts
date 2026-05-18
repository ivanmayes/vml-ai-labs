import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsString,
	Matches,
	MaxLength,
	MinLength,
	ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { NoControlChars, TemplateFieldDto } from './template-field.dto';

const MAX_FIELDS_PER_TEMPLATE = 50;

/**
 * Create-template body. The field array is required to be non-empty —
 * a template with no fields cannot match anything in the extraction
 * flow, so the API rejects the empty case rather than persisting a
 * useless row.
 */
export class CreateTemplateDto {
	@ApiProperty({ minLength: 1, maxLength: 255 })
	@IsString()
	@MinLength(1)
	@MaxLength(255)
	@NoControlChars()
	@Matches(/^(?!\s)(?!.*\s$).+$/, {
		message: 'name must not have leading or trailing whitespace',
	})
	name: string;

	@ApiProperty({ type: () => TemplateFieldDto, isArray: true })
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_FIELDS_PER_TEMPLATE)
	@ValidateNested({ each: true })
	@Type(() => TemplateFieldDto)
	fields: TemplateFieldDto[];
}
