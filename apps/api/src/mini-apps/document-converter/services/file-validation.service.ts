/**
 * FileValidationService
 *
 * Validates uploaded files for security and format compliance.
 * Includes protection against:
 * - Invalid file types/extensions
 * - File size limits
 * - Path traversal attacks
 * - ZIP bombs (for Office files)
 * - Embedded macros
 * - Corrupted files
 */
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';
import * as yauzl from 'yauzl';

import {
	InvalidFileTypeError,
	FileTooLargeError,
	EmptyFileError,
	FilenameTooLongError,
	MaliciousFileError,
	InvalidFilenameError,
	FileCorruptedError,
} from '../../../_platform/errors/domain.errors';

// Configuration constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILENAME_LENGTH = 255;
const MAX_ZIP_ENTRIES = 1000;
const MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024; // 100MB

// Allowed file extensions (case-insensitive)
const ALLOWED_EXTENSIONS = ['.docx', '.pdf', '.pptx', '.xlsx'];

// Magic bytes for file type verification
const MAGIC_BYTES: Record<string, number[]> = {
	'.docx': [0x50, 0x4b, 0x03, 0x04], // ZIP signature (PK..)
	'.xlsx': [0x50, 0x4b, 0x03, 0x04],
	'.pptx': [0x50, 0x4b, 0x03, 0x04],
	'.pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
};

// MIME type mapping
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
	'.docx': [
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/zip', // Some systems report ZIP for Office files
	],
	'.xlsx': [
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/zip',
	],
	'.pptx': [
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'application/zip',
	],
	'.pdf': ['application/pdf'],
};

// Files that indicate macro presence in Office documents
const MACRO_INDICATORS = [
	'vbaProject.bin',
	'xl/vbaProject.bin',
	'word/vbaProject.bin',
	'ppt/vbaProject.bin',
];

export interface ValidatedFile {
	buffer: Buffer;
	originalName: string;
	sanitizedName: string;
	extension: string;
	mimeType: string;
	size: number;
}

@Injectable()
export class FileValidationService {
	private readonly logger = new Logger(FileValidationService.name);

	/**
	 * Validates an uploaded file through all security checks.
	 * Throws appropriate DomainError if validation fails.
	 *
	 * @param file - Express.Multer.File object
	 * @returns ValidatedFile with sanitized properties
	 */
	async validateFile(file: Express.Multer.File): Promise<ValidatedFile> {
		if (!file || !file.buffer) {
			throw new EmptyFileError();
		}

		this.logger.debug(`Validating file: ${file.originalname}`);

		// Basic validation first (fast checks)
		this.validateSize(file.buffer, file.size);
		const sanitizedName = this.validateFileName(file.originalname);
		const extension = this.validateExtension(sanitizedName);
		this.validateContentType(file.mimetype, extension);
		this.validateMagicBytes(file.buffer, extension);

		// ZIP structure validation for Office files (slower, async)
		if (this.isOfficeFile(extension)) {
			await this.validateZipStructure(file.buffer);
		}

		this.logger.debug(`File validated successfully: ${sanitizedName}`);

		return {
			buffer: file.buffer,
			originalName: file.originalname,
			sanitizedName,
			extension,
			mimeType: this.getMimeType(extension),
			size: file.size,
		};
	}

	/**
	 * Validates file size is within limits.
	 */
	validateSize(buffer: Buffer, reportedSize: number): void {
		// Check for empty file
		if (!buffer || buffer.length === 0) {
			throw new EmptyFileError();
		}

		// Verify buffer matches reported size (detect truncation)
		if (buffer.length !== reportedSize) {
			this.logger.warn(
				`File size mismatch: buffer=${buffer.length}, reported=${reportedSize}`,
			);
			throw new FileCorruptedError();
		}

		// Check size limit
		if (buffer.length > MAX_FILE_SIZE) {
			throw new FileTooLargeError(buffer.length, MAX_FILE_SIZE);
		}
	}

	/**
	 * Validates and sanitizes filename.
	 * Returns sanitized filename.
	 */
	validateFileName(originalName: string): string {
		if (!originalName || typeof originalName !== 'string') {
			throw new InvalidFilenameError();
		}

		let filename = originalName;

		// Path traversal protection: extract only the filename
		filename = path.basename(filename);

		// Remove null bytes (security)
		// eslint-disable-next-line no-control-regex
		filename = filename.replace(/\x00/g, '');

		// Normalize unicode to prevent homograph attacks
		filename = filename.normalize('NFD');

		// Remove control characters
		// eslint-disable-next-line no-control-regex
		filename = filename.replace(/[\x00-\x1f\x7f]/g, '');

		// Remove dangerous characters, keeping only safe ones
		// Allow: alphanumeric, spaces, dots, hyphens, underscores
		filename = filename.replace(/[^\w\s.-]/g, '_');

		// Prevent hidden files (starting with dot)
		filename = filename.replace(/^\.+/, '');

		// Collapse multiple dots/spaces/underscores
		filename = filename.replace(/\.{2,}/g, '.');
		filename = filename.replace(/\s{2,}/g, ' ');
		filename = filename.replace(/_{2,}/g, '_');

		// Trim whitespace
		filename = filename.trim();

		// Validate result
		if (!filename) {
			throw new InvalidFilenameError();
		}

		if (filename.length > MAX_FILENAME_LENGTH) {
			throw new FilenameTooLongError(filename.length);
		}

		// Ensure file still has an extension after sanitization
		const ext = path.extname(filename).toLowerCase();
		if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
			throw new InvalidFileTypeError();
		}

