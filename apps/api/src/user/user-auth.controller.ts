import {
	Controller,
	Post,
	Get,
	UseGuards,
	Request,
	Body,
	HttpException,
	HttpStatus,
	Param,
	Query,
	Req,
	Res
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Any, MoreThan, Raw } from 'typeorm';
import axios from 'axios';
import { Response } from 'express';

import { Roles } from './auth/roles.decorator';
import { RolesGuard } from './auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';

import { UserService } from './user.service';
import { User, ActivationStatus } from './user.entity';
import { UserRole } from './user-role.enum';
import { Utils } from './user.utils';

import { CodeRequestDto, CodeLoginRequestDto, LoginRequestDto, OktaLoginRequestDto } from './dtos';
import { AuthService } from './auth/auth.service';
import { NotificationService } from '../notification/notification.service';
import { RemoteStatus, OrganizationService } from '../organization/organization.service';
import { Organization } from '../organization/organization.entity';
import {
	AuthenticationStrategy,
	AuthenticationStrategyType,
	OktaConfig
} from '../authentication-strategy/authentication-strategy.entity';
import { Crypt } from '../_core/crypt';
import { SAML2_0LoginRequestDto, SAML2_0Response } from './dtos/saml-login-request.dto';
import { PermissionType } from './permission/models/permission.enum';
import { Permissions } from './permission/permission.decorator';
import { PermissionsGuard } from './permission/permission.guard';
import { FraudPrevention } from '../_core/fraud-prevention/fraud-prevention';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';
import { WPPOpen } from '../_core/third-party/wpp-open';
import { WorkspaceHierarchy } from '../_core/third-party/wpp-open/models';
import { WPPOpenLoginRequestDto } from './dtos/wpp-open-login-request.dto';

export const basePath = 'user';
export const SAMLLoginPath = 'auth/saml/:orgSlug/login';

@Controller([basePath, 'sso'])
export class UserAuthController {
	constructor(
		private readonly jwtService: JwtService,
		private readonly userService: UserService,
		private readonly authService: AuthService,
		private readonly notificationService: NotificationService,
		private readonly organizationService: OrganizationService
	) {}

