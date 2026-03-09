/**
 * Shared types for pg-boss queue operations.
 */

/**
 * Job configuration interface for type safety.
 */
export interface JobConfig {
	/** Maximum retry attempts before moving to DLQ */
	retryLimit: number;
	/** Maximum time for job execution in seconds */
	expireInSeconds: number;
	/** Queue priority (lower = higher priority) */
	priority: number;
	/** Delay before first retry in seconds */
	retryDelay?: number;
	/** Backoff strategy */
	retryBackoff?: boolean;
}

/**
 * Job data interface for conversion jobs.
 */
export interface ConversionJobData {
	/** Database job ID (UUID) */
	jobId: string;
	/** User who uploaded the file */
	userId: string;
	/** Organization context */
	organizationId: string;
	/** File extension for converter selection */
	fileExtension: string;
	/** S3 key for input file */
	s3InputKey: string;
	/** Original filename for output naming */
	originalFileName: string;
	/** Current retry count */
	retryCount: number;
}

/**
 * Job data interface for agent updater runs.
 */
export interface AgentUpdaterJobData {
	/** Database task run ID (UUID) */
	taskRunId: string;
	/** Task configuration ID */
	taskId: string;
	/** Box folder to scan */
	boxFolderId: string;
	/** WPP Open agent to update */
	wppOpenAgentId: string;
	/** WPP Open project context */
	wppOpenProjectId: string;
	/** User who triggered the run */
	userId: string;
	/** Organization context */
	organizationId: string;
	/** Timestamp of last successful run (ISO string) */
	lastRunAt: string | null;
	/** User's WPP Open session token */
	wppOpenToken: string;
}

/**
 * Dead letter queue data interface.
 */
export interface DeadLetterData {
	/** Original job data */
	originalJob: ConversionJobData;
	/** Error that caused DLQ placement */
	error: {
		code: string;
		message: string;
		timestamp: string;
	};
	/** Timestamp when job was moved to DLQ */
	movedAt: string;
}
