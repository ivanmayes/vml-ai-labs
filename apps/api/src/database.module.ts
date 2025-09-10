import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from './notification/notification.entity';
import { User } from './user/user.entity';
import { Organization } from './organization/organization.entity';
import { AuthenticationStrategy } from './authentication-strategy/authentication-strategy.entity';
import { ApiKey } from './api-key/api-key.entity';
// CLI_ENTITIES_IMPORT

@Module({
	imports: [
		TypeOrmModule.forRoot({
			name: 'default',
			type: <any>process.env.DATABASE_TYPE || 'postgres',
			url: process.env.DATABASE_URL,
			extra: {
				ssl: process.env.DATABASE_SSL
					? { rejectUnauthorized: false }
					: false
			},
			entities: [__dirname + '/**/*.entity{.ts,.js}'],
			synchronize: process.env.DATABASE_SYNCHRONIZE === 'true' || false,
			logging: <any>process.env.LOGGING || false
		}),
		TypeOrmModule.forFeature(
			[
				// TypeORM Entities
				Notification,
				AuthenticationStrategy,
				Organization,
				ApiKey,
				User,
				// CLI_ENTITIES_REF
			],
			'default'
		),
	],
	exports: [TypeOrmModule]
})
export class DatabaseModule {}