import { isEmail } from 'class-validator';
import axios from 'axios';

import { Normalization } from '../../form-normalization.module';
import {
	ArrayValidationOptions,
	FileValidationOptions,
	NumberValidationOptions,
	ReCaptchaValidationOptions,
	StringValidationOptions,
} from '../../../models';

export class Validate {
	// TODO:
	// We probably want to use a third-party service like USPS for this.
	// For now, we can add specific states or ZIP codes to the individual field validators.
	// public static address(components: string[], requirements: any) {

	// }

	public static email(
		email: string,
		restrictions: (string | RegExp)[] = [],
	): string[] {
		const errors: string[] = [];
		// Step one, make sure this is a real email at all
		let badEmail = !isEmail(email);

		if (badEmail) {
			errors.push(`Invalid email address: "${email}"`);
		}

		const emailNormalized = Normalization.normalizeEmail(email);

		if (!restrictions) {
			restrictions = [];
		}

		// Step two, iterate rule restrictions
		restrictions.forEach((r) => {
			const pattern: RegExp = r instanceof RegExp ? r : new RegExp(r);
			if (emailNormalized?.match(pattern)) {
				badEmail = true;
			}
		});

		// This email has been explicitly blacklisted
		if (badEmail) {
			errors.push(
				`Email address does not meet validation requirements: "${email}"`,
			);
		}

		return errors;
	}

	public static phone(phone: string, countries?: string[]): string[] {
		const errors: string[] = [];
		if (!phone) {
			return [`No phone number provided to validate.`];
		}

		// Remove non-numbers
		phone = phone.replace(/[^0-9]+/g, '');

		// If no validators are passed,
		// default to checking US phone numbers
		if (!countries?.length || !Array.isArray(countries)) {
			countries = ['US'];
		}

		for (let i = 0; i < countries.length; i++) {
			const country = countries[i];
			switch (country) {
				case 'US':
				default:
					// +1 (###) ###-#### | (###) ###-#####
					// At some point we probably want to validate area codes
					// and prefixes. Right now we just test to see if it's
					// US (+1) and 10 digits.
					if (!phone.match(/(^1[0-9]{10}$)|(^[0-9]{10}$)/)) {
						errors.push(
							`Input "${phone}" does not appear to be a valid phone number.`,
						);
					}
					break;
			}
		}

		return errors;
	}

	public static required(input: any, optional: boolean = false): string[] {
		const errorMessage = `A value is required.`;
		if (optional) {
			return [];
		}
		if (
			typeof input !== 'undefined' &&
			input !== null &&
			!Number.isNaN(input) &&
			input !== false
		) {
			if (typeof input === 'string' && input.trim().length === 0) {
				return [errorMessage];
			}
			if (Array.isArray(input) && !input.length) {
				return [errorMessage];
			}
			if (typeof input === 'object' && !Object.keys(input).length) {
				return [errorMessage];
			}
			return [];
		}
		return [errorMessage];
	}

	public static string(
		str: any,
		options?: StringValidationOptions,
	): string[] {
		const errors: string[] = [];
		if (typeof str !== 'string' || !str?.trim()?.length) {
			errors.push(`Input value "${str}" is not a valid string.`);
		}
		if (options?.minLength && str?.length < options.minLength) {
			errors.push(
				`Input value "${str}" is too short. Minimum length is: ${options.minLength}`,
			);
		}
		if (options?.maxLength && str?.length > options.maxLength) {
			errors.push(
				`Input value "${str}" is too long. Maximum length is: ${options.maxLength}`,
			);
		}
		return errors;
	}

