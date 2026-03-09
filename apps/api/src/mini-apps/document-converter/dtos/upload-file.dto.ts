/**
 * Upload File DTOs
 *
 * Request/response DTOs for the file upload endpoint.
 * Uses class-validator for request validation.
 */
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

/**
 * DTO for multipart form data in upload request.
 * Note: The actual file is handled by Multer, this DTO is for metadata.
 */
export class UploadFileDto {
	/**
	 * Optional client-generated idempotency key to prevent duplicate uploads.
	 * Must be alphanumeric with optional hyphens, max 100 characters.
	 */
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Matches(/^[a-zA-Z0-9-]+$/, {
		message: 'Idempotency key must be alphanumeric with optional hyphens',
	})
	idempotencyKey?: string;
}
