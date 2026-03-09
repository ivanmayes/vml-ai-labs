/**
 * Conversion SSE Service
 *
 * Manages Server-Sent Events connections for real-time job status updates.
 * Uses in-memory EventEmitter for pub/sub (suitable for single-instance deployment).
 *
 * Flow:
 * 1. Client connects to SSE endpoint with validated token
 * 2. Service registers the Response object for the user/org
 * 3. Worker emits events when job status changes
 * 4. Service broadcasts events to relevant connected clients
 * 5. Heartbeats keep connections alive
 */
import { EventEmitter } from 'events';

import {
	Injectable,
	Logger,
	OnModuleDestroy,
	ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';

import {
	SSEEventType,
	SSEEventPayloads,
	formatSSEMessage,
	SSE_CONFIG,
} from '../types/sse-events.types';

/**
 * Error thrown when SSE connection limit is exceeded.
 */
export class SSEConnectionLimitError extends ServiceUnavailableException {
	constructor(message: string) {
		super(message);
		this.name = 'SSEConnectionLimitError';
	}
}

/**
 * SSE connection metadata
 */
interface SSEConnection {
	/** Express Response object for writing SSE data */
	response: Response;
	/** User ID for this connection */
	userId: string;
	/** Organization ID for this connection */
	organizationId: string;
	/** Connection timestamp */
	connectedAt: Date;
	/** Last activity timestamp (for timeout detection) */
	lastActivity: Date;
	/** Heartbeat interval handle */
	heartbeatInterval: NodeJS.Timeout;
}

/**
 * Internal event for broadcasting job updates
 */
export interface JobSSEEvent<T extends SSEEventType = SSEEventType> {
	/** Job ID */
	jobId: string;
	/** User ID who owns the job */
	userId: string;
	/** Organization ID for the job */
	organizationId: string;
	/** SSE event type */
	eventType: T;
	/** Event payload */
	payload: SSEEventPayloads[T];
}

/** Event name for internal job events */
const JOB_EVENT = 'job.sse.event';

/**
 * ConversionSseService - Manages SSE connections and event broadcasting.
 *
 * Responsibilities:
 * - Maintain active SSE connections per user
 * - Broadcast job status events to relevant clients
 * - Send heartbeats to keep connections alive
 * - Clean up stale connections
 *
 * Usage:
 * ```typescript
 * // In SSE controller endpoint
 * const connectionId = await sseService.addConnection(res, userId, orgId);
 *
 * // In worker when job status changes
 * sseService.sendToUser(userId, orgId, SSEEventType.JOB_COMPLETED, payload);
 * ```
 */
@Injectable()
export class ConversionSseService implements OnModuleDestroy {
	private readonly logger = new Logger(ConversionSseService.name);

	/** Active SSE connections indexed by connection ID */
	private readonly connections = new Map<string, SSEConnection>();

	/** User ID to connection IDs mapping (users can have multiple connections) */
	private readonly userConnections = new Map<string, Set<string>>();

	/** Connection timeout check interval */
	private timeoutCheckInterval: NodeJS.Timeout | null = null;

	/** Internal event emitter for job events */
	private readonly eventEmitter: EventEmitter = new EventEmitter();

	constructor() {
		// Subscribe to internal job events
		this.eventEmitter.on(JOB_EVENT, (event: JobSSEEvent) => {
			this.handleJobEvent(event);
		});

		// Start connection timeout checker
		this.startTimeoutChecker();
	}

	/**
	 * Clean up on module destroy.
	 */
	onModuleDestroy(): void {
		// Clear timeout checker
		if (this.timeoutCheckInterval) {
			clearInterval(this.timeoutCheckInterval);
		}

		// Close all connections
		for (const [connectionId, connection] of this.connections) {
			this.closeConnection(connectionId, connection);
		}

		this.connections.clear();
		this.userConnections.clear();
		this.logger.log('SSE service shutdown complete');
	}

	/**
	 * Add a new SSE connection.
	 *
	 * Sets up the response for SSE streaming and registers the connection.
	 * Enforces connection limits to prevent resource exhaustion.
	 *
	 * @param response - Express Response object
	 * @param userId - User ID for this connection
	 * @param organizationId - Organization ID for this connection
	 * @returns Connection ID
	 * @throws SSEConnectionLimitError if connection limits are exceeded
	 */
	addConnection(
		response: Response,
		userId: string,
		organizationId: string,
	): string {
		// Check global connection limit
		if (this.connections.size >= SSE_CONFIG.MAX_TOTAL_CONNECTIONS) {
			this.logger.warn(
				`SSE global connection limit reached (${SSE_CONFIG.MAX_TOTAL_CONNECTIONS})`,
			);
			throw new SSEConnectionLimitError(
				'Server at maximum SSE capacity. Please try again later.',
			);
		}

		// Check per-user connection limit
		const userConns = this.userConnections.get(userId);
		const userConnectionCount = userConns?.size || 0;
		if (userConnectionCount >= SSE_CONFIG.MAX_CONNECTIONS_PER_USER) {
			this.logger.warn(
				`SSE per-user connection limit reached for user ${userId} (${SSE_CONFIG.MAX_CONNECTIONS_PER_USER})`,
			);
			throw new SSEConnectionLimitError(
				`Maximum SSE connections per user (${SSE_CONFIG.MAX_CONNECTIONS_PER_USER}) exceeded. Close existing connections first.`,
			);
		}

		// Generate unique connection ID
		const connectionId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

		// Configure response for SSE
		// Use setHeader() instead of writeHead() to preserve CORS headers set by NestJS
		response.setHeader('Content-Type', 'text/event-stream');
		response.setHeader('Cache-Control', 'no-cache');
		response.setHeader('Connection', 'keep-alive');
		response.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
		response.flushHeaders(); // Send headers immediately to establish SSE connection

		// Send retry directive
		response.write(`retry: ${SSE_CONFIG.RETRY_MS}\n\n`);

		// Send initial connection event
		const connectionEvent = formatSSEMessage(SSEEventType.CONNECTION, {
			connected: true,
			timestamp: new Date().toISOString(),
		});
		response.write(connectionEvent);

		// Set up heartbeat
		const heartbeatInterval = setInterval(() => {
			this.sendHeartbeat(connectionId);
		}, SSE_CONFIG.HEARTBEAT_INTERVAL_MS);

		// Create connection record
		const connection: SSEConnection = {
			response,
			userId,
			organizationId,
			connectedAt: new Date(),
			lastActivity: new Date(),
			heartbeatInterval,
		};

		// Store connection
		this.connections.set(connectionId, connection);

		// Add to user's connection set
		if (!this.userConnections.has(userId)) {
			this.userConnections.set(userId, new Set());
		}
		this.userConnections.get(userId)!.add(connectionId);

		// Handle client disconnect
		response.on('close', () => {
			this.removeConnection(connectionId);
		});

		this.logger.debug(
			`SSE connection established: ${connectionId} for user ${userId}`,
		);

		return connectionId;
	}

	/**
	 * Remove an SSE connection.
	 *
	 * @param connectionId - Connection ID to remove
	 */
	removeConnection(connectionId: string): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		this.closeConnection(connectionId, connection);
		this.connections.delete(connectionId);

		// Remove from user's connection set
		const userConns = this.userConnections.get(connection.userId);
		if (userConns) {
			userConns.delete(connectionId);
			if (userConns.size === 0) {
				this.userConnections.delete(connection.userId);
			}
		}

		this.logger.debug(`SSE connection removed: ${connectionId}`);
	}

	/**
	 * Send an SSE event to a specific user.
	 *
	 * Broadcasts to all of the user's active connections.
	 *
	 * @param userId - User ID to send to
	 * @param organizationId - Organization ID (for verification)
	 * @param eventType - SSE event type
	 * @param payload - Event payload
	 */
	sendToUser<T extends SSEEventType>(
		userId: string,
		organizationId: string,
		eventType: T,
		payload: SSEEventPayloads[T],
	): void {
		const connectionIds = this.userConnections.get(userId);
		if (!connectionIds || connectionIds.size === 0) {
			this.logger.debug(`No SSE connections for user ${userId}`);
			return;
		}

		const message = formatSSEMessage(eventType, payload);
		let sentCount = 0;

		for (const connectionId of connectionIds) {
			const connection = this.connections.get(connectionId);
			if (connection && connection.organizationId === organizationId) {
				if (this.writeToConnection(connectionId, connection, message)) {
					sentCount++;
				}
			}
		}

		this.logger.debug(
			`Sent ${eventType} to ${sentCount} connections for user ${userId}`,
		);
	}

	/**
	 * Emit a job event for broadcasting.
	 *
	 * Used by the conversion worker to notify clients of job status changes.
	 *
	 * @param jobId - Job ID
	 * @param userId - User ID who owns the job
	 * @param organizationId - Organization ID
	 * @param eventType - SSE event type
	 * @param payload - Event payload
	 */
	emitJobEvent<T extends SSEEventType>(
		jobId: string,
		userId: string,
		organizationId: string,
		eventType: T,
		payload: SSEEventPayloads[T],
	): void {
		const event: JobSSEEvent<T> = {
			jobId,
			userId,
			organizationId,
			eventType,
			payload,
		};

		this.eventEmitter.emit(JOB_EVENT, event);
	}

	/**
	 * Get count of active connections.
	 */
	getConnectionCount(): number {
		return this.connections.size;
	}

	/**
	 * Get count of connected users.
	 */
	getConnectedUserCount(): number {
		return this.userConnections.size;
	}

	/**
	 * Get connection stats for monitoring.
	 */
	getStats(): {
		totalConnections: number;
		connectedUsers: number;
		connectionsByUser: Record<string, number>;
	} {
		const connectionsByUser: Record<string, number> = {};
		for (const [userId, connectionIds] of this.userConnections) {
			connectionsByUser[userId] = connectionIds.size;
		}

		return {
			totalConnections: this.connections.size,
			connectedUsers: this.userConnections.size,
			connectionsByUser,
		};
	}

	/**
	 * Handle internal job event.
	 */
	private handleJobEvent(event: JobSSEEvent): void {
		this.sendToUser(
			event.userId,
			event.organizationId,
			event.eventType,
			event.payload,
		);
	}

	/**
	 * Send heartbeat to a connection.
	 */
	private sendHeartbeat(connectionId: string): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		const message = formatSSEMessage(SSEEventType.HEARTBEAT, {
			timestamp: new Date().toISOString(),
		});

		this.writeToConnection(connectionId, connection, message);
	}

	/**
	 * Write a message to a connection.
	 *
	 * @returns true if write succeeded, false if connection should be removed
	 */
	private writeToConnection(
		connectionId: string,
		connection: SSEConnection,
		message: string,
	): boolean {
		try {
			if (connection.response.writableEnded) {
				this.removeConnection(connectionId);
				return false;
			}

			// Write the message
			const writeResult = connection.response.write(message);
			connection.lastActivity = new Date();

			// Flush the response to ensure immediate delivery
			// This is critical for SSE - without flushing, messages may be buffered
			if (typeof (connection.response as any).flush === 'function') {
				(connection.response as any).flush();
			} else if (
				typeof (connection.response as any).flushHeaders === 'function'
			) {
				// Fallback for environments without flush()
				try {
					(connection.response as any).flushHeaders();
				} catch {
					// Ignore if headers already sent
				}
			}

			// Log if write buffer is full (backpressure)
			if (!writeResult) {
				this.logger.warn(
					`SSE write buffer full for connection ${connectionId} - message may be delayed`,
				);
			}

			return true;
		} catch (error) {
			this.logger.warn(
				`Error writing to SSE connection ${connectionId}: ${error}`,
			);
			this.removeConnection(connectionId);
			return false;
		}
	}

	/**
	 * Close a connection and clean up resources.
	 */
	private closeConnection(
		connectionId: string,
		connection: SSEConnection,
	): void {
		// Clear heartbeat interval
		clearInterval(connection.heartbeatInterval);

		// Try to end the response gracefully
		try {
			if (!connection.response.writableEnded) {
				connection.response.end();
			}
		} catch {
			// Ignore errors during close
		}

		this.logger.debug(`Closed SSE connection: ${connectionId}`);
	}

	/**
	 * Start the connection timeout checker.
	 *
	 * Periodically checks for stale connections and removes them.
	 */
	private startTimeoutChecker(): void {
		const checkInterval = Math.floor(SSE_CONFIG.CONNECTION_TIMEOUT_MS / 2);

		this.timeoutCheckInterval = setInterval(() => {
			this.checkStaleConnections();
		}, checkInterval);
	}

	/**
	 * Check for and remove stale connections.
	 */
	private checkStaleConnections(): void {
		const now = Date.now();
		const timeout = SSE_CONFIG.CONNECTION_TIMEOUT_MS;
		let removedCount = 0;

		for (const [connectionId, connection] of this.connections) {
			const lastActivity = connection.lastActivity.getTime();
			if (now - lastActivity > timeout) {
				this.logger.debug(
					`Removing stale SSE connection: ${connectionId}`,
				);
				this.removeConnection(connectionId);
				removedCount++;
			}
		}

		if (removedCount > 0) {
			this.logger.log(`Removed ${removedCount} stale SSE connections`);
		}
	}
}
