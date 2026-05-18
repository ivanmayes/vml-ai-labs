import { Global, Module } from '@nestjs/common';

import { HasAppAccessGuard } from './guards/has-app-access.guard';
import { PgBossService } from './queue/pg-boss.service';
import { AwsS3Service, AwsSqsService } from './aws';
import { ConverterFactory } from './converters/converter.factory';
import { ImageFileValidationService } from './files';

@Global()
@Module({
	providers: [
		HasAppAccessGuard,
		PgBossService,
		AwsS3Service,
		AwsSqsService,
		ConverterFactory,
		ImageFileValidationService,
	],
	exports: [
		HasAppAccessGuard,
		PgBossService,
		AwsS3Service,
		AwsSqsService,
		ConverterFactory,
		ImageFileValidationService,
	],
})
export class PlatformModule {}
