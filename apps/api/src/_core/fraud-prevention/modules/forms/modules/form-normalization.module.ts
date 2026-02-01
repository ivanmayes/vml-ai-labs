import { S3 } from '../../../../third-party/aws/aws.s3';
import { EmailFakeDotProviders, Field, FieldResult } from '../models';
import { ObjectUtils } from '../../../../utils';

import { Utils } from './validation/utils';

export class Normalization {
	private static readonly fakeDotProviders: string[] = EmailFakeDotProviders;

	// Creates a reasonably canonical email address.
	// Used to help prevent users from providing slight
	// variations on their addresses to gain extra entries.
	public static normalizeEmail(email: string): string | undefined {
		if (!email) {
			return undefined;
		}
		// Strip "+"
		// Remove "." from the email name (for gmail at least)
		// Other things?

		const segments = email.toLowerCase().split('@');

		if (segments[0].includes('+')) {
			segments[0] = segments[0].split('+')[0];
		}

		if (this.fakeDotProviders.includes(segments[1])) {
			segments[0] = segments[0].replace(/\./g, '');
		}

		return segments[0] + '@' + segments[1];
	}

	public static normalizePhone(phone: string): string | undefined {
		if (!phone) {
			return undefined;
		}
		return phone.toString().replace(/[\.\+\-\s]/g, '');
	}

	public static fieldResultsToObject(
		fieldResults: FieldResult[] = [],
		excludedSlugs: string[] = [],
	): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (const f of fieldResults) {
			if (!f.slug) {
				continue;
			}
			if (excludedSlugs.includes(f.slug)) {
				continue;
			}
			if (Array.isArray(f.value)) {
				if (
					(f.value as unknown[]).every((item: unknown) =>
						Utils.isFieldResult(item),
					)
				) {
					obj[f.slug] = this.fieldResultsToObject(
						f.value as FieldResult[],
						excludedSlugs,
					);
				} else {
					obj[f.slug] = f.value as unknown[];
				}
			} else {
				obj[f.slug] = f.value;
			}
		}
		return obj;
	}

	public static objectToFieldResults(
		obj: Record<string, unknown>,
	): FieldResult[] {
		const results: FieldResult[] = [];
		for (const k in obj) {
			let v: FieldResult[] | unknown = obj[k];
			if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
				v = this.objectToFieldResults(v as Record<string, unknown>);
			}
			results.push({
				slug: k,
				value: v as FieldResult[],
			});
		}
		return results;
	}

	public static preProcessFieldOptions(fields: Field[]): Field[] {
		if (!fields?.length) {
			return fields;
		}

		fields = structuredClone(fields);

		for (const f of fields) {
			if (Utils.isFieldGroup(f)) {
				f.fields = this.preProcessFieldOptions(f.fields);
			}
			if (Utils.isFieldSelect(f)) {
				// Shortcut to allow a flat array of options.
				if (f.options?.length) {
					const options = f.options as unknown[];
					f.options = options.map((o: unknown) => {
						if (Utils.isSelectOption(o)) {
							return o;
						} else {
							return {
								value: o as string,
							};
						}
					});
				} else {
					f.options = [];
				}

				// Copy select options into validator if not provided.
				if (!f.validators?.values?.length) {
					if (!f.validators) {
						f.validators = {};
					}
					f.validators.values = f.options?.map((o) => o.value);
				}
			}
		}

		return fields;
	}

	public static async uploadFiles(
		files: Express.Multer.File[],
		uploadFolder: string,
	): Promise<(Express.Multer.File & { s3Path: string })[]> {
		const uploadedFiles: (Express.Multer.File & { s3Path: string })[] =
			[];
		for (const f of files) {
			const result = await S3.upload(
				f.buffer,
				f.originalname,
				f.mimetype,
				uploadFolder,
				true,
				undefined,
			).catch((err: unknown) => {
				console.log(err);
				return null;
			});

			if (!result || !result?.path) {
				throw new Error(`Error uploading file.`);
			}

			uploadedFiles.push({
				...f,
				s3Path: result.path,
			});
		}

		return uploadedFiles;
	}

	public static findFieldBySlug(
		slug: string,
		fields: { slug: string; value?: unknown; fields?: unknown[] }[],
	): { slug: string; value?: unknown; fields?: unknown[] } | -1 {
		for (const f of fields) {
			if (f.slug === slug) {
				return f;
			} else if (f.fields || Array.isArray(f.value)) {
				const nestedFields = (f.fields ?? f.value) as typeof fields;
				const result = this.findFieldBySlug(slug, nestedFields);
				if (result !== -1) {
					return result;
				}
			}
		}
		return -1;
	}

	public static mergeFiles(
		input: FieldResult[],
		fields: Field[],
		uploadedFiles: (Express.Multer.File & { s3Path: string })[] = [],
	): FieldResult[] {
		input = structuredClone(input);

		const result = this.extractFilePaths(fields);
		for (const filePath of result) {
			const segments: string[] = filePath.split('.');

			if (segments.length === 1) {
				const file = uploadedFiles.find(
					(uf) => uf.fieldname === segments[0],
				);
				if (file) {
					input.push({
						slug: file.fieldname,
						value: file.s3Path,
					});
				}
				continue;
			}

			let currentTarget: FieldResult | undefined;
			for (let i = 0; i < segments.length; i++) {
				const s = segments[i];
				const next = i + 1;
				if (s === '[]' && i === 0) {
					// Invalid path definition.
					continue;
				}
				if (!currentTarget) {
					currentTarget = input.find((item) => item.slug === s);
				} else if (s === '[]') {
					// This will create the value for a group automatically.
					// This is a shortcut for handling files that are defined in groups with no other fields.
					if (typeof currentTarget?.value === 'undefined') {
						currentTarget.value = [];
					}
					// Doesn't match form definition.
					else if (!Array.isArray(currentTarget.value)) {
						continue;
					}
					const valueArray = currentTarget.value as FieldResult[];
					const found = valueArray.find(
						(t: FieldResult) => t.slug === segments[next],
					);
					if (found) {
						currentTarget = found;
					} else if (i + 1 === segments.length - 1) {
						const matchingFile = uploadedFiles.find(
							(f) => f.fieldname === segments[next],
						);
						if (matchingFile) {
							valueArray.push({
								slug: segments[next],
								value: matchingFile.s3Path,
							});
						}
					} else {
						// Doesn't match schema;
					}
				}
			}
		}

		return input;
	}

	public static extractSlugs(
		fields: FieldResult[],
		_recursive: boolean = false,
	): string[] {
		return Utils.extractSlugs(fields, true);
	}

	public static extractFiles(
		input: Record<string, unknown>,
		fields: Field[],
	): string[] {
		const paths = this.extractFilePaths(fields);
		const slugs = paths.map((p) => {
			const segments = p.split('.');
			return segments[segments.length - 1];
		});

		const files: string[] = [];
		for (const s of slugs) {
			if (s) {
				const f = ObjectUtils.getPropertyByName(input, s);
				if (f && f !== -1) {
					files.push(f as string);
				}
			}
		}

		return files;
	}

	public static extractFilePaths(
		fields: Field[],
		path: string = '',
	): string[] {
		const paths: string[] = [];
		for (const f of fields) {
			if (Utils.isFieldFile(f)) {
				paths.push(path + `${path?.length ? '.' : ''}${f.slug}`);
			} else if (Utils.isFieldGroup(f)) {
				paths.push(
					...this.extractFilePaths(
						f.fields,
						path + `${path?.length ? '.' : ''}${f.slug}.[]`,
					),
				);
			}
		}
		return paths;
	}
}
