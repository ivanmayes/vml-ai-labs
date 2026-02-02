import {
	ApiProperty,
	ApiPropertyOptional,
	getSchemaPath,
} from '@nestjs/swagger';
import { Type, DiscriminatorDescriptor } from 'class-transformer';
import {
	IsString,
	IsOptional,
	IsBoolean,
	Equals,
	IsNumber,
	IsArray,
	IsEnum,
	ValidateNested,
	IsInt,
	Min,
} from 'class-validator';

import { ValidationError } from '../modules/validation/form-validation.module';

import { FieldType } from './field-type.enum';

export { FieldType } from './field-type.enum';
export const EmailFakeDotProviders: string[] = ['gmail.com', 'googlemail.com'];
export const EmailSuspiciousDomains: string[] = [
	// Fastmail. Updated 2023-12-01
	'123mail.org',
	'150mail.com',
	'150ml.com',
	'16mail.com',
	'2-mail.com',
	'4email.net',
	'50mail.com',
	'airpost.net',
	'allmail.net',
	'cluemail.com',
	'elitemail.org',
	'emailcorner.net',
	'emailengine.net',
	'emailengine.org',
	'emailgroups.net',
	'emailplus.org',
	'emailuser.net',
	'eml.cc',
	'f-m.fm',
	'fast-email.com',
	'fast-mail.org',
	'fastem.com',
	'fastemailer.com',
	'fastest.cc',
	'fastimap.com',
	'fastmail.cn',
	'fastmail.co.uk',
	'fastmail.com',
	'fastmail.com.au',
	'fastmail.de',
	'fastmail.es',
	'fastmail.fm',
	'fastmail.fr',
	'fastmail.im',
	'fastmail.in',
	'fastmail.jp',
	'fastmail.mx',
	'fastmail.net',
	'fastmail.nl',
	'fastmail.org',
	'fastmail.se',
	'fastmail.to',
	'fastmail.tw',
	'fastmail.uk',
	'fastmailbox.net',
	'fastmessaging.com',
	'fea.st',
	'fmail.co.uk',
	'fmailbox.com',
	'fmgirl.com',
	'fmguy.com',
	'ftml.net',
	'hailmail.net',
	'imap-mail.com',
	'imap.cc',
	'imapmail.org',
	'inoutbox.com',
	'internet-e-mail.com',
	'internet-mail.org',
	'internetemails.net',
	'internetmailing.net',
	'jetemail.net',
	'justemail.net',
	'letterboxes.org',
	'mail-central.com',
	'mail-page.com',
	'mailas.com',
	'mailbolt.com',
	'mailc.net',
	'mailcan.com',
	'mailforce.net',
	'mailhaven.com',
	'mailingaddress.org',
	'mailite.com',
	'mailmight.com',
	'mailnew.com',
	'mailsent.net',
	'mailservice.ms',
	'mailup.net',
	'mailworks.org',
	'ml1.net',
	'mm.st',
	'myfastmail.com',
	'mymacmail.com',
	'nospammail.net',
	'ownmail.net',
	'petml.com',
	'postinbox.com',
	'postpro.net',
	'proinbox.com',
	'promessage.com',
	'realemail.net',
	'reallyfast.biz',
	'reallyfast.info',
	'rushpost.com',
	'sent.as',
	'sent.at',
	'sent.com',
	'speedpost.net',
	'speedymail.org',
	'ssl-mail.com',
	'swift-mail.com',
	'the-fastest.net',
	'the-quickest.com',
	'theinternetemail.com',
	'veryfast.biz',
	'veryspeedy.net',
	'warpmail.net',
	'xsmail.com',
	'yepmail.net',
	'your-mail.com',
];

export class SelectOption {
	@IsOptional()
	@IsString()
	@ApiProperty()
	name?: string;

	@IsString()
	@ApiProperty()
	value!: string;
}

export class StringValidationOptions {
	@IsOptional()
	@IsInt()
	@Min(0)
	@ApiPropertyOptional()
	minLength?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@ApiPropertyOptional()
	maxLength?: number;

	constructor(minLength?: number, maxLength?: number) {
		this.minLength = minLength;
		this.maxLength = maxLength;
	}
}

export class NumberValidationOptions {
	@IsOptional()
	@IsNumber()
	@ApiPropertyOptional()
	min?: number;

	@IsOptional()
	@IsNumber()
	@ApiPropertyOptional()
	max?: number;

	constructor(min?: number, max?: number) {
		this.min = min;
		this.max = max;
	}
}

export class ArrayValidationOptions {
	@IsOptional()
	@IsInt()
	@Min(0)
	@ApiPropertyOptional()
	minLength?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@ApiPropertyOptional()
	maxLength?: number;

	constructor(minLength?: number, maxLength?: number) {
		this.minLength = minLength;
		this.maxLength = maxLength;
	}
}

