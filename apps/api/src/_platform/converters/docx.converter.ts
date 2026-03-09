/**
 * DOCX Converter
 *
 * Converts Microsoft Word (.docx) files to Markdown using Mammoth.js.
 * Mammoth extracts semantic content, then Turndown converts HTML to Markdown.
 */
import * as mammoth from 'mammoth';
import TurndownService from 'turndown';

import {
	FileCorruptedError,
	PasswordProtectedError,
} from '../errors/domain.errors';

import { BaseConverter, ConversionContext } from './base.converter';

/**
 * DOCX to Markdown converter using Mammoth.js
 *
 * Mammoth focuses on semantic content extraction (headings, paragraphs, lists)
 * rather than visual formatting, making it ideal for AI pipeline input.
 *
 * Advantages over Pandoc:
 * - Pure JavaScript (no external process)
 * - Faster for most documents
 * - Better handling of semantic structure
 *
 * Limitations:
 * - Complex layouts may lose structure
 * - Some Office features not supported (falls back to Pandoc)
 */
export class DocxConverter extends BaseConverter {
	readonly engineName = 'mammoth';
	readonly supportedExtensions = ['.docx'];

	private readonly turndown: TurndownService;

	constructor() {
		super();

		// Configure Turndown for clean Markdown output
		this.turndown = new TurndownService({
			headingStyle: 'atx', // Use # for headings
			hr: '---',
			bulletListMarker: '-',
			codeBlockStyle: 'fenced',
			fence: '```',
			emDelimiter: '*',
			strongDelimiter: '**',
			linkStyle: 'inlined',
		});

		// Add custom rules for better output
		this.addTurndownRules();
	}

	/**
	 * Convert DOCX buffer to Markdown.
	 */
	protected async doConvert(
		buffer: Buffer,
		context: ConversionContext,
	): Promise<string> {
		context.logger.debug('Starting Mammoth conversion');

		// Check for cancellation before starting
		this.checkCancelled(context);

		// Convert DOCX to HTML using Mammoth
		const result = await mammoth.convertToHtml(
			{ buffer },
			{
				// Style map for semantic extraction
				styleMap: [
					"p[style-name='Heading 1'] => h1:fresh",
					"p[style-name='Heading 2'] => h2:fresh",
					"p[style-name='Heading 3'] => h3:fresh",
					"p[style-name='Heading 4'] => h4:fresh",
					"p[style-name='Code'] => pre:fresh",
					"p[style-name='Quote'] => blockquote:fresh",
				],
				// Include images as data URIs (we'll strip them later if needed)
				convertImage: mammoth.images.imgElement((image) => {
					return image.read('base64').then((data) => ({
						src: `data:${image.contentType};base64,${data}`,
					}));
				}),
			},
		);

		// Check for cancellation after Mammoth processing
		this.checkCancelled(context);

		// Log any warnings from Mammoth
		if (result.messages.length > 0) {
			const warnings = result.messages
				.filter((m) => m.type === 'warning')
				.map((m) => m.message);

			if (warnings.length > 0) {
				context.logger.debug(
					`Mammoth warnings: ${warnings.join(', ')}`,
				);
			}
		}

		// Check if we got any content
		if (!result.value || result.value.trim().length === 0) {
			context.logger.warn('Mammoth produced empty output');
			return ''; // Empty document is valid
		}

		// Convert HTML to Markdown using Turndown
		let markdown = this.turndown.turndown(result.value);

		// Post-process the Markdown
		markdown = this.postProcess(markdown);

		return markdown;
	}

	/**
	 * Add custom Turndown rules for better Markdown output.
	 */
	private addTurndownRules(): void {
		// Handle tables better
		this.turndown.addRule('table', {
			filter: 'table',
			replacement: (_content, node) => {
				// Convert table to Markdown format
				const rows = Array.from((node as HTMLTableElement).rows);
				if (rows.length === 0) return '';

				const headerRow = rows[0];
				const headerCells = Array.from(headerRow.cells);
				const headers = headerCells.map((cell) =>
					this.turndown.turndown(cell.innerHTML).trim(),
				);

				const separator = headers.map(() => '---');
				const dataRows = rows.slice(1).map((row) => {
					const cells = Array.from(row.cells);
					return cells.map((cell) =>
						this.turndown.turndown(cell.innerHTML).trim(),
					);
				});

				let table = `| ${headers.join(' | ')} |\n`;
				table += `| ${separator.join(' | ')} |\n`;
				dataRows.forEach((row) => {
					table += `| ${row.join(' | ')} |\n`;
				});

				return `\n${table}\n`;
			},
		});

		// Strip embedded images (keep alt text as description)
		this.turndown.addRule('stripImages', {
			filter: 'img',
			replacement: (_content, node) => {
				const img = node as HTMLImageElement;
				const alt = img.alt || '';
				return alt ? `[Image: ${alt}]` : '[Image]';
			},
		});

		// Handle highlighted/marked text
		this.turndown.addRule('mark', {
			filter: 'mark',
			replacement: (content) => `==${content}==`,
		});

		// Handle superscript
		this.turndown.addRule('sup', {
			filter: 'sup',
			replacement: (content) => `^${content}^`,
		});

		// Handle subscript
		this.turndown.addRule('sub', {
			filter: 'sub',
			replacement: (content) => `~${content}~`,
		});
	}

	/**
	 * Post-process Markdown for cleaner output.
	 */
	private postProcess(markdown: string): string {
		return (
			markdown
				// Remove excessive blank lines (more than 2)
				.replace(/\n{3,}/g, '\n\n')
				// Clean up whitespace at end of lines
				.replace(/[ \t]+$/gm, '')
				// Normalize line endings
				.replace(/\r\n/g, '\n')
				// Remove trailing whitespace
				.trim()
		);
	}

	/**
	 * Override error normalization for Mammoth-specific errors.
	 */
	protected override normalizeError(
		error: unknown,
		fileName?: string,
	): Error {
		const message = error instanceof Error ? error.message : String(error);

		// Mammoth-specific error patterns
		if (
			message.includes('Could not find') ||
			message.includes('not a valid') ||
			message.includes('Failed to read')
		) {
			return new FileCorruptedError();
		}

		if (message.includes('encrypted') || message.includes('password')) {
			return new PasswordProtectedError();
		}

		// Delegate to base class for other errors
		return super.normalizeError(error, fileName);
	}
}
