/**
 * Base Converter
 *
 * Abstract base class for document converters.
 * Provides common functionality for error handling, timeout support,
 * and a consistent interface for all converter implementations.
 */
import { Logger } from '@nestjs/common';

import {
	ConversionTimeoutError,
	ConversionFailedError,
	FileCorruptedError,
	PasswordProtectedError,
	UnsupportedFeatureError,
} from '../errors/domain.errors';

/**
 * Result of a successful conversion
 */
export interface ConversionResult {
	/** Converted content (Markdown/text) */
	content: string;
	/** Size of converted content in bytes */
	outputSize: number;
	/** Conversion engine name */
	engine: string;
	/** Metadata extracted during conversion */
	metadata?: Record<string, unknown>;
}

/**
 * Options for conversion execution
 */
export interface ConversionOptions {
	/** Timeout in milliseconds (default: 60000) */
	timeoutMs?: number;
	/** AbortSignal for cancellation support */
	signal?: AbortSignal;
	/** Original filename (for context in error messages) */
	fileName?: string;
}

/**
 * Context passed to converter implementations
 */
export interface ConversionContext {
	/** Conversion start time (for timeout calculation) */
	startTime: number;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Original filename */
	fileName?: string;
	/** Logger instance */
	logger: Logger;
}

/**
 * Abstract base class for all document converters.
 *
 * Subclasses must implement:
 * - `engineName`: Identifier for this converter (e.g., 'mammoth', 'pdf-parse')
 * - `supportedExtensions`: File extensions this converter handles
 * - `doConvert()`: Actual conversion logic
 *
 * Usage:
 * ```typescript
 * class DocxConverter extends BaseConverter {
 *   readonly engineName = 'mammoth';
 *   readonly supportedExtensions = ['.docx'];
 *
 *   protected async doConvert(buffer: Buffer, context: ConversionContext): Promise<string> {
 *     // Conversion logic here
 *   }
 * }
 * ```
 */
export abstract class BaseConverter {
	protected readonly logger: Logger;

	/** Unique identifier for this converter engine */
	abstract readonly engineName: string;

	/** File extensions supported by this converter (lowercase with dot) */
	abstract readonly supportedExtensions: string[];

	/** Default timeout in milliseconds */
	protected readonly defaultTimeoutMs: number = 60000;

	constructor() {
		this.logger = new Logger(this.constructor.name);
	}

	/**
	 * Convert a document buffer to Markdown/text.
	 *
	 * Handles timeout, cancellation, and error normalization.
	 *
	 * @param buffer - File contents to convert
	 * @param options - Conversion options
	 * @returns Conversion result with content and metadata
	 * @throws ConversionTimeoutError if timeout exceeded
	 * @throws ConversionFailedError for conversion failures
	 * @throws FileCorruptedError if file cannot be parsed
	 * @throws PasswordProtectedError if file is encrypted
	 * @throws UnsupportedFeatureError for unsupported content
	 */
	async convert(
		buffer: Buffer,
		options: ConversionOptions = {},
	): Promise<ConversionResult> {
		const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
		const startTime = Date.now();

		const context: ConversionContext = {
			startTime,
			signal: options.signal,
			fileName: options.fileName,
			logger: this.logger,
		};

		this.logger.debug(
			`Starting conversion: ${options.fileName || 'unknown'} (${buffer.length} bytes)`,
		);

		try {
			// Check for early cancellation
			if (options.signal?.aborted) {
				throw new Error('AbortError');
			}

			// Execute conversion with timeout
			const content = await this.withTimeout(
				this.doConvert(buffer, context),
				timeoutMs,
				options.signal,
			);

			const processingTime = Date.now() - startTime;
			const outputSize = Buffer.byteLength(content, 'utf-8');

			this.logger.debug(
				`Conversion complete: ${outputSize} bytes in ${processingTime}ms`,
			);

			return {
				content,
				outputSize,
				engine: this.engineName,
				metadata: {
					processingTimeMs: processingTime,
					inputSize: buffer.length,
				},
			};
		} catch (error) {
			// Re-throw domain errors as-is
			if (this.isDomainError(error)) {
				throw error;
			}

			// Handle abort/cancellation
			if (this.isAbortError(error)) {
				throw new ConversionFailedError('Conversion cancelled', false);
			}

			// Normalize unknown errors
			throw this.normalizeError(error, options.fileName);
		}
	}