export class EmailValidationOptions {
	// A colleciton of email blacklist rules.
	// Should be an array of RegEx-parseable strings.
	// ['somedomain.org$']
	restrictions: string[];

	constructor(restrictions?: string[]) {
		this.restrictions = restrictions ?? [];
	}
}

export class PhoneValidationOptions {
	// A colleciton of email whitelist rules.
	// TODO: Should be based on country codes: "US", "CA"
	requirements: string[];

	constructor(requirements?: string[]) {
		this.requirements = requirements ?? [];
	}
}

export class AddressValidationOptions {
	countries?: string[];
	states?: string[];

	constructor(countries?: string[], states?: string[]) {
		this.countries = countries;
		this.states = states;
	}
}

export class FileValidationOptions {
	@IsOptional()
	@IsString({ each: true })
	@ApiPropertyOptional({ isArray: true })
	mimeTypes?: string[];

	@IsOptional()
	@IsNumber()
	@ApiPropertyOptional()
	maxBytes?: number;

	constructor(mimeTypes?: string[], maxBytes?: number) {
		this.mimeTypes = mimeTypes;
		this.maxBytes = maxBytes;
	}
}

export class ReCaptchaValidationOptions {
	@IsString()
	@ApiProperty()
	siteKey: string;

	@IsString()
	@ApiProperty()
	secret: string;

	constructor(siteKey?: string, secret?: string) {
		this.siteKey = siteKey ?? '';
		this.secret = secret ?? '';
	}
}

export class Validators {
	// Some value must be passed.
	@IsOptional()
	@IsBoolean()
	@Equals(true)
	@ApiPropertyOptional()
	required?: boolean;

	// Value should be a string and not empty.
	// Additional options can be passed for min and max length.
	@IsOptional()
	@ValidateNested()
	@Type((options) => {
		if (typeof options?.object?.string === 'object') {
			return StringValidationOptions;
		}
		return Boolean;
	})
	@ApiPropertyOptional({
		oneOf: [
			{ type: 'boolean' },
			{ $ref: getSchemaPath(StringValidationOptions) },
		],
	})
	string?: true | StringValidationOptions;

	// Value should be a boolean.
	@IsOptional()
	@IsBoolean()
	@Equals(true)
	@ApiPropertyOptional()
	boolean?: true;

	// Value should be Number-parseable (and not NaN).
	// Additional options can be passed for min and max values.
	@IsOptional()
	@ValidateNested()
	@Type((options) => {
		if (typeof options?.object?.number === 'object') {
			return NumberValidationOptions;
		}
		return Boolean;
	})
	@ApiPropertyOptional({
		oneOf: [
			{ type: 'boolean' },
			{ $ref: getSchemaPath(NumberValidationOptions) },
		],
	})
	number?: true | NumberValidationOptions;

	@IsOptional()
	@ValidateNested()
	@Type((options) => {
		if (typeof options?.object?.array === 'object') {
			return ArrayValidationOptions;
		}
		return Boolean;
	})
	@ApiPropertyOptional({
		oneOf: [
			{ type: 'boolean' },
			{ $ref: getSchemaPath(ArrayValidationOptions) },
		],
	})
	array?: true | ArrayValidationOptions;

	// Value should be a Date-parseable string and be at least this many years ago.
	@IsOptional()
	@IsNumber()
	@ApiPropertyOptional()
	minAge?: number;

	// A whitelist of valid values.
	// TODO: Maybe this should be RegEx-based?
	@IsOptional()
	@IsArray()
	@ApiPropertyOptional({ isArray: true })
	values?: string[] | number[];

	// Requires all fields in a group to be validated.
	@IsOptional()
	@IsBoolean()
	@Equals(true)
	@ApiPropertyOptional()
	group?: true;

	// Value should be an email and/or pass additional checks.

	email?: true | EmailValidationOptions;
	// Value should be a phone number and/or pass additional checks.
	phone?: true | PhoneValidationOptions;
	// Validate an address.
	// Should be used on a group of address fields.
	// TODO: Decide on GMaps or USPS provider.
	address?: AddressValidationOptions;

	// Validates file uploads
	@IsOptional()
	@ValidateNested()
	@Type(() => FileValidationOptions)
	@ApiPropertyOptional({ type: FileValidationOptions })
	file?: FileValidationOptions;

	// Validates ReCaptchas.
	@IsOptional()
	@ValidateNested()
	@Type(() => ReCaptchaValidationOptions)
	@ApiPropertyOptional({ type: ReCaptchaValidationOptions })
	reCaptcha?: ReCaptchaValidationOptions;
}

export class ValidationResult {
	valid!: boolean;
	errors?: ValidationError[];
}

export class FieldResult {
	@ApiProperty()
	slug!: string;

