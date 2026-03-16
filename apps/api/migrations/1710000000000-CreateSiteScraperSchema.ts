import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSiteScraperSchema1710000000000
	implements MigrationInterface
{
	name = 'CreateSiteScraperSchema1710000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create the site_scraper schema
		await queryRunner.query(
			`CREATE SCHEMA IF NOT EXISTS "site_scraper"`,
		);

		// Create enum types
		await queryRunner.query(
			`CREATE TYPE "site_scraper"."ss_job_status" AS ENUM('pending', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')`,
		);
		await queryRunner.query(
			`CREATE TYPE "site_scraper"."ss_page_status" AS ENUM('pending', 'completed', 'failed')`,
		);

		// Create scrape_jobs table
		await queryRunner.query(`
			CREATE TABLE "site_scraper"."scrape_jobs" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"url" character varying(2048) NOT NULL,
				"maxDepth" integer NOT NULL DEFAULT 3,
				"viewports" jsonb NOT NULL DEFAULT '[1920]',
				"status" "site_scraper"."ss_job_status" NOT NULL DEFAULT 'pending',
				"pagesDiscovered" integer NOT NULL DEFAULT 0,
				"pagesCompleted" integer NOT NULL DEFAULT 0,
				"pagesFailed" integer NOT NULL DEFAULT 0,
				"pagesSkippedByDepth" integer NOT NULL DEFAULT 0,
				"error" jsonb,
				"userId" uuid NOT NULL,
				"organizationId" uuid NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"startedAt" TIMESTAMP WITH TIME ZONE,
				"completedAt" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_ss_scrape_jobs" PRIMARY KEY ("id")
			)
		`);

		// Create scraped_pages table
		await queryRunner.query(`
			CREATE TABLE "site_scraper"."scraped_pages" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"scrapeJobId" uuid NOT NULL,
				"url" character varying(2048) NOT NULL,
				"title" character varying(255),
				"htmlS3Key" character varying(500),
				"screenshots" jsonb NOT NULL DEFAULT '[]',
				"status" "site_scraper"."ss_page_status" NOT NULL DEFAULT 'pending',
				"errorMessage" character varying(500),
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_ss_scraped_pages" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_ss_pages_job_url" UNIQUE ("scrapeJobId", "url")
			)
		`);

		// Indexes for scrape_jobs
		await queryRunner.query(
			`CREATE INDEX "IDX_ss_jobs_id" ON "site_scraper"."scrape_jobs" ("id")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_ss_jobs_status" ON "site_scraper"."scrape_jobs" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_ss_jobs_user" ON "site_scraper"."scrape_jobs" ("userId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_ss_jobs_org" ON "site_scraper"."scrape_jobs" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_ss_jobs_created" ON "site_scraper"."scrape_jobs" ("createdAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_ss_jobs_user_org_status" ON "site_scraper"."scrape_jobs" ("userId", "organizationId", "status", "createdAt")`,
		);

		// Indexes for scraped_pages
		await queryRunner.query(
			`CREATE INDEX "idx_ss_pages_job_status" ON "site_scraper"."scraped_pages" ("scrapeJobId", "status")`,
		);

		// Foreign keys for scrape_jobs
		await queryRunner.query(
			`ALTER TABLE "site_scraper"."scrape_jobs" ADD CONSTRAINT "fk_ss_job_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "site_scraper"."scrape_jobs" ADD CONSTRAINT "fk_ss_job_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`,
		);

		// Foreign keys for scraped_pages
		await queryRunner.query(
			`ALTER TABLE "site_scraper"."scraped_pages" ADD CONSTRAINT "fk_ss_page_job" FOREIGN KEY ("scrapeJobId") REFERENCES "site_scraper"."scrape_jobs"("id") ON DELETE CASCADE`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop foreign keys
		await queryRunner.query(
			`ALTER TABLE "site_scraper"."scraped_pages" DROP CONSTRAINT IF EXISTS "fk_ss_page_job"`,
		);
		await queryRunner.query(
			`ALTER TABLE "site_scraper"."scrape_jobs" DROP CONSTRAINT IF EXISTS "fk_ss_job_organization"`,
		);
		await queryRunner.query(
			`ALTER TABLE "site_scraper"."scrape_jobs" DROP CONSTRAINT IF EXISTS "fk_ss_job_user"`,
		);

		// Drop tables
		await queryRunner.query(
			`DROP TABLE IF EXISTS "site_scraper"."scraped_pages"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "site_scraper"."scrape_jobs"`,
		);

		// Drop enum types
		await queryRunner.query(
			`DROP TYPE IF EXISTS "site_scraper"."ss_page_status"`,
		);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "site_scraper"."ss_job_status"`,
		);

		// Drop schema
		await queryRunner.query(
			`DROP SCHEMA IF EXISTS "site_scraper" CASCADE`,
		);
	}
}
