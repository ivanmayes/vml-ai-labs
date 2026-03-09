import { JobStatus } from './job-status.enum';
import { ConversionError } from './conversion-error.types';

/**
 * Server-Sent Events event types for real-time job status updates.
 */
export enum SSEEventType {
	/** Initial connection confirmation */
	CONNECTION = 'connection',
	/** Keep-alive heartbeat (every 30s) */
	HEARTBEAT = 'heartbeat',
	/** New job created and queued */
	JOB_CREATED = 'job:created',
	/** Worker started processing the job */
	JOB_STARTED = 'job:started',
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
export interface SSEEventPayloads {
	[SSEEventType.CONNECTION]: {
		connected: true;
		timestamp: string;
	};
	[SSEEventType.HEARTBEAT]: {
		timestamp: string;
	};
	[SSEEventType.JOB_CREATED]: {
		id: string;
		fileName: string;
		status: JobStatus.PENDING;
		queuePosition: number;
	};
	[SSEEventType.JOB_STARTED]: {
		id: string;
		status: JobStatus.PROCESSING;
		engine: string;
	};
	[SSEEventType.JOB_COMPLETED]: {
		id: string;
		status: JobStatus.COMPLETED;
		outputSize: number;
		processingTimeMs: number;
	};
	[SSEEventType.JOB_FAILED]: {
		id: string;
		status: JobStatus.FAILED;
		error: ConversionError;
	};
	[SSEEventType.JOB_CANCELLED]: {
		id: string;
		status: JobStatus.CANCELLED;
	};
}

/**
 * Generic SSE event wrapper for type-safe event handling.
 */
export interface SSEEvent<T extends SSEEventType = SSEEventType> {
	type: T;
	data: SSEEventPayloads[T];
}

/**
 * Create a type-safe SSE event object.
 * @param type Event type
 * @param data Event payload (type-checked against SSEEventPayloads)
 * @returns SSE event object
 */
export function createSSEEvent<T extends SSEEventType>(
	type: T,
	data: SSEEventPayloads[T],
): SSEEvent<T> {
	return { type, data };
}

/**
 * Format an SSE event for transmission over the wire.
 * @param type Event type
 * @param data Event payload
 * @returns Formatted SSE string (event: type\ndata: json\n\n)
 */
export function formatSSEMessage<T extends SSEEventType>(
	type: T,
	data: SSEEventPayloads[T],
): string {
	return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * SSE connection configuration constants.
 */
export const SSE_CONFIG = {
	/** Heartbeat interval in milliseconds (15 seconds - must be < Heroku's 30s timeout) */
	HEARTBEAT_INTERVAL_MS: 15000,
	/** Connection timeout for stale connections (2 minutes) */
	CONNECTION_TIMEOUT_MS: 120000,
	/** Retry delay for client reconnection (3 seconds) */
	RETRY_MS: 3000,
	/** Maximum connections per user (prevents resource exhaustion) */
	MAX_CONNECTIONS_PER_USER: 5,
	/** Maximum total connections across all users (server-wide limit) */
	MAX_TOTAL_CONNECTIONS: 1000,
} as const;
