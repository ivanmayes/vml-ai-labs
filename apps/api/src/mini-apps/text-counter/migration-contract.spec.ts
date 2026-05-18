/**
 * Locks in the deletion-behavior contract for the text-counter schema
 * migration without running real SQL. Migrations live outside the
 * jest rootDir (`src`), so the spec lives here next to the rest of
 * the mini-app and reaches up into `apps/api/migrations`.
 *
 * Specifically: deleting a `users` row must NOT cascade-wipe the
 * templates that user authored — templates are org-shared. The FK
 * uses `ON DELETE SET NULL` and `createdById` is nullable.
 */
import type { QueryRunner } from 'typeorm';

import { CreateTextCounterSchema1747958400000 } from '../../../migrations/1747958400000-CreateTextCounterSchema';

function fakeQueryRunner(queries: string[]): QueryRunner {
	return {
		query: jest.fn(async (sql: string) => {
			queries.push(sql);
		}),
	} as unknown as QueryRunner;
}

describe('CreateTextCounterSchema1747958400000 migration contract', () => {
	it('declares createdById as nullable and uses ON DELETE SET NULL for the user FK', async () => {
		const queries: string[] = [];
		const migration = new CreateTextCounterSchema1747958400000();
		await migration.up(fakeQueryRunner(queries));

		const createTable = queries.find((q) =>
			q.includes('CREATE TABLE "text_counter"."template"'),
		);
		expect(createTable).toBeDefined();
		const createTableSql = createTable as string;
		// createdById must NOT be NOT NULL — SET NULL needs nullability.
		expect(createTableSql).toMatch(/"createdById"\s+uuid\s*,/);
		expect(createTableSql).not.toMatch(/"createdById"\s+uuid\s+NOT NULL/);

		// The user FK must use SET NULL, never CASCADE.
		const fkSql = queries.find(
			(q) =>
				q.includes('fk_tc_template_created_by') &&
				q.includes('FOREIGN KEY'),
		);
		expect(fkSql).toBeDefined();
		expect(fkSql).toContain('ON DELETE SET NULL');
		expect(fkSql).not.toContain('ON DELETE CASCADE');
	});

	it('keeps the organization FK on CASCADE (orgs own templates)', async () => {
		const queries: string[] = [];
		const migration = new CreateTextCounterSchema1747958400000();
		await migration.up(fakeQueryRunner(queries));

		const orgFk = queries.find(
			(q) =>
				q.includes('fk_tc_template_organization') &&
				q.includes('FOREIGN KEY'),
		);
		expect(orgFk).toBeDefined();
		expect(orgFk).toContain('ON DELETE CASCADE');
	});
});
