import {
	Utils
} from './utils';
import {
	ArrayValidationOptions,
	EmailValidationOptions,
	Field,
	FieldFile,
	FieldGroup,
	FieldReCaptcha,
	FieldResult,
	FieldSelect,
	FileValidationOptions,
	NumberValidationOptions,
	PhoneValidationOptions,
	ReCaptchaValidationOptions,
	StringValidationOptions,
	ValidationResult,
	Validators
} from '../../models';
import { FieldType } from '../../models/field-type.enum';

import { Validate } from './validators';

export class ValidationError {
	constructor(slug: string, message: string) {
		this.slug = slug;
		this.message = message;
	}
	public slug: string;
	public message: string;
	public toString() {
		return `Slug: ${this.slug}, Message: ${this.message}`;
	}
}

export class Validation {
	public static Validate = Validate;
	public static Utils = Utils;

	public static validateFormMeta(fields: Field[], root: boolean = true): ValidationResult {
		if(!Array.isArray(fields) || !fields?.length) {
			return {
				valid: false,
				errors: [new ValidationError(null, 'No fields were provided.')]
			};
		}
		const fieldTypes = Object.values(FieldType);
		let errors: ValidationError[] = [];
		for(const f of fields) {
			if(!f.slug?.length || f.slug.match(/[^_\-a-zA-Z0-9]/)) {
				errors.push(new ValidationError(f.slug, `Field "${f.slug}" has an invalid slug. Slugs must be alphanumeric and may contain underscores and dashes.`));
			}
			if(!f.displayName?.length) {
				errors.push(new ValidationError(f.slug, `Field "${f.slug}" has an invalid display name.`));
			}
			if(!fieldTypes.includes(f.type)) {
				errors.push(new ValidationError(f.slug, `Field "${f.slug}" has an invalid type: "${f.type}".`));
			}
			if(Utils.isFieldGroup(f)) {
				if(!f.fields?.length) {
					errors.push(new ValidationError(f.slug, `Field "${f.slug}" is a group but has no fields.`));
				} else {
					let groupResult = this.validateFormMeta(f.fields, false);
					if(!groupResult.valid) {
						errors.push(...groupResult.errors);
					}
				}
			}
			if(Utils.isFieldSelect(f)) {
				if(!f.options?.length) {
					errors.push(new ValidationError(f.slug, `Field "${f.slug}" is a select but has no options.`));
				} else {
					for(const o of f.options) {
						if(!o.value?.length) {
							errors.push(new ValidationError(f.slug, `Field "${f.slug}" has an invalid option.`));
						}
					}
				}
			}
			if(Utils.isFieldReCaptcha(f)) {
				if(!f.validators?.reCaptcha) {
					errors.push(new ValidationError(f.slug, `Field "${f.slug}" is a reCaptcha but has no validator.`));
				}
			}
			if(f.validators) {
				let validatorResult = this.validateValidatorsMeta(f.validators);
				if(!validatorResult.valid) {
					errors.push(...validatorResult.errors);
				}
			}
			if(f.public && !root) {
				errors.push(new ValidationError(f.slug, `Field "${f.slug}" is a marked "public" but is not a top-level field. This option can only be used on top-level field elements.`));
			}
		}

		if(errors.length) {
			return {
				valid: false,
				errors
			};
		}

		return {
			valid: true
		};
	}

