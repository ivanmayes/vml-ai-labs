import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends `task_run_files_status_enum` with `'skipped'`.
 *
 * Files that are intentionally not processed (size cap exceeded, already
 * uploaded in a prior successful run) used to be marked `failed`, which made
 * the run-detail UI red-tag them and conflated user-actionable errors with
 * routine bookkeeping. The worker now emits `'skipped'` for those rows so
 * `failed` only counts genuine errors.
 *
 * Idempotent: `ADD VALUE IF NOT EXISTS` is safe to re-apply if prod was
 * hot-patched.
 */
export class AddSkippedStatusToTaskRunFiles1746500000000
	implements MigrationInterface
{
	name = 'AddSkippedStatusToTaskRunFiles1746500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "wpp_open_agent_updater"."task_run_files_status_enum" ADD VALUE IF NOT EXISTS 'skipped'`,
		);
	}

	public async down(): Promise<void> {
		// Postgres does not support removing enum values without recreating
		// the type. Leaving 'skipped' in place on rollback is harmless.
	}
}
