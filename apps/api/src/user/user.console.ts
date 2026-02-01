import 'colors';
import { Console, Command } from 'nestjs-console';
import { JwtService } from '@nestjs/jwt';

import { ErrorLevel, Utils } from '../_core/utils/utils.console';
import { Organization } from '../organization/organization.entity';
import { OrganizationService } from '../organization/organization.service';
import { AuthenticationStrategy } from '../authentication-strategy/authentication-strategy.entity';
import { AuthenticationStrategyService } from '../authentication-strategy/authentication-strategy.service';
import { AuthenticationStrategyConsole } from '../authentication-strategy/authentication-strategy.console';
import { FraudPrevention } from '../_core/fraud-prevention/fraud-prevention';

import { ActivationStatus, User } from './user.entity';
import { UserRole } from './user-role.enum';
import { UserService } from './user.service';

@Console()
export class UserConsole {
	constructor(
		private readonly organizationService: OrganizationService,
		private readonly userService: UserService,
		private readonly authenticationStrategyService: AuthenticationStrategyService,
		private readonly authenticationStrategyConsole: AuthenticationStrategyConsole,
		private readonly jwtService: JwtService,
	) {}

	// npm run console:dev GetUserToken <id>
	@Command({
		command: 'GetUserToken <id>',
		description: 'Generates and returns an auth token for a given user id.',
	})
	public async getUserToken(id: string) {
		const user: User | null = await this.userService
			.findOne({
				where: {
					id,
				},
			})
			.catch(() => {
				return null;
			});

		// Make sure we could find a user in the DB.
		// Opaque front-end error.
		if (!user) {
			throw new Error(`User not found.`);
		}

		// Create a JWT
		const token = this.jwtService.sign({
			id: user.id,
			email: user.email,
			emailNormalized: user.emailNormalized,
			organizationId: user.organizationId,
		});
		// Update user
		if (!user.authTokens) {
			user.authTokens = [];
		}
		user.authTokens.push(token);
		user.activationStatus = ActivationStatus.Activated;

		const userUpdateRequest = await this.userService
			.updateOne(user)
			.catch(() => {
				return false;
			});

		if (!userUpdateRequest) {
			throw new Error(`User could not be updated.`);
		}

		// Output token to stdout for CLI usage (intentional for dev tooling)
		process.stdout.write(Utils.formatMessage(`Token generated:\n`));
		process.stdout.write(Utils.formatMessage(token) + '\n');
	}

	// npm run console:dev InstallUser
	@Command({
		command: 'InstallUser',
		description: 'Installs a user for a given organization.',
	})
	public async installUserCmd() {
		await this.installUser().catch(() => undefined);
	}

