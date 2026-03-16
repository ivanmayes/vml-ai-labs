import * as fs from 'fs';
import * as path from 'path';

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaBootstrapService implements OnModuleInit {
	private readonly logger = new Logger(SchemaBootstrapService.name);

	constructor(private readonly dataSource: DataSource) {}

	async onModuleInit() {
		const manifestPath = path.resolve(__dirname, '../../../mini-apps.json');
		if (!fs.existsSync(manifestPath)) {
			this.logger.warn(
				'mini-apps.json not found, skipping schema bootstrap',
			);
			return;
		}

		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		const schemas: string[] = [];

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
			schemas.push(schemaName);
			this.logger.log(`Ensured schema exists: ${schemaName}`);
		}

		if (schemas.length > 0) {
			const searchPath = ['public', ...schemas].join(', ');
			await this.dataSource.query(`SET search_path TO ${searchPath}`);
			this.logger.log(`Set search_path to: ${searchPath}`);
		}
	}
}
