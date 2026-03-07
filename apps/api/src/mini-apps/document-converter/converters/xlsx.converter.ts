/**
 * XLSX Converter
 *
 * Converts Excel spreadsheets (.xlsx) to Markdown tables using SheetJS (xlsx).
 * Each sheet becomes a section with its data rendered as a Markdown table.
 */
import * as XLSX from 'xlsx';

import {
	FileCorruptedError,
	PasswordProtectedError,
} from '../errors/domain.errors';

import { BaseConverter, ConversionContext } from './base.converter';

/**
 * Sheet data extracted from workbook
 */
interface SheetData {
	name: string;
	rows: string[][];
	rowCount: number;
	colCount: number;
}

/**
 * XLSX to Markdown converter using SheetJS
 *
 * Features:
 * - Multi-sheet support (each sheet becomes a section)
 * - Markdown table formatting
 * - Date/number formatting preservation
 * - Formula evaluation
 *
 * Limitations:
 * - Images, charts, and embedded objects are not extracted
 * - Complex formatting is lost
 * - Very large sheets may be truncated
 */
export class XlsxConverter extends BaseConverter {
	readonly engineName = 'xlsx';
	readonly supportedExtensions = ['.xlsx'];

	/** Maximum rows per sheet to prevent memory issues */
	private readonly maxRowsPerSheet = 10000;

	/** Maximum columns per sheet */
	private readonly maxColsPerSheet = 100;

	/**
	 * Convert XLSX buffer to Markdown tables.
	 */
	protected async doConvert(
		buffer: Buffer,
		context: ConversionContext,
	): Promise<string> {
		context.logger.debug('Starting XLSX parsing');

		// Check for cancellation
		this.checkCancelled(context);

		// Parse workbook
		const workbook = XLSX.read(buffer, {
			type: 'buffer',
			cellDates: true, // Parse dates as Date objects
			cellNF: true, // Preserve number formats
			cellText: false, // Don't generate text
			// Note: Using sparse mode (default) for compatibility with cell address access
		});

		// Check for cancellation after parsing
		this.checkCancelled(context);

		// Extract data from each sheet
		const sheets: SheetData[] = [];

		for (const sheetName of workbook.SheetNames) {
			this.checkCancelled(context);

			const sheet = workbook.Sheets[sheetName];
			if (!sheet) continue;

			const sheetData = this.extractSheetData(sheetName, sheet);
			if (sheetData.rowCount > 0) {
				sheets.push(sheetData);
			}
		}

		context.logger.debug(`XLSX parsed: ${sheets.length} sheets with data`);

		// Format as Markdown
		const markdown = this.formatAsMarkdown(sheets);

		return markdown;
	}

	/**
	 * Extract data from a worksheet.
	 */
	private extractSheetData(name: string, sheet: XLSX.WorkSheet): SheetData {
		// Get sheet range
		const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
		const rowCount = Math.min(
			range.e.r - range.s.r + 1,
			this.maxRowsPerSheet,
		);
		const colCount = Math.min(
			range.e.c - range.s.c + 1,
			this.maxColsPerSheet,
		);

		// Extract rows as string arrays
		const rows: string[][] = [];

		for (let r = range.s.r; r <= range.s.r + rowCount - 1; r++) {
			const row: string[] = [];

			for (let c = range.s.c; c <= range.s.c + colCount - 1; c++) {
				const cellAddress = XLSX.utils.encode_cell({ r, c });
				const cell = sheet[cellAddress];

				if (cell) {
					row.push(this.formatCellValue(cell));
				} else {
					row.push('');
				}
			}

			// Only add non-empty rows
			if (row.some((cell) => cell.trim() !== '')) {
				rows.push(row);
			}
		}

		return {
			name,
			rows,
			rowCount: rows.length,
			colCount,
		};
	}

	/**
	 * Format a cell value as string.
	 */
	private formatCellValue(cell: XLSX.CellObject): string {
		if (cell.v === undefined || cell.v === null) {
			return '';
		}

		// Handle dates
		if (cell.t === 'd' && cell.v instanceof Date) {
			return cell.v.toISOString().split('T')[0]; // YYYY-MM-DD format
		}

		// Handle numbers with formatting
		if (cell.t === 'n' && cell.w) {
			return cell.w; // Use formatted value if available
		}

		// Handle booleans
		if (cell.t === 'b') {
			return cell.v ? 'TRUE' : 'FALSE';
		}

		// Handle errors
		if (cell.t === 'e') {
			return `#${cell.v}`; // Excel error codes
		}

		// Default: convert to string
		const value = String(cell.v);

		// Escape pipe characters for Markdown tables
		return value.replace(/\|/g, '\\|');
	}

	/**
	 * Format extracted sheets as Markdown.
	 */
	private formatAsMarkdown(sheets: SheetData[]): string {
		if (sheets.length === 0) {
			return '';
		}

		const sections: string[] = [];

		for (const sheet of sheets) {
			if (sheet.rowCount === 0) continue;

			// Add sheet name as heading
			sections.push(`## ${sheet.name}`);
			sections.push('');

			// Generate Markdown table
			const table = this.generateMarkdownTable(sheet.rows);
			sections.push(table);
			sections.push('');
		}

		return sections.join('\n').trim();
	}

	/**
	 * Generate a Markdown table from rows.
	 */
	private generateMarkdownTable(rows: string[][]): string {
		if (rows.length === 0) return '';

		// Use first row as header
		const header = rows[0];
		const dataRows = rows.slice(1);

		// Calculate column widths for alignment (optional, but cleaner output)
		const colWidths = header.map((_, colIndex) => {
			return Math.max(
				3, // Minimum width
				...rows.map((row) => (row[colIndex] || '').length),
			);
		});

		// Build header row
		const headerLine = `| ${header.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ')} |`;

		// Build separator row
		const separator = `| ${colWidths.map((w) => '-'.repeat(w)).join(' | ')} |`;

		// Build data rows
		const dataLines = dataRows.map((row) => {
			const cells = header.map((_, i) => {
				const cell = row[i] || '';
				return cell.padEnd(colWidths[i]);
			});
			return `| ${cells.join(' | ')} |`;
		});

		return [headerLine, separator, ...dataLines].join('\n');
	}

	/**
	 * Override error normalization for XLSX-specific errors.
	 */
	protected override normalizeError(
		error: unknown,
		fileName?: string,
	): Error {
		const message = error instanceof Error ? error.message : String(error);

		// XLSX-specific error patterns
		if (
			message.includes('not supported') ||
			message.includes('Invalid') ||
			message.includes('corrupted') ||
			message.includes('zip')
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