	public async installUser(organization?: Organization) {
		console.log(`::Creating new User::`.bgYellow.black.bold);

		let selectedOrg: Organization;

		if (organization) {
			selectedOrg = organization;
		} else {
			const orgs: Organization[] | null = await this.organizationService
				.find()
				.catch(() => {
					return null;
				});

			if (!orgs?.length) {
				throw Utils.formatMessage(
					`Couldn't find any Organizations. Make sure at least one is installed.`,
					ErrorLevel.Error,
				);
			}

			console.log(`Which Organization should this User belong to?`.bold);
			console.log('\tPlease make a selection:');
			for (let i = 0; i < orgs.length; i++) {
				const o = orgs[i];
				const idx =
					i === 0
						? ` ${i.toString().bgWhite.black.bold} `
						: ` ${i.toString()} `;
				console.log(`\t\t ${idx} : Name: ${o.name}, Id: ${o.id}`);
			}

			const orgResponse = await Utils.getUserResponse(
				'\tOrganization Number: ',
			);
			const idx = parseInt(orgResponse, 10);
			if (isNaN(idx) || idx < 0 || idx > orgs.length - 1) {
				selectedOrg = orgs[0];
			} else {
				selectedOrg = orgs[idx];
			}
		}

		const user: User = new User({
			organizationId: selectedOrg.id,
			activationStatus: ActivationStatus.Pending,
		});

		console.log(
			Utils.formatMessage(
				`Installing user to ${selectedOrg.id}`,
				ErrorLevel.Info,
			),
		);
		console.log(
			Utils.formatMessage(
				`Looking for Authentication Strategies...`,
				ErrorLevel.Info,
			),
		);
		const authStrategies: AuthenticationStrategy[] | null =
			await this.authenticationStrategyService
				.find({
					where: {
						organizationId: selectedOrg.id,
					},
				})
				.catch(() => {
					return null;
				});

		let authStrategy: AuthenticationStrategy | null = null;
		if (authStrategies?.length) {
			console.log(
				`Which Authentication Strategy should this User belong to?`
					.bold,
			);
			console.log('\tPlease make a selection:');
			for (let i = 0; i < authStrategies.length; i++) {
				const o = authStrategies[i];
				const idx =
					i === 0
						? ` ${i.toString().bgWhite.black.bold} `
						: ` ${i.toString()} `;
				console.log(`\t\t ${idx} : Name: ${o.name}, Id: ${o.id}`);
			}

			const orgResponse = await Utils.getUserResponse(
				'\tAuthentication Strategy Number: ',
			);
			const idx = parseInt(orgResponse, 10);
			if (isNaN(idx) || idx < 0 || idx > authStrategies.length - 1) {
				authStrategy = authStrategies[0];
			} else {
				authStrategy = authStrategies[idx];
			}
		} else {
			console.log(
				Utils.formatMessage(
					`No Authentication Strategies found.`,
					ErrorLevel.Warning,
				),
			);
			console.log(`Create new Authentication Strategy?`.bold);
			const shouldCreate = await Utils.getUserResponse(
				`\t[y/${' N '.bgWhite.black.bold}]: `,
			);
			if (shouldCreate?.toLowerCase() !== 'y') {
				return;
			}

			authStrategy = await this.authenticationStrategyConsole
				.installAuthStrategy(selectedOrg)
				.catch(() => {
					return null;
				});

			if (!authStrategy) {
				throw Utils.formatMessage(
					`Can't install a User without any Authentication Strategies.`,
					ErrorLevel.Error,
				);
			}
		}

		user.authenticationStrategyId = authStrategy?.id ?? null;

		console.log(`What is the User's email address?`.bold);
		const email = await Utils.getUserResponse(`\tEmail: `);
		if (!FraudPrevention.Forms.Validation.Validate.email(email)) {
			throw Utils.formatMessage(`Invalid email.`, ErrorLevel.Error);
		} else {
			user.email = email;
			user.emailNormalized =
				FraudPrevention.Forms.Normalization.normalizeEmail(email) ??
				null;
		}

		console.log(`What is the User's first name?`.bold);
		const nameFirst = (await Utils.getUserResponse(`\tFirst Name: `)) ?? '';

		console.log(`What is the User's last name?`.bold);
		const nameLast = (await Utils.getUserResponse(`\tLast Name: `)) ?? '';

		user.profile = {
			nameFirst,
			nameLast,
		};

		console.log(`What is this User's role?`.bold);
		console.log(`\tPlease make a selection:`);

		const roleOptions = Object.entries(UserRole);
		for (let i = 0; i < roleOptions.length; i++) {
			const idx =
				i === 0
					? ` ${i.toString().bgWhite.black.bold} `
					: ` ${i.toString()} `;
			console.log(`\t\t ${idx} : ${roleOptions[i][0]}`);
		}

		const strategyResponse = await Utils.getUserResponse('\tUser Role: ');
		const idx = parseInt(strategyResponse, 10);
		let userRole: UserRole;
		if (isNaN(idx) || idx < 0 || idx > roleOptions.length - 1) {
			userRole = roleOptions[0]?.[1];
		} else {
			userRole = roleOptions[idx]?.[1];
		}

		user.role = userRole;

		const savedUser = await this.userService.save(user).catch(() => {
			return null;
		});

		if (!savedUser) {
			throw Utils.formatMessage(
				`Error saving new user.`,
				ErrorLevel.Error,
			);
		}

		console.log(
			Utils.formatMessage(`Success! User created with id: ${user.id}`),
		);

		return savedUser;
	}
}
