import AWS, { SQS as AWSSQS } from 'aws-sdk'; 

export class SQS {
	private static readonly isDebug = process.env.DEBUG || false;

	private static sqsConfig = {
		queueURL: process.env.AWS_SQS_QUEUE_URL,
		region: process.env.AWS_SQS_REGION || process.env.AWS_REGION,
		accessKeyId: process.env.AWS_SQS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SQS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
	};

	public static async pushMessage(message: any) {
		if(process.env.RUNTIME_ENVIRONMENT !== 'aws') {
			AWS.config.update({
				region: this.sqsConfig.region,
				accessKeyId: this.sqsConfig.accessKeyId,
				secretAccessKey: this.sqsConfig.secretAccessKey
			});
		}

		const sqs = new AWSSQS();

		const response: AWS.SQS.SendMessageResult = await sqs.sendMessage({
			MessageBody: JSON.stringify(message),
			QueueUrl: this.sqsConfig.queueURL
		})
			.promise()
			.catch(err => {
				if(this.isDebug) {
					console.log(err);
				}
				return null;
			});

		if(!response) {
			throw new Error(`Couldn't add message to queue: ${this.sqsConfig.queueURL}.`);
		}

		return response.MessageId;
	}

	public static async receiveMessage(maxMessages: number = 1): Promise<AWS.SQS.ReceiveMessageResult> {
		if(process.env.RUNTIME_ENVIRONMENT !== 'aws') {
			AWS.config.update({
				region: this.sqsConfig.region,
				accessKeyId: this.sqsConfig.accessKeyId,
				secretAccessKey: this.sqsConfig.secretAccessKey
			});
		}

		const sqs = new AWSSQS();

		const message = await sqs.receiveMessage({
			QueueUrl: this.sqsConfig.queueURL,
			MaxNumberOfMessages: maxMessages
		}).promise()
			.catch(err => {
				if(this.isDebug) {
					console.log(err);
				}
				return null;
			});

		if(!message) {
			throw new Error('Error retrieving messages from SQS.');
		}

		return message;
	}

	public static async deleteMessage(receiptHandle: string) {
		if(process.env.RUNTIME_ENVIRONMENT !== 'aws') {
			AWS.config.update({
				region: this.sqsConfig.region,
				accessKeyId: this.sqsConfig.accessKeyId,
				secretAccessKey: this.sqsConfig.secretAccessKey
			});
		}

		const sqs = new AWSSQS();

		const result = await sqs.deleteMessage({
			ReceiptHandle: receiptHandle,
			QueueUrl: this.sqsConfig.queueURL
		}).promise()
			.catch(err => {
				if(this.isDebug) {
					console.log(err);
				}
				return null;
			});
		
		if(!result) {
			throw new Error('Error deleting SQS message.');
		}

		return result;
	}
}