	// Basic validator definition...validation.
	public static validateValidatorsMeta(validators: Validators) {
		if(!validators) {
			return {
				valid: true
			}
		}
		let errors: ValidationError[] = [];
		for(const [k, v] of Object.entries(validators)) {
			switch(k) {
				case 'required':
				case 'boolean':
				case 'values':
				case 'group':
					break;
				case 'string':
					if(v === true) {
						break;
					}
					if(Utils.hasExtraKeys(v, new StringValidationOptions())) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. Unexpected keys found.`));
					}
					if(typeof v.minLength !== 'undefined' && (isNaN(Number(v.minLength)) || Number(v.minLength) < 0)) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "minLength" is required.`));
					}
					if(typeof v.maxLength !== 'undefined' && (isNaN(Number(v.maxLength)) || Number(v.maxLength) < 1)) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "maxLength" is required.`));
					}
					if(typeof v.minLength !== 'undefined' && typeof v.maxLength !== 'undefined' && Number(v.minLength) > Number(v.maxLength)) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. "minLength" value is greater than "maxLength" value.`));
					}
					break;
				case 'number':
					if(v === true) {
						break;
					}
					if(Utils.hasExtraKeys(v, new NumberValidationOptions())) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. Unexpected keys found.`));
					}
					if(typeof v.min !== 'undefined' && isNaN(Number(v.min))) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "min" is required.`));
					}
					if(typeof v.max !== 'undefined' && isNaN(Number(v.max))) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "max" is required.`));
					}
					if(typeof v.min !== 'undefined' && typeof v.max !== 'undefined' && Number(v.min) > Number(v.max)) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. "min" value is greater than "max" value.`));
					}
					break;
				case 'array':
					if(v === true) {
						break;
					}
					if(Utils.hasExtraKeys(v, new ArrayValidationOptions())) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. Unexpected keys found.`));
					}
					if(typeof v.minLength !== 'undefined' && (isNaN(Number(v.minLength)) || Number(v.minLength) < 0)) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "minLength" is required.`));
					}
					if(typeof v.maxLength !== 'undefined' && (isNaN(Number(v.maxLength)) || Number(v.maxLength) < 1)) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "maxLength" is required.`));
					}
					if(typeof v.minLength !== 'undefined' && typeof v.maxLength !== 'undefined' && Number(v.minLength) > Number(v.maxLength)) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. "minLength" value is greater than "maxLength" value.`));
					}
					break;
				case 'address':
					if(!v.countries?.length && !v.states?.length) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. No countries and/or states provided.`));
					}
					break;
				case 'phone':
					if(v === true) {
						break;
					}
					if(Utils.hasExtraKeys(v, new PhoneValidationOptions())) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. Unexpected keys found.`));
					}
					if(!(v as PhoneValidationOptions)?.requirements.length) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. No requirements provided.`));
					}
					break;
				case 'email':
					if(v === true) {
						break;
					}
					if(Utils.hasExtraKeys(v, new EmailValidationOptions())) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. Unexpected keys found.`));
					}
					if(!(v as EmailValidationOptions)?.restrictions?.length) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. No restrictions provided.`));
					}
					break;
				case 'minAge':
					if(!Validate.number(v)) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. Value isn't a number: "${v}".`));
					}
					break;
				case 'file':
					if(Utils.hasExtraKeys(v, new FileValidationOptions())) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. Unexpected keys found.`));
					}
					let opts = v as FileValidationOptions;
					if(
						(
							typeof opts?.maxBytes === 'undefined' ||
							(
								typeof opts?.maxBytes !== 'undefined' &&
								!Validate.number(opts.maxBytes)
							)
						)
						&&
						(
							typeof opts?.mimeTypes === 'undefined' ||
							(
								typeof opts?.mimeTypes !== 'undefined' &&
								!Array.isArray(opts.mimeTypes)
							)
						)
					) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "maxBytes" and/or "mimeTypes" is required.`));
					}
					break;
				case 'reCaptcha':
					if(Utils.hasExtraKeys(v, new ReCaptchaValidationOptions())) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. Unexpected keys found.`));
					}
					let ropts = v as ReCaptchaValidationOptions;
					if(!ropts.siteKey?.length) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "siteKey" is required.`));
					}
					if(!ropts.secret?.length) {
						errors.push(new ValidationError(k, `Invalid validator "${k}" provided. A valid value for "secret" is required.`));
					}
					break;
				default:
					errors.push(new ValidationError(k, `Invalid validator "${k}" provided.`));
			}
		}

		if(errors.length) {
			return {
				valid: false,
				errors
			};
		}

		return {
			valid: true
		};
	}

	public static async validateForm(
		input: FieldResult[],
		fields: Array<Field | FieldGroup | FieldSelect | FieldReCaptcha | FieldFile>,
		files?: Express.Multer.File[]
	) {
		const validationErrors: ValidationError[] = [];

		if(!input?.length) {
			input = [];
		}

		if(!fields?.length) {
			validationErrors.push(new ValidationError(null, 'No fields were provided. Validation is not possible'));
			return {
				valid: false,
				errors: validationErrors
			};
		}

		const fileSlugs = [];
		const filesTransformed = files?.map(f => {
			fileSlugs.push(f.fieldname);
			return {
				slug: f.fieldname,
				value: {
					...f
				}
			} as FieldResult;
		});

		// console.log(input, fields, files);
		const inputSlugs = [...Utils.extractSlugs(input, true), ...(filesTransformed?.map(f => f.slug) ?? [])];
		const targetSlugs = Utils.extractSlugs(fields, true);
		for(const i of inputSlugs) {
			// Check to make sure no extra fileds are provided.
			if(!targetSlugs.includes(i)) {
				validationErrors.push(new ValidationError(i, `Input field "${i}" was not expected.`));
			}
		}

		for(const f of fields) {
			const inputField = (f.type !== FieldType.File) ? input.find(i => i.slug === f.slug) : filesTransformed?.find(fi => fi.slug === f.slug);
			let validators = f.validators ?? {};
			if(f.type === FieldType.Select) {
				if(!validators.values) {
					validators.values = (f as FieldSelect).options.map(o => o.value);
				}
			}
			// if(!inputField && f.validators?.required) {
			// 	validationErrors.push(`Field "${f.slug}" is required but was not provided.`);
			// 	continue;
			// }

			// Handle array results.
			if(f.allowMultiple && Array.isArray(inputField?.value) && !f.validators?.array) {
				// If the field allows multiple values and the input is an array, turn on the array validator.
				validators.array = true;
			}

			// Handle nested fields.
			if(Utils.isFieldGroup(f)) {
				if(!f.fields?.length) {
					f.fields = [];
				}
				const groupSlugs = Utils.extractSlugs(f.fields as Field[], true);
				const { valid, errors } = await this.validateForm(inputField?.value as FieldResult[], f.fields, files?.filter(f => groupSlugs?.includes(f.fieldname)))
					.catch(err => {
						console.log(err);
						return {
							valid: false,
							errors: [new ValidationError(f.slug, `An error occurred while validating the input for "${f.slug}".`)]
						}
					});

				// console.log(f.slug, valid, errors);

				if(!valid) {
					validationErrors.push(new ValidationError(f.slug, `Field "${f.slug}" is not valid: ` + `One or more of the fields in the group has validation errors.`), ...errors);
				}
			}

			const { valid, errors } = await this.validateInput(inputField?.value, f.slug, validators)
				.catch((err: Error) => {
					console.log(err);
					return { valid: false, errors: [new ValidationError(f.slug, `Field "${f.slug}" is not valid: ` + `An error occurred while validating the input.`)] }
				});

			//console.log(inputField.slug, valid, errors)

			if(errors?.length) {
				validationErrors.push(...errors);
			}
		}

		if(validationErrors.length) {
			return {
				valid: false,
				errors: validationErrors
			};
		} else {
			return {
				valid: true
			};
		}
	}

	public static async validateInput(input: any, name: string, validators: Validators): Promise<ValidationResult> {
		const validatorKeys = Object.keys(validators);

		// // Fields should be required by default.
		// if(!validatorKeys.includes('required')) {
		// 	validatorKeys.push('required');
		// 	validators.required = true;
		// }

		if(!input && validators.required === false) {
			return {
				valid: true
			};
		}

		// Handle array inputs.
		if(Array.isArray(input)) {
			const { array, ...rest } = validators;
			let errors: ValidationError[] = [];

			if(array) {
				const arrayErrors = Validate.array(input, (array === true) ? undefined : array);
				if(arrayErrors?.length) {
					for(const e of arrayErrors) {
						errors.push(new ValidationError(name, `Field "${name}" is not valid: ` + e));
					}
				}
				for(const i of input) {
					const errorResult = await this.validateInput(i, name, rest);
					if(errorResult.errors?.length) {
						errors.push(...errorResult.errors);
					}
				}
			} else {
				errors.push(new ValidationError(name, `Field "${name}" is not valid: ` + `Input is an array but the field does not allow multiple values.`));
			}

			if(errors.length) {
				return {
					valid: false,
					errors
				};
			}
			return {
				valid: true
			};
		}

		const validationErrors: ValidationError[] = [];
		for(const k of validatorKeys) {
			let options = (validators[k] !== true) ? validators[k] : null;
			let errors: string[] = [];
			switch(k) {
				// Not yet implemented.
				// Validate address components directly.
				// case 'address':
				// 	valid = Validate.address
				// 	break;
				case 'boolean':
					errors = Validate.bool(input);
					break;
				case 'email':
					errors = Validate.email(input, (options as EmailValidationOptions)?.restrictions);
					break;
				case 'minAge':
					errors = Validate.age(input, validators[k]);
					break;
				case 'number':
					errors = Validate.number(input, (options as NumberValidationOptions));
					break;
				case 'phone':
					errors = Validate.phone(input, (options as PhoneValidationOptions)?.requirements);
					break;
				case 'required':
					errors = Validate.required(input, validators[k] === false);
					break;
				case 'string':
					errors = Validate.string(input, (options as StringValidationOptions));
					break;
				case 'values':
					errors = Validate.values(input, validators[k]);
					break;
				case 'file':
					errors = Validate.file(input, validators[k]);
					break;
				case 'reCaptcha':
					errors = await Validate.reCaptcha(input, validators[k]);
					break;
				default:
					break;
			}

			if(errors?.length) {
				for(const e of errors) {
					validationErrors.push(new ValidationError(name, `Field "${name}" is not valid: ` + e));
				}
			}
		}

		if(validationErrors.length) {
			return {
				valid: false,
				errors: validationErrors
			};
		}

		return {
			valid: true
		};
	}
}