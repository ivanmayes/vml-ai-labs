/**
 * Converter Factory
 *
 * Registry and factory for document converters.
 * Selects appropriate converter based on file extension.
 * Supports fallback strategies (e.g., Pandoc for DOCX when Mammoth fails).
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import {
	InvalidFileTypeError,
	ConversionFailedError,
} from '../errors/domain.errors';

import {
	BaseConverter,
	ConversionResult,
	ConversionOptions,
} from './base.converter';
import { DocxConverter } from './docx.converter';
import { PdfConverter } from './pdf.converter';
import { XlsxConverter } from './xlsx.converter';
import { PptxConverter } from './pptx.converter';
import { PandocRunner } from './pandoc.runner';

/**
 * Converter registration info
 */
interface ConverterRegistration {
	converter: BaseConverter;
	extensions: string[];
	priority: number; // Lower = higher priority
}

/**
 * Converter Factory - NestJS injectable service
 *
 * Responsibilities:
 * - Register and manage converter instances
 * - Select appropriate converter for file type
 * - Handle fallback strategies
 * - Check Pandoc availability for DOCX fallback
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * class ConversionWorker {
 *   constructor(private factory: ConverterFactory) {}
 *
 *   async convert(buffer: Buffer, extension: string) {
 *     return this.factory.convert(buffer, extension);
 *   }
 * }
 * ```
 */
@Injectable()
export class ConverterFactory implements OnModuleInit {
	private readonly logger = new Logger(ConverterFactory.name);

	/** Registered converters */
	private readonly converters = new Map<string, ConverterRegistration[]>();

	/** Pandoc runner for fallback */
	private readonly pandocRunner: PandocRunner;

	/** Whether Pandoc is available */
	private pandocAvailable = false;

	constructor() {
		this.pandocRunner = new PandocRunner();
		this.registerDefaultConverters();
	}

	/**
	 * Initialize on module start.
	 * Checks Pandoc availability.
	 */
	async onModuleInit(): Promise<void> {
		this.pandocAvailable = await this.pandocRunner.isAvailable();

		if (this.pandocAvailable) {
			this.logger.log('Pandoc is available for fallback conversion');
		} else {
			this.logger.warn(
				'Pandoc is not available - DOCX fallback disabled',
			);
		}
	}

	/**
	 * Register default converters.
	 */
	private registerDefaultConverters(): void {
		// DOCX - Mammoth (primary)
		this.register(new DocxConverter(), 1);

		// PDF - pdf-parse
		this.register(new PdfConverter(), 1);

		// XLSX - SheetJS
		this.register(new XlsxConverter(), 1);

		// PPTX - officeparser
		this.register(new PptxConverter(), 1);
	}

	/**
	 * Register a converter.
	 *
	 * @param converter - Converter instance
	 * @param priority - Priority (lower = higher priority)
	 */
	register(converter: BaseConverter, priority = 10): void {
		const registration: ConverterRegistration = {
			converter,
			extensions: converter.supportedExtensions,
			priority,
		};

		for (const ext of converter.supportedExtensions) {
			const normalizedExt = this.normalizeExtension(ext);
			const existing = this.converters.get(normalizedExt) || [];
			existing.push(registration);
			// Sort by priority (ascending)
			existing.sort((a, b) => a.priority - b.priority);
			this.converters.set(normalizedExt, existing);
		}

		this.logger.debug(
			`Registered converter: ${converter.engineName} for ${converter.supportedExtensions.join(', ')}`,
		);
	}

	/**
	 * Get the best converter for a file extension.
	 *
	 * @param extension - File extension (with or without dot)
	 * @returns Converter or null if not supported
	 */
	getConverter(extension: string): BaseConverter | null {
		const normalizedExt = this.normalizeExtension(extension);
		const registrations = this.converters.get(normalizedExt);

		if (!registrations || registrations.length === 0) {
			return null;
		}

		return registrations[0].converter;
	}

	/**
	 * Get all converters for a file extension (in priority order).
	 */
	getConverters(extension: string): BaseConverter[] {
		const normalizedExt = this.normalizeExtension(extension);
		const registrations = this.converters.get(normalizedExt) || [];
		return registrations.map((r) => r.converter);
	}

	/**
	 * Check if file extension is supported.
	 */
	isSupported(extension: string): boolean {
		return this.getConverter(extension) !== null;
	}

	/**
	 * Get all supported extensions.
	 */
	getSupportedExtensions(): string[] {
		return Array.from(this.converters.keys());
	}

	/**
	 * Convert a document using the appropriate converter.
	 *
	 * @param buffer - File contents
	 * @param extension - File extension
	 * @param options - Conversion options
	 * @returns Conversion result
	 * @throws InvalidFileTypeError if extension not supported
	 * @throws ConversionFailedError if all converters fail
	 */
	async convert(
		buffer: Buffer,
		extension: string,
		options: ConversionOptions = {},
	): Promise<ConversionResult> {
		const normalizedExt = this.normalizeExtension(extension);
		const converter = this.getConverter(normalizedExt);

		if (!converter) {
			throw new InvalidFileTypeError();
		}

		try {
			return await converter.convert(buffer, options);
		} catch (error) {
			// Try fallback for DOCX if primary fails and Pandoc is available
			if (normalizedExt === '.docx' && this.pandocAvailable) {
				this.logger.warn(
					`Primary converter failed for DOCX, trying Pandoc fallback`,
				);
				return this.convertWithPandocFallback(buffer, options);
			}

			// Re-throw the error
			throw error;
		}
	}

	/**
	 * Convert using Pandoc as fallback.
	 */
	private async convertWithPandocFallback(
		buffer: Buffer,
		options: ConversionOptions,
	): Promise<ConversionResult> {
		try {
			const result = await this.pandocRunner.convert(buffer, {
				inputFormat: 'docx',
				outputFormat: 'gfm',
				timeoutMs: options.timeoutMs,
				signal: options.signal,
			});

			return {
				content: result.content,
				outputSize: Buffer.byteLength(result.content, 'utf-8'),
				engine: 'pandoc',
				metadata: {
					processingTimeMs: result.processingTimeMs,
					fallback: true,
				},
			};
		} catch (error) {
			throw new ConversionFailedError(
				`Pandoc fallback also failed: ${error instanceof Error ? error.message : String(error)}`,
				false,
			);
		}
	}

	/**
	 * Normalize file extension to lowercase with dot.
	 */
	private normalizeExtension(extension: string): string {
		const ext = extension.toLowerCase();
		return ext.startsWith('.') ? ext : `.${ext}`;
	}

	/**
	 * Get factory statistics for monitoring.
	 */
	getStats(): {
		supportedExtensions: string[];
		converterCount: number;
		pandocAvailable: boolean;
	} {
		return {
			supportedExtensions: this.getSupportedExtensions(),
			converterCount: this.converters.size,
			pandocAvailable: this.pandocAvailable,
		};
	}
}
