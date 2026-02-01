import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';

import { DatabaseModule } from './database.module';
import { CLIConsole } from './console/cli.console';
import { JwtStrategy } from './user/auth/jwt.strategy';
import { BearerStrategy } from './api-key/auth/bearer.strategy';
import { AppService } from './app.service';
import { NotificationService } from './notification/notification.service';
import { ApiKeyService } from './api-key/api-key.service';
import { UserService } from './user/user.service';
import { AuthService } from './user/auth/auth.service';
import { AuthenticationStrategyService } from './authentication-strategy/authentication-strategy.service';
import { OrganizationService } from './organization/organization.service';
import { SpaceService } from './space/space.service';
import { SpaceUserService } from './space-user/space-user.service';
import { AuthenticationStrategyConsole } from './authentication-strategy/authentication-strategy.console';
import { OrganizationConsole } from './organization/organization.console';
import { ApiKeyConsole } from './api-key/api-key.console';
import { UserConsole } from './user/user.console';
// CLI_SERVICES_IMPORT

const providerList = [
	// Services
	JwtStrategy,
	BearerStrategy,
	AppService,
	ApiKeyService,
	UserService,
	AuthService,
	AuthenticationStrategyService,
	OrganizationService,
	SpaceService,
	SpaceUserService,
	NotificationService,
	// CLI_SERVICES_REF
	// CRON services
	// CLI commands
	CLIConsole,
	AuthenticationStrategyConsole,
	OrganizationConsole,
	ApiKeyConsole,
	UserConsole
];

@Module({
	imports: [
		HttpModule,
		DatabaseModule,
		PassportModule.register({ defaultStrategy: 'jwt' }),
		JwtModule.register({
			privateKey: process.env.PRIVATE_KEY,
			publicKey: process.env.PUBLIC_KEY,
			signOptions: {
				expiresIn: '30days',
				algorithm: 'RS256'
			}
		})
	],
	providers: providerList,
	exports: [...providerList, PassportModule, JwtModule]
})
export class CommonModule {}