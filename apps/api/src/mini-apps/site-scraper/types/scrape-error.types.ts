/**
 * Error codes for scrape failures.
 * Each code represents a specific category of failure in the scraping pipeline.
 */
export type ScrapeErrorCode =
	| 'CRAWL_TIMEOUT'
	| 'CRAWL_FAILED'
	| 'SSRF_BLOCKED'
	| 'S3_ERROR'
	| 'BROWSER_CRASH'
	| 'SITE_UNREACHABLE'
	| 'JOB_CANCELLED'
	| 'WORKER_RESTART';

/**
 * Structured error information for scrape failures.
 * Stored as JSONB in the database and returned in API responses.
 */
export interface ScrapeError {
	/** Error code identifying the failure type */
	code: ScrapeErrorCode;
	/** Human-readable error message */
	message: string;
	/** Whether the error is retryable (job can be requeued) */
	retryable: boolean;
	/** ISO 8601 timestamp when the error occurred */
	timestamp: string;
}

/**
 * Type guard for runtime validation of ScrapeError objects.
 * Used when deserializing from database JSONB columns.
 * @param obj Unknown object to validate
 * @returns true if obj is a valid ScrapeError
 */
export function isScrapeError(obj: unknown): obj is ScrapeError {
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
export const RETRYABLE_ERROR_CODES: ScrapeErrorCode[] = [
	'CRAWL_TIMEOUT',
	'S3_ERROR',
	'BROWSER_CRASH',
];

/**
 * Error codes that indicate the site itself is problematic (non-retryable).
 */
export const SITE_ERROR_CODES: ScrapeErrorCode[] = [
	'SSRF_BLOCKED',
	'SITE_UNREACHABLE',
];

/**
 * Create a standardized ScrapeError object.
 * @param code Error code
 * @param message Human-readable message
 * @returns ScrapeError object
 */
export function createScrapeError(
	code: ScrapeErrorCode,
	message: string,
): ScrapeError {
	return {
		code,
		message,
		retryable: RETRYABLE_ERROR_CODES.includes(code),
		timestamp: new Date().toISOString(),
	};
}
