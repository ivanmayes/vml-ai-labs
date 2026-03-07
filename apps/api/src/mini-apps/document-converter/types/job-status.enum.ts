/**
 * Job status enumeration for conversion jobs.
 * Represents all possible states in the conversion workflow lifecycle.
 */
export enum JobStatus {
	PENDING = 'pending',
	PROCESSING = 'processing',
	COMPLETED = 'completed',
	FAILED = 'failed',
	CANCELLED = 'cancelled',
}

/**
 * Valid state transitions (state machine).
 * Defines which status transitions are allowed from each state.
 */
export const VALID_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
	[JobStatus.PENDING]: [JobStatus.PROCESSING, JobStatus.CANCELLED],
	[JobStatus.PROCESSING]: [
		JobStatus.COMPLETED,
		JobStatus.FAILED,
		JobStatus.CANCELLED,
	],
	[JobStatus.COMPLETED]: [], // Terminal state
	[JobStatus.FAILED]: [JobStatus.PENDING], // Can retry
	[JobStatus.CANCELLED]: [], // Terminal state
};

/**
 * Check if a status transition is valid according to the state machine.
 * @param from Current job status
 * @param to Target job status
 * @returns true if the transition is allowed
 */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
	return VALID_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Check if a status represents a terminal (final) state.
 * Terminal states cannot transition to any other state (except FAILED which can retry).
 * @param status Job status to check
 * @returns true if the status is terminal
 */
export function isTerminalStatus(status: JobStatus): boolean {
	return status === JobStatus.COMPLETED || status === JobStatus.CANCELLED;
}

/**
 * Check if a job in this status can be retried.
 * @param status Job status to check
 * @returns true if the job can be retried
 */
export function isRetryableStatus(status: JobStatus): boolean {
	return status === JobStatus.FAILED;
}

/**
 * Check if a job in this status is still active (not finished).
 * @param status Job status to check
 * @returns true if the job is still active
 */
export function isActiveStatus(status: JobStatus): boolean {
	return status === JobStatus.PENDING || status === JobStatus.PROCESSING;
}