	/**
	 * Check if this converter supports the given file extension.
	 *
	 * @param extension - File extension (with or without dot)
	 * @returns True if supported
	 */
	supports(extension: string): boolean {
		const normalizedExt = extension.toLowerCase().startsWith('.')
			? extension.toLowerCase()
			: `.${extension.toLowerCase()}`;
		return this.supportedExtensions.includes(normalizedExt);
	}

	/**
	 * Abstract method for actual conversion logic.
	 * Implementations should convert the buffer to Markdown/text.
	 *
	 * @param buffer - File contents
	 * @param context - Conversion context with cancellation support
	 * @returns Converted content as string
	 */
	protected abstract doConvert(
		buffer: Buffer,
		context: ConversionContext,
	): Promise<string>;

	/**
	 * Execute a promise with timeout support.
	 *
	 * @param promise - Promise to execute
	 * @param timeoutMs - Timeout in milliseconds
	 * @param signal - Optional AbortSignal
	 * @returns Promise result
	 * @throws ConversionTimeoutError if timeout exceeded
	 */
	protected async withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<T> {
		let timeoutId: NodeJS.Timeout | undefined;

		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new ConversionTimeoutError());
			}, timeoutMs);
		});

		// Also listen for abort signal
		const abortPromise = signal
			? new Promise<never>((_, reject) => {
					signal.addEventListener(
						'abort',
						() => reject(new Error('AbortError')),
						{ once: true },
					);
				})
			: null;

		try {
			const result = await Promise.race([
				promise,
				timeoutPromise,
				...(abortPromise ? [abortPromise] : []),
			]);
			return result;
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	}

	/**
	 * Check remaining time before timeout.
	 *
	 * @param context - Conversion context
	 * @param timeoutMs - Total timeout
	 * @returns Remaining milliseconds
	 */
	protected getRemainingTime(
		context: ConversionContext,
		timeoutMs: number,
	): number {
		return Math.max(0, timeoutMs - (Date.now() - context.startTime));
	}

	/**
	 * Check if operation should be cancelled.
	 *
	 * @param context - Conversion context
	 * @throws Error if cancelled
	 */
	protected checkCancelled(context: ConversionContext): void {
		if (context.signal?.aborted) {
			throw new Error('AbortError');
		}
	}

	/**
	 * Check if error is a domain error (already normalized).
	 */
	private isDomainError(error: unknown): boolean {
		return (
			error instanceof ConversionTimeoutError ||
			error instanceof ConversionFailedError ||
			error instanceof FileCorruptedError ||
			error instanceof PasswordProtectedError ||
			error instanceof UnsupportedFeatureError
		);
	}

	/**
	 * Check if error is an abort error.
	 */
	private isAbortError(error: unknown): boolean {
		if (error instanceof Error) {
			return (
				error.name === 'AbortError' ||
				error.message === 'AbortError' ||
				error.message.includes('aborted')
			);
		}
		return false;
	}

	/**
	 * Normalize unknown errors to domain errors.
	 *
	 * Override in subclasses for engine-specific error handling.
	 */
	protected normalizeError(error: unknown, fileName?: string): Error {
		const message = error instanceof Error ? error.message : String(error);
		const context = fileName ? ` (file: ${fileName})` : '';

		// Check for common patterns
		if (
			message.toLowerCase().includes('corrupt') ||
			message.toLowerCase().includes('invalid') ||
			message.toLowerCase().includes('malformed')
		) {
			return new FileCorruptedError();
		}

		if (
			message.toLowerCase().includes('password') ||
			message.toLowerCase().includes('encrypted')
		) {
			return new PasswordProtectedError();
		}

		// Default to generic conversion failure (retryable)
		this.logger.error(`Conversion failed${context}: ${message}`, error);
		return new ConversionFailedError(
			`Conversion failed: ${message}`,
			true, // retryable by default
		);
	}
}
