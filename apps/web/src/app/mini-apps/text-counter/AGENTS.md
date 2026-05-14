# AGENTS.md - text-counter (Web)

## Scope
You are working in the `text-counter` mini app frontend. The entire feature lives on the web side — no API endpoints, no entities.

## Directory Boundary
- ONLY modify files under `apps/web/src/app/mini-apps/text-counter/`
- NEVER modify files in other mini apps' directories
- NEVER modify shared pages (`pages/home/`, `pages/login/`, etc.)

## Component Rules
- Standalone components with signal-based state and `ChangeDetectionStrategy.OnPush`.
- Selector prefix: `app-text-counter-` (e.g. `app-text-counter-home`).
- Use PrimeNG v20 component names — `p-toggleswitch`, `p-select`, `p-inputnumber`, `p-tag`, `p-button`. The legacy names `p-inputSwitch` and `p-dropdown` do **not** work in this codebase.
- `ToggleSwitchModule` is already in `apps/web/src/app/shared/primeng.module.ts`. `SelectModule`, `InputNumberModule`, and the textarea directive are imported directly in `text-counter-home.component.ts` rather than being added to the shared module (per the mini-app boundary rule).

## Style Rules
- Tailwind v4 utilities only. No PrimeFlex classes (`col-*`, `grid`).
- Color from `--p-*` design tokens. No hardcoded hex / rgb.

## Persistence
- Settings persist in `localStorage` under key `text-counter:settings:v1` via `services/text-counter-settings.util.ts`.
- The merge-onto-defaults strategy means adding a new settings key never requires a migration — old payloads have the new key filled in from `DEFAULT_SETTINGS`. Only reach for a version bump if a key is renamed or its type changes.
- Text content is **never** persisted. This is a deliberate privacy choice (R7).

## Pure Counting Util
- `services/text-counter.util.ts` is a genuinely pure function — string in, stats object out. No Angular imports, no DOM. The spec runs as a plain Karma/Jasmine spec.

## Reference
- Plan: `docs/plans/2026-05-14-001-feat-text-counter-mini-app-plan.md`
- Reference mini-app: `apps/web/src/app/mini-apps/image-library/`
