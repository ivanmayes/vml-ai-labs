/**
 * Download Response DTO
 *
 * Response DTO for the download endpoint that returns presigned S3 URLs.
 */
import { Expose, Type } from 'class-transformer';

/**
 * Response DTO for GET /api/conversion/jobs/:id/download
 *
 * Returns a time-limited presigned URL for downloading the converted file.
 */
export class DownloadResponseDto {
	@Expose()
	downloadUrl: string;

	@Expose()
	fileName: string;

	@Expose()
	fileSize: number;

	@Expose()
	@Type(() => Date)
	expiresAt: Date;

	@Expose()
	urlExpiresIn: number;
}
