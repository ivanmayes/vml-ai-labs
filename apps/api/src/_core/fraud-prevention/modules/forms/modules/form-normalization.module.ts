import { HttpException, HttpStatus } from '@nestjs/common';
import { S3 } from '../../../../third-party/aws/aws.s3';
import { EmailFakeDotProviders, Field, FieldResult } from '../models';
import { FieldType } from '../models/field-type.enum';
import { Utils } from './validation/utils';
import { ObjectUtils } from '../../../../utils';

export class Normalization {
	private static readonly fakeDotProviders: string[] = EmailFakeDotProviders;

	// Creates a reasonably canonical email address.
	// Used to help prevent users from providing slight
	// variations on their addresses to gain extra entries.
	public static normalizeEmail(email: string): string {
		if(!email) {
			return;
		}
		// Strip "+"
		// Remove "." from the email name (for gmail at least)
		// Other things?

		const segments = email.toLowerCase()
			.split('@');

		if(segments[0].includes('+')) {
			segments[0] = segments[0].split('+')[0];
		}

		if(this.fakeDotProviders.includes(segments[1])) {
			segments[0] = segments[0].replace(/\./g, '');
		}

		return segments[0] + '@' + segments[1];
	}

	public static normalizePhone(phone: string) {
		if(!phone) {
			return;
		}
		return phone
			.toString()
			.replace(/[\.\+\-\s]/g, '');
	}

	public static fieldResultsToObject(fieldResults: FieldResult[] = [], excludedSlugs: string[] = []): Object {
		let obj = {};
		for(const f of fieldResults) {
			if(!f.slug) {
				continue;
			}
			if(excludedSlugs.includes(f.slug)) {
				continue;
			}
			if(Array.isArray(f.value)) {
				if((f.value as Array<any>).every(f => Utils.isFieldResult(f))) {
					obj[f.slug] = this.fieldResultsToObject(f.value as FieldResult[], excludedSlugs);
				} else {
					obj[f.slug] = f.value as any[];
				}
			} else {
				obj[f.slug] = f.value;
			}
		}
		return obj;
	}

	public static objectToFieldResults(obj: Object): FieldResult[] {
		let results: FieldResult[] = [];
		for(const k in obj) {
			let v = obj[k];
			if(typeof v === 'object') {
				v = this.objectToFieldResults(v);
			}
			results.push({
				slug: k,
				value: v
			});
		}
		return results;
	}

	public static preProcessFieldOptions(fields: Field[]) {
		if(!fields?.length) {
			return fields;
		}

		fields = structuredClone(fields);

		for(let f of fields) {
			if(Utils.isFieldGroup(f)) {
				f.fields = this.preProcessFieldOptions(f.fields);
			}
			if(Utils.isFieldSelect(f)) {
				// Shortcut to allow a flat array of options.
				if(f.options?.length) {
					f.options = f.options as any[];
					f.options = f.options.map(o => {
						if(Utils.isSelectOption(o)) {
							return o;
						} else {
							return {
								value: o
							};
						}
					})
				} else {
					f.options = [];
				}

				// Copy select options into validator if not provided.
				if(!f.validators?.values?.length) {
					if(!f.validators) {
						f.validators = {};
					}
					f.validators.values = f.options?.map(o => o.value);
				}
			}
		}
		
		return fields;
	}

	public static async uploadFiles(
		files: Express.Multer.File[],
		uploadFolder: string
	) {
		let uploadedFiles: Array<Express.Multer.File & { s3Path: string }> = [];
		for(const f of files) {
			const result = await S3
				.upload(
					f.buffer,
					f.originalname,
					f.mimetype,
					uploadFolder,
					true,
					null
				)
				.catch(err => {
					console.log(err);
					return null;
				});

			if(!result || !result?.path) {
				throw new Error(`Error uploading file.`);
			}

			uploadedFiles.push({
				...f,
				s3Path: result.path
			});
		}

		return uploadedFiles;
	}

	public static findFieldBySlug(slug: string, fields: { slug: string, value?: any, fields?: any[]}[]) {
		for(const f of fields) {
			if(f.slug === slug) {
				return f;
			} else if(f.fields || Array.isArray(f.value)) {
				const result = this.findFieldBySlug(slug, f.fields ?? f.value);
				if(result !== -1) {
					return result;
				}
			}
		}
		return -1;
	}

	public static mergeFiles(
		input: FieldResult[],
		fields: Field[],
		uploadedFiles: Array<Express.Multer.File & { s3Path: string }> = []
	) {
		input = structuredClone(input);

		const result = this.extractFilePaths(fields);
		for(const filePath of result) {
			const segments: string[] = filePath.split('.');

			if(segments.length === 1) {
				const file = uploadedFiles.find(uf => uf.fieldname === segments[0]);
				if(file) {
					input.push({
						slug: file.fieldname,
						value: file.s3Path
					});
				}
				continue;
			}

			let currentTarget;
			for(let i = 0; i < segments.length; i++) {
				let s = segments[i];
				const next = i + 1;
				if(s === '[]' && i === 0) {
					// Invalid path definition.
					continue;
				}
				if(!currentTarget) {
					currentTarget = input.find(i => i.slug === s);
				} else if(s === '[]') {
					// This will create the value for a group automatically.
					// This is a shortcut for handling files that are defined in groups with no other fields.
					if(typeof currentTarget?.value === 'undefined') {
						currentTarget.value = [];
					}
					// Doesn't match form definition.
					else if(!Array.isArray(currentTarget.value)) {
						continue;
					}
					const found = currentTarget.value.find(t => t.slug === segments[next]);
					if(found) {
						currentTarget = found;
					} else if(i + 1 === segments.length - 1) {
						currentTarget.value.push({
							slug: segments[next],
							value: uploadedFiles.find(f => f.fieldname === segments[next]).s3Path
						});
					} else {
						// Doesn't match schema;
					}
				}
			}
		}

		return input;
	}

	public static extractSlugs(fields: FieldResult[], recursive: boolean = false): string[] {
		return Utils
			.extractSlugs(fields, true);
	}

	public static extractFiles(
		input: Object,
		fields: Field[]
	): string[] {
		const paths = this.extractFilePaths(fields);
		const slugs = paths.map(p => {
			let segments = p.split('.');
			return segments.at(-1);
		});

		let files = [];
		for(const s of slugs) {
			let f = ObjectUtils.getPropertyByName(input, s);
			if(f && f !== -1) {
				files.push(f);
			}
		}

		return files;
	}

	public static extractFilePaths(fields: Field[], path: string = '') {
		let paths = [];
		for(const f of fields) {
			if(Utils.isFieldFile(f)) {
				paths.push(path + `${path?.length ? '.' : ''}${f.slug}`);
			} else if(Utils.isFieldGroup(f)) {
				paths.push(...this.extractFilePaths(f.fields, path + `${path?.length ? '.' : ''}${f.slug}.[]`));
			}
		}
		return paths;
	}
}