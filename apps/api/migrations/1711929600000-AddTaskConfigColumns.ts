import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskConfigColumns1711929600000 implements MigrationInterface {
	name = 'AddTaskConfigColumns1711929600000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "wpp_open_agent_updater"."updater_tasks"
			ADD COLUMN "fileExtensions" jsonb NOT NULL DEFAULT '["docx","pdf","pptx","xlsx"]'::jsonb
		`);

		await queryRunner.query(`
			ALTER TABLE "wpp_open_agent_updater"."updater_tasks"
			ADD COLUMN "includeSubfolders" boolean NOT NULL DEFAULT true
		`);

		await queryRunner.query(`
			ALTER TABLE "wpp_open_agent_updater"."updater_tasks"
			ADD COLUMN "cadence" character varying(50) NOT NULL DEFAULT 'manual'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "wpp_open_agent_updater"."updater_tasks"
			DROP COLUMN "cadence"
		`);

		await queryRunner.query(`
			ALTER TABLE "wpp_open_agent_updater"."updater_tasks"
			DROP COLUMN "includeSubfolders"
		`);

		await queryRunner.query(`
			ALTER TABLE "wpp_open_agent_updater"."updater_tasks"
			DROP COLUMN "fileExtensions"
		`);
	}
}