	@Post('sign-out')
	@UseGuards(AuthGuard())
	public async signOut(@Request() req: any) {
		const result = await this.authService.removeAuthTokens(req.user.id)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!result) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, 'Error signing out.'),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(ResponseStatus.Success, 'Goodbye.');
	}

	@Post('/auth/request-sign-in')
	public async requestSignIn(
		@Body() signInRequest: CodeRequestDto
	): Promise<any> {
		// Check the user's authentication strategy

		// Get the org
		const organization: Organization = await this.organizationService
			.getOrganizationRaw(signInRequest.organizationId, true)
			.catch(err => {
				console.log(err);
				return null;
			});

		// check the user's auth strategy as defined in the CMS
		let user: User = await this.userService
			.findOne({
				where: {
					emailNormalized: FraudPrevention.Forms.Normalization.normalizeEmail(signInRequest.email),
					organizationId: organization.id
				},
				loadEagerRelations: false,
				relations: ['authenticationStrategy']
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!user) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'No account found.'),
				HttpStatus.FORBIDDEN
			);
		}

		if(user.deactivated) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Your account has been deactivated.'),
				HttpStatus.FORBIDDEN
			);
		}

		const authStrategyType: AuthenticationStrategyType = user.authenticationStrategy.type;

		// act according to strategy
		if(authStrategyType === AuthenticationStrategyType.Okta) {
			const config: OktaConfig = user.authenticationStrategy.config as OktaConfig;

			// okta sign-in flow
			const authStrategyIssuer: string = `https://${config.oktaDomain}`;
			const authStrategyClientID: string = config.clientId;

			return new ResponseEnvelope(
				ResponseStatus.Success,
				'Okta sign-in flow initiated.',
				{
					strategy: AuthenticationStrategyType.Okta,
					issuer: authStrategyIssuer,
					clientId: authStrategyClientID
				}
			);
		} else if(authStrategyType === AuthenticationStrategyType.Basic) {
			// Basic sign-in flow

			// Generate a single-use password
			const [singlePass, singlePassHash, singlePassExpire] = await this.authService
				.generateSinglePass()
				.catch(err => null);

			if(!singlePass || !singlePassExpire) {
				throw new HttpException(
					new ResponseEnvelope(ResponseStatus.Error, 'Error generating login token.'),
					HttpStatus.INTERNAL_SERVER_ERROR
				);
			} else {
				user.singlePass = singlePassHash;
				user.singlePassExpire = singlePassExpire;
			}

			// Save password
			user = await this.userService.updateOne(user)
				.catch(err => {
					console.log(err);
					return null;
				});

			if(!user) {
				throw new HttpException(
					new ResponseEnvelope(ResponseStatus.Error, 'An error occurred processing your request. Please try again.'),
					HttpStatus.INTERNAL_SERVER_ERROR
				);
			} else {
				user = user as User;
			}

			// Email code to user
			const emailResult = await this.notificationService
				.sendTemplate(
					'login-code',
					user.organizationId,
					{ to: user.email },
					{ 'SINGLE_PASS': singlePass }
				)
				.catch(err => {
					console.log(err);
					return false;
				});

			if(emailResult === false) {
				throw new HttpException(
					new ResponseEnvelope(ResponseStatus.Error, 'An error occurred sending a code to your email. Please try again.'),
					HttpStatus.INTERNAL_SERVER_ERROR
				);
			}

			return new ResponseEnvelope(
				ResponseStatus.Success,
				'A temporary login code has been sent to your email.',
				{ strategy: AuthenticationStrategyType.Basic }
			);
		}
	}

	@Post('/auth/okta/sign-in')
	public async oktaSignIn(@Body() req: OktaLoginRequestDto): Promise<any> {
		const organization: Organization = await this.organizationService
			.getOrganizationRaw(req.organizationId, true)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!organization) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Invalid organizationId.'),
				HttpStatus.NOT_FOUND
			);
		}

		// Validate email
		if(!FraudPrevention.Forms.Validation.Validate.email(req.email)) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Invalid email submitted.'),
				HttpStatus.BAD_REQUEST
			);
		}

		// Check for existing user
		let user = await this.userService
			.findOne({
				where: {
					emailNormalized: FraudPrevention.Forms.Normalization.normalizeEmail(req.email),
					organizationId: organization.id
				},
				loadEagerRelations: false
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!user) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'No account found.'),
				HttpStatus.FORBIDDEN
			);
		}

		if(user.deactivated) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Your account has been deactivated.'),
				HttpStatus.FORBIDDEN
			);
		}

		// Save password
		user = await this.userService.updateOne(user)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!user) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, 'An error occurred processing your request. Please try again.'),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		} else {
			user = user as User;
		}

		// Okta validation.
		const params = new URLSearchParams();
		params.append('token', req.accessToken.accessToken);
		params.append('token_type_hint', 'access_token');

		const oktaResponse = await axios
			.post(
				req.accessToken.claims.iss +
					'/oauth2/v1/introspect' +
					`?client_id=${req.accessToken.claims.cid}`,
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
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Okta reports token invalid.'),
				HttpStatus.UNAUTHORIZED
			);
		}

		// Create a JWT token that is used traditionally by this application, sign with the additional oktaJwt token
		const token = this.jwtService.sign({
			id: user.id,
			email: user.email,
			emailNormalized: user.emailNormalized,
			organizationId: organization.id,
			oktaOauthToken: req.accessToken
		});

		// Update user
		if(!user.authTokens) {
			user.authTokens = [];
		}

		// Push the validated JWT access token
		user.authTokens.push(token);
		user.activationStatus = ActivationStatus.Activated;
		user.singlePass = null;
		user.singlePassExpire = null;

		const userUpdateRequest = await this.userService.updateOne(user)
			.catch(err => {
				console.log(err);
				return false;
			});

		if(!userUpdateRequest) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, 'Error saving auth token. You may not be signed in.'),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		// TODO: User profile things should be merged here
		const userCleaned = {
			id: user.id,
			email: user.email,
			role: user.role,
			organizationId: organization.id,
			privateProfile: user.privateProfile
		};

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Okta sign-in successful.',
			{
				token: token,
				profile: userCleaned
			}
		);
	}

	@Post('/auth/wpp-open/sign-in')
	public async wppOpenSignIn(@Body() loginReq: WPPOpenLoginRequestDto) {
		let error;
		const result = await WPPOpen.validateToken(loginReq.token).catch(err => {
			console.log(err);
			return null;
		});

		if (!result) {
			throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
		}

		const site = await this.organizationService
			.findOne({
				where: { id: loginReq.siteId }
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if (!site) {
			throw new HttpException('Invalid siteId.', HttpStatus.BAD_REQUEST);
		}

		const scope: WorkspaceHierarchy = await WPPOpen
			.getWorkspaceAncestor(loginReq.token, loginReq.workspaceId, loginReq.scopeId)
			.catch(err => {
				console.log(err);
				return null;
			});

		if (!scope?.workspace) {
			throw new HttpException('Invalid workspaceId.', HttpStatus.BAD_REQUEST);
		}

		if (loginReq.scopeId && scope.workspace.id !== loginReq.scopeId) {
			throw new HttpException('Invalid scopeId.', HttpStatus.BAD_REQUEST);
		}

		const email = FraudPrevention.Forms.Normalization.normalizeEmail(result.email);
		let user: User = await this.userService
			.findOne({
				where: {
					emailNormalized: email,
					organizationId: site.id
				}
			})
			.catch(err => {
				console.log(err);
				error = err;
				return null;
			});

		if (error) {
			throw new HttpException('Error finding user.', HttpStatus.INTERNAL_SERVER_ERROR);
		}

		if (!user) {
			const newUser = new User({
				email: email,
				emailNormalized: email,
				organizationId: site.id,
				activationStatus: ActivationStatus.Activated,
				role: UserRole.User,
				authenticationStrategyId: site.defaultAuthenticationStrategyId
			});

			user = await this.userService.addOne(newUser).catch(err => {
				console.log(err);
				return null;
			});

			if (!user) {
				throw new HttpException('Error creating user.', HttpStatus.INTERNAL_SERVER_ERROR);
			}
		}

		let responseData: { token?: string; redirect?: string } = {};

		// Create a JWT
		let token = this.jwtService.sign({
			id: user.id,
			email: user.email,
			emailNormalized: user.emailNormalized,
			siteId: site.id,
			// In case we have deeper integration later
			wppOpenToken: loginReq.token
		});
		// Update user
		if (!user.authTokens) {
			user.authTokens = [];
		}
		user.authTokens.push(token);
		user.activationStatus = ActivationStatus.Activated;
		user.singlePass = null;
		user.singlePassExpire = null;

		const userUpdateRequest = await this.userService.updateOne(user).catch(err => {
			console.log(err);
			return false;
		});

		if (!userUpdateRequest) {
			throw new HttpException('Error saving auth token. You may not be signed in.', HttpStatus.INTERNAL_SERVER_ERROR);
		}

		responseData.token = token;


		return {
			status: 'succeeded',
			...responseData,
			profile: new User(user).toPublic(),
		};
	}

	@Post('/auth/basic/code-sign-in')
	public async codeSignIn(@Body() req: CodeLoginRequestDto): Promise<any> {
		const organization: Organization = await this.organizationService
			.getOrganizationRaw(req.organizationId, true)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!organization) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Invalid organizationId.'),
				HttpStatus.NOT_FOUND
			);
		}

		// Find a user with a valid, matching code
		let user = await this.userService
			.findOne({
				where: {
					emailNormalized: FraudPrevention.Forms.Normalization.normalizeEmail(req.email),
					singlePassExpire: MoreThan('NOW()'),
					organizationId: organization.id
				}
			})
			.catch(err => {
				console.log(err);
				return false;
			});

		// Make sure we could find a user in the DB.
		// Opaque front-end error.
		if(!user) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Invalid login request or expired code.'),
				HttpStatus.UNAUTHORIZED
			);
		} else {
			user = user as User;
			// Purge stale tokens.
			this.authService.cleanAuthTokens(user.id)
				.catch(err => {
					console.log(err);
				});
		}

		// Validate singlePass against the saved hash.
		const passOk = await this.authService
			.validatePass(req.singlePass, user.singlePass)
			.catch(err => {
				console.log(err);
				return false;
			});

		// If the password couldn't validate for any reason, fail.
		if(!passOk) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Invalid login request or expired code.'),
				HttpStatus.UNAUTHORIZED
			);
		}

		// Make sure banned users don't somehow have valid codes.
		if(user.deactivated) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Your account has been deactivated.'),
				HttpStatus.FORBIDDEN
			);
		}

		// Create a JWT
		const token = this.jwtService.sign({
			id: user.id,
			email: user.email,
			emailNormalized: user.emailNormalized,
			organizationId: organization.id
		});
		// Update user
		if(!user.authTokens) {
			user.authTokens = [];
		}
		user.authTokens.push(token);
		user.activationStatus = ActivationStatus.Activated;
		user.singlePass = null;
		user.singlePassExpire = null;

		const userUpdateRequest = await this.userService.updateOne(user)
			.catch(err => {
				console.log(err);
				return false;
			});

		if(!userUpdateRequest) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, 'Error saving auth token. You may not be signed in.'),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Basic sign-in successful.',
			{
				token,
				user: new User(user).toPublic()
			}
		);
	}

	@Get('refresh')
	@UseGuards(AuthGuard())
	public async checkUser(@Request() req): Promise<any> {
		// Extract current JWT
		const oldToken = req.headers.authorization.split(' ')[1];

		// Create a new JWT
		const newToken = this.jwtService.sign({
			id: req.user.id,
			email: req.user.email,
			emailNormalized: req.user.emailNormalized,
			organizationId: req.user.organizationId
		});

		// TODO: Check for and refresh remote auth token.

		const result = await this.authService
			.replaceToken(req.user.id, oldToken, newToken)
			.catch(err => {
				console.log(err);
				return null;
			});

		// When the user checks their login status,
		// go ahead and remove any old or bad tokens.
		this.authService.cleanAuthTokens(req.user.id)
			.catch(err => {
				console.log(err);
			});

		if(!result) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, 'There was an error refreshing your user token.'),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'User token refreshed.',
			{
				token: newToken,
				user: new User(req.user).toPublic()
			}
		);
	}

	@Get('/organization/:orgId/suggest')
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async suggestUsers(@Param('orgId') orgId: string, @Query('query') query: string = '') {
		const users: User[] = await this.userService
			.find({
				where: [
					{
						profile: Raw(alias => `${alias} ->> 'nameFirst' ILIKE :query`, {
							query: `%${query}%`
						}),
						organizationId: orgId
					},
					{
						profile: Raw(alias => `${alias} ->> 'nameLast' ILIKE :query`, {
							query: `%${query}%`
						}),
						organizationId: orgId
					}
				]
			})
			.catch(err => {
				console.log(err);
				return [];
			});

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'User search results.',
			users
				.sort((a, b) => Utils.getUserSearchScore(query, b) - Utils.getUserSearchScore(query, a))
				.map(u => u.toPublic())
		);
	}

	@Get('is-admin')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	//@Permissions(PermissionType.PIIView, PermissionType.PIIExport)
	@UseGuards(AuthGuard(), RolesGuard, PermissionsGuard)
	public async isAdmin(): Promise<any> {
		return new ResponseEnvelope(ResponseStatus.Success, 'You are an admin.');
	}
}
