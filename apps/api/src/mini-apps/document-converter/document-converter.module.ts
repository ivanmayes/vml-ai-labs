import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AwsS3Service } from '../../_platform/aws';
import { PgBossService } from '../../_platform/queue';

import { ConversionJob } from './entities/conversion-job.entity';
import { DocumentConverterController } from './document-converter.controller';
import { ConversionService } from './services/conversion.service';
import { FileValidationService } from './services/file-validation.service';
import { ConversionSseService } from './services/conversion-sse.service';
import { ConversionWorkerService } from './services/conversion-worker.service';
import { ConverterFactory } from './converters/converter.factory';

@Module({
	imports: [TypeOrmModule.forFeature([ConversionJob])],
	controllers: [DocumentConverterController],
	providers: [
		ConversionService,
		FileValidationService,
		ConverterFactory,
		ConversionSseService,
		ConversionWorkerService,
		AwsS3Service,
		PgBossService,
	],
})
export class DocumentConverterModule {}
