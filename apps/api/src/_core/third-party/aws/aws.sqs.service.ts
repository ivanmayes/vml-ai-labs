import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
	SQSClient,
	SendMessageCommand,
	SendMessageBatchCommand,
	type SendMessageCommandInput,
	type SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs';
import { v4 as uuid } from 'uuid';

/**
 * AWS SQS Service (Injectable)
 *
 * Provides message publishing to SQS queues with:
 * - Single message sends
 * - Batch message sends (up to 10 per batch, auto-chunked)
 * - Proper error handling
 *
 * Uses AWS SDK v3 for modern, modular architecture.
 * Follows the same pattern as AwsS3Service.
 */
@Injectable()
export class AwsSqsService implements OnModuleInit {
	private readonly logger = new Logger(AwsSqsService.name);
	private client: SQSClient;
	private readonly scraperQueueUrl: string;
	private readonly region: string;

	constructor() {
		this.scraperQueueUrl = process.env.AWS_SQS_SCRAPER_QUEUE_URL || '';
		this.region =
			process.env.AWS_SQS_REGION || process.env.AWS_REGION || 'us-east-1';
	}

	onModuleInit() {
		this.initializeClient();
	}

	/**
	 * Initialize SQS client with credentials.
	 * Follows the same credential resolution pattern as AwsS3Service.
	 */
	private initializeClient(): void {
		const accessKeyId =
			process.env.AWS_SQS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
		const secretAccessKey =
			process.env.AWS_SQS_SECRET_ACCESS_KEY ||
			process.env.AWS_SECRET_ACCESS_KEY;

		const config: {
			region: string;
			credentials?: { accessKeyId: string; secretAccessKey: string };
		} = {
			region: this.region,
		};

		// Only set explicit credentials if provided
		// Otherwise, SDK will use default credential chain (IAM roles, etc.)
		if (accessKeyId && secretAccessKey) {
			config.credentials = {
				accessKeyId,
				secretAccessKey,
			};
		}

		this.client = new SQSClient(config);

		if (!this.scraperQueueUrl) {
			this.logger.warn(
				'AWS_SQS_SCRAPER_QUEUE_URL not configured - SQS operations will fail',
			);
		} else {
			this.logger.log(
				`SQS service initialized for queue: ${this.scraperQueueUrl}`,
			);
		}
	}

	/**
	 * Send a single page work message to the scraper queue.
	 *
	 * @param message - Message payload (will be JSON-serialized)
	 * @returns SQS MessageId
	 */
	async sendPageWork(message: Record<string, unknown>): Promise<string> {
		const params: SendMessageCommandInput = {
			QueueUrl: this.scraperQueueUrl,
			MessageBody: JSON.stringify(message),
		};

		try {
			const command = new SendMessageCommand(params);
			const result = await this.client.send(command);

			this.logger.debug(
				`Sent page work message to SQS: ${result.MessageId}`,
			);

			return result.MessageId || '';
		} catch (error) {
			this.logger.error('Failed to send page work message to SQS', error);
			throw new Error('SQS sendPageWork failed');
		}
	}

	/**
	 * Send a batch of messages to the scraper queue.
	 * Automatically chunks into groups of 10 (SQS batch limit).
	 *
	 * @param messages - Array of message payloads (will be JSON-serialized)
	 * @returns Number of messages successfully sent
	 */
	async sendBatch(messages: Record<string, unknown>[]): Promise<number> {
		if (messages.length === 0) {
			return 0;
		}

		const SQS_BATCH_SIZE = 10;
		let totalSent = 0;

		for (let i = 0; i < messages.length; i += SQS_BATCH_SIZE) {
			const chunk = messages.slice(i, i + SQS_BATCH_SIZE);

			const entries: SendMessageBatchRequestEntry[] = chunk.map(
				(msg, idx) => ({
					Id: `${idx}-${uuid().slice(0, 8)}`,
					MessageBody: JSON.stringify(msg),
				}),
			);

			try {
				const command = new SendMessageBatchCommand({
					QueueUrl: this.scraperQueueUrl,
					Entries: entries,
				});
				const result = await this.client.send(command);

				const successCount = result.Successful?.length || 0;
				totalSent += successCount;

				if (result.Failed && result.Failed.length > 0) {
					this.logger.warn(
						`SQS batch send: ${result.Failed.length} messages failed`,
					);
				}
			} catch (error) {
				this.logger.error(
					`Failed to send batch to SQS (chunk starting at ${i})`,
					error,
				);
				throw new Error('SQS sendBatch failed');
			}
		}

		this.logger.debug(`Sent ${totalSent} messages to SQS in batch`);
		return totalSent;
	}
}
