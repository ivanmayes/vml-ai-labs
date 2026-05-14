import { Module } from '@nestjs/common';

/**
 * Text Counter is a client-only mini app: no controllers, no entities, no DB tables.
 * The module exists for parity with `apps/mini-apps.json` and to register the schema
 * via SchemaBootstrapService — but it deliberately registers nothing inside.
 * See: docs/plans/2026-05-14-001-feat-text-counter-mini-app-plan.md (R9).
 */
@Module({})
export class TextCounterModule {}
