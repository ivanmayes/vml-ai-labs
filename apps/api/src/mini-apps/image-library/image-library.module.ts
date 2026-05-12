import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '../../common.module';

import { ImageAsset } from './entities/image-asset.entity';
import { ImageLibraryController } from './image-library.controller';
import { ImageLibraryService } from './services/image-library.service';
import { ImageFileValidationService } from './services/image-file-validation.service';

/**
 * CommonModule is imported (not as @Global) so SpaceAccessGuard can resolve
 * its `SpaceUserService` + `SpaceService` deps. Other mini-apps do not need
 * this — `image-library` is the first per-space app and consumes the space
 * membership infra.
 */
@Module({
	imports: [CommonModule, TypeOrmModule.forFeature([ImageAsset])],
	controllers: [ImageLibraryController],
	providers: [ImageLibraryService, ImageFileValidationService],
	exports: [ImageLibraryService],
})
export class ImageLibraryModule {}