	public static age(input: unknown, targetAge: number): string[] {
		const errors: string[] = [];
		const now = new Date();
		const then = new Date(input as string | number | Date);

		if (!(then instanceof Date && isFinite(then.getTime()))) {
			errors.push(`Input is not a valid date: "${input}"`);
			return errors;
		}

		const years = now.getFullYear() - then.getFullYear();
		const months = now.getMonth() - then.getMonth();

		if (
			years < targetAge ||
			(years === targetAge &&
				(months < 0 ||
					(months === 0 && now.getDate() < then.getDate())))
		) {
			errors.push(
				`Input "${input}" does not meet the age requirement of: "${targetAge}"`,
			);
		}

		return errors;
	}

	public static bool(input: unknown): string[] {
		// Strict on true, lenient on false (allows for optional booleans to be validated).
		const valid =
			input === true ||
			input == false ||
			typeof input === 'undefined' ||
			input === null;
		if (!valid) {
			return [`Input is not a boolean: "${input}"`];
		}
		return [];
	}

	public static number(
		input: any,
		options?: NumberValidationOptions,
	): string[] {
		const errors: string[] = [];
		// Note: isNaN alone tries to coerce to a number first.
		if (input?.toString) {
			input = input.toString();
		}
		const valid = !isNaN(input);
		if (!valid) {
			errors.push(`Input "${input}" is not a valid number.`);
		} else {
			const num = Number(input);
			if (options?.min && num < options.min) {
				errors.push(
					`Input "${input}" is too low. Minimum value is: ${options.min}`,
				);
			}
			if (options?.max && num > options.max) {
				errors.push(
					`Input "${input}" is too high. Maximum value is: ${options.max}`,
				);
			}
		}
		return errors;
	}

	public static array(
		input: any[],
		options?: ArrayValidationOptions,
	): string[] {
		const errors: string[] = [];
		if (!Array.isArray(input)) {
			errors.push(`Input "${input}" is not an array.`);
		}
		if (options?.minLength && input.length < options.minLength) {
			errors.push(
				`Input "${input}" is too short. Minimum length is: ${options.minLength}`,
			);
		}
		if (options?.maxLength && input.length > options.maxLength) {
			errors.push(
				`Input "${input}" is too long. Maximum length is: ${options.maxLength}`,
			);
		}
		return errors;
	}

	public static values(input: unknown, values: unknown[]): string[] {
		if (!Array.isArray(values) || !values?.length) {
			return [];
		}
		const valid = values.includes(input);
		if (!valid) {
			return [
				`Input "${input}" is not in the list of acceptable values.`,
			];
		}
		return [];
	}

	public static file(
		input: { buffer?: unknown; size?: number; mimetype?: string } | null,
		options: FileValidationOptions,
	): string[] {
		const errors: string[] = [];
		if (!input?.buffer || !input) {
			errors.push(`File is empty.`);
		}

		if (typeof options?.maxBytes !== 'undefined') {
			if (!input?.size || input?.size > options.maxBytes) {
				errors.push(
					`File size "${input?.size}" exceeds the maximum limit of: ${options.maxBytes} bytes`,
				);
			}
		}

		if (typeof options?.mimeTypes !== 'undefined') {
			if (
				!input?.mimetype ||
				!options.mimeTypes?.includes(input.mimetype)
			) {
				errors.push(
					`File has an invalid mime-type: ${input?.mimetype}`,
				);
			}
		}

		return errors;
	}

	public static async reCaptcha(
		input: string,
		options: ReCaptchaValidationOptions,
	): Promise<string[]> {
		const errors: string[] = [];
		if (!input) {
			errors.push(`No reCaptcha response provided.`);
		}

		if (typeof options?.secret !== 'string' || !options?.secret) {
			errors.push(`ReCaptcha is misconfigured.`);
		}

		if (errors.length) {
			return errors;
		}

		const params = new URLSearchParams();
		params.append('secret', options.secret);
		params.append('response', input);

		const response = await axios
			.post('https://www.google.com/recaptcha/api/siteverify', params, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
			})
			.then((res) => res.data)
			.catch((err) => err.response?.data ?? err.message ?? err);

		if (response.success !== true) {
			errors.push(`ReCaptcha validation failed.`);
		}

		return errors;
	}
}
