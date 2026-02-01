import { Crypt } from '../../../crypt';
import { Field } from '../forms/models';

export class FraudPreventionCrypto {
	// Generates a crypto-random 8-bit hex string.
	public static createNonce(): string {
		return Crypt.randomHex(8);
	}

	// Encrypt an object based on Field definition.
	// Note, only root-level keys can be marked "public".
	public static encryptFieldObject(
		input: Record<string, unknown>,
		fields: Field[],
		key: string,
	): { public?: Record<string, unknown>; encrypted?: string } | Error {
		if (!input || typeof input !== 'object') {
			return new Error(`Couldn't encrypt object.`);
		}
		const publicFields: Record<string, unknown> = {};
		const encryptedFields: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(input)) {
			const field = fields?.find((f) => f.slug === k);
			if (!field) {
				return new Error(`Slug "${k}" not found in field definition.`);
			}
			if (field.public) {
				publicFields[k] = v;
			} else {
				encryptedFields[k] = v;
			}
		}

		const output: { public?: Record<string, unknown>; encrypted?: string } =
			{};
		if (Object.keys(publicFields)?.length) {
			output.public = publicFields;
		}
		if (Object.keys(encryptedFields)?.length) {
			const encryptionResult = this.encryptData(
				JSON.stringify(encryptedFields),
				key,
				process.env.PII_SIGNING_OFFSET ?? '',
			);
			if (encryptionResult instanceof Error) {
				return new Error(`Error encrypting field data.`);
			}
			output.encrypted = encryptionResult;
		}
		return output;
	}

	public static decryptFieldObject(
		input: { public?: Record<string, unknown>; encrypted?: string },
		key: string,
	): Record<string, unknown> | Error {
		let merged: Record<string, unknown> = {
			...input?.public,
		};
		if (input?.encrypted) {
			const decrypted = this.decryptData(
				input.encrypted,
				key,
				process.env.PII_SIGNING_OFFSET ?? '',
			);

			if (decrypted instanceof Error) {
				return decrypted;
			}

			let decryptedObject: Record<string, unknown>;
			try {
				decryptedObject = JSON.parse(decrypted) as Record<
					string,
					unknown
				>;
			} catch (_err) {
				return new Error(`Couldn't parse decrypted object.`);
			}

			merged = {
				...merged,
				...decryptedObject,
			};
		}
		return merged;
	}

	// Encrypt a string of data.
	public static encryptData(
		data: string,
		key: string,
		iv: string,
	): string | Error {
		try {
			return Crypt.encrypt(data, key, iv);
		} catch (err) {
			return err as Error;
		}
	}

	// Decrypt an encrypted string of data.
	public static decryptData(
		data: string,
		key: string,
		iv: string,
	): string | Error {
		try {
			return Crypt.decrypt(data, key, iv);
		} catch (err) {
			return err as Error;
		}
	}
}
