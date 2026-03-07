/**
 * Domain Error Hierarchy for VML Document Converter
 *
 * Provides a type-safe error handling system with:
 * - Consistent error codes for client handling
 * - HTTP status mapping for API responses
 * - Retryable flag for client retry logic
 * - Optional context for debugging
 */

/**
 * Base class for all domain-specific errors.
 * Provides consistent structure for error handling across the application.
 */
export abstract class DomainError extends Error {
	/** Unique error code for client-side handling */
	abstract readonly code: string;

	/** HTTP status code to return in API responses */
	abstract readonly httpStatus: number;

	/** Whether the operation can be retried */
	readonly retryable: boolean;

	/** Additional context for debugging (not exposed to clients) */
	readonly context?: Record<string, unknown>;

	constructor(
		message: string,
		retryable = false,
		context?: Record<string, unknown>,
	) {
		super(message);
		this.name = this.constructor.name;
		this.retryable = retryable;
		this.context = context;

		// Maintains proper stack trace for where error was thrown
		Error.captureStackTrace(this, this.constructor);
	}

	/**
	 * Serializes error for API responses.
	 * Excludes internal context to prevent information leakage.
	 */
	toJSON(): { code: string; message: string; retryable: boolean } {
		return {
			code: this.code,
			message: this.message,
			retryable: this.retryable,
		};
	}
}

// =============================================================================
// File Validation Errors (400 Bad Request)
// =============================================================================

/**
 * Thrown when uploaded file type is not supported.
 * Supported types: .docx, .pdf, .pptx, .xlsx
 */
export class InvalidFileTypeError extends DomainError {
	readonly code = 'INVALID_FILE_TYPE';
	readonly httpStatus = 400;

	constructor() {
		super('Unsupported file type', false);
	}
}

/**
 * Thrown when uploaded file exceeds size limit (25MB).
 */
export class FileTooLargeError extends DomainError {
	readonly code = 'FILE_TOO_LARGE';
	readonly httpStatus = 400;

	constructor(actualSize?: number, maxSize?: number) {
		super('File exceeds maximum allowed size', false, {
			actualSize,
			maxSize,
		});
	}
}

/**
 * Thrown when uploaded file is empty (0 bytes).
 */
export class EmptyFileError extends DomainError {
	readonly code = 'EMPTY_FILE';
	readonly httpStatus = 400;

	constructor() {
		super('File appears to be empty', false);
	}
}

/**
 * Thrown when filename exceeds maximum length (255 characters).
 */
export class FilenameTooLongError extends DomainError {
	readonly code = 'FILENAME_TOO_LONG';
	readonly httpStatus = 400;

	constructor(length?: number) {
		super('Filename exceeds maximum length', false, {
			length,
			maxLength: 255,
		});
	}
}

/**
 * Thrown when file fails security validation.
 * Includes ZIP bomb detection, macro detection, path traversal, etc.
 */
export class MaliciousFileError extends DomainError {
	readonly code = 'MALICIOUS_FILE';
	readonly httpStatus = 400;

	constructor(detail: string) {
		super('File failed security validation', false, { detail });
	}
}

/**
 * Thrown when filename contains invalid characters or patterns.
 */
export class InvalidFilenameError extends DomainError {
	readonly code = 'INVALID_FILENAME';
	readonly httpStatus = 400;

	constructor() {
		super('Filename contains invalid characters', false);
	}
}

// =============================================================================
// Job Errors
// =============================================================================

/**
 * Thrown when requested job does not exist or user lacks access.
 * Uses 404 to prevent job ID enumeration.
 */
export class JobNotFoundError extends DomainError {
	readonly code = 'JOB_NOT_FOUND';
	readonly httpStatus = 404;

	constructor() {
		super('Job not found', false);
	}
}

/**
 * Thrown when attempting an invalid job state transition.
 * E.g., trying to cancel a completed job.
 */
export class InvalidStatusTransitionError extends DomainError {
	readonly code = 'INVALID_STATUS';
	readonly httpStatus = 400;

	constructor(message: string, fromStatus?: string, toStatus?: string) {
		super(message, false, { fromStatus, toStatus });
	}
}

/**
 * Thrown when job has already been cancelled.
 */
export class JobAlreadyCancelledError extends DomainError {
	readonly code = 'JOB_ALREADY_CANCELLED';
	readonly httpStatus = 400;

	constructor() {
		super('Job has already been cancelled', false);
	}
}

/**
 * Thrown when retry is attempted but max retries exceeded.
 */
export class MaxRetriesExceededError extends DomainError {
	readonly code = 'MAX_RETRIES_EXCEEDED';
	readonly httpStatus = 400;

