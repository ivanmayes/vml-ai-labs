import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { BoxClient, BoxJwtAuth, JwtConfig } from 'box-typescript-sdk-gen';

import { BoxFile, BoxFolderInfo } from '../types/box.types';

/** Supported file extensions for document conversion */
const SUPPORTED_EXTENSIONS = new Set(['.docx', '.pdf', '.pptx', '.xlsx']);

/** Max concurrent Box API calls to respect rate limits */
const MAX_CONCURRENT = 8;

@Injectable()
export class BoxService {
	private readonly logger = new Logger(BoxService.name);
	private client: BoxClient | null = null;

	/**
	 * Get or create the authenticated Box SDK client.
	 * Uses JWT/Enterprise authentication via env vars.
	 */
	private getClient(): BoxClient {
		if (this.client) return this.client;

		const clientId = process.env.BOX_CLIENT_ID;
		const clientSecret = process.env.BOX_CLIENT_SECRET;
		const enterpriseId = process.env.BOX_ENTERPRISE_ID;
		const jwtKeyId = process.env.BOX_PUBLIC_KEY_ID;
		const privateKey = process.env.BOX_PRIVATE_KEY?.replace(/\\n/g, '\n');
		const passphrase = process.env.BOX_PASSPHRASE;

		if (
			!clientId ||
			!clientSecret ||
			!enterpriseId ||
			!jwtKeyId ||
			!privateKey
		) {
			throw new Error(
				'Missing Box credentials. Required: BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ENTERPRISE_ID, BOX_PUBLIC_KEY_ID, BOX_PRIVATE_KEY',
			);
		}

		const jwtConfig = new JwtConfig({
			clientId,
			clientSecret,
			jwtKeyId,
			privateKey,
			privateKeyPassphrase: passphrase || '',
			enterpriseId,
		});

		const jwtAuth = new BoxJwtAuth({ config: jwtConfig });
		this.client = new BoxClient({ auth: jwtAuth });

		this.logger.log('Box SDK client initialized with JWT auth');
		return this.client;
	}

	/**
	 * Validate that a Box folder exists and is accessible.
	 * Returns folder name and approximate file count.
	 */
	async validateFolder(folderId: string): Promise<BoxFolderInfo> {
		const client = this.getClient();

		const folder = await client.folders.getFolderById(folderId, {
			queryParams: { fields: ['name', 'item_collection'] as any },
		});

		return {
			name: folder.name || 'Unknown',
			fileCount: folder.itemCollection?.totalCount ?? 0,
		};
	}

	/**
	 * List files in a Box folder, with optional filtering.
	 *
	 * @param folderId - Box folder ID to scan
	 * @param options - Filtering options
	 * @param options.modifiedAfter - Only return files modified after this date
	 * @param options.extensions - File extensions to include (without dots, e.g. ['pdf', 'docx'])
	 * @param options.includeSubfolders - Whether to recurse into subfolders (default: true)
	 */
	async listFolderFiles(
		folderId: string,
		options: {
			modifiedAfter?: Date;
			extensions?: string[];
			includeSubfolders?: boolean;
		} = {},
	): Promise<{ files: BoxFile[]; totalSeen: number; skippedByDate: number }> {
		const extensionSet = options.extensions?.length
			? new Set(
					options.extensions.map((ext) =>
						ext.startsWith('.')
							? ext.toLowerCase()
							: `.${ext.toLowerCase()}`,
					),
				)
			: SUPPORTED_EXTENSIONS;
		const includeSubfolders = options.includeSubfolders ?? true;

		const files: BoxFile[] = [];
		const counters = { totalSeen: 0, skippedByDate: 0 };
		await this.scanFolder(
			folderId,
			'',
			files,
			options.modifiedAfter,
			extensionSet,
			includeSubfolders,
			counters,
		);
		this.logger.log(
			`Box folder ${folderId}: ${counters.totalSeen} total files, ${files.length} new/modified, ${counters.skippedByDate} skipped by date (modifiedAfter: ${options.modifiedAfter?.toISOString() || 'none'})`,
		);
		return {
			files,
			totalSeen: counters.totalSeen,
			skippedByDate: counters.skippedByDate,
		};
	}

