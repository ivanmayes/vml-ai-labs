import { Global, Module } from '@nestjs/common';

import { HasAppAccessGuard } from './guards/has-app-access.guard';

@Global()
@Module({
	providers: [HasAppAccessGuard],
	exports: [HasAppAccessGuard],
})
export class PlatformModule {}
