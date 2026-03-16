import { JobStatus } from './job-status.enum';
import { ScrapeError } from './scrape-error.types';

/**
 * Server-Sent Events event types for real-time scrape job status updates.
 */
export enum ScraperSSEEventType {
	/** Initial connection confirmation */
	CONNECTION = 'connection',
	/** Keep-alive heartbeat (every 15s) */
	HEARTBEAT = 'heartbeat',
	/** Worker started processing the job */
	JOB_STARTED = 'job:started',
	/** A single page has been scraped successfully */
	PAGE_COMPLETED = 'page:completed',
	/** New pages discovered during crawl */
	PAGES_DISCOVERED = 'pages:discovered',
	/** Job completed successfully */
	JOB_COMPLETED = 'job:completed',
	/** Job failed with error */
	JOB_FAILED = 'job:failed',
	/** Job cancelled by user */
	JOB_CANCELLED = 'job:cancelled',
}

/**
 * Type-safe event payload interfaces for each SSE event type.
 * Used to ensure type safety when sending and receiving SSE events.
 */
export interface ScraperSSEEventPayloads {
	[ScraperSSEEventType.CONNECTION]: {
		connected: true;
		timestamp: string;
	};
	[ScraperSSEEventType.HEARTBEAT]: {
		timestamp: string;
	};
	[ScraperSSEEventType.JOB_STARTED]: {
		id: string;
		status: JobStatus.RUNNING;
		url: string;
	};
	[ScraperSSEEventType.PAGE_COMPLETED]: {
		id: string;
		pageUrl: string;
		title: string | null;
		pagesCompleted: number;
		pagesDiscovered: number;
	};
	[ScraperSSEEventType.PAGES_DISCOVERED]: {
		id: string;
		newUrls: string[];
		totalDiscovered: number;
	};
	[ScraperSSEEventType.JOB_COMPLETED]: {
		id: string;
		status: JobStatus.COMPLETED | JobStatus.COMPLETED_WITH_ERRORS;
		pagesCompleted: number;
		pagesFailed: number;
		pagesDiscovered: number;
		pagesSkippedByDepth: number;
	};
	[ScraperSSEEventType.JOB_FAILED]: {
		id: string;
		status: JobStatus.FAILED;
		error: ScrapeError;
	};
	[ScraperSSEEventType.JOB_CANCELLED]: {
		id: string;
		status: JobStatus.CANCELLED;
	};
}

/**
 * Generic SSE event wrapper for type-safe event handling.
 */
export interface ScraperSSEEvent<
	T extends ScraperSSEEventType = ScraperSSEEventType,
> {
	type: T;
	data: ScraperSSEEventPayloads[T];
}

/**
 * Create a type-safe SSE event object.
 * @param type Event type
 * @param data Event payload (type-checked against ScraperSSEEventPayloads)
 * @returns SSE event object
 */
export function createScraperSSEEvent<T extends ScraperSSEEventType>(
	type: T,
	data: ScraperSSEEventPayloads[T],
): ScraperSSEEvent<T> {
	return { type, data };
}

/**
 * Format an SSE event for transmission over the wire.
 * @param type Event type
 * @param data Event payload
 * @returns Formatted SSE string (event: type\ndata: json\n\n)
 */
export function formatSSEMessage<T extends ScraperSSEEventType>(
	type: T,
	data: ScraperSSEEventPayloads[T],
): string {
	return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * SSE connection configuration constants.
 */
export const SSE_CONFIG = {
	/** Heartbeat interval in milliseconds (15 seconds - must be < Heroku's 30s timeout) */
	HEARTBEAT_INTERVAL_MS: 15000,
	/** Connection timeout for stale connections (5 minutes - crawl jobs take longer) */
	CONNECTION_TIMEOUT_MS: 300000,
	/** Retry delay for client reconnection (3 seconds) */
	RETRY_MS: 3000,
	/** Maximum connections per user (prevents resource exhaustion) */
	MAX_CONNECTIONS_PER_USER: 5,
	/** Maximum total connections across all users (server-wide limit) */
	MAX_TOTAL_CONNECTIONS: 1000,
} as const;
