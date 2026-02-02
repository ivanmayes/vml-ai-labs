/**
 * AI Provider Error Classes
 * Custom error types for AI operations
 */

import { AIProvider } from './enums';

/**
 * Base error class for all AI-related errors
 */
export class AIError extends Error {
	public readonly provider?: AIProvider;
	public readonly statusCode?: number;
	public readonly requestId?: string;
	public readonly retryable: boolean;
	public readonly originalError?: Error;

	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			statusCode?: number;
			requestId?: string;
			retryable?: boolean;
			cause?: Error;
		},
	) {
		super(message);
		this.name = 'AIError';
		this.provider = options?.provider;
		this.statusCode = options?.statusCode;
		this.requestId = options?.requestId;
		this.retryable = options?.retryable ?? false;
		this.originalError = options?.cause;

		// Maintains proper stack trace for where error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, AIError);
		}
	}
}

/**
 * Error when a provider API returns an error
 */
export class AIProviderError extends AIError {
	public readonly providerMessage?: string;
	public readonly providerCode?: string;

	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			statusCode?: number;
			requestId?: string;
			retryable?: boolean;
			providerMessage?: string;
			providerCode?: string;
			cause?: Error;
		},
	) {
		super(message, options);
		this.name = 'AIProviderError';
		this.providerMessage = options?.providerMessage;
		this.providerCode = options?.providerCode;
	}
}

/**
 * Error when rate limit is exceeded
 */
export class AIRateLimitError extends AIError {
	public readonly retryAfter?: number;

	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			requestId?: string;
			retryAfter?: number;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			statusCode: 429,
			retryable: true,
		});
		this.name = 'AIRateLimitError';
		this.retryAfter = options?.retryAfter;
	}
}

/**
 * Error when authentication fails
 */
export class AIAuthenticationError extends AIError {
	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			requestId?: string;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			statusCode: 401,
			retryable: false,
		});
		this.name = 'AIAuthenticationError';
	}
}

/**
 * Error when a model is not supported
 */
export class AIModelNotSupportedError extends AIError {
	public readonly requestedModel: string;
	public readonly supportedModels?: string[];

	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			requestedModel: string;
			supportedModels?: string[];
			cause?: Error;
		},
	) {
		super(message, {
			provider: options?.provider,
			retryable: false,
			cause: options?.cause,
		});
		this.name = 'AIModelNotSupportedError';
		this.requestedModel = options?.requestedModel ?? 'unknown';
		this.supportedModels = options?.supportedModels;
	}
}

/**
 * Error when content is filtered/blocked
 */
export class AIContentFilterError extends AIError {
	public readonly filterReason?: string;

	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			requestId?: string;
			filterReason?: string;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			retryable: false,
		});
		this.name = 'AIContentFilterError';
		this.filterReason = options?.filterReason;
	}
}

/**
 * Error when request times out
 */
export class AITimeoutError extends AIError {
	public readonly timeoutMs: number;

	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			requestId?: string;
			timeoutMs: number;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			retryable: true,
		});
		this.name = 'AITimeoutError';
		this.timeoutMs = options?.timeoutMs ?? 0;
	}
}

/**
 * Error when request validation fails
 */
export class AIValidationError extends AIError {
	public readonly validationErrors: string[];

	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			validationErrors: string[];
			cause?: Error;
		},
	) {
		super(message, {
			provider: options?.provider,
			retryable: false,
			cause: options?.cause,
		});
		this.name = 'AIValidationError';
		this.validationErrors = options?.validationErrors ?? [];
	}
}

/**
 * Error when provider configuration is invalid
 */
export class AIConfigurationError extends AIError {
	public readonly configKey?: string;

	constructor(
		message: string,
		options?: {
			provider?: AIProvider;
			configKey?: string;
			cause?: Error;
		},
	) {
		super(message, {
			provider: options?.provider,
			retryable: false,
			cause: options?.cause,
		});
		this.name = 'AIConfigurationError';
		this.configKey = options?.configKey;
	}
}

/**
 * Parse provider-specific errors into standardized error types
 */
export function parseProviderError(
	error: unknown,
	provider: AIProvider,
): AIError {
	if (error instanceof AIError) {
		return error;
	}

	const err = error as {
		message?: string;
		status?: number;
		statusCode?: number;
		code?: string;
		error?: { message?: string; code?: string };
		headers?: { 'retry-after'?: string };
	};

	const message = err?.message ?? err?.error?.message ?? 'Unknown AI error';
	const statusCode = err?.status ?? err?.statusCode;
	const code = err?.code ?? err?.error?.code;

	// Rate limit errors
	if (statusCode === 429 || code === 'rate_limit_exceeded') {
		const retryAfter = err?.headers?.['retry-after'];
		return new AIRateLimitError(message, {
			provider,
			retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
			cause: error instanceof Error ? error : undefined,
		});
	}

	// Authentication errors
	if (
		statusCode === 401 ||
		statusCode === 403 ||
		code === 'invalid_api_key'
	) {
		return new AIAuthenticationError(message, {
			provider,
			cause: error instanceof Error ? error : undefined,
		});
	}

	// Content filter errors
	if (code === 'content_filter' || code === 'content_policy_violation') {
		return new AIContentFilterError(message, {
			provider,
			filterReason: code,
			cause: error instanceof Error ? error : undefined,
		});
	}

	// Model not found
	if (code === 'model_not_found' || message.includes('model')) {
		return new AIModelNotSupportedError(message, {
			provider,
			requestedModel: 'unknown',
			cause: error instanceof Error ? error : undefined,
		});
	}

	// Generic provider error
	return new AIProviderError(message, {
		provider,
		statusCode,
		retryable: statusCode ? statusCode >= 500 : false,
		providerCode: code,
		cause: error instanceof Error ? error : undefined,
	});
}
