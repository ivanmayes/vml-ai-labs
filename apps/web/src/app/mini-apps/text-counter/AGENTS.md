# AGENTS.md - text-counter (Web)

## Scope
You are working in the `text-counter` mini app frontend. The app has three tabs on `pages/text-counter-home/`:

- **Text** — original paste-text mode (extracted into `components/text-counter-text-mode/`); preserves R7 privacy posture (text never persisted, only settings).
- **Image (general)** — upload one or more images, AI extracts text per image, each region renders as a row with the same counts as paste mode.
- **Image + template** — per-image template selector + CDK drag-and-drop assignment of extracted text into labeled fields with live per-field rule validation.

The web side now talks to an API surface under `organization/:orgId/apps/text-counter/...` for template CRUD and vision extraction (see `services/text-counter-templates.service.ts` and `services/text-counter-extraction.service.ts`).

## Directory Boundary
- ONLY modify files under `apps/web/src/app/mini-apps/text-counter/`
- NEVER modify files in other mini apps' directories
- NEVER modify shared pages (`pages/home/`, `pages/login/`, etc.)

## Component Rules
- Standalone components with signal-based state and `ChangeDetectionStrategy.OnPush`
- Selector prefix: `app-text-counter-` (e.g. `app-text-counter-home`, `app-text-counter-image-card`)
- PrimeNG v20 component names — `p-toggleswitch`, `p-select`, `p-inputnumber`, `p-tag`, `p-button`, `p-tabs` / `p-tablist` / `p-tab` / `p-tabpanels` / `p-tabpanel`. The legacy names `p-inputSwitch` and `p-dropdown` do **not** work in this codebase
- `TabsModule` + `DialogModule` are already exported from `apps/web/src/app/shared/primeng.module.ts`. `FileUploadModule` and the textarea directive are imported directly in the components that use them (mini-app boundary rule)
- Drag-and-drop uses Angular CDK (`@angular/cdk/drag-drop`) with `LiveAnnouncer` from `@angular/cdk/a11y` for screen-reader announcements. Drag is scoped per image card via `cdkDropListConnectedTo`

## Style Rules
- Tailwind v4 utilities only. No PrimeFlex classes (`col-*`, `grid`, `flex-column`, etc.)
- Color from `--p-*` design tokens. No hardcoded hex / rgb. Do not include hex fallbacks inside `var(--p-...)` — PrimeNG always defines the token at runtime

## Types & API Boundary
- `no-restricted-imports` blocks `@api/mini-apps/text-counter/*` — the web side hand-mirrors API DTO shapes in `models/template.types.ts`, `models/extraction.types.ts`, and `models/rule.types.ts`
- `Rule` is the single source of truth for the validation-rule discriminated union (six V1 types) on the web side. `template.types.ts` re-exports it alongside `TemplateField`
- HTTP services unwrap `ResponseEnvelope<T>` via `.data` (mirror the image-library pattern)
- Shared utilities (`nextId`, `createImagePreviewUrl`, `revokeImagePreviewUrl`, `extractErrorMessage`, `MAX_UPLOAD_BYTES`, `ACCEPT_MIMES`) live in `services/text-counter-shared.util.ts` — do not duplicate them in components

## Persistence
- Settings persist in `localStorage` under key `text-counter:settings:v1` via `services/text-counter-settings.util.ts`
- AI-vision consent acknowledgement persists under `text-counter:ai-consent:v1` via the consent banner component. Image orchestrators (`text-counter-image-general` and `text-counter-image-template`) GATE the first extraction on consent by calling `hasAIConsent()` before firing the AI POST and draining a `pendingConsent` queue when the banner emits `(accepted)`
- Text content, uploaded images, and extracted regions are **never** persisted — refresh discards everything (R7)
- Settings storage uses merge-onto-defaults: adding a new key needs no migration; only renames/type changes force a version bump

## Pure Utilities
- `services/text-counter.util.ts` — counting (pure, no Angular)
- `services/text-counter-validation.util.ts` — rule evaluation, uses `computeStats` internally so paste-mode and template-mode produce identical numbers for identical settings

## Reference
- Original plan: `docs/plans/2026-05-14-001-feat-text-counter-mini-app-plan.md`
- Image-extraction + templates plan: `docs/plans/2026-05-18-001-feat-text-counter-image-extraction-and-templates-plan.md`
- Origin doc: `docs/brainstorms/2026-05-18-text-counter-image-extraction-and-templates-brainstorm.md`
- Reference mini-app: `apps/web/src/app/mini-apps/image-library/`
