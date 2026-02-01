import { CognitoIdentityServiceProvider, AWSError } from 'aws-sdk';
import * as jwt from 'jsonwebtoken';
import jwkToPem, { JWK } from 'jwk-to-pem';

import { Crypt } from '../../crypt';

declare interface JWKS {
	keys: JWK[];
}

export interface UserAttribute {
	Name: string;
	Value: string;
}

export class Cognito {
	private static readonly _isDebug = process.env.DEBUG || false;

	private static cognitoConfig = {
		region: process.env.AWS_COGNITO_REGION,
		userPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
		appClientId: process.env.AWS_COGNITO_APP_CLIENT_ID ?? '',
		appClientSecret: process.env.AWS_COGNITO_APP_CLIENT_SECRET ?? '',
		jwk: process.env.AWS_COGNITO_JWK_JSON
			? (JSON.parse(
					Buffer.from(
						process.env.AWS_COGNITO_JWK_JSON,
						'base64',
					).toString(),
				) as JWKS)
			: null,
	};

	public static async signUp(
		username: string,
		password: string,
		userAttributes: UserAttribute[],
	) {
		const cisp = this.getCISP();

		let error: AWSError | undefined;
		const response: CognitoIdentityServiceProvider.SignUpResponse | null =
			await cisp
				.signUp({
					ClientId: this.cognitoConfig.appClientId,
					Username: username,
					Password: password,
					SecretHash: this.getSecretHash(username),
					UserAttributes: userAttributes,
				})
				.promise()
				.catch((err: AWSError) => {
					if (this._isDebug) {
						console.log(err);
					}
					error = err;
					return null;
				});

		if (!response) {
			throw error;
		}

		return response;
	}

	public static async verify(username: string, confirmationCode: string) {
		const cisp = this.getCISP();

		let error: AWSError | undefined;
		const response: CognitoIdentityServiceProvider.ConfirmSignUpResponse | null =
			await cisp
				.confirmSignUp({
					ClientId: this.cognitoConfig.appClientId,
					ConfirmationCode: confirmationCode,
					Username: username,
					SecretHash: this.getSecretHash(username),
				})
				.promise()
				.catch((err: AWSError) => {
					if (this._isDebug) {
						console.log(err);
					}
					error = err;
					return null;
				});

		if (!response) {
			throw error;
		}

		return response;
	}

	public static async signIn(username: string, password: string) {
		const cisp = this.getCISP();

		let error: AWSError | undefined;
		const response: CognitoIdentityServiceProvider.InitiateAuthResponse | null =
			await cisp
				.initiateAuth({
					AuthFlow: 'USER_PASSWORD_AUTH',
					ClientId: this.cognitoConfig.appClientId,
					AuthParameters: {
						SECRET_HASH: this.getSecretHash(username),
						USERNAME: username,
						PASSWORD: password,
					},
				})
				.promise()
				.catch((err: AWSError) => {
					if (this._isDebug) {
						console.log(err);
					}
					error = err;
					return null;
				});

		if (!response) {
			throw error;
		}

		return response;
	}

	public static async refreshToken(idToken: string, refreshToken: string) {
		const cisp = this.getCISP();

		const userData: any = await this.decodeToken(idToken).catch(
			(err: Error) => {
				console.log(err);
			},
		);

		let error: AWSError | undefined;
		const response: CognitoIdentityServiceProvider.InitiateAuthResponse | null =
			await cisp
				.initiateAuth({
					AuthFlow: 'REFRESH_TOKEN_AUTH',
					ClientId: this.cognitoConfig.appClientId,
					AuthParameters: {
						SECRET_HASH: this.getSecretHash(userData.sub),
						REFRESH_TOKEN: refreshToken,
					},
				})
				.promise()
				.catch((err: AWSError) => {
					if (this._isDebug) {
						console.log(err);
					}
					error = err;
					return null;
				});

		// Response may be empty on success.
		// Check for error instead.
		if (error) {
			throw error;
		}

		return response;
	}

	private static getCISP() {
		return new CognitoIdentityServiceProvider({
			region: this.cognitoConfig.region,
			accessKeyId: process.env.AWS_COGNITO_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_COGNITO_ACCESS_KEY_SECRET,
		});
	}

	private static getSecretHash(userId: string) {
		return Crypt.createHMACHash(
			this.cognitoConfig.appClientSecret,
			userId,
			this.cognitoConfig.appClientId,
		);
	}

	// TODO: Move to auth
	private static async decodeToken(token: string) {
		return jwt.decode(token);
	}

	// TODO: Move to auth
	// @ts-expect-error - verifyToken is unused but kept for future use
	private static async verifyToken(token: string) {
		if (!this.cognitoConfig.jwk) {
			throw new Error('JWK configuration is not set');
		}
		const pem = jwkToPem(this.cognitoConfig.jwk.keys[0]);

		return jwt.verify(token, pem, { algorithms: ['RS256'] });
	}
}
