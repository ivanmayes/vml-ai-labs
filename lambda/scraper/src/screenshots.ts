import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import type { Page } from 'playwright-core';

import type { PageWorkMessage, ScreenshotRecord } from './types';

// ---------------------------------------------------------------------------
// Screenshot Capture + S3 Upload
// Captures screenshots sequentially (viewport resize needed), then uploads
// ALL full-res and thumbnails in parallel for maximum throughput.
// ---------------------------------------------------------------------------

/** Module-scope S3 client — reused across invocations */
const s3 = new S3Client({});

/** S3 bucket from env var — read once */
function getBucket(): string {
	const bucket = process.env.S3_BUCKET;
	if (!bucket) throw new Error('Missing env var: S3_BUCKET');
	return bucket;
}

interface CapturedScreenshot {
	viewport: number;
	screenshotBuffer: Buffer;
	screenshotS3Key: string;
	thumbnailS3Key: string;
}

/**
 * Capture screenshots at each viewport and upload to S3.
 *
 * Capture is sequential (each viewport requires resizing the page),
 * but all S3 uploads (full-res + thumbnails) are done in parallel.
 *
 * @param page - Playwright page after rendering and cookie dismissal
 * @param message - The SQS message with viewport list and S3 prefix
 * @param pageId - UUID for this page's S3 directory
 * @returns Array of ScreenshotRecord for the callback payload
 */
export async function captureAndUpload(
	page: Page,
	message: PageWorkMessage,
	pageId: string,
): Promise<ScreenshotRecord[]> {
	const bucket = getBucket();
	const captured: CapturedScreenshot[] = [];

	// 1. Capture screenshots sequentially (viewport resize required)
	for (const viewport of message.viewports) {
		await page.setViewportSize({ width: viewport, height: 900 });
		// Brief wait for layout reflow after viewport change
		await page.waitForTimeout(500);

		const screenshotBuffer = Buffer.from(
			await page.screenshot({
				fullPage: true,
				type: 'jpeg',
				quality: 85,
			}),
		);

		const screenshotS3Key = `${message.s3Prefix}${pageId}/screenshot-${viewport}w.jpg`;
		const thumbnailS3Key = `${message.s3Prefix}${pageId}/screenshot-${viewport}w-thumb.webp`;

		captured.push({
			viewport,
			screenshotBuffer,
			screenshotS3Key,
			thumbnailS3Key,
		});
	}

	// 2. Upload ALL screenshots + thumbnails in parallel
	const uploadPromises: Promise<void>[] = [];
	const records: ScreenshotRecord[] = [];

	for (const item of captured) {
		// Full-res JPEG upload
		uploadPromises.push(
			s3
				.send(
					new PutObjectCommand({
						Bucket: bucket,
						Key: item.screenshotS3Key,
						Body: item.screenshotBuffer,
						ContentType: 'image/jpeg',
					}),
				)
				.then(() => {}),
		);

		// WebP thumbnail generation + upload
		uploadPromises.push(
			sharp(item.screenshotBuffer)
				.resize({ width: 480 })
				.webp({ quality: 80 })
				.toBuffer()
				.then((thumbnailBuffer) =>
					s3
						.send(
							new PutObjectCommand({
								Bucket: bucket,
								Key: item.thumbnailS3Key,
								Body: thumbnailBuffer,
								ContentType: 'image/webp',
							}),
						)
						.then(() => {}),
				)
				.catch((error) => {
					console.warn(
						`Failed to generate/upload thumbnail for ${item.viewport}w: ${error}`,
					);
					// Mark thumbnail as undefined — non-fatal
					item.thumbnailS3Key = '';
				}),
		);

		records.push({
			viewport: item.viewport,
			s3Key: item.screenshotS3Key,
			thumbnailS3Key: item.thumbnailS3Key,
		});
	}

	await Promise.all(uploadPromises);

	// Fix up records where thumbnail failed (empty string -> undefined)
	for (const record of records) {
		if (record.thumbnailS3Key === '') {
			record.thumbnailS3Key = undefined;
		}
	}

	return records;
}

/**
 * Upload page HTML content to S3.
 *
 * @param htmlContent - The raw HTML string
 * @param s3Key - The S3 object key
 * @returns The S3 key for reference
 */
export async function uploadHtml(
	htmlContent: string,
	s3Key: string,
): Promise<string> {
	const bucket = getBucket();

	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: s3Key,
			Body: Buffer.from(htmlContent, 'utf-8'),
			ContentType: 'text/html; charset=utf-8',
		}),
	);

	return s3Key;
}
