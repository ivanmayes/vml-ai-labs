# AGENTS.md - text-counter (API)

## Scope
You are working in the `text-counter` mini app backend. The app now has a server-side surface:

- **Templates** are org-scoped objects (`Template` + `TemplateField`) persisted in the `text_counter` Postgres schema. Anyone in the org can create / edit / delete; service-layer queries always scope via `@CurrentOrg()`.
- **Extraction** is a multipart endpoint that takes one image plus a mode (`general` or `template`) and calls the configured vision provider via `AIService.analyzeImage`. Images are never persisted; the buffer is dropped after the call returns.

Endpoints under `organization/:orgId/apps/text-counter/`:
- `GET / POST / GET :id / PUT :id / DELETE :id` on `templates` — full CRUD.
- `POST extract` — multipart `file` + `mode` + optional `templateId`.

## Directory Boundary
- ONLY modify files under `apps/api/src/mini-apps/text-counter/`
- NEVER modify files in other mini apps' directories
- Shared validation logic that needs to be reused (e.g. `ImageFileValidationService` at `_platform/files/`) lives in `_platform/`, not here

## Conventions
- Entities use `@Entity({ schema: 'text_counter' })` (underscore form; matches `app.key.replace(/-/g, '_')`)
- Controller paths use the canonical `organization/:orgId/apps/text-counter/...` shape; guards: `AuthGuard('jwt')` + global `HasAppAccessGuard` + `@RequiresApp('text-counter')`
- Validation rules persist as JSONB on `template_field.rules`. The six V1 rule types (`maxCharacters`, `maxWords`, `minCharacters`, `minWords`, `singleLine`, `forbiddenWords`) live in `dtos/rule.dto.ts` as a discriminated union (`RuleDtoUnion`); the entity imports this type, so there is one source of truth on the API side
- DTO validation enforces: no control chars in template name / field labels, `forbiddenWords` array max 100 × 200 chars each
- AI calls go through `AIService.analyzeImage({ images: [{ base64, mimeType }], prompt })` with no provider override — the default is resolved from `AIConfig.defaultProviders[AIModality.Vision]`
- AI provider errors map to specific HTTP statuses in `extraction.service.ts`: `AIRateLimitError` → 429, `AITimeoutError` → 504, `AIProviderError` → 502. Never propagate raw upstream error messages — they may contain keys / prompt fragments / user content
- Cross-org reads return 404 (not 403) to avoid existence leaks
- `template.service.update` preserves field ids — payload fields carrying an `id` update in place, fields without an `id` insert, and fields omitted from the payload are deleted. Never regenerate every field UUID on save (it orphans client-side state keyed by id)
- `template.createdById` is nullable and the FK uses `ON DELETE SET NULL` — deleting a user does NOT cascade-wipe their org's templates

## Privacy Posture (R7)
Templates persist. Images and extracted text **do not** — no DB rows are created for either. The extraction endpoint asserts this in its specs (see `extraction.service.spec.ts`). Future mini-app additions in this directory must preserve this posture.

## Reference
- Original plan: `docs/plans/2026-05-14-001-feat-text-counter-mini-app-plan.md`
- Image-extraction + templates plan: `docs/plans/2026-05-18-001-feat-text-counter-image-extraction-and-templates-plan.md`
- Origin doc: `docs/brainstorms/2026-05-18-text-counter-image-extraction-and-templates-brainstorm.md`
