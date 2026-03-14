/**
 * pg-boss Queue Configuration
 *
 * Configures the PostgreSQL-backed job queue for document conversion.
 */

import { JobConfig } from './pg-boss.types';

/**
 * Main pg-boss configuration options.
 * Uses the existing PostgreSQL database for queue storage.
 */
export const PG_BOSS_CONFIG = {
	/** Use DATABASE_URL from environment */
	connectionString: process.env.DATABASE_URL,

	/** SSL configuration for Heroku Postgres */
	ssl: process.env.DATABASE_SSL ? { rejectUnauthorized: false } : false,

	/** Schema for pg-boss tables */
	schema: 'pgboss',

	/** Application name for connection identification */
	application_name: 'vml-ai-labs',

	/** Archive completed jobs after 24 hours */
	archiveCompletedAfterSeconds: 86400, // 24 hours

	/** Delete archived jobs after 7 days */
	deleteAfterDays: 7,

	/** Reduced connection pool size (shared with main app) */
	max: 3,

	/** Maintenance check interval */
	maintenanceIntervalSeconds: 120,

	/** UUID v4 for job IDs */
	uuid: 'v4',
} as const;

/**
 * File-type specific job configuration.
 * Different file types have different processing characteristics.
 */
export const JOB_CONFIGS: Record<string, JobConfig> = {
	/** PDFs take longer due to text extraction complexity */
	'.pdf': {
		retryLimit: 3,
		expireInSeconds: 600, // 10 minutes
		priority: 1, // Lowest priority (larger files)
		retryDelay: 10,
		retryBackoff: true,
	},
	/** DOCX is fastest with Mammoth */
	'.docx': {
		retryLimit: 3,
		expireInSeconds: 300, // 5 minutes
		priority: 2,
		retryDelay: 5,
		retryBackoff: true,
	},
	/** Excel files with multiple sheets */
	'.xlsx': {
		retryLimit: 2,
		expireInSeconds: 180, // 3 minutes
		priority: 3,
		retryDelay: 5,
		retryBackoff: true,
	},
	/** PowerPoint presentations */
	'.pptx': {
		retryLimit: 2,
		expireInSeconds: 180, // 3 minutes
		priority: 3,
		retryDelay: 5,
		retryBackoff: true,
	},
} as const;

/**
 * Get job configuration for a file extension.
 * Falls back to DOCX config if extension not recognized.
 */
export function getJobConfig(fileExtension: string): JobConfig {
	const normalizedExt = fileExtension.toLowerCase().startsWith('.')
		? fileExtension.toLowerCase()
		: `.${fileExtension.toLowerCase()}`;

	return JOB_CONFIGS[normalizedExt] || JOB_CONFIGS['.docx'];
}

/**
 * Queue name constants.
 */
export const CONVERSION_QUEUE = 'document-conversion';
export const DEAD_LETTER_QUEUE = 'document-conversion-dlq';
export const AGENT_UPDATER_QUEUE = 'agent-updater-run';
export const SITE_SCRAPER_QUEUE = 'site-scraper';

/**
 * Site scraper job configuration.
 * Longer timeout for deep crawls with retry backoff.
 */
export const SITE_SCRAPER_JOB_CONFIG: JobConfig = {
	retryLimit: 2,
	expireInSeconds: 1800, // 30 minutes for long crawls
	priority: 1,
	retryDelay: 30,
	retryBackoff: true,
};

/**
 * Worker configuration constants.
 */
export const WORKER_CONFIG = {
	/** Number of concurrent jobs per worker */
	teamSize: parseInt(process.env.PG_BOSS_CONCURRENCY || '2', 10),

	/** How often to check for new jobs (ms) */
	pollingIntervalSeconds: 2,

	/** Maximum number of active jobs across all workers */
	maxConcurrency: 5,
} as const;
