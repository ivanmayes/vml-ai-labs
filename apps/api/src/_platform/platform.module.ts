import { Global, Module } from '@nestjs/common';

import { HasAppAccessGuard } from './guards/has-app-access.guard';
import { PgBossService } from './queue/pg-boss.service';
import { AwsS3Service } from './aws';

@Global()
@Module({
	providers: [HasAppAccessGuard, PgBossService, AwsS3Service],
	exports: [HasAppAccessGuard, PgBossService, AwsS3Service],
})
export class PlatformModule {}
