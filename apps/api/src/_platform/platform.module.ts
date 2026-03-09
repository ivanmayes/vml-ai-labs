import { Global, Module } from '@nestjs/common';

import { HasAppAccessGuard } from './guards/has-app-access.guard';
import { PgBossService } from './queue/pg-boss.service';
import { AwsS3Service } from './aws';
import { ConverterFactory } from './converters/converter.factory';

@Global()
@Module({
	providers: [
		HasAppAccessGuard,
		PgBossService,
		AwsS3Service,
		ConverterFactory,
	],
	exports: [HasAppAccessGuard, PgBossService, AwsS3Service, ConverterFactory],
})
export class PlatformModule {}
