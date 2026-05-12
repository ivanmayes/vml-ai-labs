import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { AwsS3Service } from '../../../_platform/aws';
import { UserService } from '../../../user/user.service';
import { ImageAsset } from '../entities/image-asset.entity';
import type {
	ImageResponseDto,
	ListImagesResponseDto,
	TagSuggestResponseDto,
} from '../dtos';

import { ValidatedImage } from './image-file-validation.service';

const APP_PREFIX = 'image-library';
const SIGNED_URL_TTL_SECONDS = 3600;

interface CreateImageInput {
	orgId: string;
	spaceId: string;
	userId: string;
	file: ValidatedImage;
	tags: string[];
}

interface ListImagesInput {
	orgId: string;
	spaceId: string;
	tags?: string[];
	page?: number;
	pageSize?: number;
	sort?: 'newest' | 'oldest';
}

@Injectable()
export class ImageLibraryService {
	private readonly logger = new Logger(ImageLibraryService.name);

	constructor(
		@InjectRepository(ImageAsset)
		private readonly imageRepo: Repository<ImageAsset>,
		private readonly s3Service: AwsS3Service,
		private readonly userService: UserService,
	) {}

	async createImage(input: CreateImageInput): Promise<ImageResponseDto> {
		const { orgId, spaceId, userId, file, tags } = input;
		const ext = file.extension.replace(/^\./, '');
		const s3Key = `${APP_PREFIX}/${spaceId}/${uuidv4()}.${ext}`;

		await this.s3Service.upload({
			key: s3Key,
			buffer: file.buffer,
			contentType: file.mimeType,
			metadata: {
				orgid: orgId,
				spaceid: spaceId,
				userid: userId,
			},
		});

		try {
			const asset = this.imageRepo.create({
				organizationId: orgId,
				spaceId,
				userId,
				s3Key,
				mime: file.mimeType,
				sizeBytes: file.size,
				originalFilename: file.sanitizedName,
				tags: this.normalizeTags(tags ?? []),
			});
			const saved = await this.imageRepo.save(asset);
			return this.toResponse(saved);
		} catch (err) {
			this.logger.warn(
				`Persist failed for ${s3Key}; cleaning up S3 object`,
				err as Error,
			);
			try {
				await this.s3Service.delete(s3Key);
			} catch (cleanupErr) {
				this.logger.error(
					`S3 cleanup failed for ${s3Key}`,
					cleanupErr as Error,
				);
			}
			throw err;
		}
	}

	async listImages(input: ListImagesInput): Promise<ListImagesResponseDto> {
		const page = Math.max(1, input.page ?? 1);
		const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
		const order: 'ASC' | 'DESC' = input.sort === 'oldest' ? 'ASC' : 'DESC';

		const qb = this.imageRepo
			.createQueryBuilder('image')
			.where('image.spaceId = :spaceId', { spaceId: input.spaceId })
			.andWhere('image.organizationId = :orgId', { orgId: input.orgId });

		const tagFilters = (input.tags ?? [])
			.map((t) => t.trim())
			.filter(Boolean);
		if (tagFilters.length > 0) {
			// `text[] @> ARRAY[...]::text[]` — AND-logic containment, GIN-accelerated.
			qb.andWhere('image.tags @> :tags::text[]', { tags: tagFilters });
		}

		qb.orderBy('image.createdAt', order)
			.offset((page - 1) * pageSize)
			.limit(pageSize);

		const [rows, total] = await qb.getManyAndCount();
		const items = await Promise.all(rows.map((r) => this.toResponse(r)));

		return { items, total, page, pageSize };
	}

	async deleteImage(
		id: string,
		orgId: string,
		spaceId: string,
	): Promise<void> {
		const row = await this.imageRepo.findOne({
			where: { id, organizationId: orgId, spaceId },
		});
		if (!row) {
			throw new NotFoundException('Image not found');
		}

		try {
			await this.s3Service.delete(row.s3Key);
		} catch (err) {
			// Best-effort: keep going even if S3 object is already gone.
			this.logger.warn(
				`S3 delete failed for ${row.s3Key}; proceeding with row delete`,
				err as Error,
			);
		}

		await this.imageRepo.delete({ id });
	}

	async suggestTags(
		orgId: string,
		spaceId: string,
		q: string,
		limit: number,
	): Promise<TagSuggestResponseDto> {
		const cleanQ = (q ?? '').trim();
		const cleanLimit = Math.min(50, Math.max(1, limit ?? 20));

		// `unnest(tags)` expands the array, group + count gives popularity rank.
		const rows = await this.imageRepo.manager.query<
			{ tag: string; uses: string }[]
		>(
			`SELECT tag, COUNT(*)::int AS uses
			 FROM (
			   SELECT DISTINCT id, unnest(tags) AS tag
			   FROM image_library.image_assets
			   WHERE "spaceId" = $1 AND "organizationId" = $2
			 ) t
			 WHERE ($3 = '' OR tag ILIKE '%' || $3 || '%')
			 GROUP BY tag
			 ORDER BY uses DESC, tag ASC
			 LIMIT $4`,
			[spaceId, orgId, cleanQ, cleanLimit],
		);

		return {
			suggestions: rows.map((r) => ({
				tag: r.tag,
				uses: Number(r.uses),
			})),
		};
	}

	private async toResponse(asset: ImageAsset): Promise<ImageResponseDto> {
		const signedUrl = await this.s3Service.generatePresignedUrl({
			key: asset.s3Key,
			expiresIn: SIGNED_URL_TTL_SECONDS,
			responseContentDisposition: `inline; filename="${asset.originalFilename.replace(/"/g, '')}"`,
			responseContentType: asset.mime,
		});

		const uploader = await this.userService
			.findOne({ where: { id: asset.userId } })
			.catch(() => null);

		return {
			id: asset.id,
			signedUrl,
			mime: asset.mime,
			sizeBytes: asset.sizeBytes,
			originalFilename: asset.originalFilename,
			tags: asset.tags ?? [],
			createdAt: asset.createdAt,
			uploadedBy: {
				id: asset.userId,
				email: uploader?.email ?? '',
			},
		};
	}

	private normalizeTags(tags: string[]): string[] {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const raw of tags) {
			if (typeof raw !== 'string') continue;
			const trimmed = raw.trim();
			if (!trimmed) continue;
			const key = trimmed.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			result.push(trimmed);
		}
		return result;
	}
}
