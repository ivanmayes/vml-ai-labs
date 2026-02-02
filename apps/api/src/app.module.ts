import { APP_GUARD } from '@nestjs/core';
import { Module, Global, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

// Support for cli-based dev tools
import { ConsoleModule } from 'nestjs-console';

// Top-level deps
import { ThrottlerBehindProxyGuard } from './_core/guards/throttler-behind-proxy.guard';
import { Time } from './_core/utils/utils.time';
import { CommonModule } from './common.module';

// Controllers
import { AppController } from './app.controller';
import { UserController } from './user/user.controller';
import { OrganizationController } from './organization/organization.controller';
import { AuthenticationStrategyController } from './authentication-strategy/authentication-strategy.controller';
import { UserAuthController } from './user/user-auth.controller';
import { SampleController } from './sample/sample.controller';
import {
	SpaceController,
	SpacePublicController,
} from './space/space.controller';
import { SpaceUserController } from './space-user/space-user.controller';
// CLI_CONTROLLERS_IMPORT

Global();
@Module({
	imports: [
		HttpModule,
		ThrottlerModule.forRoot([
			{
				ttl: Time.durationStringToMs('5m'),
				limit: 50,
			},
		]),
		CommonModule,
		ConsoleModule,
	],
	controllers: [
		// Controllers
		AppController,
		UserController,
		UserAuthController,
		OrganizationController,
		AuthenticationStrategyController,
		SampleController,
		SpaceController,
		SpacePublicController,
		SpaceUserController,
		// CLI_CONTROLLERS_REF
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: ThrottlerBehindProxyGuard,
		},
	],
	exports: [],
})
export class AppModule implements NestModule {
	// @ts-expect-error DataSource injected for TypeORM but not directly used
	constructor(private readonly _dataSource: DataSource) {}

	// eslint-disable-next-line @typescript-eslint/no-empty-function -- Required by NestModule interface
	configure(_consumer: MiddlewareConsumer) {}
}
