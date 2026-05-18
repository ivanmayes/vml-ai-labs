import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsString,
	Matches,
	MaxLength,
	MinLength,
	registerDecorator,
	ValidationOptions,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
