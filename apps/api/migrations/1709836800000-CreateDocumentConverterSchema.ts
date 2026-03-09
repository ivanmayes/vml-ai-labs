import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentConverterSchema1709836800000
	implements MigrationInterface
{
	name = 'CreateDocumentConverterSchema1709836800000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create the document_converter schema
		await queryRunner.query(
			`CREATE SCHEMA IF NOT EXISTS "document_converter"`,
		);

		// Create the status enum type
		await queryRunner.query(
			`CREATE TYPE "document_converter"."conversion_jobs_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled')`,
		);

		// Create the conversion_jobs table
		await queryRunner.query(`
			CREATE TABLE "document_converter"."conversion_jobs" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"fileName" character varying(255) NOT NULL,
				"originalFileName" character varying(255) NOT NULL,
				"fileSize" integer NOT NULL,
				"status" "document_converter"."conversion_jobs_status_enum" NOT NULL DEFAULT 'pending',
				"engine" character varying(50),
				"error" jsonb,
				"mimeType" character varying(100) NOT NULL,
				"fileExtension" character varying(20) NOT NULL,
				"s3InputKey" character varying(500),
				"s3OutputKey" character varying(500),
				"outputSize" integer,
				"processingTimeMs" integer,
				"pgBossJobId" character varying(100),
				"idempotencyKey" character varying(100),
				"userId" uuid NOT NULL,
				"organizationId" uuid NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"startedAt" TIMESTAMP WITH TIME ZONE,
				"completedAt" TIMESTAMP WITH TIME ZONE,
				"expiresAt" TIMESTAMP WITH TIME ZONE,
				"retryCount" integer NOT NULL DEFAULT 0,
				"maxRetries" integer NOT NULL DEFAULT 3,
				"version" integer NOT NULL,
				CONSTRAINT "PK_dc_conversion_jobs" PRIMARY KEY ("id")
			)
		`);

		// Create indexes
		// Note: No index on "id" -- the PRIMARY KEY constraint already creates one.
		await queryRunner.query(
			`CREATE INDEX "idx_dc_jobs_status" ON "document_converter"."conversion_jobs" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dc_jobs_user" ON "document_converter"."conversion_jobs" ("userId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dc_jobs_org" ON "document_converter"."conversion_jobs" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dc_jobs_idempotency" ON "document_converter"."conversion_jobs" ("idempotencyKey")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dc_jobs_created" ON "document_converter"."conversion_jobs" ("createdAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dc_jobs_expires" ON "document_converter"."conversion_jobs" ("expiresAt")`,
		);

		// Composite indexes for common queries
		await queryRunner.query(
			`CREATE INDEX "idx_dc_jobs_user_org_status_created" ON "document_converter"."conversion_jobs" ("userId", "organizationId", "status", "createdAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dc_jobs_status_created" ON "document_converter"."conversion_jobs" ("status", "createdAt")`,
		);

		// Unique constraint for idempotency
		await queryRunner.query(
			`ALTER TABLE "document_converter"."conversion_jobs" ADD CONSTRAINT "uq_dc_jobs_org_idempotency" UNIQUE ("organizationId", "idempotencyKey")`,
		);

		// Foreign keys
		await queryRunner.query(
			`ALTER TABLE "document_converter"."conversion_jobs" ADD CONSTRAINT "fk_dc_job_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "document_converter"."conversion_jobs" ADD CONSTRAINT "fk_dc_job_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop foreign keys
		await queryRunner.query(
			`ALTER TABLE "document_converter"."conversion_jobs" DROP CONSTRAINT IF EXISTS "fk_dc_job_organization"`,
		);
		await queryRunner.query(
			`ALTER TABLE "document_converter"."conversion_jobs" DROP CONSTRAINT IF EXISTS "fk_dc_job_user"`,
		);

		// Drop table (cascades indexes and constraints)
		await queryRunner.query(
			`DROP TABLE IF EXISTS "document_converter"."conversion_jobs"`,
		);

		// Drop the enum type
		await queryRunner.query(
			`DROP TYPE IF EXISTS "document_converter"."conversion_jobs_status_enum"`,
		);

		// Drop the schema
		await queryRunner.query(
			`DROP SCHEMA IF EXISTS "document_converter" CASCADE`,
		);
	}
}
