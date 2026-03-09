import { Module } from '@nestjs/common';

import { DocumentConverterModule } from './document-converter/document-converter.module';
import { WppOpenAgentUpdaterModule } from './wpp-open-agent-updater/wpp-open-agent-updater.module';
// MINIAPP_MODULES_IMPORT

@Module({
	imports: [
		DocumentConverterModule,
		WppOpenAgentUpdaterModule,
		// MINIAPP_MODULES_REF
	],
})
export class MiniAppsModule {}
