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
		const privateKey = process.env.BOX_PRIVATE_KEY;
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
	 * Recursively list files in a Box folder.
	 * Optionally filter by modification date for incremental syncs.
	 *
	 * @param folderId - Box folder ID to scan
	 * @param modifiedAfter - Only return files modified after this date
	 * @returns Array of BoxFile metadata
	 */
	async listFolderFiles(
		folderId: string,
		modifiedAfter?: Date,
	): Promise<BoxFile[]> {
		const files: BoxFile[] = [];
		await this.scanFolder(folderId, '', files, modifiedAfter);
		return files;
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
	 * Recursively scan a folder and its subfolders for supported files.
	 */
	private async scanFolder(
		folderId: string,
		parentPath: string,
		results: BoxFile[],
		modifiedAfter?: Date,
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
					subfolders.push({
						id: entry.id,
						path: parentPath
							? `${parentPath}/${entry.name}`
							: entry.name || '',
					});
					continue;
				}

				if (entry.type !== 'file') continue;

				const ext = path.extname(entry.name || '').toLowerCase();
				if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

				const modifiedAt = (entry as any).modifiedAt
					? new Date((entry as any).modifiedAt)
					: (entry as any).modified_at
						? new Date((entry as any).modified_at)
						: new Date();

				// Skip files not modified since last run
				if (modifiedAfter && modifiedAt <= modifiedAfter) continue;

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

		// Recursively scan subfolders with concurrency limit
		await this.processBatched(
			subfolders,
			async (subfolder) => {
				await this.scanFolder(
					subfolder.id,
					subfolder.path,
					results,
					modifiedAfter,
				);
			},
			MAX_CONCURRENT,
		);
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
			await Promise.allSettled(batch.map(processor));

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
