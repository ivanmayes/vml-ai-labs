import { z } from 'zod';

// ---------------------------------------------------------------------------
// SQS Message Schema — validated with zod on every invocation
// ---------------------------------------------------------------------------

/**
 * Zod schema for the SQS message body.
 * Config (callbackUrl, s3Bucket, etc.) comes from Lambda env vars, NOT the message.
 */
export const PageWorkMessageSchema = z.object({
	jobId: z.string().uuid(),
	url: z.string().url(),
	urlHash: z.string().min(1),
	depth: z.number().int().min(0),
	maxDepth: z.number().int().min(0),
	maxPages: z.number().int().min(1),
	viewports: z.array(z.number().int().min(1)).min(1),
	seedHostname: z.string().min(1),
	s3Prefix: z.string().min(1),
});

export type PageWorkMessage = z.infer<typeof PageWorkMessageSchema>;

// ---------------------------------------------------------------------------
// Screenshot record — matches the JSONB shape stored in PostgreSQL
// ---------------------------------------------------------------------------

export interface ScreenshotRecord {
	/** Viewport width in pixels */
	viewport: number;
	/** S3 object key for the full-res screenshot */
	s3Key: string;
	/** S3 object key for the WebP thumbnail */
	thumbnailS3Key?: string;
}

// ---------------------------------------------------------------------------
// Callback payload — sent to Heroku after page processing
// ---------------------------------------------------------------------------

export interface CallbackPayload {
	jobId: string;
	urlHash: string;
	url: string;
	title: string | null;
	htmlS3Key: string | null;
	screenshots: ScreenshotRecord[];
	status: 'completed' | 'failed';
	errorMessage?: string;
	/** Links discovered on this page (same-hostname, not download URLs) */
	discoveredLinks: string[];
	depth: number;
}

// ---------------------------------------------------------------------------
// Environment config — read once from Lambda env vars
// ---------------------------------------------------------------------------

export interface LambdaEnvConfig {
	callbackUrl: string;
	callbackSecret: string;
	queueUrl: string;
	s3Bucket: string;
}

/**
 * Read and validate required environment variables.
 * Throws on startup if any are missing.
 */
export function getEnvConfig(): LambdaEnvConfig {
	const callbackUrl = process.env.CALLBACK_URL;
	const callbackSecret = process.env.CALLBACK_SECRET;
	const queueUrl = process.env.QUEUE_URL;
	const s3Bucket = process.env.S3_BUCKET;

	if (!callbackUrl) throw new Error('Missing env var: CALLBACK_URL');
	if (!callbackSecret) throw new Error('Missing env var: CALLBACK_SECRET');
	if (!queueUrl) throw new Error('Missing env var: QUEUE_URL');
	if (!s3Bucket) throw new Error('Missing env var: S3_BUCKET');

	return { callbackUrl, callbackSecret, queueUrl, s3Bucket };
}
