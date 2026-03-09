import * as fs from 'fs';
import path from 'path';

import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';

import { SchemaBootstrapService } from './_platform/database/schema-bootstrap.service';
import { Notification } from './notification/notification.entity';
import { User } from './user/user.entity';
import { Organization } from './organization/organization.entity';
import { AuthenticationStrategy } from './authentication-strategy/authentication-strategy.entity';
import { ApiKey } from './api-key/api-key.entity';
import { ApiKeyLog } from './api-key/api-key-log.entity';
import { Space } from './space/space.entity';
import { SpaceUser } from './space-user/space-user.entity';
import { Project } from './project/project.entity';
import { OrganizationApp } from './organization-app/organization-app.entity';
// CLI_ENTITIES_IMPORT

async function ensureSchemasExist(): Promise<void> {
	const logger = new Logger('SchemaBootstrap');
	const manifestPath = path.resolve(__dirname, '../mini-apps.json');
	if (!fs.existsSync(manifestPath)) {
		logger.warn('mini-apps.json not found, skipping schema bootstrap');
		return;
	}

	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	const client = new Client({
		connectionString: process.env.DATABASE_URL,
		ssl: process.env.DATABASE_SSL
			? { rejectUnauthorized: false }
			: undefined,
	});

	try {
		await client.connect();
		for (const app of manifest.apps) {
			const schemaName = app.key.replace(/-/g, '_');
			if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) continue;
			await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
			logger.log(`Ensured schema exists: ${schemaName}`);
		}
	} catch (err) {
		logger.error('Failed to bootstrap schemas', err);
	} finally {
		await client.end();
	}
}

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			useFactory: async () => {
				await ensureSchemasExist();
				return {
					name: 'default',
					type: (process.env.DATABASE_TYPE as any) || 'postgres',
					url: process.env.DATABASE_URL,
					extra: {
						ssl: process.env.DATABASE_SSL
							? { rejectUnauthorized: false }
							: false,
					},
					entities: [__dirname + '/**/*.entity{.ts,.js}'],
					synchronize:
						process.env.DATABASE_SYNCHRONIZE === 'true' || false,
					logging: (process.env.LOGGING as any) || false,
					autoLoadEntities: true,
					migrations: [
						path.resolve(__dirname + '/../migrations-js') + '/*.js',
					],
					migrationsRun:
						process.env.DATABASE_MIGRATE_ON_STARTUP === 'true' ||
						false,
				};
			},
		}),
		TypeOrmModule.forFeature(
			[
				// TypeORM Entities
				Notification,
				AuthenticationStrategy,
				Organization,
				ApiKey,
				ApiKeyLog,
				User,
				Space,
				SpaceUser,
				Project,
				OrganizationApp,
				// CLI_ENTITIES_REF
			],
			'default',
		),
	],
	providers: [SchemaBootstrapService],
	exports: [TypeOrmModule, SchemaBootstrapService],
})
export class DatabaseModule {}
