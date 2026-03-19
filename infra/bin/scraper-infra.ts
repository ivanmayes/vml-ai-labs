#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ScraperStack } from '../lib/scraper-stack';

const app = new cdk.App();

new ScraperStack(app, 'VmlScraperStack', {
	env: {
		account: '309913069147',
		region: 'us-east-2',
	},
	description:
		'VML Site Scraper — SQS queues, ECR repo, Lambda worker, and IAM roles for per-page scraping',
});
