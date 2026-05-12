import * as fs from 'fs';
import * as path from 'path';

import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaBootstrapService implements OnApplicationBootstrap {
	private readonly logger = new Logger(SchemaBootstrapService.name);

	constructor(private readonly dataSource: DataSource) {}

	async onApplicationBootstrap() {
		const manifestPath = this.resolveManifestPath();
		if (!manifestPath) {
			this.logger.warn(
				'mini-apps.json not found, skipping schema bootstrap',
			);
			return;
		}

		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

		for (const app of manifest.apps) {
			const schemaName = app.key.replace(/-/g, '_');

			if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
				this.logger.error(
					`Invalid schema name "${schemaName}" for app "${app.key}", skipping`,
				);
				continue;
			}

			await this.dataSource.query(
				`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
			);
			this.logger.log(`Ensured schema exists: ${schemaName}`);
		}
	}

	/**
	 * The manifest sits at different relative locations in source vs. compiled
	 * output. Source path (ts-node): `apps/api/src/_platform/database/...` →
	 * `apps/mini-apps.json` is `../../../../mini-apps.json`. Compiled (Heroku):
	 * `/app/dist/_platform/database/...` (TypeScript flattens `src/` into the
	 * `dist/` root) → `/app/mini-apps.json` is `../../../mini-apps.json`. Both
	 * candidates are tried; the first existing one wins.
	 */
	private resolveManifestPath(): string | null {
		const candidates = [
			path.resolve(__dirname, '../../../mini-apps.json'),
			path.resolve(__dirname, '../../../../mini-apps.json'),
		];
		return candidates.find((p) => fs.existsSync(p)) ?? null;
	}
}
