import { Global, Module } from '@nestjs/common';

import { HasAppAccessGuard } from './guards/has-app-access.guard';
import { PgBossService } from './queue/pg-boss.service';

@Global()
@Module({
	providers: [HasAppAccessGuard, PgBossService],
	exports: [HasAppAccessGuard, PgBossService],
})
export class PlatformModule {}
