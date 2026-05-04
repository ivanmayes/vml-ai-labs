import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `wppOpenAgentProjectId` to `wpp_open_agent_updater.updater_tasks`.
 *
 * Used by the run worker for `getAgentConfig` / `updateAgentConfig` calls
 * because CS's `listAgents` is loose-scoped (returns agents under broader
 * scope) while `getAgentConfig` is strict-scoped (requires the agent's
 * actual owning project). Resolved from the user's osContext at task save
 * time and persisted on the row.
 *
 * Nullable for back-compat with rows created before this column existed;
 * the worker falls back to `wppOpenProjectId` when null.
 *
 * Idempotent: prod was hot-patched with the same DDL on 2026-05-04 to
 * recover from a missed deploy migration. Running this migration on prod
 * is a no-op.
 */
export class AddWppOpenAgentProjectIdColumn1746382500000
	implements MigrationInterface
{
	name = 'AddWppOpenAgentProjectIdColumn1746382500000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "wpp_open_agent_updater"."updater_tasks"
			ADD COLUMN IF NOT EXISTS "wppOpenAgentProjectId" character varying(100)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "wpp_open_agent_updater"."updater_tasks"
			DROP COLUMN IF EXISTS "wppOpenAgentProjectId"
		`);
	}
}
