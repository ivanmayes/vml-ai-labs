/**
 * NPM Modules
 */
import crypto, { Encoding } from 'crypto';

import bcrypt from 'bcrypt';

export enum CIPHERS {
	AES_128 = 'aes128',
	AES_128_CBC = 'aes-128-cbc',
	AES_192 = 'aes192',
	AES_256 = 'aes256',
}

export enum CIPHER_ENCODINGS {
	'ascii',
	'utf8',
	'hex',
	'base64',
}

export class Crypt {
	private static readonly bcryptSaltRounds =
		process.env.BCRYPT_SALT_ROUNDS || 11;

	/**
	 * Creates a cryptographically secure random number.
	 *
	 * @param bytes (optional) Number of bytes of randomness to generate
	 */
	public static random(bytes = 32): number {
		// Get bytes, convert to 32-bit int, divide by 32-bit max for 0-1 decimal.
		return crypto.randomBytes(bytes).readUInt32LE(0) / 0xffffffff;
	}

	/**
	 * Creates a cryptographically secure random hex string.
	 *
	 * @param bytes (optional) Number of bytes of randomness to generate.
	 */
	public static randomHex(bytes = 32): string {
		const buf = crypto.randomBytes(bytes);
		// Convert buffer to hex.
		return buf.toString('hex');
	}

	/**
	 * Creates a cryptographically secure random base64 string.
	 *
	 * @param bytes (optional) Number of bytes of randomness to generate.
	 */
	public static randomBase64(bytes = 32): string {
		const buf = crypto.randomBytes(bytes);
		// Convert buffer to base64.
		return buf.toString('base64');
	}

	public static encrypt(
		data: string,
		key: string,
		iv: string,
		algorithm: CIPHERS = CIPHERS.AES_256,
		encoding: Encoding = 'base64',
	): string {
		const cipher = crypto.createCipheriv(
			algorithm,
			Buffer.from(key, 'base64'),
			iv,
		);

		return cipher.update(data, 'utf8', encoding) + cipher.final(encoding);
	}

	public static decrypt(
		data: string,
		key: string,
		iv: string,
		algorithm: CIPHERS = CIPHERS.AES_256,
		encoding: Encoding = 'base64',
	): string {
		const decipher = crypto.createDecipheriv(
			algorithm,
			Buffer.from(key, 'base64'),
			iv,
		);

		return decipher.update(data, encoding) + decipher.final('utf8');
	}

	public static createSHA256Hash(...args: string[]): string {
		const sha = crypto.createHash('sha256');
		sha.update(args.join(''));
		return sha.digest('base64');
	}

	public static createHMACHash(secret: string, ...args: string[]): string {
		const hmac = crypto.createHmac('sha256', secret);
		hmac.update(args.join(''));
		return hmac.digest('base64');
	}

	/**
	 * Generates a bcrypt hash for a given password.
	 * @param password The plain-text password to hash.
	 *
	 * @returns Hashed password.
	 */
	public static async hashPassword(password: string): Promise<string> {
		return bcrypt.hash(password, this.bcryptSaltRounds);
	}

	/**
	 * Checks to make sure a password matches a given bcrypt hash.
	 * @param password The plain-text password to match.
	 * @param hash A bcrypt hash to validate.
	 *
	 */
	public static async checkPassword(
		password: string,
		hash: string,
	): Promise<boolean> {
		return bcrypt.compare(password, hash);
	}
}
