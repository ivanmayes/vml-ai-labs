import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWppOpenAgentUpdaterSchema1709836900000
	implements MigrationInterface
{
	name = 'CreateWppOpenAgentUpdaterSchema1709836900000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create the schema
		await queryRunner.query(
			`CREATE SCHEMA IF NOT EXISTS "wpp_open_agent_updater"`,
		);

		// Create enum types
		await queryRunner.query(
			`CREATE TYPE "wpp_open_agent_updater"."updater_tasks_status_enum" AS ENUM('active', 'paused', 'archived')`,
		);
		await queryRunner.query(
			`CREATE TYPE "wpp_open_agent_updater"."task_runs_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled')`,
		);
		await queryRunner.query(
			`CREATE TYPE "wpp_open_agent_updater"."task_run_files_status_enum" AS ENUM('pending', 'downloading', 'converting', 'uploading', 'completed', 'failed')`,
		);

		// Create updater_tasks table
		await queryRunner.query(`
			CREATE TABLE "wpp_open_agent_updater"."updater_tasks" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"name" character varying(255) NOT NULL,
				"boxFolderId" character varying(100) NOT NULL,
				"boxFolderName" character varying(255),
				"wppOpenAgentId" character varying(100) NOT NULL,
				"wppOpenAgentName" character varying(255),
				"wppOpenProjectId" character varying(100) NOT NULL,
				"status" "wpp_open_agent_updater"."updater_tasks_status_enum" NOT NULL DEFAULT 'active',
				"lastRunAt" TIMESTAMP WITH TIME ZONE,
				"createdById" uuid NOT NULL,
				"organizationId" uuid NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_woau_updater_tasks" PRIMARY KEY ("id")
			)
		`);

		// Create task_runs table
		await queryRunner.query(`
			CREATE TABLE "wpp_open_agent_updater"."task_runs" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"taskId" uuid NOT NULL,
				"status" "wpp_open_agent_updater"."task_runs_status_enum" NOT NULL DEFAULT 'pending',
				"startedAt" TIMESTAMP WITH TIME ZONE,
				"completedAt" TIMESTAMP WITH TIME ZONE,
				"filesFound" integer NOT NULL DEFAULT 0,
				"filesProcessed" integer NOT NULL DEFAULT 0,
				"filesFailed" integer NOT NULL DEFAULT 0,
				"filesSkipped" integer NOT NULL DEFAULT 0,
				"errorMessage" text,
				"triggeredById" uuid NOT NULL,
				"organizationId" uuid NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_woau_task_runs" PRIMARY KEY ("id")
			)
		`);

		// Create task_run_files table
		await queryRunner.query(`
			CREATE TABLE "wpp_open_agent_updater"."task_run_files" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"taskRunId" uuid NOT NULL,
				"boxFileId" character varying(255) NOT NULL,
				"fileName" character varying(500) NOT NULL,
				"fileSize" bigint NOT NULL DEFAULT 0,
				"status" "wpp_open_agent_updater"."task_run_files_status_enum" NOT NULL DEFAULT 'pending',
				"errorMessage" text,
				"processedAt" TIMESTAMP WITH TIME ZONE,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_woau_task_run_files" PRIMARY KEY ("id")
			)
		`);

		// Indexes for updater_tasks
		await queryRunner.query(
			`CREATE INDEX "idx_woau_tasks_created_by" ON "wpp_open_agent_updater"."updater_tasks" ("createdById")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_woau_tasks_org" ON "wpp_open_agent_updater"."updater_tasks" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_woau_tasks_org_status" ON "wpp_open_agent_updater"."updater_tasks" ("organizationId", "status")`,
		);

		// Indexes for task_runs
		await queryRunner.query(
			`CREATE INDEX "idx_woau_runs_task" ON "wpp_open_agent_updater"."task_runs" ("taskId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_woau_runs_task_status" ON "wpp_open_agent_updater"."task_runs" ("taskId", "status")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_woau_runs_org" ON "wpp_open_agent_updater"."task_runs" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_woau_runs_org_created" ON "wpp_open_agent_updater"."task_runs" ("organizationId", "createdAt")`,
		);

		// Indexes for task_run_files
		await queryRunner.query(
			`CREATE INDEX "idx_woau_files_run" ON "wpp_open_agent_updater"."task_run_files" ("taskRunId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_woau_files_run_status" ON "wpp_open_agent_updater"."task_run_files" ("taskRunId", "status")`,
		);

		// Foreign keys for updater_tasks
		await queryRunner.query(
			`ALTER TABLE "wpp_open_agent_updater"."updater_tasks" ADD CONSTRAINT "fk_woau_tasks_created_by" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "wpp_open_agent_updater"."updater_tasks" ADD CONSTRAINT "fk_woau_tasks_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`,
		);

		// Foreign keys for task_runs
		await queryRunner.query(
			`ALTER TABLE "wpp_open_agent_updater"."task_runs" ADD CONSTRAINT "fk_woau_runs_task" FOREIGN KEY ("taskId") REFERENCES "wpp_open_agent_updater"."updater_tasks"("id") ON DELETE CASCADE`,
		);

		// Foreign keys for task_run_files
		await queryRunner.query(
			`ALTER TABLE "wpp_open_agent_updater"."task_run_files" ADD CONSTRAINT "fk_woau_files_run" FOREIGN KEY ("taskRunId") REFERENCES "wpp_open_agent_updater"."task_runs"("id") ON DELETE CASCADE`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop foreign keys
		await queryRunner.query(
			`ALTER TABLE "wpp_open_agent_updater"."task_run_files" DROP CONSTRAINT IF EXISTS "fk_woau_files_run"`,
		);
		await queryRunner.query(
			`ALTER TABLE "wpp_open_agent_updater"."task_runs" DROP CONSTRAINT IF EXISTS "fk_woau_runs_task"`,
		);
		await queryRunner.query(
			`ALTER TABLE "wpp_open_agent_updater"."updater_tasks" DROP CONSTRAINT IF EXISTS "fk_woau_tasks_organization"`,
		);
		await queryRunner.query(
			`ALTER TABLE "wpp_open_agent_updater"."updater_tasks" DROP CONSTRAINT IF EXISTS "fk_woau_tasks_created_by"`,
		);

		// Drop tables
		await queryRunner.query(
			`DROP TABLE IF EXISTS "wpp_open_agent_updater"."task_run_files"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "wpp_open_agent_updater"."task_runs"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "wpp_open_agent_updater"."updater_tasks"`,
		);

		// Drop enum types
		await queryRunner.query(
			`DROP TYPE IF EXISTS "wpp_open_agent_updater"."task_run_files_status_enum"`,
		);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "wpp_open_agent_updater"."task_runs_status_enum"`,
		);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "wpp_open_agent_updater"."updater_tasks_status_enum"`,
		);

		// Drop schema
		await queryRunner.query(
			`DROP SCHEMA IF EXISTS "wpp_open_agent_updater" CASCADE`,
		);
	}
}
