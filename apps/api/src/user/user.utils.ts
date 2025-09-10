import { PermissionType } from './permission/models/permission.enum';
import { Crypt } from '../_core/crypt';

import { User, UserRoleMap } from './user.entity';
import { Validators } from '../_core/fraud-prevention/modules/forms/models';
import { Validation } from '../_core/fraud-prevention/modules/forms/modules/validation/form-validation.module';
import { UserRole } from './user-role.enum';

export interface FormField {
	name: string;
	display_name?: string;
	type: 'text' | 'checkbox' | 'select' | 'group' | 'phone' | 'state' | 'hidden';
	description?: string; // For front-end use only.
	current_value?: any; // For front-end use only.
	options?: any[]; // For front-end use only.
	validators: Validators;
	fields?: FormField[];
}

export class Utils {
	public static hasPermission(user: User, permissionType: PermissionType, campaignId?: string) {
		if(user.role === UserRole.SuperAdmin) {
			return true;
		}
		if(!user.permissions) {
			return false;
		}
		for(const p of user.permissions) {
			if(p.type === permissionType) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Validate registration or profile data based on FormField definitions.
	 * Supports nested groups.
	 *
	 * @param data Profile or registration data that needs validation.
	 * @param fields Array of FormFields with validators
	 */
	public static async validateFormData(data: any, fields?: FormField[]): Promise<any> {
		const errors = [];

		// If nothing has been passed for validation,
		// assume valid.
		if(!fields || !fields.length) {
			return true;
		}

		if(!data && fields && fields.length) {
			throw ['Data is required but has not been provided.'];
		}

		for(const field of fields) {
			// Traverse groups, make sure their internal valdiators pass.
			// Then continue, checking the group as a whole, if it has validators.
			if(field.type === 'group' || field.validators?.group) {
				let groupErrors = [];
				const groupValid = await this.validateFormData(
					data[field.name],
					field.fields
				)
					.catch(err => {
						console.log(err);
						groupErrors = err;
						return false;
					});

				if(!groupValid) {
					console.log('Not valid:', field.name);
					errors.push(`Field Group "${field.name}" has missing or invalid values.`);
					errors.push(...groupErrors);
				}
			}

			// Validate fields.
			if(field.validators) {
				const isValid = await Validation.validateInput(data[field.name], field.name, field.validators)
					.catch(
						err => false
					);

				if(!isValid) {
					console.log('Not valid:', field.name);
					errors.push(`Field "${field.name}" is missing or invalid.`);
				}
			}
		}

		if(errors.length) {
			throw errors;
		}

		return true;
	}

	public static encryptProfile(value: any, userId?: string): string {
		if(!value || !process.env.PII_SIGNING_KEY || !process.env.PII_SIGNING_OFFSET) {
			return;
		}
		try {
			value = JSON.stringify(value);
		} catch(err) {
			console.log(err);
			return;
		}
		try {
			value = Crypt.encrypt(
				value,
				Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY, userId),
				process.env.PII_SIGNING_OFFSET
			);
		} catch(err) {
			console.log(err);
			return;
		}
		return value;
	}

	public static decryptProfile(value: string, userId: string): any {
		if(!value || !process.env.PII_SIGNING_KEY || !process.env.PII_SIGNING_OFFSET) {
			return;
		}
		try {
			value = JSON.parse(
				Crypt.decrypt(
					value,
					Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY, userId),
					process.env.PII_SIGNING_OFFSET
				)
			);
		} catch(err) {
			if(process.env.DEBUG) {
				console.log(err);
			}
			return;
		}
		return value;
	}

	public static getUserSearchScore(query: string, user: User) {
		const name = `${user.profile?.nameFirst} ${user.profile?.nameLast}`.trim()
			.toLowerCase();

		const match = name.match(query.toLowerCase())?.index;
		const wordMatchBonus = name.match(new RegExp(`\\b${query.toLowerCase()}\\b`)) ? 10 : 0;
		const startBonus = match === 0 ? 10 : 0;
		const boundaryBonus = !startBonus && match >= 0 ? (name[match - 1].match(/\s/) ? 5 : 0) : 0;
		const lengthBonus = match >= 0 ? 10 * ((query.length / name.length) * 100 * 0.05) : 0;

		return wordMatchBonus + startBonus + boundaryBonus + lengthBonus;
	}

	// TODO:
	// This needs to be based on role AND permissions
	public static canUserAddRole(ownerRole: string, newRole: string) {
		if(UserRoleMap[ownerRole] > UserRoleMap[newRole]) {
			return false;
		}
		return true;
	}
}
