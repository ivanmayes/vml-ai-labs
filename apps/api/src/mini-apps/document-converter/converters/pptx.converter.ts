/**
 * PPTX Converter
 *
 * Converts PowerPoint presentations (.pptx) to Markdown using officeparser.
 * Extracts text content from slides, organizing by slide number.
 */
import * as officeparser from 'officeparser';

import {
	FileCorruptedError,
	PasswordProtectedError,
} from '../errors/domain.errors';

import { BaseConverter, ConversionContext } from './base.converter';

/**
 * PPTX to Markdown converter using officeparser
 *
 * Features:
 * - Extracts all text content from slides
 * - Preserves slide structure as sections
 * - Handles speaker notes (when available)
 *
 * Limitations:
 * - Cannot extract images, charts, or embedded objects
 * - Complex formatting and animations are lost
 * - SmartArt and diagrams may not render well
 */
export class PptxConverter extends BaseConverter {
	readonly engineName = 'pptx-parser';
	readonly supportedExtensions = ['.pptx', '.ppt'];

	/**
	 * Convert PPTX buffer to Markdown.
	 */
	protected async doConvert(
		buffer: Buffer,
		context: ConversionContext,
	): Promise<string> {
		context.logger.debug('Starting PPTX parsing');

		// Check for cancellation
		this.checkCancelled(context);

		// Parse PPTX using officeparser
		// officeparser returns text content as a string
		const text = await this.parseWithOfficeParser(buffer);

		// Check for cancellation after parsing
		this.checkCancelled(context);

		// Format output as Markdown
		const markdown = this.formatAsMarkdown(text, context);

		return markdown;
	}

	/**
	 * Parse PPTX using officeparser.
	 */
	private async parseWithOfficeParser(buffer: Buffer): Promise<string> {
		return new Promise((resolve, reject) => {
			officeparser
				.parseOfficeAsync(buffer, {
					// Configuration options
					outputErrorToConsole: false,
					newlineDelimiter: '\n',
					ignoreNotes: false, // Include speaker notes
				})
				.then((result: string) => {
					resolve(result);
				})
				.catch((error: Error) => {
					reject(error);
				});
		});
	}

	/**
	 * Format extracted text as Markdown with slide structure.
	 */
	private formatAsMarkdown(text: string, context: ConversionContext): string {
		if (!text || text.trim().length === 0) {
			context.logger.debug('PPTX appears to have no text content');
			return '';
		}

		// Split by slide markers if present, otherwise treat as continuous text
		const slides = this.splitIntoSlides(text);

		if (slides.length === 0) {
			return this.cleanText(text);
		}

		// Format each slide as a section
		const sections: string[] = [];

		slides.forEach((slideContent, index) => {
			const slideNumber = index + 1;
			const cleanContent = this.cleanText(slideContent);

			if (cleanContent.trim()) {
				sections.push(`## Slide ${slideNumber}`);
				sections.push('');
				sections.push(cleanContent);
				sections.push('');
			}
		});

		return sections.join('\n').trim();
	}

	/**
	 * Attempt to split text into slides based on common patterns.
	 */
	private splitIntoSlides(text: string): string[] {
		// officeparser typically outputs slides with clear boundaries
		// Look for patterns like page breaks, multiple newlines, or "Slide X" markers

		// Try splitting by multiple newlines (common slide boundary)
		const sections = text.split(/\n{3,}/);

		// If we got meaningful sections, use them
		if (sections.length > 1 && sections.every((s) => s.trim().length > 0)) {
			return sections.filter((s) => s.trim().length > 0);
		}

		// Try splitting by form feeds
		const formFeedSections = text.split('\f');
		if (formFeedSections.length > 1) {
			return formFeedSections.filter((s) => s.trim().length > 0);
		}

		// Fallback: return as single section
		return [text];
	}

	/**
	 * Clean and normalize text content.
	 */
	private cleanText(text: string): string {
		return (
			text
				// Normalize line endings
				.replace(/\r\n/g, '\n')
				.replace(/\r/g, '\n')
				// Remove excessive whitespace
				.replace(/[ \t]+/g, ' ')
				// Remove excessive newlines
				.replace(/\n{3,}/g, '\n\n')
				// Trim lines
				.split('\n')
				.map((line) => line.trim())
				.join('\n')
				// Detect and format bullet points
				.replace(/^[\u2022\u2023\u25E6\u2043\u2219\-*]\s*/gm, '- ')
				// Detect numbered lists
				.replace(/^(\d+)[.)\]]\s+/gm, '$1. ')
				// Final trim
				.trim()
		);
	}

	/**
	 * Override error normalization for PPTX-specific errors.
	 */
	protected override normalizeError(
		error: unknown,
		fileName?: string,
	): Error {
		const message = error instanceof Error ? error.message : String(error);

		// PPTX-specific error patterns
		if (
			message.includes('Invalid') ||
			message.includes('corrupt') ||
			message.includes('Could not') ||
			message.includes('zip') ||
			message.includes('not a PowerPoint')
		) {
			return new FileCorruptedError();
		}

		if (message.includes('password') || message.includes('encrypted')) {
			return new PasswordProtectedError();
		}

		// Delegate to base class
		return super.normalizeError(error, fileName);
	}
}
