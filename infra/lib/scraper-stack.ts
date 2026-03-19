import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

/**
 * VML Scraper Infrastructure Stack
 *
 * Creates the AWS resources for the per-page Lambda scraping architecture:
 * - SQS Standard Queue + DLQ for page work distribution
 * - ECR Repository for the Lambda container image
 * - Lambda DockerImageFunction for page rendering
 * - SSM Parameter for callback secret
 * - IAM least-privilege permissions
 *
 * NO DynamoDB — all state lives in PostgreSQL on Heroku.
 */
export class ScraperStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// ---------------------------------------------------------------
		// SQS Dead-Letter Queue
		// ---------------------------------------------------------------
		const dlq = new sqs.Queue(this, 'ScraperPageWorkDlq', {
			queueName: 'vml-scraper-page-work-dlq',
			retentionPeriod: cdk.Duration.days(14),
			encryption: sqs.QueueEncryption.KMS_MANAGED,
			// No redrive — DLQ is the terminal destination
		});

		// ---------------------------------------------------------------
		// SQS Work Queue
		// ---------------------------------------------------------------
		const workQueue = new sqs.Queue(this, 'ScraperPageWorkQueue', {
			queueName: 'vml-scraper-page-work',
			visibilityTimeout: cdk.Duration.seconds(720), // 6x Lambda timeout (120s)
			retentionPeriod: cdk.Duration.days(7),
			encryption: sqs.QueueEncryption.KMS_MANAGED,
			deadLetterQueue: {
				queue: dlq,
				maxReceiveCount: 4, // After 4 failed attempts, move to DLQ
			},
		});

		// ---------------------------------------------------------------
		// ECR Repository
		// ---------------------------------------------------------------
		// ECR repo is created outside the stack (avoids chicken-and-egg:
		// Lambda needs an image in ECR, but ECR is created by the stack).
		// Created manually or by CI before first deploy.
		const ecrRepo = ecr.Repository.fromRepositoryName(
			this,
			'ScraperLambdaRepo',
			'vml-scraper-lambda',
		);

		// ---------------------------------------------------------------
		// SSM Parameter — Callback Secret
		// ---------------------------------------------------------------
		// The secret is read from the SCRAPER_CALLBACK_SECRET env var at
		// deploy time. If not set, a placeholder is created that must be
		// updated manually before the Lambda can authenticate callbacks.
		const callbackSecret = new ssm.StringParameter(
			this,
			'ScraperCallbackSecret',
			{
				parameterName: '/vml-scraper/callback-secret',
				description:
					'Shared Bearer token secret for Lambda-to-Heroku callback authentication',
				stringValue:
					process.env.SCRAPER_CALLBACK_SECRET ||
					'REPLACE_ME_BEFORE_FIRST_DEPLOY',
				tier: ssm.ParameterTier.STANDARD,
			},
		);

		// ---------------------------------------------------------------
		// Reference the existing S3 bucket (managed outside this stack)
		// ---------------------------------------------------------------
		const s3BucketName =
			process.env.AWS_S3_BUCKET_NAME || 'vml-ai-labs-assets';
		const s3Bucket = s3.Bucket.fromBucketName(
			this,
			'ExistingAssetsBucket',
			s3BucketName,
		);

		// ---------------------------------------------------------------
		// Lambda Function (Docker Image)
		// ---------------------------------------------------------------
		// On first deploy the ECR repo is empty — CDK needs a valid image.
		// We use a placeholder from the ECR public gallery. Once the CI/CD
		// pipeline pushes the real image, update the function code via
		// `aws lambda update-function-code`.
		// CALLBACK_URL is the Heroku API URL where Lambda sends page results.
		// Varies per environment, so it's passed at deploy time.
		const callbackUrl =
			process.env.SCRAPER_CALLBACK_URL ||
			'https://vml-ai-labs-api-952c223e883a.herokuapp.com';

		const pageWorker = new lambda.DockerImageFunction(
			this,
			'ScraperPageWorker',
			{
				functionName: 'vml-scraper-page-worker',
				description:
					'Renders a single page with Chromium, captures screenshots, uploads to S3, and callbacks to Heroku',
				code: lambda.DockerImageCode.fromEcr(ecrRepo, {
					tagOrDigest: 'latest',
				}),
				memorySize: 2048,
				timeout: cdk.Duration.seconds(120),
				architecture: lambda.Architecture.X86_64,
				reservedConcurrentExecutions: 25,
				environment: {
					NODE_OPTIONS: '--enable-source-maps',
					// Names must match what lambda/scraper/src/types.ts getEnvConfig() reads
					QUEUE_URL: workQueue.queueUrl,
					S3_BUCKET: s3BucketName,
					CALLBACK_URL: callbackUrl,
					CALLBACK_SECRET:
						process.env.SCRAPER_CALLBACK_SECRET ||
						'REPLACE_ME_BEFORE_FIRST_DEPLOY',
				},
				retryAttempts: 0, // SQS handles retries, not Lambda async invoke
			},
		);

		// ---------------------------------------------------------------
		// SQS Event Source Mapping
		// ---------------------------------------------------------------
		pageWorker.addEventSource(
			new SqsEventSource(workQueue, {
				batchSize: 1, // One page per Lambda invocation
				maxConcurrency: 20, // Cap concurrent Lambdas (within reserved 25)
				reportBatchItemFailures: true, // Enable partial batch failure reporting
			}),
		);

		// ---------------------------------------------------------------
		// IAM Permissions (Least Privilege)
		// ---------------------------------------------------------------

		// ECR: pull container image (needed for imported repos — CDK doesn't auto-grant)
		ecrRepo.grantPull(pageWorker);

		// SQS: consume messages from work queue + send new messages (for discovered links
		// that Heroku re-enqueues — Lambda itself doesn't enqueue, but the role is ready
		// in case the architecture evolves)
		workQueue.grantConsumeMessages(pageWorker);
		workQueue.grantSendMessages(pageWorker);

		// S3: upload screenshots, HTML, thumbnails under site-scraper/* prefix only
		s3Bucket.grantPut(pageWorker, 'site-scraper/*');

		// SSM: read the callback secret parameter
		callbackSecret.grantRead(pageWorker);

		// ---------------------------------------------------------------
		// Stack Outputs
		// ---------------------------------------------------------------
		new cdk.CfnOutput(this, 'QueueUrl', {
			value: workQueue.queueUrl,
			description: 'SQS page-work queue URL',
			exportName: 'VmlScraperQueueUrl',
		});

		new cdk.CfnOutput(this, 'DlqUrl', {
			value: dlq.queueUrl,
			description: 'SQS dead-letter queue URL',
			exportName: 'VmlScraperDlqUrl',
		});

		new cdk.CfnOutput(this, 'EcrRepoUri', {
			value: ecrRepo.repositoryUri,
			description: 'ECR repository URI for Lambda container images',
			exportName: 'VmlScraperEcrUri',
		});

		new cdk.CfnOutput(this, 'LambdaFunctionName', {
			value: pageWorker.functionName,
			description: 'Lambda function name for page worker',
			exportName: 'VmlScraperLambdaName',
		});

		new cdk.CfnOutput(this, 'LambdaFunctionArn', {
			value: pageWorker.functionArn,
			description: 'Lambda function ARN for page worker',
			exportName: 'VmlScraperLambdaArn',
		});
	}
}
