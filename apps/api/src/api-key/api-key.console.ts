import { Command, Console } from 'nestjs-console';
import { Crypt } from '../_core/crypt';

import { KEY_SIZE_BYTES } from './api-key.entity';
import { ApiKeyService } from './api-key.service';
import { ErrorLevel, Utils } from '../_core/utils/utils.console';
import { Organization } from '../organization/organization.entity';
import { OrganizationService } from '../organization/organization.service';

@Console()
export class ApiKeyConsole {

	constructor(
		private readonly apiKeyService: ApiKeyService,
		private readonly organizationService: OrganizationService
	) {}

	// npm run console:dev InstallAPIKey <name> [expires]
	// ex: npm run console:dev InstallAPIKey "Some Campaign Middleware" "2023-08-01"
	@Command({
		command: 'InstallAPIKey <name> [expires]',
		description: 'Installs a new API Key.'
	})
	public async installAPIKey(name: string, expires?: string) {
		let organizationId: string;
		let organization: Organization;
		const orgs: Organization[] = await this.organizationService.find()
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!orgs?.length) {
			throw Utils.formatMessage(
				`Couldn't find any Organizations. Make sure at least one is installed.`,
				ErrorLevel.Error
			);
		}

		console.log(`Which Organization should this Key belong to?`.bold);
		console.log('\tPlease make a selection:');
		for(let i = 0; i < orgs.length; i++) {
			const o = orgs[i];
			const idx = i === 0 ? ` ${i.toString().bgWhite.black.bold} ` : ` ${i.toString()} `;
			console.log(`\t\t ${idx} : Name: ${o.name}, Id: ${o.id}`);
		}

		const orgResponse = await Utils.getUserResponse('\tOrganization Number: ');
		const idx = parseInt(orgResponse);
		if(isNaN(idx) || idx < 0 || idx > orgs.length - 1) {
			organization = orgs[0];
		} else {
			organization = orgs[idx];
		}
		organizationId = organization.id;

		let expireDate;
		if(new Date(expires).getTime()) {
			expireDate = new Date(expires).toISOString();
		}

		const keyDecrypted = Crypt.randomBase64(KEY_SIZE_BYTES);
		const keyEncrypted = Crypt
			.encrypt(
				keyDecrypted,
				//Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY, organizationId),
				Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY),
				process.env.PII_SIGNING_OFFSET
			);

		let apiKey = await this.apiKeyService
			.addOne({
				name,
				key: keyEncrypted,
				expires: expireDate,
				organizationId: organizationId
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		console.log(apiKey);

		return true;
	}

	// npm run console:dev GetAPIKey <id>
	@Command({
		command: 'GetAPIKey <id>',
		description: 'Gets an existing API Key.'
	})
	public async getAPIKey(id: string) {
		const apiKey = await this.apiKeyService
			.findOne({
				where: {
					id
				}
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!apiKey) {
			console.error(`API Key not found with id "${id}".`);
			return false;
		}

		const decrypted = Crypt
			.decrypt(
				apiKey.key,
				Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY),
				process.env.PII_SIGNING_OFFSET
			);

		console.log(
			`
			Decrypted Key for id "${id}":
			${decrypted}
			
			
		`.replace(/\t/g, ''));

		return true;
	}
}