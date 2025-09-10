import { Field, FieldFile, FieldGroup, FieldReCaptcha, FieldResult, FieldSelect, SelectOption } from '../../../models';
import { FieldType } from '../../../models/field-type.enum';

export class Utils {
	public static isFieldResult(input: any): input is FieldResult {
		return typeof input?.slug !== 'undefined' && typeof input?.value !== 'undefined';
	}

	public static isFieldGroup(field: Field): field is FieldGroup {
		return field.type === FieldType.Group;
	}
	
	public static isFieldSelect(field: Field): field is FieldSelect {
		return field.type === FieldType.Select;
	}

	public static isSelectOption(input: any): input is SelectOption {
		return typeof input?.value !== 'undefined';
	}
	
	public static isFieldReCaptcha(field: Field): field is FieldReCaptcha {
		return field.type === FieldType.ReCaptcha;
	}

	public static isFieldFile(field: Field): field is FieldFile {
		return field.type === FieldType.File;
	}

	public static hasExtraKeys(obj: Object, reference: Object): boolean {
		const keys1 = Object.keys(obj);
		const keys2 = Object.keys(reference);
		return keys1.some(key => !keys2.includes(key));
	}
	
	public static extractSlugs(fields: { slug: string, value?: any, fields?: any[]}[], recursive: boolean = false): string[] {
		return fields.reduce((acc, field) => {
			if(field.value && Array.isArray(field.value)) {
				if(recursive) {
					if(field.value?.every(f => f?.slug)) {
						return acc.concat(field.slug, this.extractSlugs(field.value, recursive));
					}
				}
				return acc.concat(field.slug);
			} else if(field.fields && Array.isArray(field.fields)) {
				if(recursive) {
					return acc.concat(field.slug, this.extractSlugs(field.fields, recursive));
				}
				return acc.concat(field.slug);
			}
	
			return acc.concat(field.slug);
		}, []);
	}

	// This will remove any sensitive data from the field configurations.
	// Right now, it just removes the ReCaptcha secret value.
	public static makeFieldsPublic(fields: Field[] | FieldGroup[]): Field[] {
		return fields?.map(field => {
			if(field.type === FieldType.ReCaptcha) {
				if(field.validators?.reCaptcha?.secret) {
					return {
						...field,
						validators: {
							...field.validators,
							reCaptcha: {
								...field.validators.reCaptcha,
								secret: undefined
							}
						}
					}
				}
			} else if(field.type === FieldType.Group) {
				return {
					...field,
					fields: this.makeFieldsPublic(field.fields)
				};
			}

			return field;
		});
	}
}