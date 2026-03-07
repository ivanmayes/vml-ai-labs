/**
 * Error codes for conversion failures.
 * Each code represents a specific category of failure in the conversion pipeline.
 */
export type ConversionErrorCode =
	| 'CONVERSION_TIMEOUT'
	| 'CONVERSION_FAILED'
	| 'INVALID_FORMAT'
	| 'S3_ERROR'
	| 'QUEUE_ERROR'
	| 'JOB_CANCELLED'
	| 'UNSUPPORTED_FEATURE'
	| 'FILE_CORRUPTED'
	| 'PASSWORD_PROTECTED';

/**
 * Structured error information for conversion failures.
 * Stored as JSONB in the database and returned in API responses.
 */
export interface ConversionError {
	/** Error code identifying the failure type */
	code: ConversionErrorCode;
	/** Human-readable error message */
	message: string;
	/** Whether the error is retryable (job can be requeued) */
	retryable: boolean;
	/** ISO 8601 timestamp when the error occurred */
	timestamp: string;
	/** Additional context for debugging (not exposed to clients) */
	context?: Record<string, unknown>;
}

/**
 * Type guard for runtime validation of ConversionError objects.
 * Used when deserializing from database JSONB columns.
 * @param obj Unknown object to validate
 * @returns true if obj is a valid ConversionError
 */
export function isConversionError(obj: unknown): obj is ConversionError {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'code' in obj &&
		'message' in obj &&
		'retryable' in obj &&
		'timestamp' in obj
	);
}

/**
 * Error codes that indicate the job should be automatically retried.
 */
export const RETRYABLE_ERROR_CODES: ConversionErrorCode[] = [
	'CONVERSION_TIMEOUT',
	'S3_ERROR',
	'QUEUE_ERROR',
];

/**
 * Error codes that indicate the file itself is problematic (non-retryable).
 */
export const FILE_ERROR_CODES: ConversionErrorCode[] = [
	'INVALID_FORMAT',
	'FILE_CORRUPTED',
	'PASSWORD_PROTECTED',
	'UNSUPPORTED_FEATURE',
];

/**
 * Create a standardized ConversionError object.
 * @param code Error code
 * @param message Human-readable message
 * @param context Optional additional context
 * @returns ConversionError object
 */
export function createConversionError(
	code: ConversionErrorCode,
	message: string,
	context?: Record<string, unknown>,
): ConversionError {
	return {
		code,
		message,
		retryable: RETRYABLE_ERROR_CODES.includes(code),
		timestamp: new Date().toISOString(),
		context,
	};
}
