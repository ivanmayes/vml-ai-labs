import { Module } from '@nestjs/common';

import { DocumentConverterModule } from './document-converter/document-converter.module';
import { WppOpenAgentUpdaterModule } from './wpp-open-agent-updater/wpp-open-agent-updater.module';
import { SiteScraperModule } from './site-scraper/site-scraper.module';
// MINIAPP_MODULES_IMPORT

@Module({
	imports: [
		DocumentConverterModule,
		WppOpenAgentUpdaterModule,
		SiteScraperModule,
		// MINIAPP_MODULES_REF
	],
})
export class MiniAppsModule {}
