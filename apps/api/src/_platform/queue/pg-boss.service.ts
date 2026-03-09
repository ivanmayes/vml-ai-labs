import {
	Injectable,
	OnModuleInit,
	OnModuleDestroy,
	Logger,
} from '@nestjs/common';
import PgBoss from 'pg-boss';

import {
	PG_BOSS_CONFIG,
	CONVERSION_QUEUE,
	DEAD_LETTER_QUEUE,
	AGENT_UPDATER_QUEUE,
	getJobConfig,
} from './pg-boss.config';
import {
	ConversionJobData,
	DeadLetterData,
	AgentUpdaterJobData,
} from './pg-boss.types';

/**
 * PgBossService
 *
 * Wraps pg-boss instance with NestJS lifecycle management.
 * Handles connection, queue operations, and graceful shutdown.
 */
@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(PgBossService.name);
	private boss: PgBoss;
	private isStarted = false;

	/**
	 * Initialize pg-boss on module startup.
	 */
	async onModuleInit(): Promise<void> {
		try {
			this.boss = new PgBoss(PG_BOSS_CONFIG);

			// Error handling
			this.boss.on('error', (error) => {
				this.logger.error('pg-boss error:', error);
			});

			// Start the boss
			await this.boss.start();
			this.isStarted = true;
			this.logger.log('pg-boss started successfully');

			// Create queues if they don't exist
			await this.ensureQueuesExist();
		} catch (error) {
			this.logger.error('Failed to start pg-boss:', error);
			throw error;
		}
	}

	/**
	 * Graceful shutdown on module destroy.
	 */
	async onModuleDestroy(): Promise<void> {
		if (this.boss && this.isStarted) {
			try {
				await this.boss.stop({ graceful: true, timeout: 30000 });
				this.isStarted = false;
				this.logger.log('pg-boss stopped gracefully');
			} catch (error) {
				this.logger.error('Error stopping pg-boss:', error);
			}
		}
	}

	/**
	 * Ensure required queues exist.
	 * In pg-boss v10, queues must be explicitly created.
	 */
	private async ensureQueuesExist(): Promise<void> {
		try {
			await this.boss.createQueue(CONVERSION_QUEUE);
			this.logger.log(`Queue created: ${CONVERSION_QUEUE}`);
		} catch (error: unknown) {
			// Queue might already exist - that's fine
			if (
				error instanceof Error &&
				error.message.includes('already exists')
			) {
				this.logger.debug(`Queue already exists: ${CONVERSION_QUEUE}`);
			} else {
				this.logger.warn(
					`Could not create queue ${CONVERSION_QUEUE}:`,
					error,
				);
			}
		}

		try {
			await this.boss.createQueue(DEAD_LETTER_QUEUE);
			this.logger.log(`Queue created: ${DEAD_LETTER_QUEUE}`);
		} catch (error: unknown) {
			if (
				error instanceof Error &&
				error.message.includes('already exists')
			) {
				this.logger.debug(`Queue already exists: ${DEAD_LETTER_QUEUE}`);
			} else {
				this.logger.warn(
					`Could not create queue ${DEAD_LETTER_QUEUE}:`,
					error,
				);
			}
		}

		try {
			await this.boss.createQueue(AGENT_UPDATER_QUEUE);
			this.logger.log(`Queue created: ${AGENT_UPDATER_QUEUE}`);
		} catch (error: unknown) {
			if (
				error instanceof Error &&
				error.message.includes('already exists')
			) {
				this.logger.debug(
					`Queue already exists: ${AGENT_UPDATER_QUEUE}`,
				);
			} else {
				this.logger.warn(
					`Could not create queue ${AGENT_UPDATER_QUEUE}:`,
					error,
				);
			}
		}
	}

	/**
	 * Get the pg-boss instance (for advanced operations).
	 */
	getInstance(): PgBoss {
		if (!this.isStarted) {
			throw new Error('pg-boss is not started');
		}
		return this.boss;
	}

	/**
	 * Send a conversion job to the queue.
	 */
	async sendConversionJob(data: ConversionJobData): Promise<string | null> {
		const config = getJobConfig(data.fileExtension);
		this.logger.log(`Sending job to pg-boss queue: ${data.jobId}`);

		try {
			const pgBossJobId = await this.boss.send(CONVERSION_QUEUE, data, {
				retryLimit: config.retryLimit,
				expireInSeconds: config.expireInSeconds,
				priority: config.priority,
				retryDelay: config.retryDelay,
				retryBackoff: config.retryBackoff,
			});

			if (pgBossJobId) {
				this.logger.log(`Job queued with pg-boss ID: ${pgBossJobId}`);
			} else {
				this.logger.warn(
					`pg-boss.send returned null for job: ${data.jobId}`,
				);
			}
			return pgBossJobId;
		} catch (error) {
			this.logger.error(
				`Failed to send job to pg-boss: ${data.jobId}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Send a job to the dead letter queue.
	 */
	async sendToDeadLetterQueue(data: DeadLetterData): Promise<string | null> {
		return this.boss.send(DEAD_LETTER_QUEUE, data, {
			retryLimit: 0, // No retries for DLQ
		});
	}

	/**
	 * Register a worker for the conversion queue.
	 * @param handler Job handler function (receives array of jobs in pg-boss v10+)
	 * @param options Worker options
	 */
	async workConversionQueue(
		handler: (jobs: PgBoss.Job<ConversionJobData>[]) => Promise<void>,
		options?: PgBoss.WorkOptions,
	): Promise<string> {
		return this.boss.work<ConversionJobData>(
			CONVERSION_QUEUE,
			options || { batchSize: 2 },
			handler,
		);
	}

	/**
	 * Register a worker for the dead letter queue.
	 */
	async workDeadLetterQueue(
		handler: (jobs: PgBoss.Job<DeadLetterData>[]) => Promise<void>,
	): Promise<string> {
		return this.boss.work<DeadLetterData>(
			DEAD_LETTER_QUEUE,
			{ batchSize: 1 },
			handler,
		);
	}

	/**
	 * Send an agent updater run job to the queue.
	 */
	async sendAgentUpdaterJob(
		data: AgentUpdaterJobData,
	): Promise<string | null> {
		this.logger.log(
			`Sending agent updater job to queue: run=${data.taskRunId}`,
		);

		try {
			const pgBossJobId = await this.boss.send(
				AGENT_UPDATER_QUEUE,
				data,
				{
					retryLimit: 2,
					expireInSeconds: 900, // 15 minutes
					retryDelay: 30,
					retryBackoff: true,
				},
			);

			if (pgBossJobId) {
				this.logger.log(
					`Agent updater job queued with pg-boss ID: ${pgBossJobId}`,
				);
			}
			return pgBossJobId;
		} catch (error) {
			this.logger.error(
				`Failed to send agent updater job: ${data.taskRunId}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Register a worker for the agent updater queue.
	 */
	async workAgentUpdaterQueue(
		handler: (jobs: PgBoss.Job<AgentUpdaterJobData>[]) => Promise<void>,
		options?: PgBoss.WorkOptions,
	): Promise<string> {
		return this.boss.work<AgentUpdaterJobData>(
			AGENT_UPDATER_QUEUE,
			options || { batchSize: 1 },
			handler,
		);
	}

	/**
	 * Cancel a specific job by ID.
	 * @param jobId pg-boss job ID
	 * @param queueName Queue name (defaults to CONVERSION_QUEUE)
	 */
	async cancelJob(
		jobId: string,
		queueName: string = CONVERSION_QUEUE,
	): Promise<void> {
		await this.boss.cancel(queueName, jobId);
	}

	/**
	 * Resume a job (e.g., after fixing an issue).
	 * @param jobId pg-boss job ID
	 * @param queueName Queue name (defaults to CONVERSION_QUEUE)
	 */
	async resumeJob(
		jobId: string,
		queueName: string = CONVERSION_QUEUE,
	): Promise<void> {
		await this.boss.resume(queueName, jobId);
	}

	/**
	 * Get job details by ID.
	 * @param jobId pg-boss job ID
	 * @param queueName Queue name (defaults to CONVERSION_QUEUE)
	 */
	async getJobById(
		jobId: string,
		queueName: string = CONVERSION_QUEUE,
	): Promise<PgBoss.Job | null> {
		return this.boss.getJobById(queueName, jobId);
	}

	/**
	 * Delete a job from the queue.
	 */
	async deleteJob(queueName: string, jobId: string): Promise<void> {
		await this.boss.deleteJob(queueName, jobId);
	}

	/**
	 * Get queue statistics for monitoring.
	 */
	async getQueueSize(queueName: string = CONVERSION_QUEUE): Promise<number> {
		return this.boss.getQueueSize(queueName);
	}

	/**
	 * Check if pg-boss is running.
	 */
	isRunning(): boolean {
		return this.isStarted;
	}
}
