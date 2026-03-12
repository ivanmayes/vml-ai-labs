import { APP_GUARD } from '@nestjs/core';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

// Support for cli-based dev tools
import { ConsoleModule } from 'nestjs-console';

// Top-level deps
import { ThrottlerBehindProxyGuard } from './_core/guards/throttler-behind-proxy.guard';
import { Time } from './_core/utils/utils.time';
import { CommonModule } from './common.module';
import { PlatformModule } from './_platform/platform.module';
import { HasAppAccessGuard } from './_platform/guards/has-app-access.guard';
import { MiniAppsModule } from './mini-apps/mini-apps.module';

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
import { ProjectController } from './project/project.controller';
import { OrganizationAppController } from './organization-app/organization-app.controller';
// CLI_CONTROLLERS_IMPORT

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
		PlatformModule,
		MiniAppsModule,
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
		ProjectController,
		OrganizationAppController,
		// CLI_CONTROLLERS_REF
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: ThrottlerBehindProxyGuard,
		},
		{
			provide: APP_GUARD,
			useClass: HasAppAccessGuard,
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
