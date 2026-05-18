import {
	ArrayMaxSize,
	IsArray,
	IsIn,
	IsInt,
	IsString,
	MaxLength,
	Min,
	registerDecorator,
	ValidationOptions,
} from 'class-validator';
import { ApiProperty, ApiExtraModels } from '@nestjs/swagger';

/**
 * Validation rule discriminated union — six types in V1 (see plan H-LTD).
 *
 * Each rule shape carries a `type` discriminator and only the payload
 * relevant to that type. Forbidden-words is capped at 100 entries and
 * 200 chars per entry (G3 security resolution from plan review).
 *
 * Incoming rules are parsed via a custom `@IsRule()` validator below
 * because class-validator's nested-type discrimination needs a class
 * mapping at runtime; rolling our own keeps the controller-side DTOs
 * declarative without pulling in a heavier `oneOf` plugin.
 */

export type RuleType =
	| 'maxCharacters'
	| 'maxWords'
	| 'minCharacters'
	| 'minWords'
	| 'singleLine'
	| 'forbiddenWords';

const NUMERIC_RULE_TYPES: readonly RuleType[] = [
	'maxCharacters',
	'maxWords',
	'minCharacters',
	'minWords',
];

const FORBIDDEN_WORDS_MAX_TERMS = 100;
const FORBIDDEN_WORDS_MAX_TERM_LENGTH = 200;

export class MaxCharactersRuleDto {
	@ApiProperty({ enum: ['maxCharacters'] })
	@IsIn(['maxCharacters'])
	type: 'maxCharacters';

	@ApiProperty({ minimum: 0, type: 'integer' })
	@IsInt()
	@Min(0)
	value: number;
}

export class MaxWordsRuleDto {
	@ApiProperty({ enum: ['maxWords'] })
	@IsIn(['maxWords'])
	type: 'maxWords';

	@ApiProperty({ minimum: 0, type: 'integer' })
	@IsInt()
	@Min(0)
	value: number;
}

export class MinCharactersRuleDto {
	@ApiProperty({ enum: ['minCharacters'] })
	@IsIn(['minCharacters'])
	type: 'minCharacters';

	@ApiProperty({ minimum: 0, type: 'integer' })
	@IsInt()
	@Min(0)
	value: number;
}

export class MinWordsRuleDto {
	@ApiProperty({ enum: ['minWords'] })
	@IsIn(['minWords'])
	type: 'minWords';

	@ApiProperty({ minimum: 0, type: 'integer' })
	@IsInt()
	@Min(0)
	value: number;
}

export class SingleLineRuleDto {
	@ApiProperty({ enum: ['singleLine'] })
	@IsIn(['singleLine'])
	type: 'singleLine';
}

export class ForbiddenWordsRuleDto {
	@ApiProperty({ enum: ['forbiddenWords'] })
	@IsIn(['forbiddenWords'])
	type: 'forbiddenWords';

	@ApiProperty({
		type: [String],
		maxItems: FORBIDDEN_WORDS_MAX_TERMS,
		description: `Up to ${FORBIDDEN_WORDS_MAX_TERMS} terms, each up to ${FORBIDDEN_WORDS_MAX_TERM_LENGTH} chars.`,
	})
	@IsArray()
	@ArrayMaxSize(FORBIDDEN_WORDS_MAX_TERMS)
	@IsString({ each: true })
	@MaxLength(FORBIDDEN_WORDS_MAX_TERM_LENGTH, { each: true })
	values: string[];
}

@ApiExtraModels(
	MaxCharactersRuleDto,
	MaxWordsRuleDto,
	MinCharactersRuleDto,
	MinWordsRuleDto,
	SingleLineRuleDto,
	ForbiddenWordsRuleDto,
)
export class RuleDto {
	@IsIn([
		'maxCharacters',
		'maxWords',
		'minCharacters',
		'minWords',
		'singleLine',
		'forbiddenWords',
	])
	type: RuleType;
}

