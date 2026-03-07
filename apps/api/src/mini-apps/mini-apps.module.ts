import { Module } from '@nestjs/common';

import { DocumentConverterModule } from './document-converter/document-converter.module';
// MINIAPP_MODULES_IMPORT

@Module({
	imports: [
		DocumentConverterModule,
		// MINIAPP_MODULES_REF
	],
})
export class MiniAppsModule {}
