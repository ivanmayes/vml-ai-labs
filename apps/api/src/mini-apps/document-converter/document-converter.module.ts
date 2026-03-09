import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConversionJob } from './entities/conversion-job.entity';
import { DocumentConverterController } from './document-converter.controller';
import { DocumentConverterSseController } from './document-converter-sse.controller';
import { ConversionService } from './services/conversion.service';
import { FileValidationService } from './services/file-validation.service';
import { ConversionSseService } from './services/conversion-sse.service';
import { ConversionWorkerService } from './services/conversion-worker.service';

@Module({
	imports: [TypeOrmModule.forFeature([ConversionJob])],
	controllers: [DocumentConverterController, DocumentConverterSseController],
	providers: [
		ConversionService,
		FileValidationService,
		ConversionSseService,
		ConversionWorkerService,
	],
})
export class DocumentConverterModule {}