	constructor(retryCount: number, maxRetries: number) {
		super('Maximum retry attempts exceeded', false, {
			retryCount,
			maxRetries,
		});
	}
}

/**
 * Thrown when job download is requested but file has expired.
 */
export class DownloadExpiredError extends DomainError {
	readonly code = 'DOWNLOAD_EXPIRED';
	readonly httpStatus = 410; // Gone

	constructor() {
		super('Download link has expired', false);
	}
}

// =============================================================================
// Conversion Errors (500 Internal Server Error, may be retryable)
// =============================================================================

/**
 * Thrown when conversion exceeds time limit.
 * This is retryable as it may succeed on retry.
 */
export class ConversionTimeoutError extends DomainError {
	readonly code = 'CONVERSION_TIMEOUT';
	readonly httpStatus = 500;

	constructor() {
		super('Conversion timed out', true);
	}
}

/**
 * Thrown when conversion fails for technical reasons.
 * Retryable flag depends on the underlying cause.
 */
export class ConversionFailedError extends DomainError {
	readonly code = 'CONVERSION_FAILED';
	readonly httpStatus = 500;

	constructor(message: string, retryable = true) {
		super(message, retryable);
	}
}

/**
 * Thrown when file is corrupted or cannot be parsed.
 */
export class FileCorruptedError extends DomainError {
	readonly code = 'FILE_CORRUPTED';
	readonly httpStatus = 400;

	constructor() {
		super('File appears to be corrupted', false);
	}
}

/**
 * Thrown when file is password protected.
 */
export class PasswordProtectedError extends DomainError {
	readonly code = 'PASSWORD_PROTECTED';
	readonly httpStatus = 400;

	constructor() {
		super('File is password protected', false);
	}
}

/**
 * Thrown when file contains unsupported features.
 */
export class UnsupportedFeatureError extends DomainError {
	readonly code = 'UNSUPPORTED_FEATURE';
	readonly httpStatus = 400;

	constructor(feature: string) {
		super(`Unsupported feature: ${feature}`, false, { feature });
	}
}

// =============================================================================
// Infrastructure Errors (500 Internal Server Error)
// =============================================================================

/**
 * Thrown when S3 operation fails.
 */
export class S3Error extends DomainError {
	readonly code = 'S3_ERROR';
	readonly httpStatus = 500;

	constructor(operation: string, retryable = true) {
		super(`Storage operation failed: ${operation}`, retryable, {
			operation,
		});
	}
}

/**
 * Thrown when queue operation fails.
 */
export class QueueError extends DomainError {
	readonly code = 'QUEUE_ERROR';
	readonly httpStatus = 500;

	constructor(operation: string) {
		super(`Queue operation failed: ${operation}`, true, { operation });
	}
}

// =============================================================================
// Rate Limiting Errors (429 Too Many Requests)
// =============================================================================

/**
 * Thrown when user exceeds rate limit.
 */
export class RateLimitExceededError extends DomainError {
	readonly code = 'RATE_LIMIT_EXCEEDED';
	readonly httpStatus = 429;

	/** Seconds until rate limit resets */
	readonly retryAfter: number;

	constructor(retryAfter: number) {
		super('Too many requests. Please try again later.', true, {
			retryAfter,
		});
		this.retryAfter = retryAfter;
	}

	override toJSON(): {
		code: string;
		message: string;
		retryable: boolean;
		retryAfter: number;
	} {
		return {
			...super.toJSON(),
			retryAfter: this.retryAfter,
		};
	}
}

// =============================================================================
// SSE Token Errors (401 Unauthorized)
// =============================================================================

/**
 * Thrown when SSE token is invalid or expired.
 */
export class InvalidSseTokenError extends DomainError {
	readonly code = 'INVALID_SSE_TOKEN';
	readonly httpStatus = 401;

	constructor() {
		super('Invalid or expired SSE token', false);
	}
}

/**
 * Thrown when SSE token has already been used.
 */
export class SseTokenAlreadyUsedError extends DomainError {
	readonly code = 'SSE_TOKEN_USED';
	readonly httpStatus = 401;

	constructor() {
		super('SSE token has already been used', false);
	}
}

// =============================================================================
// Concurrency Errors (409 Conflict)
// =============================================================================

/**
 * Thrown when optimistic locking detects a concurrent update.
 * Client should refresh data and retry.
 */
export class ConcurrentUpdateError extends DomainError {
	readonly code = 'CONCURRENT_UPDATE';
	readonly httpStatus = 409; // Conflict

	constructor(entityName = 'record') {
		super(
			`${entityName} was modified by another request. Please refresh and try again.`,
			true,
			{ entityName },
		);
	}
}
