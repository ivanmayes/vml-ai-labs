import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
	MinLength,
	registerDecorator,
	ValidationOptions,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsRule, RuleDtoUnion } from './rule.dto';

/**
 * Reject newlines, carriage returns, null bytes, and other control
 * characters in field labels (G2 security resolution from plan review).
 * Matches the ASCII control range U+0000-U+001F plus DEL (U+007F);
 * standard printable characters (including most Unicode) pass through.
 *
 * Built via `new RegExp` from a string so this source file does not
 * contain literal control-character bytes.
 */
// eslint-disable-next-line no-control-regex -- intentional deny-list against control chars in labels (G2)
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]');

export function NoControlChars(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'noControlChars',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			validator: {
				validate(value: unknown) {
					return (
						typeof value === 'string' && !CONTROL_CHARS.test(value)
					);
				},
				defaultMessage() {
					return 'must not contain newlines, null bytes, or other control characters';
				},
			},
		});
	};
}

const MAX_RULES_PER_FIELD = 20;

export class TemplateFieldDto {
	/**
	 * Optional id present on update payloads only. When the client sends
	 * a field that already exists (carrying its current id), the service
	 * UPDATEs the row in place — preserving the id so any client-side
	 * data keyed by field id (e.g. card assignments) survives the edit.
	 * Omit on create or when adding a new field to an existing template.
	 */
	@ApiPropertyOptional({
		format: 'uuid',
		description:
			'Optional. Present on update payloads to preserve existing field ids; absent on create / new fields.',
	})
	@IsOptional()
	@IsUUID()
	id?: string;

	@ApiProperty({ minLength: 1, maxLength: 255 })
	@IsString()
	@MinLength(1)
	@MaxLength(255)
	@NoControlChars()
	@Matches(/^(?!\s)(?!.*\s$).+$/, {
		message: 'label must not have leading or trailing whitespace',
	})
	label: string;

	@ApiProperty({
		isArray: true,
		description:
			'Validation rules - discriminated union (see RuleDto). Stored as JSONB on the field row.',
	})
	@IsArray()
	@ArrayMaxSize(MAX_RULES_PER_FIELD)
	@IsRule({ each: true })
	@Type(() => Object)
	rules: RuleDtoUnion[];
}
