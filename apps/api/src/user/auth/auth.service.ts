import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, getConnection } from 'typeorm';
import axios from 'axios';

import { JwtPayload } from './jwt-payload.interface';

import { Config } from '../../app.config';

import { Crypt } from '../../_core/crypt';
import { Time as TimeUtils } from '../../_core/utils';

import { User } from '../user.entity';
import { UserService } from '../user.service';
import { JwtService } from '@nestjs/jwt';

import { Organization } from '../../organization/organization.entity';
import {
	AuthenticationStrategyType,
	SAML2_0Challenge
} from '../../authentication-strategy/authentication-strategy.entity';

@Injectable()
export class AuthService {
	constructor(
		private readonly userService: UserService,
		private readonly jwtService: JwtService,
		private readonly dataSource: DataSource
	) {}

	/**
	 * Checks to make sure the user exists, and the token they are using
	 * has not been revoked.
	 *
	 * @param token The raw JWT
	 * @param payload The decoded JWT
	 *
	 * @returns `User` object or `false`
	 */
	public async validateUser(token: string, payload: JwtPayload): Promise<any> {
		const user: User = await this.userService.getUserRaw(payload.id)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!user) {
			throw new Error('Could not find user.');
		}

		// If the user is deactivated,
		// make sure they haven't been re-activated before denying access.
		if(user.deactivated) {
			throw new Error('Access denied.');
		}

		if(!user.authTokens || user.authTokens.indexOf(token) === -1) {
			throw new Error('Token has been revoked.');
		}

		//Extra step: validate Okta token status if present in JWT
		if(payload.oktaOauthToken) {
			// Okta validation.
			const params = new URLSearchParams();
			params.append('token', payload.oktaOauthToken.accessToken);
			params.append('token_type_hint', 'access_token');

			const oktaResponse = await axios
				.post(
					payload.oktaOauthToken.claims.iss +
						'/oauth2/v1/introspect' +
						`?client_id=${payload.oktaOauthToken.claims.cid}`,
					params,
					{
						headers: {
							'Accept': 'application/json',
							'Content-Type': 'application/x-www-form-urlencoded'
						}
					}
				)
				.catch(err => {
					console.log(err);
					return null;
				});

			if(!oktaResponse?.data?.active) {
				throw new Error('Okta reports token invalid.');
			}

			user.oktaOauthToken = payload.oktaOauthToken;
		}

