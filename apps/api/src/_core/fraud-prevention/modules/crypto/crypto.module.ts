import { Crypt } from '../../../crypt';
import { Field } from '../forms/models';

export class FraudPreventionCrypto {
	// Generates a crypto-random 8-bit hex string.
	public static createNonce(): string {
		return Crypt.randomHex(8);
	}

	// Encrypt an object based on Field definition.
	// Note, only root-level keys can be marked "public".
	public static encryptFieldObject(input: Object, fields: Field[], key: string): { public?: Object, encrypted?: string} | Error {
		if(!input || typeof input !== 'object') {
			return new Error(`Couldn't encrypt object.`);
		}
		let publicFields = {};
		let encryptedFields = {};
		for(const [k, v] of Object.entries(input)) {
			let field = fields?.find(f => f.slug === k);
			if(!field) {
				return new Error(`Slug "${k}" not found in field definition.`);
			}
			if(field.public) {
				publicFields[k] = v;
			} else {
				encryptedFields[k] = v;
			}
		}

		let output: { public?: Object, encrypted?: string } = {};
		if(Object.keys(publicFields)?.length) {
			output.public = publicFields;
		}
		if(Object.keys(encryptedFields)?.length) {
			const encryptionResult = this.encryptData(JSON.stringify(encryptedFields), key, process.env.PII_SIGNING_OFFSET);
			if(encryptionResult instanceof Error) {
				return new Error(`Error encrypting field data.`);
			}
			output.encrypted = encryptionResult;
		}
		return output;
	}

	public static decryptFieldObject(input: { public?: Object, encrypted?: string }, key: string) {
		let merged = {
			...input?.public
		};
		if(input?.encrypted) {
			const decrypted = this
				.decryptData(
					input.encrypted,
					key,
					process.env.PII_SIGNING_OFFSET
				);

			if(decrypted instanceof Error) {
				return decrypted;
			}

			let decryptedObject;
			try {
				decryptedObject = JSON.parse(decrypted);
			} catch(err) {
				console.log(err);
				return new Error(`Couldn't parse decrypted object.`);
			}

			merged = {
				...merged,
				...decryptedObject
			};
		}
		return merged;
	}

	// Encrypt a string of data.
	public static encryptData(data: string, key: string, iv: string): string | Error {
		try {
			return Crypt.encrypt(data, key, iv);
		} catch(err) {
			return err;
		}
	}

	// Decrypt an encrypted string of data.
	public static decryptData(data: string, key: string, iv: string): string | Error {
		try {
			return Crypt.decrypt(data, key, iv);
		} catch(err) {
			return err;
		}
	}
}