	@ApiProperty({
		oneOf: [
			{ type: 'string' },
			{ type: 'array', items: { type: 'string' } },
			{ type: 'number' },
			{ type: 'array', items: { type: 'number' } },
			{ type: 'boolean' },
			{ type: 'array', items: { type: 'boolean' } },
			{ items: { $ref: getSchemaPath(FieldResult) } },
		],
	})
	value!:
		| string
		| string[]
		| number
		| number[]
		| boolean
		| boolean[]
		| Express.Multer.File
		| Express.Multer.File[]
		| FieldResult[];
}

export class Field {
	// Internal field name.
	@IsString()
	@ApiProperty()
	slug!: string;

	// User-visible field name.
	@IsString()
	@ApiProperty()
	displayName!: string;

	// Defines how the field should be rendered on the front end.
	@IsEnum(FieldType)
	@ApiProperty({ enum: FieldType })
	type!: FieldType;

	// User-visible field description.
	@IsOptional()
	@IsString()
	@ApiPropertyOptional()
	description?: string;

	// Value to show in an input's "placeholder" attribute.
	@IsOptional()
	@IsString()
	@ApiPropertyOptional()
	placeholderValue?: string;

	// Value to pre-populate in the field.
	@IsOptional()
	@ApiPropertyOptional()
	initialValue?: string | number | boolean;

	// Suggested values, array of FieldOptions
	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => SelectOption)
	@ApiPropertyOptional({ type: SelectOption, isArray: true })
	suggestions?: SelectOption[];

	// If the field can have more than one value.
	@IsOptional()
	@IsBoolean()
	@ApiPropertyOptional()
	allowMultiple?: boolean;

	// Defines how the field should be validated.
	// Multiple validators can be combined.
	@IsOptional()
	@ValidateNested()
	@Type(() => Validators)
	@ApiProperty({ required: false, type: Validators })
	validators?: Validators;

	// Allows the field to remain unencrypted.
	@IsOptional()
	@IsBoolean()
	@ApiPropertyOptional()
	public?: boolean;
}

export class FieldSelect extends Field {
	@IsEnum(FieldType)
	@Equals(FieldType.Select)
	@ApiProperty({ enum: FieldType, default: FieldType.Select })
	override type!: FieldType.Select;

	@ValidateNested({ each: true })
	@Type(() => SelectOption)
	@ApiProperty({ type: SelectOption, isArray: true })
	options!: SelectOption[];
}

export class FieldReCaptcha extends Field {
	@IsEnum(FieldType)
	@Equals(FieldType.ReCaptcha)
	@ApiProperty({ enum: FieldType, default: FieldType.ReCaptcha })
	override type!: FieldType.ReCaptcha;
}

export class FieldFile extends Field {
	@IsEnum(FieldType)
	@Equals(FieldType.File)
	@ApiProperty({ enum: FieldType, default: FieldType.File })
	override type!: FieldType.File;

	// originalName: string;
	// encoding: string;
	// mimeType: string;
	// buffer: Buffer;
	// size: number;
}

export class FieldGroup extends Field {
	@IsEnum(FieldType)
	@Equals(FieldType.Group)
	@ApiProperty({ enum: FieldType, default: FieldType.Group })
	override type!: FieldType.Group;

	@ValidateNested({ each: true })
	@Type(() => Field, {
		discriminator: {
			property: 'type',
			subTypes: [
				{ value: Field, name: FieldType.Text },
				{ value: Field, name: FieldType.Checkbox },
				{ value: Field, name: FieldType.Hidden },
				{ value: Field, name: FieldType.Email },
				{ value: Field, name: FieldType.Phone },
				{ value: Field, name: FieldType.State },
				{ value: Field, name: FieldType.Date },
				{ value: FieldGroup, name: FieldType.Group },
				{ value: FieldSelect, name: FieldType.Select },
				{ value: FieldReCaptcha, name: FieldType.ReCaptcha },
				{ value: FieldFile, name: FieldType.File },
			],
		},
		keepDiscriminatorProperty: true,
	})
	fields!: (Field | FieldGroup | FieldSelect | FieldReCaptcha)[];
}

// For use in DTOS
export const FieldDiscriminator: DiscriminatorDescriptor = {
	property: 'type',
	subTypes: [
		{ value: Field, name: FieldType.Text },
		{ value: Field, name: FieldType.Checkbox },
		{ value: Field, name: FieldType.Hidden },
		{ value: Field, name: FieldType.Email },
		{ value: Field, name: FieldType.Phone },
		{ value: Field, name: FieldType.State },
		{ value: Field, name: FieldType.Date },
		{ value: FieldGroup, name: FieldType.Group },
		{ value: FieldSelect, name: FieldType.Select },
		{ value: FieldReCaptcha, name: FieldType.ReCaptcha },
		{ value: FieldFile, name: FieldType.File },
	],
};

export type Form = (
	| Field
	| FieldGroup
	| FieldSelect
	| FieldReCaptcha
	| FieldFile
)[];
