import 'colors';
import { Console, Command } from 'nestjs-console';

import { ErrorLevel, Utils } from '../_core/utils/utils.console';
import { String as StringUtils } from '../_core/utils/utils.string';
import { OrganizationService } from '../organization/organization.service';
import { Organization } from '../organization/organization.entity';
import { UserConsole } from '../user/user.console';

@Console()
export class OrganizationConsole {
	constructor(
		private readonly organizationService: OrganizationService,
		private readonly userConsole: UserConsole,
	) {}

	// npm run console:dev InstallOrganization
	@Command({
		command: 'InstallOrganization',
		description: 'Installs a new Organization.',
	})
	public async installOrganizationCmd() {
		await this.installOrganization().catch(() => {
			return null;
		});
	}

	public async installOrganization() {
		console.log(`::Creating new Organization::`.bgYellow.black.bold);
		console.log(`What would you like to name this Organization?`.bold);
		const name = await Utils.getUserResponse(`\tName: `);

		if (!name?.length) {
			throw Utils.formatMessage(`Invalid name.`, ErrorLevel.Error);
		}

		console.log(
			`What slug would you like to use for this Organization?`.bold,
		);
		const defaultSlug = StringUtils.slugify(name);
		let slug = await Utils.getUserResponse(
			`\tSlug [${(' ' + defaultSlug + ' ').bgWhite.black.bold}]: `,
		);

		if (!slug) {
			slug = defaultSlug;
		}

		const existingOrg: Organization | null = await this.organizationService
			.findOne({
				where: {
					slug,
				},
			})
			.catch(() => {
				return null;
			});

		if (existingOrg) {
			throw Utils.formatMessage(
				`An organization already exists with slug: ${slug}`,
				ErrorLevel.Error,
			);
		}

		const org = await this.organizationService
			.save({
				name,
				slug,
				enabled: true,
			})
			.catch(() => {
				return null;
			});

		if (!org) {
			throw Utils.formatMessage(
				`Error creating Organization, please try again.`,
				ErrorLevel.Error,
			);
		}

		console.log(
			Utils.formatMessage(
				`Success! Organization created with id: ${org.id.bold}`,
			),
		);
		const createUser = await Utils.getUserResponse(
			`Would you like to install a User?\n\t[ y /${' N '.bgWhite.black.bold}]: `,
		);
		if (createUser?.toLowerCase() === 'y') {
			await this.userConsole.installUser(org).catch(() => {
				return null;
			});
		}
	}
}
