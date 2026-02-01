// Awaiting issue: https://github.com/Pop-Code/nestjs-console/pull/533

import 'colors';
import fs from 'fs';
import path from 'path';

import { Console, Command } from 'nestjs-console';

import { ErrorLevel, Utils } from '../_core/utils/utils.console';

@Console()
export class CLIConsole {
	constructor() {}

	// npm run console:dev AddEntity EntityName
	@Command({
		command: 'AddEntity <EntityName>',
		description: 'Scaffolds a new entity with controller and service.',
	})
	public async AddEntity(name: string) {
		if (!name) {
			console.log(
				Utils.formatMessage(
					`EntityName is required.`,
					ErrorLevel.Error,
				),
			);
			return;
		}

		name = name.trim().replace(/\s/g, '');
		const matches = name.match(/[A-Z]/g);
		const slug =
			matches && matches.length > 1
				? name.replace(/(^.*)([A-Z])/, '$1-$2').toLowerCase()
				: name.toLowerCase();
		const lower = `${name.slice(0, 1).toLowerCase()}${name.slice(1)}`;
		const plural = `${lower}s`.replace(/ys$/, 'ies');

		const outDir = __dirname + `/../${slug}`;

		if (fs.existsSync(path.resolve(outDir))) {
			console.log(
				Utils.formatMessage(`Folder already exists.`, ErrorLevel.Error),
			);
			return;
		}

		fs.mkdirSync(path.resolve(outDir));
		fs.mkdirSync(path.resolve(outDir + '/dtos'));

		let entity = fs.readFileSync(
			path.resolve(__dirname + '/partials/entity.partial'),
			'utf8',
		);
		let controller = fs.readFileSync(
			path.resolve(__dirname + '/partials/controller.partial'),
			'utf8',
		);
		let service = fs.readFileSync(
			path.resolve(__dirname + '/partials/service.partial'),
			'utf8',
		);
		let dtos = fs.readFileSync(
			path.resolve(__dirname + '/partials/dtos/index.partial'),
			'utf8',
		);

		[entity, controller, service, dtos] = [
			entity,
			controller,
			service,
			dtos,
		].map((file) => {
			return file
				.replace(/ENTITY_NAME_UPPER/g, name)
				.replace(/ENTITY_NAME_PLURAL/g, plural)
				.replace(/ENTITY_NAME_SLUG/g, slug)
				.replace(/ENTITY_NAME_LOWER/g, lower);
		});

		fs.writeFileSync(
			path.resolve(outDir + `/${slug}.entity.ts`),
			entity,
			'utf8',
		);
		fs.writeFileSync(
			path.resolve(outDir + `/${slug}.controller.ts`),
			controller,
			'utf8',
		);
		fs.writeFileSync(
			path.resolve(outDir + `/${slug}.service.ts`),
			service,
			'utf8',
		);
		fs.writeFileSync(path.resolve(outDir + `/dtos/index.ts`), dtos, 'utf8');

		const appModulePath = path.resolve(__dirname + '/../app.module.ts');
		let appModule = fs.readFileSync(appModulePath, 'utf8');
		appModule = appModule
			.replace(
				/\/\/ CLI_CONTROLLERS_IMPORT/,
				`import { ${name}Controller } from './${slug}/${slug}.controller';\n// CLI_CONTROLLERS_IMPORT`,
			)
			.replace(
				/\/\/ CLI_CONTROLLERS_REF/,
				`${name}Controller,\n		// CLI_CONTROLLERS_REF`,
			);
		fs.writeFileSync(appModulePath, appModule, 'utf8');

		const commonModulePath = path.resolve(__dirname + '/../common.module.ts');
		let commonModule = fs.readFileSync(commonModulePath, 'utf8');
		commonModule = commonModule
			.replace(
				/\/\/ CLI_SERVICES_IMPORT/,
				`import { ${name}Service } from './${slug}/${slug}.service';\n// CLI_SERVICES_IMPORT`,
			)
			.replace(
				/\/\/ CLI_SERVICES_REF/,
				`${name}Service,\n	// CLI_SERVICES_REF`,
			);
		fs.writeFileSync(commonModulePath, commonModule, 'utf8');

		const databaseModulePath = path.resolve(
			__dirname + '/../database.module.ts',
		);
		let databaseModule = fs.readFileSync(databaseModulePath, 'utf8');
		databaseModule = databaseModule
			.replace(
				/\/\/ CLI_ENTITIES_IMPORT/,
				`import { ${name} } from './${slug}/${slug}.entity';\n// CLI_ENTITIES_IMPORT`,
			)
			.replace(/\/\/ CLI_ENTITIES_REF/, `${name},\n				// CLI_ENTITIES_REF`);
		fs.writeFileSync(databaseModulePath, databaseModule, 'utf8');

		console.log(
			Utils.formatMessage(
				`Files writen to ${path.resolve(outDir)}`,
				ErrorLevel.Info,
			),
		);
	}
}
