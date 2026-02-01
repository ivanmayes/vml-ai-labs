import {
	Field,
	FieldFile,
	FieldGroup,
	FieldReCaptcha,
	FieldResult,
	FieldSelect,
	SelectOption,
} from '../../../models';
import { FieldType } from '../../../models/field-type.enum';

export class Utils {
	public static isFieldResult(input: unknown): input is FieldResult {
		return (
			typeof (input as FieldResult)?.slug !== 'undefined' &&
			typeof (input as FieldResult)?.value !== 'undefined'
		);
	}

	public static isFieldGroup(field: Field): field is FieldGroup {
		return field.type === FieldType.Group;
	}

	public static isFieldSelect(field: Field): field is FieldSelect {
		return field.type === FieldType.Select;
	}

	public static isSelectOption(input: unknown): input is SelectOption {
		return typeof (input as SelectOption)?.value !== 'undefined';
	}

	public static isFieldReCaptcha(field: Field): field is FieldReCaptcha {
		return field.type === FieldType.ReCaptcha;
	}

	public static isFieldFile(field: Field): field is FieldFile {
		return field.type === FieldType.File;
	}

	public static hasExtraKeys(obj: object, reference: object): boolean {
		const keys1 = Object.keys(obj);
		const keys2 = Object.keys(reference);
		return keys1.some((key) => !keys2.includes(key));
	}

	public static extractSlugs(
		fields: { slug: string; value?: unknown; fields?: unknown[] }[],
		recursive: boolean = false,
	): string[] {
		if (!fields) {
			return [];
		}
		return fields.reduce((acc: string[], field) => {
			if (field.value && Array.isArray(field.value)) {
				if (recursive) {
					const valueArray = field.value as {
						slug?: string;
						value?: unknown;
						fields?: unknown[];
					}[];
					if (valueArray?.every((f) => f?.slug)) {
						return acc.concat(
							field.slug,
							this.extractSlugs(
								valueArray as {
									slug: string;
									value?: unknown;
									fields?: unknown[];
								}[],
								recursive,
							),
						);
					}
				}
				return acc.concat(field.slug);
			} else if (field.fields && Array.isArray(field.fields)) {
				if (recursive) {
					return acc.concat(
						field.slug,
						this.extractSlugs(
							field.fields as {
								slug: string;
								value?: unknown;
								fields?: unknown[];
							}[],
							recursive,
						),
					);
				}
				return acc.concat(field.slug);
			}

			return acc.concat(field.slug);
		}, []);
	}

	// This will remove any sensitive data from the field configurations.
	// Right now, it just removes the ReCaptcha secret value.
	public static makeFieldsPublic(fields: Field[] | FieldGroup[]): Field[] {
		return fields?.map((field) => {
			if (field.type === FieldType.ReCaptcha) {
				if (field.validators?.reCaptcha?.secret) {
					return {
						...field,
						validators: {
							...field.validators,
							reCaptcha: {
								...field.validators.reCaptcha,
								secret: '',
							},
						},
					} as Field;
				}
			} else if (field.type === FieldType.Group) {
				const groupField = field as FieldGroup;
				return {
					...groupField,
					fields: this.makeFieldsPublic(groupField.fields),
				} as Field;
			}

			return field;
		});
	}
}
