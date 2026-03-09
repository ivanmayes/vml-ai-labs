import 'colors';
import fs from 'fs';
import path from 'path';

import { Console, Command } from 'nestjs-console';

import { ErrorLevel, Utils } from '../_core/utils/utils.console';

const RESERVED_NAMES = [
	'public',
	'pg_catalog',
	'information_schema',
	'home',
	'login',
	'admin',
	'organization',
	'space',
	'user',
	'sso',
	'api',
	'app',
	'apps',
	'core',
	'platform',
	'shared',
	'common',
	'database',
	'console',
	'notification',
	'sample',
	'ai',
	'project',
	'mini-apps',
];

@Console()
export class CreateAppConsole {
	// eslint-disable-next-line @typescript-eslint/no-empty-function -- Required for NestJS console
	constructor() {}

	@Command({
		command: 'CreateApp',
		description: 'Scaffolds a new full-stack mini app.',
	})
	public async CreateApp() {
		const appName = await Utils.getUserResponse(
			'App name (kebab-case, e.g. "todo-list"): ',
		);

		if (!appName || !appName.trim()) {
			console.log(
				Utils.formatMessage('App name is required.', ErrorLevel.Error),
			);
			return;
		}

		const name = appName.trim().toLowerCase();

		// Validate kebab-case
		if (!/^[a-z][a-z0-9-]*$/.test(name)) {
			console.log(
				Utils.formatMessage(
					'App name must be kebab-case (lowercase letters, numbers, hyphens), starting with a letter.',
					ErrorLevel.Error,
				),
			);
			return;
		}

		if (name.length > 30) {
			console.log(
				Utils.formatMessage(
					'App name must be 30 characters or less.',
					ErrorLevel.Error,
				),
			);
			return;
		}

		if (RESERVED_NAMES.includes(name)) {
			console.log(
				Utils.formatMessage(
					`"${name}" is a reserved name. Choose a different name.`,
					ErrorLevel.Error,
				),
			);
			return;
		}

		const displayName = await Utils.getUserResponse(
			'Display name (e.g. "Todo List"): ',
		);
		const description = await Utils.getUserResponse('Description: ');
		const includeSampleEntity =
			(await Utils.getUserResponse('Include sample entity? (y/n): '))
				.trim()
				.toLowerCase() === 'y';

		// Derive names
		const pascal = name
			.split('-')
			.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
			.join('');
		const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
		const schemaName = name.replace(/-/g, '_');

		// Paths
		const apiBase = path.resolve(__dirname + '/../mini-apps/' + name);
		const webBase = path.resolve(
			__dirname + '/../../../../web/src/app/mini-apps/' + name,
		);
		const manifestPath = path.resolve(
			__dirname + '/../../../../mini-apps.json',
		);
		const miniAppsModulePath = path.resolve(
			__dirname + '/../mini-apps/mini-apps.module.ts',
		);
		const appRoutesPath = path.resolve(
			__dirname + '/../../../../web/src/app/app.routes.ts',
		);

		// Check for duplicates
		if (fs.existsSync(apiBase)) {
			console.log(
				Utils.formatMessage(
					`API directory already exists: ${apiBase}`,
					ErrorLevel.Error,
				),
			);
			return;
		}
		if (fs.existsSync(webBase)) {
			console.log(
				Utils.formatMessage(
					`Web directory already exists: ${webBase}`,
					ErrorLevel.Error,
				),
			);
			return;
		}

		// Check manifest for duplicate key
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		if (manifest.apps.some((a: { key: string }) => a.key === name)) {
			console.log(
				Utils.formatMessage(
					`App "${name}" already exists in mini-apps.json`,
					ErrorLevel.Error,
				),
			);
			return;
		}

		const createdDirs: string[] = [];
		const modifiedFiles: { path: string; original: string }[] = [];

		try {
			// ---- API scaffolding ----
			fs.mkdirSync(apiBase, { recursive: true });
			createdDirs.push(apiBase);

			const partialsDir = path.resolve(__dirname + '/partials/mini-app');

			// Read and process templates
			const processTemplate = (
				filename: string,
				extraReplacements?: Record<string, string>,
			) => {
				let content = fs.readFileSync(
					path.resolve(partialsDir + '/' + filename),
					'utf8',
				);
				content = content
					.replace(/ENTITY_NAME_UPPER/g, pascal)
					.replace(/ENTITY_NAME_LOWER/g, camel)
					.replace(/ENTITY_NAME_SLUG/g, name)
					.replace(/ENTITY_NAME_PLURAL/g, `${camel}s`)
					.replace(/MINIAPP_SCHEMA_NAME/g, schemaName);
				if (extraReplacements) {
					for (const [key, value] of Object.entries(
						extraReplacements,
					)) {
						content = content.replace(new RegExp(key, 'g'), value);
					}
				}
				return content;
			};

			// Write API files
			fs.writeFileSync(
				path.resolve(apiBase + `/${name}.module.ts`),
				processTemplate('module.partial'),
				'utf8',
			);
			fs.writeFileSync(
				path.resolve(apiBase + `/${name}.controller.ts`),
				processTemplate('controller.partial'),
				'utf8',
			);
			fs.writeFileSync(
				path.resolve(apiBase + `/${name}.service.ts`),
				processTemplate('service.partial'),
				'utf8',
			);
			fs.writeFileSync(
				path.resolve(apiBase + '/AGENTS.md'),
				processTemplate('agents-api.partial'),
				'utf8',
			);

			// Sample entity
			if (includeSampleEntity) {
				fs.mkdirSync(path.resolve(apiBase + '/entities'), {
					recursive: true,
				});
				fs.mkdirSync(path.resolve(apiBase + '/dto'), {
					recursive: true,
				});

				const sampleName = pascal + 'Item';
				const sampleCamel = camel + 'Item';
				const sampleSlug = name + '-item';
				const samplePlural = sampleCamel + 's';

				let entityContent = fs.readFileSync(
					path.resolve(partialsDir + '/entity.partial'),
					'utf8',
				);
				entityContent = entityContent
					.replace(/ENTITY_NAME_UPPER/g, sampleName)
					.replace(/ENTITY_NAME_LOWER/g, sampleCamel)
					.replace(/ENTITY_NAME_SLUG/g, sampleSlug)
					.replace(/ENTITY_NAME_PLURAL/g, samplePlural)
					.replace(/MINIAPP_SCHEMA_NAME/g, schemaName);
				fs.writeFileSync(
					path.resolve(apiBase + `/entities/${sampleSlug}.entity.ts`),
					entityContent,
					'utf8',
				);

				let dtoContent = fs.readFileSync(
					path.resolve(partialsDir + '/dto.partial'),
					'utf8',
				);
				dtoContent = dtoContent
					.replace(/ENTITY_NAME_UPPER/g, sampleName)
					.replace(/ENTITY_NAME_LOWER/g, sampleCamel)
					.replace(/ENTITY_NAME_SLUG/g, sampleSlug);
				fs.writeFileSync(
					path.resolve(apiBase + `/dto/${sampleSlug}.dto.ts`),
					dtoContent,
					'utf8',
				);

				// Update module to include entity
				const modulePath = path.resolve(apiBase + `/${name}.module.ts`);
				let moduleContent = fs.readFileSync(modulePath, 'utf8');
				moduleContent = moduleContent
					.replace(
						/\/\/ MINIAPP_ENTITY_IMPORT/,
						`import { ${sampleName} } from './entities/${sampleSlug}.entity';\n// MINIAPP_ENTITY_IMPORT`,
					)
					.replace(
						/\/\/ MINIAPP_ENTITY_REF/,
						`${sampleName},\n\t\t\t// MINIAPP_ENTITY_REF`,
					);
				fs.writeFileSync(modulePath, moduleContent, 'utf8');
			}

			// ---- Web scaffolding ----
			fs.mkdirSync(webBase, { recursive: true });
			createdDirs.push(webBase);
			fs.mkdirSync(path.resolve(webBase + `/pages/${name}-home`), {
				recursive: true,
			});
			fs.mkdirSync(path.resolve(webBase + '/services'), {
				recursive: true,
			});
			fs.mkdirSync(path.resolve(webBase + '/components'), {
				recursive: true,
			});

			fs.writeFileSync(
				path.resolve(webBase + `/${name}.routes.ts`),
				processTemplate('routes.partial'),
				'utf8',
			);
			fs.writeFileSync(
				path.resolve(
					webBase + `/pages/${name}-home/${name}-home.component.ts`,
				),
				processTemplate('page.partial'),
				'utf8',
			);
			fs.writeFileSync(
				path.resolve(webBase + `/services/${name}.service.ts`),
				processTemplate('service-web.partial'),
				'utf8',
			);
			fs.writeFileSync(
				path.resolve(webBase + '/AGENTS.md'),
				processTemplate('agents-web.partial'),
				'utf8',
			);

			// ---- Update manifest ----
			const manifestOriginal = fs.readFileSync(manifestPath, 'utf8');
			modifiedFiles.push({
				path: manifestPath,
				original: manifestOriginal,
			});
			manifest.apps.push({
				key: name,
				displayName: displayName || pascal,
				description: description || '',
				icon: 'pi pi-box',
				defaultEnabled: true,
				route: `/apps/${name}`,
				apiPrefix: `apps/${name}`,
			});
			fs.writeFileSync(
				manifestPath,
				JSON.stringify(manifest, null, 2) + '\n',
				'utf8',
			);

			// ---- Update MiniAppsModule ----
			const miniAppsOriginal = fs.readFileSync(
				miniAppsModulePath,
				'utf8',
			);
			modifiedFiles.push({
				path: miniAppsModulePath,
				original: miniAppsOriginal,
			});
			let miniAppsModule = miniAppsOriginal;
			miniAppsModule = miniAppsModule
				.replace(
					/\/\/ MINIAPP_MODULES_IMPORT/,
					`import { ${pascal}Module } from './${name}/${name}.module';\n// MINIAPP_MODULES_IMPORT`,
				)
				.replace(
					/\/\/ MINIAPP_MODULES_REF/,
					`${pascal}Module,\n\t\t// MINIAPP_MODULES_REF`,
				);
			fs.writeFileSync(miniAppsModulePath, miniAppsModule, 'utf8');

			// ---- Update app.routes.ts ----
			const appRoutesOriginal = fs.readFileSync(appRoutesPath, 'utf8');
			modifiedFiles.push({
				path: appRoutesPath,
				original: appRoutesOriginal,
			});
			let appRoutes = appRoutesOriginal;
			appRoutes = appRoutes.replace(
				/\/\/ MINIAPP_ROUTES_REF/,
				`{
			path: '${name}',
			loadChildren: () =>
				import('./mini-apps/${name}/${name}.routes').then((m) => m.routes),
		},
		// MINIAPP_ROUTES_REF`,
			);
			fs.writeFileSync(appRoutesPath, appRoutes, 'utf8');

			console.log(
				Utils.formatMessage(
					`\nApp "${name}" created successfully!`,
					ErrorLevel.Info,
				),
			);
			console.log(
				Utils.formatMessage(`API: ${apiBase}`, ErrorLevel.Info),
			);
			console.log(
				Utils.formatMessage(`Web: ${webBase}`, ErrorLevel.Info),
			);
			console.log(Utils.formatMessage('\nNext steps:', ErrorLevel.Info));
			console.log(
				Utils.formatMessage(
					`  1. Add entities: npm run console:dev AddAppEntity ${name} <EntityName>`,
					ErrorLevel.Info,
				),
			);
			console.log(
				Utils.formatMessage(
					'  2. Start the dev server and navigate to /apps/' + name,
					ErrorLevel.Info,
				),
			);
		} catch (err) {
			// Rollback
			console.log(
				Utils.formatMessage(
					`Error creating app. Rolling back...`,
					ErrorLevel.Error,
				),
			);
			console.error(err);

			// Revert modified files
			for (const file of modifiedFiles) {
				fs.writeFileSync(file.path, file.original, 'utf8');
			}

			// Delete created directories
			for (const dir of createdDirs) {
				if (fs.existsSync(dir)) {
					fs.rmSync(dir, { recursive: true, force: true });
				}
			}

			console.log(
				Utils.formatMessage('Rollback complete.', ErrorLevel.Info),
			);
		}
	}
}
