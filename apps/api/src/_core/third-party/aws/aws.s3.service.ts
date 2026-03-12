import { Readable } from 'stream';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	HeadObjectCommand,
	type PutObjectCommandInput,
	type GetObjectCommandInput,
	type DeleteObjectCommandInput,
	type DeleteObjectsCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';

/**
 * Options for file upload
 */
export interface UploadOptions {
	/** S3 key (path) for the file */
	key: string;
	/** File content as Buffer */
	buffer: Buffer;
	/** MIME type of the file */
	contentType: string;
	/** Optional metadata */
	metadata?: Record<string, string>;
}

/**
 * Result of file upload
 */
export interface UploadResult {
	/** S3 key of the uploaded file */
	key: string;
	/** Size of the uploaded file in bytes */
	size: number;
	/** ETag returned by S3 */
	etag?: string;
}

/**
 * Options for generating presigned URL
 */
export interface PresignedUrlOptions {
	/** S3 key of the file */
	key: string;
	/** URL expiration in seconds (default: 3600 = 1 hour) */
	expiresIn?: number;
	/** Filename to use in Content-Disposition header */
	responseContentDisposition?: string;
	/** Content-Type to use in response */
	responseContentType?: string;
}

/**
 * AWS S3 Service (Injectable)
 *
 * Provides secure file storage with:
 * - Private bucket (no public access)
 * - Presigned URLs for secure time-limited downloads
 * - Proper error handling
 *
 * Uses AWS SDK v3 for modern, modular architecture.
 */
@Injectable()
export class AwsS3Service implements OnModuleInit {
	private readonly logger = new Logger(AwsS3Service.name);
	private client: S3Client;
	private readonly bucketName: string;
	private readonly region: string;

	constructor() {
		this.bucketName =
			process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || '';
		this.region =
			process.env.AWS_S3_REGION || process.env.AWS_REGION || 'us-east-1';
	}

	onModuleInit() {
		this.initializeClient();
	}

	/**
	 * Initialize S3 client with credentials
	 */
	private initializeClient(): void {
		const accessKeyId =
			process.env.AWS_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
		const secretAccessKey =
			process.env.AWS_S3_SECRET_ACCESS_KEY ||
			process.env.AWS_SECRET_ACCESS_KEY;

		const config: {
			region: string;
			credentials?: { accessKeyId: string; secretAccessKey: string };
		} = {
			region: this.region,
		};

		// Only set explicit credentials if provided
		// Otherwise, SDK will use default credential chain (IAM roles, etc.)
		if (accessKeyId && secretAccessKey) {
			config.credentials = {
				accessKeyId,
				secretAccessKey,
			};
		}

		this.client = new S3Client(config);

		if (!this.bucketName) {
			this.logger.warn(
				'AWS_S3_BUCKET not configured - S3 operations will fail',
			);
		} else {
			this.logger.log(
				`S3 service initialized for bucket: ${this.bucketName}`,
			);
		}
	}

	/**
	 * Generate a unique S3 key for a file
	 *
	 * @param folder - Folder path (e.g., 'uploads', 'converted')
	 * @param originalFilename - Original filename to preserve extension
	 * @returns Unique S3 key
	 */
	generateKey(folder: string, originalFilename: string): string {
		const ext = originalFilename.split('.').pop() || '';
		const uniqueId = uuid();
		const sanitizedFolder = folder.replace(/^\/|\/$/g, '');
		return `${sanitizedFolder}/${uniqueId}.${ext}`;
	}

	/**
	 * Upload a file to S3
	 *
	 * @param options - Upload options including key, buffer, and content type
	 * @returns Upload result with key, size, and etag
	 */
	async upload(options: UploadOptions): Promise<UploadResult> {
		const { key, buffer, contentType, metadata } = options;

		const params: PutObjectCommandInput = {
			Bucket: this.bucketName,
			Key: key,
			Body: buffer,
			ContentType: contentType,
			ContentLength: buffer.length,
			Metadata: metadata,
		};

		try {
			const command = new PutObjectCommand(params);
			const result = await this.client.send(command);

			this.logger.debug(
				`Uploaded file to S3: ${key} (${buffer.length} bytes)`,
			);

			return {
				key,
				size: buffer.length,
				etag: result.ETag,
			};
		} catch (error) {
			this.logger.error(`Failed to upload to S3: ${key}`, error);
			throw new Error(`S3 upload failed for key: ${key}`);
		}
	}

	/**
	 * Download a file from S3 as a Buffer
	 *
	 * @param key - S3 key of the file
	 * @returns File content as Buffer
	 */
	async download(key: string): Promise<Buffer> {
		const params: GetObjectCommandInput = {
			Bucket: this.bucketName,
			Key: key,
		};

		try {
			const command = new GetObjectCommand(params);
			const result = await this.client.send(command);

			if (!result.Body) {
				throw new Error('Empty response body');
			}

			// Convert stream to buffer
			const stream = result.Body as Readable;
			const chunks: Buffer[] = [];

			for await (const chunk of stream) {
				chunks.push(Buffer.from(chunk));
			}

			const buffer = Buffer.concat(chunks);
			this.logger.debug(
				`Downloaded file from S3: ${key} (${buffer.length} bytes)`,
			);

			return buffer;
		} catch (error) {
			this.logger.error(`Failed to download from S3: ${key}`, error);
			throw new Error(`S3 download failed for key: ${key}`);
		}
	}

