import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '../../common.module';

import { ImageAsset } from './entities/image-asset.entity';
import { ImageLibraryController } from './image-library.controller';
import { ImageLibraryService } from './services/image-library.service';

/**
 * CommonModule is imported (not as @Global) so SpaceAccessGuard can resolve
 * its `SpaceUserService` + `SpaceService` deps. Other mini-apps do not need
 * this — `image-library` is the first per-space app and consumes the space
 * membership infra.
 *
 * `ImageFileValidationService` was hoisted to `_platform/files/` so the
 * `text-counter` mini app can reuse it without crossing mini-app boundaries.
 * It is provided globally by `PlatformModule`; nothing extra needed here.
 */
@Module({
	imports: [CommonModule, TypeOrmModule.forFeature([ImageAsset])],
	controllers: [ImageLibraryController],
	providers: [ImageLibraryService],
	exports: [ImageLibraryService],
})
export class ImageLibraryModule {}
