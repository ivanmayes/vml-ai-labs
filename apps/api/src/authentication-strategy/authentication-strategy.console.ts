import 'colors';
import { Console, Command } from 'nestjs-console';

import { ErrorLevel, Utils } from '../_core/utils/utils.console';
import { Organization } from '../organization/organization.entity';
import { OrganizationService } from '../organization/organization.service';

import { AuthenticationStrategyService } from './authentication-strategy.service';
import {
	AuthenticationStrategy,
	AuthenticationStrategyType,
} from './authentication-strategy.entity';

@Console()
export class AuthenticationStrategyConsole {
	constructor(
		private readonly authenticationStrategyService: AuthenticationStrategyService,
		private readonly organizationService: OrganizationService,
	) {}

	// npm run console:dev InstallAuthStrategy
	@Command({
		command: 'InstallAuthStrategy',
		description: 'Installs a new Authentication Strategy.',
	})
	public async installAuthStrategyCmd() {
		await this.installAuthStrategy().catch(() => {
			return null;
		});
	}

	public async installAuthStrategy(organization?: Organization) {
		console.log(
			`::Creating new Authentication Strategy::`.bgYellow.black.bold,
		);

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

			console.log(
				`Which Organization should this Authentication Strategy belong to?`
					.bold,
			);
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

		console.log(
			`What would you like to name this Authentication Strategy?`.bold,
		);
		const name = await Utils.getUserResponse(`\tName: `);
		if (!name?.length) {
			throw Utils.formatMessage(`Invalid name.`, ErrorLevel.Error);
		}

		const strategy: Partial<AuthenticationStrategy> = {
			name,
			organizationId: selectedOrg.id,
		};

		console.log(`Which type of strategy would you like to create?`.bold);
		console.log(`\tPlease make a selection:`);

		const strategyTypeOptions = Object.entries(AuthenticationStrategyType);
		for (let i = 0; i < strategyTypeOptions.length; i++) {
			const idx =
				i === 0
					? ` ${i.toString().bgWhite.black.bold} `
					: ` ${i.toString()} `;
			console.log(`\t\t ${idx} : ${strategyTypeOptions[i][0]}`);
		}

		const strategyResponse = await Utils.getUserResponse(
			'\tAuthentication Strategy Type: ',
		);
		const idx = parseInt(strategyResponse, 10);
		let strategyType: AuthenticationStrategyType;
		if (isNaN(idx) || idx < 0 || idx > strategyTypeOptions.length - 1) {
			strategyType = strategyTypeOptions[0]?.[1];
		} else {
			strategyType = strategyTypeOptions[idx]?.[1];
		}

		if (strategyType === AuthenticationStrategyType.Basic) {
			strategy.type = strategyType;

			console.log(`How long should login codes be?`.bold);
			const codeLengthResponse = await Utils.getUserResponse(
				`\tLength [${' 6 '.bgWhite.black.bold}] (Min 3, Max 16): `,
			);
			let codeLength = parseInt(codeLengthResponse, 10);
			if (!codeLength || codeLength > 16) {
				codeLength = 6;
			}

			console.log(`How long should codes last before expiring?`.bold);
			const codeLifetimeResponse = await Utils.getUserResponse(
				`\tLifetime [${' 5 '.bgWhite.black.bold}] (Minutes): `,
			);
			const codeLifetimeParsed = parseInt(codeLifetimeResponse, 10);
			let codeLifetime = '5m';
			if (codeLifetimeParsed) {
				codeLifetime = `${codeLifetimeParsed}m`;
			}

			strategy.config = {
				codeLength,
				codeLifetime,
			};
		} else if (strategyType === AuthenticationStrategyType.Okta) {
			// TODO;
			throw Utils.formatMessage(
				`Invalid option selected. (Not implemented)`,
				ErrorLevel.Error,
			);
		} else {
			throw Utils.formatMessage(
				`Invalid option selected.`,
				ErrorLevel.Error,
			);
		}

		const authenticationStrategy = await this.authenticationStrategyService
			.save(strategy)
			.catch(() => {
				return null;
			});

		if (!authenticationStrategy) {
			throw Utils.formatMessage(
				`Error saving Authentication Strategy.`,
				ErrorLevel.Error,
			);
		}

		// Set as default if one isn't set.
		if (!selectedOrg.defaultAuthenticationStrategyId) {
			selectedOrg.defaultAuthenticationStrategyId =
				authenticationStrategy.id;
			await this.organizationService.save(selectedOrg).catch(() => {
				return null;
			});
		}

		return authenticationStrategy;
	}
}
