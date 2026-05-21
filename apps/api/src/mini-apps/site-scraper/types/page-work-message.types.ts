/**
 * SQS message type for Lambda page work.
 *
 * Contains only per-page data needed by the Lambda worker.
 * Secrets and config (callbackUrl, callbackSecret, s3Bucket, queueUrl)
 * are read from Lambda environment variables, NOT sent in messages.
 */
import { EventHint } from './event-hint.types';

export interface PageWorkMessage {
	/** Scrape job UUID */
	jobId: string;
	/** URL to scrape */
	url: string;
	/** SHA-256 hash of the normalized URL (for dedup) */
	urlHash: string;
	/** Crawl depth from the seed URL */
	depth: number;
	/** Maximum crawl depth allowed */
	maxDepth: number;
	/** Maximum total pages allowed for this job */
	maxPages: number;
	/** Viewport widths in pixels for screenshots */
	viewports: number[];
	/** Hostname of the seed URL (for same-origin link filtering) */
	seedHostname: string;
	/** S3 key prefix for all artifacts: `site-scraper/{jobId}/` */
	s3Prefix: string;
	/** Resolved event hints for this specific page (from global + per-URL matching) */
	hints?: EventHint[];
	/** S3 key for session state (cookies + localStorage) from siteEntry hints */
	sessionStateS3Key?: string;
}