		return filename;
	}

	/**
	 * Validates file extension is allowed.
	 * Returns lowercase extension.
	 */
	validateExtension(filename: string): string {
		const extension = path.extname(filename).toLowerCase();

		if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
			throw new InvalidFileTypeError();
		}

		return extension;
	}

	/**
	 * Validates client-supplied Content-Type matches expected MIME types for extension.
	 * This is a defense-in-depth check; magic bytes validation is the primary control.
	 */
	validateContentType(mimeType: string | undefined, extension: string): void {
		const allowedMimeTypes = ALLOWED_MIME_TYPES[extension];

		if (!allowedMimeTypes) {
			throw new InvalidFileTypeError();
		}

		// If no MIME type provided, allow it (will be caught by magic bytes)
		if (!mimeType) {
			this.logger.debug(
				'No Content-Type header provided, relying on magic bytes validation',
			);
			return;
		}

		// Normalize MIME type (remove charset and other params)
		const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();

		// Check against allowed MIME types for this extension
		// Also accept application/octet-stream as generic binary
		if (
			!allowedMimeTypes.includes(normalizedMimeType) &&
			normalizedMimeType !== 'application/octet-stream'
		) {
			this.logger.warn(
				`Content-Type mismatch: received "${normalizedMimeType}" but expected one of [${allowedMimeTypes.join(', ')}] for extension ${extension}`,
			);
			throw new InvalidFileTypeError();
		}
	}

	/**
	 * Validates file content matches expected magic bytes.
	 */
	validateMagicBytes(buffer: Buffer, extension: string): void {
		const expectedBytes = MAGIC_BYTES[extension];
		if (!expectedBytes) {
			throw new InvalidFileTypeError();
		}

		// Check if buffer starts with expected magic bytes
		for (let i = 0; i < expectedBytes.length; i++) {
			if (buffer[i] !== expectedBytes[i]) {
				this.logger.warn(
					`Magic bytes mismatch for ${extension}: expected ${expectedBytes.join(',')} but got ${Array.from(buffer.slice(0, expectedBytes.length)).join(',')}`,
				);
				throw new InvalidFileTypeError();
			}
		}
	}

	/**
	 * Validates ZIP structure for Office files.
	 * Checks for ZIP bombs, macros, and OOXML compliance.
	 */
	async validateZipStructure(buffer: Buffer): Promise<void> {
		return new Promise((resolve, reject) => {
			yauzl.fromBuffer(buffer, { lazyEntries: false }, (err, zipfile) => {
				if (err) {
					this.logger.warn(
						`Failed to parse ZIP structure: ${err.message}`,
					);
					reject(new FileCorruptedError());
					return;
				}

				if (!zipfile) {
					reject(new FileCorruptedError());
					return;
				}

				let entryCount = 0;
				let totalUncompressedSize = 0;
				let hasMacros = false;
				let hasContentTypes = false; // Required for OOXML compliance

				zipfile.on('entry', (entry: yauzl.Entry) => {
					entryCount++;

					// Check entry count (ZIP bomb protection)
					if (entryCount > MAX_ZIP_ENTRIES) {
						zipfile.close();
						reject(
							new MaliciousFileError(
								'Too many entries in archive',
							),
						);
						return;
					}

					// Track uncompressed size (ZIP bomb protection)
					totalUncompressedSize += entry.uncompressedSize;
					if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
						zipfile.close();
						reject(
							new MaliciousFileError(
								'Decompressed size exceeds limit',
							),
						);
						return;
					}

					const entryName = entry.fileName.toLowerCase();

					// Check for macros
					if (
						MACRO_INDICATORS.some((macro) =>
							entryName.includes(macro.toLowerCase()),
						)
					) {
						hasMacros = true;
					}

					// Check for OOXML required file (all Office documents must have this)
					if (entryName === '[content_types].xml') {
						hasContentTypes = true;
					}
				});

				zipfile.on('end', () => {
					if (hasMacros) {
						reject(new MaliciousFileError('Macros not allowed'));
						return;
					}

					// All valid Office Open XML files must contain [Content_Types].xml
					if (!hasContentTypes) {
						this.logger.warn(
							'ZIP file missing [Content_Types].xml - not a valid Office document',
						);
						reject(new InvalidFileTypeError());
						return;
					}

					this.logger.debug(
						`ZIP structure validated: ${entryCount} entries, ${totalUncompressedSize} bytes uncompressed`,
					);
					resolve();
				});

				zipfile.on('error', (zipErr) => {
					this.logger.warn(`ZIP parsing error: ${zipErr.message}`);
					reject(new FileCorruptedError());
				});
			});
		});
	}

	/**
	 * Checks if extension is an Office file (OOXML format).
	 */
	private isOfficeFile(extension: string): boolean {
		return ['.docx', '.xlsx', '.pptx'].includes(extension);
	}

	/**
	 * Gets the MIME type for a file extension.
	 */
	private getMimeType(extension: string): string {
		const mimeTypes = ALLOWED_MIME_TYPES[extension];
		return mimeTypes?.[0] || 'application/octet-stream';
	}
}
