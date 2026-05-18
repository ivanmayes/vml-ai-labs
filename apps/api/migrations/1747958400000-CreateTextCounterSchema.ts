import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `text_counter` schema with the org-scoped `template` and
 * `template_field` tables. Rules persist as a JSONB array on each field row
 * (see plan Key Decisions). Org isolation is enforced at the service layer;
 * `organizationId` is indexed for the per-org list query path.
 */
export class CreateTextCounterSchema1747958400000
	implements MigrationInterface
{
	name = 'CreateTextCounterSchema1747958400000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "text_counter"`);

		await queryRunner.query(`
			CREATE TABLE "text_counter"."template" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"organizationId" uuid NOT NULL,
				"createdById" uuid NOT NULL,
				"name" character varying(255) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_tc_template" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			CREATE TABLE "text_counter"."template_field" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"templateId" uuid NOT NULL,
				"label" character varying(255) NOT NULL,
				"position" integer NOT NULL,
				"rules" jsonb NOT NULL DEFAULT '[]'::jsonb,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_tc_template_field" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "idx_tc_template_org" ON "text_counter"."template" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_tc_template_field_template_position" ON "text_counter"."template_field" ("templateId", "position")`,
		);

		await queryRunner.query(
			`ALTER TABLE "text_counter"."template" ADD CONSTRAINT "fk_tc_template_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "text_counter"."template" ADD CONSTRAINT "fk_tc_template_created_by" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "text_counter"."template_field" ADD CONSTRAINT "fk_tc_template_field_template" FOREIGN KEY ("templateId") REFERENCES "text_counter"."template"("id") ON DELETE CASCADE`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "text_counter"."template_field" DROP CONSTRAINT IF EXISTS "fk_tc_template_field_template"`,
		);
		await queryRunner.query(
			`ALTER TABLE "text_counter"."template" DROP CONSTRAINT IF EXISTS "fk_tc_template_created_by"`,
		);
		await queryRunner.query(
			`ALTER TABLE "text_counter"."template" DROP CONSTRAINT IF EXISTS "fk_tc_template_organization"`,
		);

		await queryRunner.query(
			`DROP TABLE IF EXISTS "text_counter"."template_field"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "text_counter"."template"`,
		);

		await queryRunner.query(`DROP SCHEMA IF EXISTS "text_counter" CASCADE`);
	}
}
