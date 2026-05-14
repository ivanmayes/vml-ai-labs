# AGENTS.md - text-counter (API)

## Scope
You are working in the `text-counter` mini app backend.

**This mini app is client-only.** All counting and settings logic lives in `apps/web/src/app/mini-apps/text-counter/`. There are no controllers, no entities, no DB tables.

The empty `TextCounterModule` exists for parity with `apps/mini-apps.json` and so that `SchemaBootstrapService` continues to treat the manifest as the source of truth. An empty `text_counter` Postgres schema is created on each API boot as a side effect — this is intentional and documented in the plan.

If a future requirement genuinely needs server-side state, prefer extending an existing platform service before adding a controller here.

## Directory Boundary
- ONLY modify files under `apps/api/src/mini-apps/text-counter/`
- NEVER modify files in other mini apps' directories
- NEVER modify shared infrastructure (`_core/`, `_platform/`, `organization/`, `user/`, `space/`, `project/`)

## Reference
- Plan: `docs/plans/2026-05-14-001-feat-text-counter-mini-app-plan.md`
