import 'colors';
import fs from 'fs';
import path from 'path';

import { Console, Command } from 'nestjs-console';

import { ErrorLevel, Utils } from '../_core/utils/utils.console';

@Console()
export class AddAppEntityConsole {
	// eslint-disable-next-line @typescript-eslint/no-empty-function -- Required for NestJS console
	constructor() {}

	// npm run console:dev AddAppEntity app-name EntityName
	@Command({
		command: 'AddAppEntity <appName> <entityName>',
		description: 'Adds a new entity to an existing mini app.',
	})
	public async AddAppEntity(appName: string, entityName: string) {
		if (!appName || !entityName) {
			console.log(
				Utils.formatMessage(
					'Usage: AddAppEntity <app-name> <EntityName>',
					ErrorLevel.Error,
				),
			);
			return;
		}

		const appDir = path.resolve(__dirname + '/../mini-apps/' + appName);

		if (!fs.existsSync(appDir)) {
			console.log(
				Utils.formatMessage(
					`App "${appName}" not found at ${appDir}`,
					ErrorLevel.Error,
				),
			);
			return;
		}

		const name = entityName.trim().replace(/\s/g, '');
		const slug = name
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
			.toLowerCase();
		const lower = `${name.slice(0, 1).toLowerCase()}${name.slice(1)}`;
		const plural = `${lower}s`.replace(/ys$/, 'ies');
		const schemaName = appName.replace(/-/g, '_');

		const entitiesDir = path.resolve(appDir + '/entities');
		const dtoDir = path.resolve(appDir + '/dto');

		if (!fs.existsSync(entitiesDir)) {
			fs.mkdirSync(entitiesDir, { recursive: true });
		}
		if (!fs.existsSync(dtoDir)) {
			fs.mkdirSync(dtoDir, { recursive: true });
		}

		const entityPath = path.resolve(entitiesDir + `/${slug}.entity.ts`);
		if (fs.existsSync(entityPath)) {
			console.log(
				Utils.formatMessage(
					`Entity file already exists: ${entityPath}`,
					ErrorLevel.Error,
				),
			);
			return;
		}

		// Read entity template
		const partialsDir = path.resolve(__dirname + '/partials/mini-app');
		let entityContent = fs.readFileSync(
			path.resolve(partialsDir + '/entity.partial'),
			'utf8',
		);
		entityContent = entityContent
			.replace(/ENTITY_NAME_UPPER/g, name)
			.replace(/ENTITY_NAME_LOWER/g, lower)
			.replace(/ENTITY_NAME_SLUG/g, slug)
			.replace(/ENTITY_NAME_PLURAL/g, plural)
			.replace(/MINIAPP_SCHEMA_NAME/g, schemaName);

		fs.writeFileSync(entityPath, entityContent, 'utf8');

		// Write DTO
		let dtoContent = fs.readFileSync(
			path.resolve(partialsDir + '/dto.partial'),
			'utf8',
		);
		dtoContent = dtoContent
			.replace(/ENTITY_NAME_UPPER/g, name)
			.replace(/ENTITY_NAME_LOWER/g, lower)
			.replace(/ENTITY_NAME_SLUG/g, slug);

		fs.writeFileSync(
			path.resolve(dtoDir + `/${slug}.dto.ts`),
			dtoContent,
			'utf8',
		);

		// Update app module to include entity in TypeOrmModule.forFeature
		const modulePath = path.resolve(appDir + `/${appName}.module.ts`);
		if (fs.existsSync(modulePath)) {
			let moduleContent = fs.readFileSync(modulePath, 'utf8');
			moduleContent = moduleContent
				.replace(
					/\/\/ MINIAPP_ENTITY_IMPORT/,
					`import { ${name} } from './entities/${slug}.entity';\n// MINIAPP_ENTITY_IMPORT`,
				)
				.replace(
					/\/\/ MINIAPP_ENTITY_REF/,
					`${name},\n\t\t\t// MINIAPP_ENTITY_REF`,
				);
			fs.writeFileSync(modulePath, moduleContent, 'utf8');
		}

		console.log(
			Utils.formatMessage(
				`Entity "${name}" created in app "${appName}"`,
				ErrorLevel.Info,
			),
		);
		console.log(
			Utils.formatMessage(`  Entity: ${entityPath}`, ErrorLevel.Info),
		);
		console.log(
			Utils.formatMessage(
				`  DTO: ${dtoDir}/${slug}.dto.ts`,
				ErrorLevel.Info,
			),
		);
		console.log(
			Utils.formatMessage(
				`  Module updated: ${modulePath}`,
				ErrorLevel.Info,
			),
		);
	}
}
