/**
 * Retry Utilities
 * Exponential backoff with jitter for AI API calls
 */

import { AIError, AIRateLimitError } from '../models/errors';

/**
 * Retry configuration
 */
export interface RetryOptions {
	maxRetries: number;
	initialDelayMs: number;
	maxDelayMs: number;
	backoffMultiplier: number;
	retryableErrors?: string[];
	onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: RetryOptions = {
	maxRetries: 3,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2,
	retryableErrors: [
		'rate_limit_exceeded',
		'timeout',
		'service_unavailable',
		'internal_server_error',
		'ECONNRESET',
		'ETIMEDOUT',
		'ENOTFOUND',
	],
};

/**
 * Retry utility for AI API calls
 */
export class RetryUtil {
	/**
	 * Execute a function with exponential backoff retry
	 */
	public static async withRetry<T>(
		fn: () => Promise<T>,
		options?: Partial<RetryOptions>,
	): Promise<T> {
		const opts = { ...DEFAULT_OPTIONS, ...options };
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError =
					error instanceof Error ? error : new Error(String(error));

				// Check if we should retry
				if (
					attempt >= opts.maxRetries ||
					!this.isRetryable(lastError, opts)
				) {
					throw lastError;
				}

				// Calculate delay
				const delayMs = this.calculateDelay(lastError, attempt, opts);

				// Call retry callback if provided
				if (opts.onRetry) {
					opts.onRetry(lastError, attempt + 1, delayMs);
				}

				// Wait before retrying
				await this.sleep(delayMs);
			}
		}

		throw lastError;
	}

	/**
	 * Check if an error is retryable
	 */
	private static isRetryable(error: Error, opts: RetryOptions): boolean {
		// AI errors have explicit retryable flag
		if (error instanceof AIError) {
			return error.retryable;
		}

		// Check error message/code against retryable patterns
		const errorInfo = this.getErrorInfo(error);
		const retryablePatterns = opts.retryableErrors ?? [];

		return retryablePatterns.some(
			(pattern) =>
				errorInfo.code?.toLowerCase().includes(pattern.toLowerCase()) ||
				errorInfo.message
					?.toLowerCase()
					.includes(pattern.toLowerCase()),
		);
	}

	/**
	 * Calculate delay with exponential backoff and jitter
	 */
	private static calculateDelay(
		error: Error,
		attempt: number,
		opts: RetryOptions,
	): number {
		// Use retry-after header if available from rate limit errors
		if (error instanceof AIRateLimitError && error.retryAfter) {
			return error.retryAfter * 1000;
		}

		// Exponential backoff
		const exponentialDelay =
			opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);

		// Add jitter (0-30% of delay)
		const jitter = exponentialDelay * Math.random() * 0.3;

		// Cap at max delay
		return Math.min(exponentialDelay + jitter, opts.maxDelayMs);
	}

	/**
	 * Extract error information
	 */
	private static getErrorInfo(error: Error): {
		code?: string;
		message?: string;
		status?: number;
	} {
		const err = error as {
			code?: string;
			status?: number;
			statusCode?: number;
		};
		return {
			code: err.code,
			message: error.message,
			status: err.status ?? err.statusCode,
		};
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private static sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Create a retry wrapper with pre-configured options
	 */
	public static createRetryWrapper(options: Partial<RetryOptions>) {
		const opts = { ...DEFAULT_OPTIONS, ...options };
		return <T>(fn: () => Promise<T>): Promise<T> =>
			this.withRetry(fn, opts);
	}
}
