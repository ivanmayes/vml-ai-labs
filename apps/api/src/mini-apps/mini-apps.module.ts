import { Module } from '@nestjs/common';

import { DocumentConverterModule } from './document-converter/document-converter.module';
import { WppOpenAgentUpdaterModule } from './wpp-open-agent-updater/wpp-open-agent-updater.module';
import { SiteScraperModule } from './site-scraper/site-scraper.module';
import { ImageLibraryModule } from './image-library/image-library.module';
import { TextCounterModule } from './text-counter/text-counter.module';
// MINIAPP_MODULES_IMPORT

@Module({
	imports: [
		DocumentConverterModule,
		WppOpenAgentUpdaterModule,
		SiteScraperModule,
		ImageLibraryModule,
		TextCounterModule,
		// MINIAPP_MODULES_REF
	],
})
export class MiniAppsModule {}