		return user;
	}

	/**
	 * Removes a single auth token (log out current session only).
	 *
	 * @param id The user's id.
	 * @param token The token to remove.
	 */
	public async removeAuthTokens(id: string, token: string) {
		const conn = this.dataSource;
		const result = await conn
			.query(
				...conn.driver.escapeQueryWithParameters(
					`
							UPDATE
								users
							SET
								"authTokens" = array_remove("authTokens", :token)
							WHERE
								id = :id
						`,
					{
						id,
						token
					},
					{}
				)
			)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!result) {
			throw new Error('Error removing token.');
		}

		return result;
	}

	/**
	 * Remove expired auth tokens from the User's account.
	 *
	 * @param id The user's id.
	 */
	public async cleanAuthTokens(id: string) {
		const user: User = await this.userService
			.findOne({
				where: {
					id
				},
				loadEagerRelations: false
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!user) {
			throw new Error('User not found.');
		}

		if(user.authTokens && user.authTokens.length) {
			// Remove bad and stale tokens
			user.authTokens = user.authTokens.filter(t => {
				// Run this as a try/catch
				// jwtService throws an error instead of returning.
				try {
					this.jwtService.verify(t);
				} catch(err) {
					console.log(err);
					console.log(t);
					return false;
				}
				return true;
			});
		}

		return await this.userService.updateOne(user)
			.catch(err => {
				console.log(err);
				return null;
			});
	}

	/**
	 * Replace an old token with a new one.
	 *
	 * @param id The user's id.
	 */
	public async replaceToken(id: string, oldToken: string, newToken: string) {
		const conn = this.dataSource;
		const updated = await conn
			.query(
				...conn.driver.escapeQueryWithParameters(
					`
						UPDATE
							users
						SET
							"authTokens" = ARRAY_REPLACE("authTokens", :oldToken, :newToken)
						WHERE
							id = :id
						RETURNING
							id
						`,
					{
						id,
						oldToken,
						newToken
					},
					{}
				)
			)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!updated?.length) {
			throw new Error('Error replacing token.');
		}

		return updated;
	}

	/**
	 * Generates a single-use password, hash, and expiration date.
	 *
	 * @returns [pass, hash, expire]
	 */
	public async generateSinglePass() {
		const pass = Crypt.randomHex()
			.slice(0, Config.system.security.singlePassLength);

		const hash = await Crypt.hashPassword(pass)
			.catch(err => {
				console.log(err);
				return false;
			});

		const expire = new Date(
			Date.now() + TimeUtils.durationStringToMs(Config.system.security.singlePassExpire)
		)
			.toISOString();

		return [pass, hash, expire];
	}

	/**
	 * Alias for Crypt.checkPassword
	 * @param password The raw password to check.
	 * @param hash A bcrypt password hash.
	 *
	 */
	public async validatePass(password: string, hash: string): Promise<boolean> {
		return Crypt.checkPassword(password, hash);
	}

	public async getUserSAMLChallenge(userId: string, organizationId: string, host: string) {
		if(!host.match(/\/$/)) {
			host += '/';
		}

		const authChallenge: string = Crypt.encrypt(
			JSON.stringify({
				id: userId,
				organizationId,
				host: host,
				nonce: Crypt.randomBase64(),
				expires: Date.now() + TimeUtils.mToMs(5)
			}),
			Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY, userId),
			process.env.PII_SIGNING_OFFSET
		);

		const user = new User({
			id: userId,
			authChallenge
		});

		const userResult = await this.userService.save(user)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!userResult) {
			throw new HttpException(
				`Error saving user authorization.`,
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return Crypt.encrypt(
			JSON.stringify({
				userId: user.id,
				challengeString: user.authChallenge
			}),
			Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY, organizationId),
			process.env.PII_SIGNING_OFFSET
		);
	}

	public async getUserFromSAMLChallenge(
		encryptedChallengeString: string,
		organization: Organization
	): Promise<{ user: User; decryptedChallenge: SAML2_0Challenge }> {
		// Unwrap the challenge to get the user id and user-encrypted data.
		const decryptedChallengeEnvelopeString = Crypt.decrypt(
			encryptedChallengeString,
			Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY, organization.id),
			process.env.PII_SIGNING_OFFSET
		);

		let decryptedChallengeEnvelope: { userId: string; challengeString: string };
		try {
			decryptedChallengeEnvelope = JSON.parse(decryptedChallengeEnvelopeString);
		} catch(err) {
			throw new HttpException(
				`Couldn't parse your credentials. Please try again.`,
				HttpStatus.BAD_REQUEST
			);
		}

		const user: User = await this.userService
			.findOne({
				where: {
					id: decryptedChallengeEnvelope.userId,
					organizationId: organization.id,
					authChallenge: decryptedChallengeEnvelope.challengeString
				},
				relations: ['authenticationStrategy']
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!user) {
			throw new HttpException('Invalid user.', HttpStatus.BAD_REQUEST);
		}

		if(user.deactivated) {
			throw new HttpException('Your account has been deactivated.', HttpStatus.FORBIDDEN);
		}

		if(user.authenticationStrategy?.type !== AuthenticationStrategyType.SAML2_0) {
			throw new HttpException(
				`Your account does not support SAML 2.0.`,
				HttpStatus.BAD_REQUEST
			);
		}

		// Decrypt and verify the user-encrypted challenge data.
		const decryptedChallengeString = Crypt.decrypt(
			decryptedChallengeEnvelope.challengeString,
			Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY, user.id),
			process.env.PII_SIGNING_OFFSET
		);

		if(!decryptedChallengeString) {
			throw new HttpException(
				`Couldn't verify your credentials. Please try again.`,
				HttpStatus.BAD_REQUEST
			);
		}

		let decryptedChallenge: SAML2_0Challenge;
		try {
			decryptedChallenge = JSON.parse(decryptedChallengeString);
		} catch(err) {
			throw new HttpException(
				`Couldn't parse your credentials. Please try again.`,
				HttpStatus.BAD_REQUEST
			);
		}

		if(decryptedChallenge.expires < Date.now()) {
			throw new HttpException(
				`Login request has expired. Please try again.`,
				HttpStatus.BAD_REQUEST
			);
		}

		return { user, decryptedChallenge };
	}
}
