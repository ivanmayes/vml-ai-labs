import * as path from 'path';

import { Injectable } from '@nestjs/common';

import {
	InvalidFileTypeError,
	FileTooLargeError,
	EmptyFileError,
	InvalidFilenameError,
	HeicNotSupportedError,
	FileCorruptedError,
} from '../errors/domain.errors';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_FILENAME_LENGTH = 255;

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
	'.png': ['image/png'],
	'.jpg': ['image/jpeg'],
	'.jpeg': ['image/jpeg'],
	'.webp': ['image/webp'],
	'.gif': ['image/gif'],
};

const CANONICAL_MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
};

export interface ValidatedImage {
	buffer: Buffer;
	originalName: string;
	sanitizedName: string;
	extension: string;
	mimeType: string;
	size: number;
}

/**
 * Validates uploaded image files: size, filename safety, mime/extension
 * allow-list, and magic-byte verification (so a renamed PDF or an HEIC
 * disguised as `.jpg` is rejected). HEIC is explicitly identified and
 * rejected with a clear message in v1 (server-side transcode is deferred).
 *
 * Lives under `_platform/files/` because more than one mini app uses it
 * (image-library + text-counter). Cross-mini-app imports are forbidden, so
 * shared validation infra is hoisted to `_platform/` and provided globally
 * via `PlatformModule`.
 */
@Injectable()
export class ImageFileValidationService {
	async validateFile(file: Express.Multer.File): Promise<ValidatedImage> {
		if (!file || !file.buffer || file.buffer.length === 0) {
			throw new EmptyFileError();
		}

		this.validateSize(file.buffer, file.size);
		const sanitizedName = this.validateFileName(file.originalname);
		// HEIC check runs before extension/mime so users renaming `.heic` to
		// `.jpg` and users uploading a real `.heic` both get the same
		// HEIC-specific guidance instead of the generic "unsupported" error.
		if (this.isHeic(file.buffer)) {
			throw new HeicNotSupportedError();
		}
		const extension = this.validateExtension(sanitizedName);
		this.validateMimeType(file.mimetype, extension);
		this.validateMagicBytes(file.buffer, extension);

		return {
			buffer: file.buffer,
			originalName: file.originalname,
			sanitizedName,
			extension,
			mimeType: CANONICAL_MIME[extension],
			size: file.buffer.length,
		};
	}

	private validateSize(buffer: Buffer, reportedSize: number): void {
		if (buffer.length > MAX_FILE_SIZE) {
			throw new FileTooLargeError(buffer.length, MAX_FILE_SIZE);
		}
		// Trust buffer length; reported size from multer can drift on streams.
		// A large mismatch typically signals a truncated or corrupted upload —
		// reporting it as a filename problem (the prior class) mislabeled the
		// real failure to the user.
		if (
			typeof reportedSize === 'number' &&
			Math.abs(reportedSize - buffer.length) > 1024
		) {
			throw new FileCorruptedError();
		}
	}

	private validateFileName(name: string): string {
		if (!name || typeof name !== 'string') {
			throw new InvalidFilenameError();
		}
		if (name.length > MAX_FILENAME_LENGTH) {
			throw new InvalidFilenameError();
		}
		// Strip path components and reject control / null bytes.
		const base = path.basename(name);
		if (base !== name && name.includes('/')) {
			throw new InvalidFilenameError();
		}
		// Build the control-char regex via RegExp so the source file stays ASCII —
		// prettier/lint-staged previously rewrote a literal `/[\x00-\x1f]/` to a
		// printable `/[ -]/` (space-to-hyphen) during commit, silently disabling
		// the check and ALSO rejecting legitimate filenames with hyphens/spaces.
		// eslint-disable-next-line no-control-regex -- intentional deny-list against control chars in filenames
		if (new RegExp('[\\u0000-\\u001f\\u007f]').test(base)) {
			throw new InvalidFilenameError();
		}
		return base;
	}

	private validateExtension(sanitizedName: string): string {
		const ext = path.extname(sanitizedName).toLowerCase();
		if (!ALLOWED_EXTENSIONS.includes(ext)) {
			throw new InvalidFileTypeError();
		}
		return ext;
	}

	private validateMimeType(mime: string, extension: string): void {
		const allowed = ALLOWED_MIME_TYPES[extension] ?? [];
		// Browsers occasionally send `application/octet-stream` for camera
		// uploads — treat that as "trust the magic bytes" rather than reject.
		if (mime === 'application/octet-stream' || mime === '') return;
		if (!allowed.includes(mime)) {
			throw new InvalidFileTypeError();
		}
	}

	/**
	 * Magic-byte checks per format:
	 *  - PNG : 89 50 4E 47 0D 0A 1A 0A at offset 0
	 *  - JPEG: FF D8 FF                at offset 0
	 *  - GIF : "GIF87a" or "GIF89a"    at offset 0
	 *  - WebP: "RIFF" at 0-3 AND "WEBP" at 8-11
	 *  - HEIC: "ftyp" at 4-7 with brand heic/heix/heif/hevc/mif1/msf1 at 8-11
	 */
	private validateMagicBytes(buffer: Buffer, extension: string): void {
		switch (extension) {
			case '.png':
				if (
					!this.startsWith(
						buffer,
						[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
					)
				) {
					throw new InvalidFileTypeError();
				}
				break;
			case '.jpg':
			case '.jpeg':
				if (!this.startsWith(buffer, [0xff, 0xd8, 0xff])) {
					throw new InvalidFileTypeError();
				}
				break;
			case '.gif':
				if (
					!(
						this.matchesAscii(buffer, 0, 'GIF87a') ||
						this.matchesAscii(buffer, 0, 'GIF89a')
					)
				) {
					throw new InvalidFileTypeError();
				}
				break;
			case '.webp':
				if (
					!(
						this.matchesAscii(buffer, 0, 'RIFF') &&
						this.matchesAscii(buffer, 8, 'WEBP')
					)
				) {
					throw new InvalidFileTypeError();
				}
				break;
			default:
				throw new InvalidFileTypeError();
		}
	}

	private isHeic(buffer: Buffer): boolean {
		if (buffer.length < 12) return false;
		if (!this.matchesAscii(buffer, 4, 'ftyp')) return false;
		const brand = buffer.slice(8, 12).toString('ascii');
		return [
			'heic',
			'heix',
			'heif',
			'hevc',
			'hevx',
			'mif1',
			'msf1',
		].includes(brand);
	}

	private startsWith(buffer: Buffer, expected: number[]): boolean {
		if (buffer.length < expected.length) return false;
		for (let i = 0; i < expected.length; i += 1) {
			if (buffer[i] !== expected[i]) return false;
		}
		return true;
	}

	private matchesAscii(
		buffer: Buffer,
		offset: number,
		expected: string,
	): boolean {
		if (buffer.length < offset + expected.length) return false;
		return (
			buffer.slice(offset, offset + expected.length).toString('ascii') ===
			expected
		);
	}
}