	/**
	 * Generate a presigned URL for secure, time-limited download
	 *
	 * @param options - Presigned URL options
	 * @returns Presigned URL string
	 */
	async generatePresignedUrl(options: PresignedUrlOptions): Promise<string> {
		const {
			key,
			expiresIn = 3600, // 1 hour default
			responseContentDisposition,
			responseContentType,
		} = options;

		const params: GetObjectCommandInput = {
			Bucket: this.bucketName,
			Key: key,
		};

		// Add response headers for download
		if (responseContentDisposition) {
			params.ResponseContentDisposition = responseContentDisposition;
		}
		if (responseContentType) {
			params.ResponseContentType = responseContentType;
		}

		try {
			const command = new GetObjectCommand(params);
			const url = await getSignedUrl(this.client, command, {
				expiresIn,
			});

			this.logger.debug(
				`Generated presigned URL for: ${key} (expires in ${expiresIn}s)`,
			);

			return url;
		} catch (error) {
			this.logger.error(
				`Failed to generate presigned URL for: ${key}`,
				error,
			);
			throw new Error(`S3 generatePresignedUrl failed for key: ${key}`);
		}
	}

	/**
	 * Generate a presigned download URL with proper headers
	 *
	 * @param key - S3 key of the file
	 * @param filename - Filename to use in download
	 * @param expiresIn - URL expiration in seconds (default: 3600)
	 * @returns Presigned URL configured for download
	 */
	async generateDownloadUrl(
		key: string,
		filename: string,
		expiresIn = 3600,
	): Promise<string> {
		// Sanitize filename to prevent header injection attacks
		const sanitizedFilename =
			this.sanitizeContentDispositionFilename(filename);

		return this.generatePresignedUrl({
			key,
			expiresIn,
			responseContentDisposition: sanitizedFilename,
			responseContentType: 'text/markdown',
		});
	}

	/**
	 * Sanitize filename for Content-Disposition header.
	 * Prevents header injection and handles non-ASCII characters per RFC 5987.
	 *
	 * @param filename - Original filename
	 * @returns Safe Content-Disposition header value
	 */
	private sanitizeContentDispositionFilename(filename: string): string {
		// Remove control characters and newlines (prevent header injection)
		// eslint-disable-next-line no-control-regex
		let sanitized = filename.replace(/[\x00-\x1f\x7f\r\n]/g, '');

		// Check if filename is ASCII-only
		const isAscii = /^[\x20-\x7e]+$/.test(sanitized);

		if (isAscii) {
			// For ASCII filenames: escape quotes and backslashes
			sanitized = sanitized.replace(/["\\]/g, '\\$&');
			return `attachment; filename="${sanitized}"`;
		} else {
			// For non-ASCII: use RFC 5987 encoding (filename*=UTF-8''...)
			// Also include ASCII fallback for older clients
			const asciiFallback = sanitized
				.replace(/[^\x20-\x7e]/g, '_')
				.replace(/["\\]/g, '\\$&');
			const encoded = encodeURIComponent(sanitized).replace(/'/g, '%27');
			return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
		}
	}

	/**
	 * Delete a single file from S3
	 *
	 * @param key - S3 key of the file to delete
	 */
	async delete(key: string): Promise<void> {
		const params: DeleteObjectCommandInput = {
			Bucket: this.bucketName,
			Key: key,
		};

		try {
			const command = new DeleteObjectCommand(params);
			await this.client.send(command);

			this.logger.debug(`Deleted file from S3: ${key}`);
		} catch (error) {
			this.logger.error(`Failed to delete from S3: ${key}`, error);
			throw new Error(`S3 delete failed for key: ${key}`);
		}
	}

	/**
	 * Delete multiple files from S3
	 *
	 * @param keys - Array of S3 keys to delete
	 */
	async deleteMany(keys: string[]): Promise<void> {
		if (keys.length === 0) {
			return;
		}

		const params: DeleteObjectsCommandInput = {
			Bucket: this.bucketName,
			Delete: {
				Objects: keys.map((Key) => ({ Key })),
				Quiet: true,
			},
		};

		try {
			const command = new DeleteObjectsCommand(params);
			const result = await this.client.send(command);

			if (result.Errors && result.Errors.length > 0) {
				this.logger.warn(
					`Some files failed to delete: ${result.Errors.length} errors`,
				);
			}

			this.logger.debug(`Deleted ${keys.length} files from S3`);
		} catch (error) {
			this.logger.error(`Failed to delete multiple files from S3`, error);
			throw new Error(`S3 deleteMany failed`);
		}
	}

	/**
	 * Check if a file exists in S3
	 *
	 * @param key - S3 key to check
	 * @returns true if file exists, false otherwise
	 */
	async exists(key: string): Promise<boolean> {
		try {
			const command = new HeadObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			});
			await this.client.send(command);
			return true;
		} catch (error: unknown) {
			if (error && typeof error === 'object' && 'name' in error) {
				const awsError = error as { name: string };
				if (awsError.name === 'NotFound') {
					return false;
				}
			}
			throw new Error(`S3 exists check failed for key: ${key}`);
		}
	}

	/**
	 * Get file metadata without downloading content
	 *
	 * @param key - S3 key of the file
	 * @returns Object with size and content type
	 */
	async getMetadata(
		key: string,
	): Promise<{ size: number; contentType: string | undefined }> {
		try {
			const command = new HeadObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			});
			const result = await this.client.send(command);

			return {
				size: result.ContentLength || 0,
				contentType: result.ContentType,
			};
		} catch (error) {
			this.logger.error(`Failed to get metadata from S3: ${key}`, error);
			throw new Error(`S3 getMetadata failed for key: ${key}`);
		}
	}
}
