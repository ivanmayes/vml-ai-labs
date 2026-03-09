/**
 * PDF Converter
 *
 * Converts PDF files to text/Markdown using pdf-parse v1.
 * Extracts text content while preserving basic structure.
 */
import pdfParse from 'pdf-parse';

import {
	FileCorruptedError,
	PasswordProtectedError,
	ConversionFailedError,
} from '../errors/domain.errors';

import { BaseConverter, ConversionContext } from './base.converter';

/**
 * PDF metadata extracted during conversion
 */
interface PdfMetadata {
	title?: string;
	author?: string;
	subject?: string;
	creator?: string;
	producer?: string;
	creationDate?: Date;
	modificationDate?: Date;
	pageCount: number;
}

/**
 * pdf-parse result type
 */
interface PdfParseResult {
	numpages: number;
	numrender: number;
	info: {
		Title?: string;
		Author?: string;
		Subject?: string;
		Creator?: string;
		Producer?: string;
		CreationDate?: string;
		ModDate?: string;
	};
	metadata: unknown;
	text: string;
	version: string;
}

/**
 * PDF to text converter using pdf-parse v1
 *
 * Limitations:
 * - Cannot extract images (text only)
 * - Complex layouts may lose structure
 * - Scanned PDFs (images of text) won't extract well without OCR
 */
export class PdfConverter extends BaseConverter {
	readonly engineName = 'pdf-parse';
	readonly supportedExtensions = ['.pdf'];

	/** Longer timeout for PDFs (they can be slow) */
	protected override readonly defaultTimeoutMs = 120000;

	/**
	 * Convert PDF buffer to text/Markdown.
	 */
	protected async doConvert(
		buffer: Buffer,
		context: ConversionContext,
	): Promise<string> {
		context.logger.debug('Starting PDF parsing');

		// Check for cancellation
		this.checkCancelled(context);

		// Parse PDF using pdf-parse v1 API
		const data = (await pdfParse(buffer)) as PdfParseResult;

		// Check for cancellation after parsing
		this.checkCancelled(context);

		// Extract metadata
		const metadata = this.extractMetadata(data);
		context.logger.debug(`PDF parsed: ${metadata.pageCount} pages`);

		// Format output as Markdown
		const markdown = this.formatAsMarkdown(data.text, metadata);

		return markdown;
	}

	/**
	 * Extract metadata from parsed PDF.
	 */
	private extractMetadata(data: PdfParseResult): PdfMetadata {
		const info = data.info || {};

		return {
			title: info.Title,
			author: info.Author,
			subject: info.Subject,
			creator: info.Creator,
			producer: info.Producer,
			creationDate: info.CreationDate
				? new Date(info.CreationDate)
				: undefined,
			modificationDate: info.ModDate ? new Date(info.ModDate) : undefined,
			pageCount: data.numpages || 0,
		};
	}

	/**
	 * Format extracted text as Markdown with metadata header.
	 */
	private formatAsMarkdown(text: string, metadata: PdfMetadata): string {
		const lines: string[] = [];

		// Add document title if available
		if (metadata.title) {
			lines.push(`# ${metadata.title}`);
			lines.push('');
		}

		// Add metadata block if we have useful info
		if (metadata.author || metadata.subject || metadata.pageCount > 0) {
			lines.push('---');
			if (metadata.author) {
				lines.push(`**Author:** ${metadata.author}`);
			}
			if (metadata.subject) {
				lines.push(`**Subject:** ${metadata.subject}`);
			}
			if (metadata.pageCount > 0) {
				lines.push(`**Pages:** ${metadata.pageCount}`);
			}
			lines.push('---');
			lines.push('');
		}

		// Process and clean the text content
		const cleanedText = this.cleanText(text);
		lines.push(cleanedText);

		return lines.join('\n');
	}

	/**
	 * Clean and normalize extracted text.
	 */
	private cleanText(text: string): string {
		return (
			text
				// Normalize whitespace
				.replace(/\r\n/g, '\n')
				.replace(/\r/g, '\n')
				// Remove excessive spaces
				.replace(/[ \t]+/g, ' ')
				// Remove excessive newlines (more than 2)
				.replace(/\n{3,}/g, '\n\n')
				// Clean up common PDF artifacts
				.replace(/\f/g, '\n\n') // Form feeds become paragraph breaks
				// Trim whitespace from each line
				.split('\n')
				.map((line) => line.trim())
				.join('\n')
				// Final trim
				.trim()
		);
	}

	/**
	 * Override error normalization for PDF-specific errors.
	 */
	protected override normalizeError(
		error: unknown,
		fileName?: string,
	): Error {
		const message = error instanceof Error ? error.message : String(error);

		// PDF-specific error patterns
		if (
			message.includes('Invalid PDF') ||
			message.includes('Could not parse') ||
			message.includes('corrupted') ||
			message.includes('not a PDF')
		) {
			return new FileCorruptedError();
		}

		if (
			message.includes('password') ||
			message.includes('encrypted') ||
			message.includes('protected')
		) {
			return new PasswordProtectedError();
		}

		if (message.includes('Empty PDF')) {
			// Empty PDF is not an error, return empty content
			this.logger.debug('PDF appears empty');
			return new ConversionFailedError(
				'PDF contains no extractable text',
				false,
			);
		}

		// Delegate to base class
		return super.normalizeError(error, fileName);
	}
}
