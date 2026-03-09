/**
 * Secure Pandoc Runner
 *
 * Provides a secure way to run Pandoc for document conversion.
 * Used as a fallback when JavaScript-based converters fail.
 *
 * Security measures:
 * - Uses execFile (not exec) to prevent shell injection
 * - Runs with --sandbox flag
 * - Empty environment (no secrets leaked)
 * - Temporary directory isolation
 * - Strict timeouts
 * - Input/output size limits
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { Logger } from '@nestjs/common';

import {
	ConversionTimeoutError,
	ConversionFailedError,
} from '../errors/domain.errors';

const execFileAsync = promisify(execFile);

/**
 * Options for Pandoc execution
 */
export interface PandocOptions {
	/** Input format (e.g., 'docx', 'html') */
	inputFormat: string;
	/** Output format (default: 'gfm' - GitHub Flavored Markdown) */
	outputFormat?: string;
	/** Timeout in milliseconds (default: 30000) */
	timeoutMs?: number;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

/**
 * Result of Pandoc execution
 */
export interface PandocResult {
	/** Converted content */
	content: string;
	/** Conversion time in milliseconds */
	processingTimeMs: number;
}

/**
 * Secure Pandoc runner with isolation and security measures.
 *
 * Usage:
 * ```typescript
 * const runner = new PandocRunner();
 * const result = await runner.convert(buffer, { inputFormat: 'docx' });
 * console.log(result.content);
 * ```
 */
export class PandocRunner {
	private readonly logger = new Logger(PandocRunner.name);

	/** Maximum input file size (25MB) */
	private readonly maxInputSize = 25 * 1024 * 1024;

	/** Maximum output size (10MB) */
	private readonly maxOutputSize = 10 * 1024 * 1024;

	/** Default timeout (30 seconds) */
	private readonly defaultTimeoutMs = 30000;

	/**
	 * Convert a document using Pandoc.
	 *
	 * @param buffer - Input file contents
	 * @param options - Conversion options
	 * @returns Converted content and metadata
	 * @throws ConversionTimeoutError if conversion exceeds timeout
	 * @throws ConversionFailedError if Pandoc fails
	 */
	async convert(
		buffer: Buffer,
		options: PandocOptions,
	): Promise<PandocResult> {
		const startTime = Date.now();
		const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

		// Validate input size
		if (buffer.length > this.maxInputSize) {
			throw new ConversionFailedError(
				`Input file too large (${buffer.length} bytes, max ${this.maxInputSize})`,
				false,
			);
		}

		// Check for cancellation
		if (options.signal?.aborted) {
			throw new ConversionFailedError('Conversion cancelled', false);
		}

		// Create isolated temp directory
		const tmpDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'pandoc-conversion-'),
		);

		try {
			const inputPath = path.join(tmpDir, 'input');
			const outputPath = path.join(tmpDir, 'output.md');

			// Write input file
			await fs.writeFile(inputPath, buffer);

			// Build Pandoc arguments securely
			const args = this.buildPandocArgs(
				inputPath,
				outputPath,
				options.inputFormat,
				options.outputFormat ?? 'gfm',
				tmpDir,
			);

			this.logger.debug(`Running Pandoc: ${args.join(' ')}`);

			// Execute Pandoc securely
			await this.executePandoc(args, tmpDir, timeoutMs, options.signal);

			// Read output
			const content = await fs.readFile(outputPath, 'utf-8');

			// Validate output size
			if (content.length > this.maxOutputSize) {
				this.logger.warn(
					`Pandoc output truncated (${content.length} bytes)`,
				);
			}

			const processingTimeMs = Date.now() - startTime;
			this.logger.debug(
				`Pandoc conversion completed in ${processingTimeMs}ms`,
			);

			return {
				content: content.slice(0, this.maxOutputSize),
				processingTimeMs,
			};
		} finally {
			// Clean up temp directory
			await this.cleanupTempDir(tmpDir);
		}
	}

	/**
	 * Build Pandoc command arguments securely.
	 * Uses an array to prevent shell injection.
	 */
	private buildPandocArgs(
		inputPath: string,
		outputPath: string,
		inputFormat: string,
		outputFormat: string,
		tempDir: string,
	): string[] {
		return [
			inputPath,
			'-o',
			outputPath,
			'--sandbox', // Pandoc sandbox mode (restricts filesystem access)
			'-f',
			inputFormat,
			'-t',
			outputFormat,
			'--wrap=none', // Don't wrap lines
			`--extract-media=${tempDir}`, // Extract media to temp dir (cleaned up after)
		];
	}

	/**
	 * Execute Pandoc with security constraints.
	 */
	private async executePandoc(
		args: string[],
		cwd: string,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<void> {
		// Set up abort controller for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		// Also listen for external abort signal
		if (signal) {
			signal.addEventListener('abort', () => controller.abort(), {
				once: true,
			});
		}

		try {
			await execFileAsync('pandoc', args, {
				timeout: timeoutMs,
				maxBuffer: this.maxOutputSize,
				env: {}, // Empty environment (no secrets)
				cwd,
				signal: controller.signal,
				// CRITICAL: shell: false is default for execFile
				// This prevents shell injection
			});
		} catch (error) {
			if (this.isTimeoutError(error)) {
				throw new ConversionTimeoutError();
			}

			if (this.isAbortError(error)) {
				throw new ConversionFailedError('Conversion cancelled', false);
			}

			// Handle Pandoc-specific errors
			const message =
				error instanceof Error ? error.message : String(error);

			if (message.includes('not found') || message.includes('ENOENT')) {
				throw new ConversionFailedError(
					'Pandoc is not installed on this system',
					false,
				);
			}

			throw new ConversionFailedError(
				`Pandoc conversion failed: ${message}`,
				true, // May be retryable
			);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Clean up temporary directory.
	 */
	private async cleanupTempDir(tmpDir: string): Promise<void> {
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		} catch (error) {
			this.logger.warn(`Failed to clean up temp dir: ${tmpDir}`, error);
		}
	}

	/**
	 * Check if error is a timeout error.
	 */
	private isTimeoutError(error: unknown): boolean {
		if (error instanceof Error) {
			return (
				error.message.includes('ETIMEDOUT') ||
				error.message.includes('timeout') ||
				(error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
			);
		}
		return false;
	}

	/**
	 * Check if error is an abort error.
	 */
	private isAbortError(error: unknown): boolean {
		if (error instanceof Error) {
			return (
				error.name === 'AbortError' || error.message.includes('aborted')
			);
		}
		return false;
	}

	/**
	 * Check if Pandoc is available on the system.
	 */
	async isAvailable(): Promise<boolean> {
		try {
			await execFileAsync('pandoc', ['--version'], {
				timeout: 5000,
				env: {},
			});
			return true;
		} catch {
			return false;
		}
	}
}
