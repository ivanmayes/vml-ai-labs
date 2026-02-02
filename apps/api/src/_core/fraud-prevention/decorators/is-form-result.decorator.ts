import {
	ValidationOptions,
	registerDecorator,
	buildMessage,
	ValidationArguments,
} from 'class-validator';

export function isFormResult(value: any, args: ValidationArguments) {
	if (!value && args.constraints.find((c) => c.optional)) {
		return true;
	}

	if (typeof value === 'string') {
		try {
			value = JSON.parse(value);
		} catch (err) {
			return false;
		}
	}

	if (!Array.isArray(value)) {
		return false;
	}

	for (const item of value) {
		if (!item) {
			return false;
		}
		if (Array.isArray(item?.value)) {
			return isFormResult(item.value, args);
		}
		if (typeof item.slug !== 'string' || !item.slug.length) {
			return false;
		}
		if (
			typeof item.value === 'string' ||
			typeof item.value === 'number' ||
			typeof item.value === 'boolean'
		) {
			continue;
		}
	}

	return true;
}

export class FormResultOptions {
	optional?: boolean;
}

export function IsFormResult(
	options?: FormResultOptions,
	validationOptions?: ValidationOptions,
) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isFormResult',
			async: false,
			target: object.constructor,
			propertyName: propertyName,
			options: validationOptions,
			constraints: [{ optional: options?.optional }],
			validator: {
				defaultMessage: buildMessage(
					(_eachPrefix: string) =>
						'$property must be Array<FieldResult> ({ slug: string, value: string | number | boolean | FieldResult[] })',
					validationOptions,
				),
				validate: isFormResult,
			},
		});
	};
}