export type RuleDtoUnion =
	| MaxCharactersRuleDto
	| MaxWordsRuleDto
	| MinCharactersRuleDto
	| MinWordsRuleDto
	| SingleLineRuleDto
	| ForbiddenWordsRuleDto;

/**
 * `@IsRule()` — custom property validator that dispatches on the
 * discriminator and runs the payload checks inline. We avoid
 * class-validator's nested `@Type` approach because that requires the
 * containing DTO to know the rule classes at compile time; this
 * keeps the rule list shape isolated to this file.
 */
export function IsRule(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isRule',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			validator: {
				validate(value: unknown) {
					return validateRule(value).valid;
				},
				defaultMessage(args) {
					if (!args) {
						return 'is not a valid rule';
					}
					const result = validateRule(args.value);
					return (
						result.message ?? `${args.property} is not a valid rule`
					);
				},
			},
		});
	};
}

interface RuleValidation {
	valid: boolean;
	message?: string;
}

const FORBIDDEN_WORDS_LABEL = 'forbiddenWords';

function validateNumericRule(
	type: string,
	obj: Record<string, unknown>,
): RuleValidation {
	if (
		typeof obj.value !== 'number' ||
		!Number.isInteger(obj.value) ||
		obj.value < 0
	) {
		return {
			valid: false,
			message: `${type} requires a non-negative integer 'value'`,
		};
	}
	return { valid: true };
}

function validateForbiddenWordsRule(
	obj: Record<string, unknown>,
): RuleValidation {
	if (!Array.isArray(obj.values)) {
		return {
			valid: false,
			message: `${FORBIDDEN_WORDS_LABEL} requires a 'values' array`,
		};
	}
	if (obj.values.length > FORBIDDEN_WORDS_MAX_TERMS) {
		return {
			valid: false,
			message: `${FORBIDDEN_WORDS_LABEL} supports up to ${FORBIDDEN_WORDS_MAX_TERMS} terms`,
		};
	}
	for (const v of obj.values) {
		if (typeof v !== 'string') {
			return {
				valid: false,
				message: `${FORBIDDEN_WORDS_LABEL} terms must be strings`,
			};
		}
		if (v.length > FORBIDDEN_WORDS_MAX_TERM_LENGTH) {
			return {
				valid: false,
				message: `${FORBIDDEN_WORDS_LABEL} terms must be <= ${FORBIDDEN_WORDS_MAX_TERM_LENGTH} chars`,
			};
		}
	}
	return { valid: true };
}

export function validateRule(value: unknown): RuleValidation {
	if (!value || typeof value !== 'object') {
		return { valid: false, message: 'rule must be an object' };
	}
	const obj = value as Record<string, unknown>;
	const type = obj.type;

	if (typeof type !== 'string') {
		return {
			valid: false,
			message: 'rule.type must be a string discriminator',
		};
	}

	if (NUMERIC_RULE_TYPES.includes(type as RuleType)) {
		return validateNumericRule(type, obj);
	}

	if (type === 'singleLine') {
		return { valid: true };
	}

	if (type === FORBIDDEN_WORDS_LABEL) {
		return validateForbiddenWordsRule(obj);
	}

	return { valid: false, message: `unsupported rule type: ${type}` };
}

/**
 * Normalize a validated rule payload to the strict stored shape — drop
 * any incidental extra keys so the JSONB column does not accept
 * arbitrary trailing data.
 */
export function normalizeRule(raw: unknown): RuleDtoUnion {
	const obj = raw as Record<string, unknown>;
	const type = obj.type as RuleType;
	if (NUMERIC_RULE_TYPES.includes(type)) {
		return { type, value: obj.value as number } as RuleDtoUnion;
	}
	if (type === 'singleLine') {
		return { type };
	}
	// forbiddenWords
	return {
		type: 'forbiddenWords',
		values: (obj.values as string[]).map((v) => v),
	};
}