	/**
	 * Download a file's content as a Buffer.
	 */
	async downloadFile(fileId: string): Promise<Buffer> {
		const client = this.getClient();
		const stream = await client.downloads.downloadFile(fileId);

		if (!stream) {
			throw new Error(
				`Failed to download file ${fileId}: no stream returned`,
			);
		}

		return this.nodeStreamToBuffer(stream as NodeJS.ReadableStream);
	}

	/**
	 * Scan a folder for files matching the given criteria.
	 * Optionally recurses into subfolders.
	 */
	private async scanFolder(
		folderId: string,
		parentPath: string,
		results: BoxFile[],
		modifiedAfter: Date | undefined,
		extensionSet: Set<string>,
		includeSubfolders: boolean,
		counters: { totalSeen: number; skippedByDate: number },
	): Promise<void> {
		const client = this.getClient();
		let offset = 0;
		const limit = 100;
		const subfolders: { id: string; path: string }[] = [];

		while (true) {
			const items = await client.folders.getFolderItems(folderId, {
				queryParams: {
					limit,
					offset,
					fields: [
						'id',
						'type',
						'name',
						'size',
						'modified_at',
						'path_collection',
					] as any,
				},
			});

			const entries = items.entries || [];
			if (entries.length === 0) break;

			for (const entry of entries) {
				if (entry.type === 'folder') {
					if (includeSubfolders) {
						subfolders.push({
							id: entry.id,
							path: parentPath
								? `${parentPath}/${entry.name}`
								: entry.name || '',
						});
					}
					continue;
				}

				if (entry.type !== 'file') continue;

				const ext = path.extname(entry.name || '').toLowerCase();
				if (!extensionSet.has(ext)) continue;

				counters.totalSeen++;

				// Box SDK may return modifiedAt as DateTime object or raw modified_at as string
				const rawEntry = entry as any;
				const rawModified =
					rawEntry.modifiedAt ??
					rawEntry.modified_at ??
					rawEntry.content_modified_at;
				let modifiedAt: Date;
				if (rawModified instanceof Date) {
					modifiedAt = rawModified;
				} else if (typeof rawModified === 'string') {
					modifiedAt = new Date(rawModified);
				} else if (
					rawModified &&
					typeof rawModified.toString === 'function'
				) {
					modifiedAt = new Date(rawModified.toString());
				} else {
					this.logger.warn(
						`No modifiedAt for file ${entry.name} (id: ${entry.id}), including in results`,
					);
					modifiedAt = new Date(0);
				}

				if (isNaN(modifiedAt.getTime())) {
					this.logger.warn(
						`Invalid modifiedAt date for file ${entry.name}: ${rawModified}`,
					);
					modifiedAt = new Date(0);
				}

				if (modifiedAfter && modifiedAt <= modifiedAfter) {
					counters.skippedByDate++;
					continue;
				}

				results.push({
					id: entry.id,
					name: entry.name || '',
					size: (entry as any).size || 0,
					modifiedAt,
					extension: ext,
					path: parentPath,
				});
			}

			offset += entries.length;
			if (entries.length < limit) break;
		}

		if (subfolders.length > 0) {
			await this.processBatched(
				subfolders,
				async (subfolder) => {
					await this.scanFolder(
						subfolder.id,
						subfolder.path,
						results,
						modifiedAfter,
						extensionSet,
						includeSubfolders,
						counters,
					);
				},
				MAX_CONCURRENT,
			);
		}
	}

	/**
	 * Process items in batches with a concurrency limit.
	 */
	private async processBatched<T>(
		items: T[],
		processor: (item: T) => Promise<void>,
		concurrency: number,
	): Promise<void> {
		for (let i = 0; i < items.length; i += concurrency) {
			const batch = items.slice(i, i + concurrency);
			const results = await Promise.allSettled(batch.map(processor));

			// Log any failures (don't throw - continue with remaining items)
			for (const result of results) {
				if (result.status === 'rejected') {
					this.logger.warn(
						`Batch item failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
					);
				}
			}

			// Small delay between batches to respect rate limits
			if (i + concurrency < items.length) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}
	}

	/**
	 * Convert a Node.js readable stream to a Buffer.
	 */
	private nodeStreamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			stream.on('data', (chunk: Buffer) => chunks.push(chunk));
			stream.on('end', () => resolve(Buffer.concat(chunks)));
			stream.on('error', reject);
		});
	}
}
