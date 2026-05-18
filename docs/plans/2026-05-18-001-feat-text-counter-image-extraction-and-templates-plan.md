---
date: 2026-05-18
type: feat
topic: text-counter-image-extraction-and-templates
status: active
origin: docs/brainstorms/2026-05-18-text-counter-image-extraction-and-templates-brainstorm.md
---

# feat: Text-Counter Image Extraction and Templates

## Summary

Add image-upload-driven text extraction to the `text-counter` mini app. A vision AI extracts text from flat rasterized creatives; users get either a row-per-text count list (general mode) or matches against an org-scoped template of labeled fields with per-field validation rules (template mode). Multi-image sessions with per-image template choice, alongside the existing paste-text mode on a three-tab home. This is the first API surface for the mini app — vision extraction endpoint plus template CRUD — with images and extracted text staying ephemeral and only templates persisted (org-scoped).

---

## Problem Frame

Client teams reviewing creative output from agencies and designers receive flat rasterized exports (JPG/PNG/WEBP/GIF) where text is baked into the image. Today they retype each text element into the existing paste-text counter to check character counts, then mentally apply per-field rules ("headline must be 25 chars max and one line") across multiple fields per creative and multiple creatives per campaign. The retype-and-check loop and the manual rule application together are the pain — neither piece in isolation. See origin: `docs/brainstorms/2026-05-18-text-counter-image-extraction-and-templates-brainstorm.md`.

---

## Requirements Traceability

This plan implements all origin requirements R1–R21 (modes/entry points, general mode, templates and authoring, template image mode, validation rules, correction UX, unassigned-pool presentation, empty-field rendering, persistence/privacy). Actor and flow coverage:

- A1 (org user) is the only human actor; A2 (vision AI) is the extraction service called from U3.
- F1 (general image extraction) → U6, U7 (counts re-use).
- F2 (template-driven extraction and validation) → U9 (UI), U7 (rule evaluator), U3 (extraction endpoint).
- F3 (template authoring) → U8.
- Acceptance examples AE1–AE9 map to test scenarios on U2, U3, U4, U6, U7, U8, and U9 as called out per unit.

---

## Scope Boundaries

Carrying forward from origin and adding plan-local deferrals.

### Carried from origin

- Batch validation over many creatives at once (campaign-level dashboards) is out of scope.
- Saved/named validation "checks" (audit-trail records) are out of scope.
- Custom-regex rules and "required to include" rules are out of scope.
- System-curated starter template library is out of scope.
- Admin-gated template authoring (anyone-creates is the V1 posture) is out of scope.
- Image hash cache for re-uploads is out of scope.
- Last-session resume is out of scope (extracted text is intentionally ephemeral).
- Cross-image drag-and-drop is out of scope (drag is scoped to a single image card).
- PDF/CSV export of validation results is out of scope.

### Deferred to Follow-Up Work

- **PDF upload support.** Brainstorm R3 listed "PNG, JPG, PDF — formats to confirm in planning." The existing `ImageFileValidationService` validates PNG/JPG/JPEG/WEBP/GIF only (with HEIC explicitly rejected); adding PDF requires a per-page rendering path before vision call. V1 ships image formats only.
- **Per-field hints in the AI prompt.** V1 sends only field labels to the vision call. If matching accuracy is poor in practice, a follow-up adds per-field hints ("usually the largest text," "usually at the bottom").
- **Per-rule case-sensitivity toggle for forbidden words.** V1 is case-insensitive substring match. If users ask for case-sensitive matches or whole-word matching, that's a follow-up.
- **Concurrent template-edit visibility.** Templates load fresh per session; edits to a template in flight don't push to other open sessions. A "template was edited — reload?" notice is a follow-up.

---

## Key Technical Decisions

- **Vision provider selection uses the existing `AIService.analyzeImage` abstraction.** The endpoint passes no hardcoded provider/model — it reads `AIConfig.defaultProviders[AIModality.Vision]` and `AIConfig.defaultModels`, with per-request override available if a future feature wants to pin a specific provider. Rationale: the abstraction already exists, all five providers expose `analyzeImage`, and the org's environment config is the right place for the provider choice.
- **AI is responsible only for extraction and label-matching; counting and rule evaluation stay client-side.** (See origin Key Decisions.) The extraction endpoint returns a structured JSON shape — `regions: string[]` for general mode, or `{ matches: { label, text }[], unassigned: string[] }` for template mode — and the web layer runs the existing pure counting util plus the new rule evaluator. Keeps results consistent with the existing paste-text mode and avoids paying the AI to do something deterministic.
- **Validation rules persist as JSONB on each field row, not as separate rule rows.** The `template_field` table has a `rules: jsonb` column holding an array of `{ type, ... }` objects. Cheaper for V1, single-query reads, schema evolution doesn't require migrations per rule type. Trade-off: cross-template "which fields use rule X?" queries become harder if that need arises later.
- **Template authoring is an inline dialog** triggered from the template picker, not a separate `/templates` admin page. Keeps V1 surface tight. No `/manage-templates` route is added.
- **Images upload via Multer `memoryStorage()` with 25 MB cap**, reusing `ImageFileValidationService` from the image-library mini app. After the vision call returns, the buffer is dropped (no disk write, no persistence) — same posture as image-library's pre-S3 step but without the persistence tail.
- **Forbidden-words rule is case-insensitive substring match.** A list of strings; any string appearing anywhere in the field text (case-insensitive) fails the rule. Failure surfaces which terms matched.
- **Empty fields are neutral unless a minimum-bearing rule fires.** A field with no assigned text shows no indicator unless its rules include a `minCharacters` or `minWords` that emptiness violates. (Origin R21.)
- **Web mini-app maintains a local types mirror.** Per `apps/web/src/app/mini-apps/image-library/AGENTS.md` and the project's `no-restricted-imports` rule, the web side cannot import from `@api/mini-apps/text-counter`. Local types live in `apps/web/src/app/mini-apps/text-counter/models/`.
- **PrimeNG v20 selectors and module placement.** The `TabsModule` is already exported from `apps/web/src/app/shared/primeng.module.ts`; `FileUploadModule` is NOT — it imports directly into the component that uses it (mirroring image-library's pattern).
- **Drag-and-drop uses Angular CDK DragDrop.** `@angular/cdk ^21.1.2` is already a declared dependency. The text-counter is the first consumer.
- **The existing R7 privacy posture extends to the new modes.** Uploaded images are dropped after the vision request; extracted text lives only in browser memory; the existing localStorage settings policy is preserved with `mergeOntoDefaults` so new settings (if any) need no migration.

---

## High-Level Technical Design

*This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Extraction request/response shape (directional)

```
POST /organization/:orgId/apps/text-counter/extract
  multipart/form-data:
    file:        <image>
    mode:        "general" | "template"
    templateId:  <uuid>            (required when mode === "template")

Response (general mode):
  { data: { regions: string[] } }

Response (template mode):
  { data: {
      matches: [ { label: string, text: string }, ... ],   # one entry per template field; text may be ""
      unassigned: string[]                                  # extracted regions that didn't map
  } }
```

### AI prompt shape (directional sketch — V1 sends labels only, no hints)

```
System: You are an OCR assistant. Extract text regions from the image. Do not count
characters or evaluate rules. Return strict JSON only.

User (template mode):
  "Fields for this image: [headline, body, cta, disclaimer].
   Return JSON: { matches: [{label, text}], unassigned: [text] }.
   Each field appears at most once in matches; if no region matches a field, include it
   with empty text. Place any region you couldn't confidently match in unassigned."

User (general mode):
  "Return JSON: { regions: [text] } listing each distinct text region you can see, in
   no particular order."
```

### Extraction flow sequence

```mermaid
sequenceDiagram
  participant W as Web (image card)
  participant A as API (/extract)
  participant V as ImageFileValidationService
  participant AI as AIService.analyzeImage
  participant P as Vision provider

  W->>A: POST /extract (multipart: file, mode, templateId?)
  A->>V: validateFile(file)
  V-->>A: ValidatedImage { buffer, mimeType, ... }
  A->>A: build prompt from mode + (template if any)
  A->>AI: analyzeImage({ images: [{ base64, mimeType }], prompt })
  AI->>P: provider-specific vision call
  P-->>AI: JSON text response
  AI-->>A: parsed text
  A->>A: parse + validate JSON shape
  A-->>W: ResponseEnvelope { data: regions | matches+unassigned }
  Note over A: buffer dropped; nothing persisted
```

### Validation rule evaluator (pure function, directional)

```
evaluateRules(text: string, rules: Rule[], settings: TextCounterSettings): RuleResult[]

Rule types (V1):
  { type: "maxCharacters", value: number }
  { type: "maxWords", value: number }
  { type: "minCharacters", value: number }
  { type: "minWords", value: number }
  { type: "singleLine" }
  { type: "forbiddenWords", values: string[] }

RuleResult: { rule: Rule, pass: boolean, detail?: string }
```

The evaluator uses the existing `computeStats(text, settings)` from `apps/web/src/app/mini-apps/text-counter/services/text-counter.util.ts` for counts so paste-mode counts and template-mode validation produce identical numbers given the same settings.

---

## Implementation Units

### U1. Text-counter API foundation and migration

- **Goal:** Wire up the first real API surface for the text-counter mini app: register the schema bootstrap, add the migration that creates the schema's tables, and integrate the module into `mini-apps.module.ts`. After this unit lands, the mini app has an empty but live API namespace ready for U2/U3.
- **Requirements:** Underpins R5, R7, R8, R11.
- **Dependencies:** None.
- **Files:**
  - `apps/api/src/mini-apps/text-counter/text-counter.module.ts` (modify — replace empty shell with controllers + services + TypeOrmModule.forFeature)
  - `apps/api/migrations/<timestamp>-CreateTextCounterSchema.ts` (create)
  - `apps/api/src/mini-apps/text-counter/AGENTS.md` (modify — the existing web-only AGENTS.md needs an API counterpart, or this file needs to be split)
  - **Confirmed already in place (no edit needed):** `apps/mini-apps.json` already registers `text-counter` for schema bootstrap; `apps/api/src/mini-apps/mini-apps.module.ts` already imports and registers `TextCounterModule` in the CLI markers.
- **Approach:** Model the migration on `apps/api/migrations/1747100000000-CreateImageLibrarySchema.ts`. Schema name uses underscore form (`text_counter`). The migration creates the `text_counter` schema, the `template` table, and the `template_field` table (defined in U2's entities) with FKs, indexes, and the JSONB rules column. The module wires controllers + services + `TypeOrmModule.forFeature([Template, TemplateField])`.
- **Patterns to follow:** `apps/api/src/mini-apps/image-library/image-library.module.ts`, `apps/api/migrations/1747100000000-CreateImageLibrarySchema.ts`.
- **Test scenarios:**
  - Migration runs cleanly against an empty database and is idempotent on re-run (via TypeORM's `MigrationExecutor` semantics — verify migration registers as applied).
  - The `text_counter` schema and both tables exist after migration with the expected columns, FKs, and indexes (`organization_id` indexed on `template`).
  - Booting the API with `DATABASE_MIGRATE_ON_STARTUP=true` against a fresh DB produces a working text-counter schema.
  - `Test expectation: none for the empty-shell module wire-up itself` — the module simply registers components covered by U2/U3 tests.
- **Verification:** API boots without errors; `GET /api/mini-apps/text-counter/templates` returns 401/403 (auth required) rather than 404 (route registered).

### U2. Template entity, DTOs, service, and controller

- **Goal:** Full CRUD slice for org-scoped templates. Anyone in the org can list, read, create, update, delete; org isolation is enforced at the service layer.
- **Requirements:** R5, R6, R7, R19; supports F3.
- **Dependencies:** U1.
- **Files:**
  - `apps/api/src/mini-apps/text-counter/entities/template.entity.ts` (create)
  - `apps/api/src/mini-apps/text-counter/entities/template-field.entity.ts` (create)
  - `apps/api/src/mini-apps/text-counter/dtos/create-template.dto.ts` (create)
  - `apps/api/src/mini-apps/text-counter/dtos/update-template.dto.ts` (create)
  - `apps/api/src/mini-apps/text-counter/dtos/template-field.dto.ts` (create — nested)
  - `apps/api/src/mini-apps/text-counter/dtos/rule.dto.ts` (create — discriminated union for the six rule types)
  - `apps/api/src/mini-apps/text-counter/services/template.service.ts` (create)
  - `apps/api/src/mini-apps/text-counter/template.controller.ts` (create)
  - `apps/api/src/mini-apps/text-counter/services/template.service.spec.ts` (create)
  - `apps/api/src/mini-apps/text-counter/template.controller.spec.ts` (create)
  - `api-manifest.json` (regenerate via `npm run api:manifest` after the controller compiles)
- **Approach:** `Template` has `id`, `organizationId`, `name`, `createdById`, timestamps, and a one-to-many to `TemplateField`. `TemplateField` has `id`, `templateId`, `label`, `position` (ordering), and `rules: jsonb`. Rule shape is the discriminated union from the H-LTD section. Service queries always filter by `organizationId` from `@CurrentOrg()`. Controller uses `@RequiresApp('text-counter')` + `@UseGuards(JwtAuthGuard, HasAppAccessGuard)` (or whatever the canonical guard composition is — confirm against image-library controller). Endpoints: `GET /templates`, `GET /templates/:id`, `POST /templates`, `PUT /templates/:id`, `DELETE /templates/:id`. ResponseEnvelope on every return.
- **Patterns to follow:** `apps/api/src/mini-apps/image-library/image-library.controller.ts`, `apps/api/src/mini-apps/image-library/entities/image-asset.entity.ts`, `apps/api/src/_platform/decorators/current-org.decorator.ts`.
- **Test scenarios:**
  - **Covers AE8 in part (service layer).** Service `findAll(orgA)` returns only orgA's templates; service `findAll(orgB)` does not include orgA's templates. Direct attempt to read orgA's template via `findOne(id, orgB)` returns null / not-found.
  - Create: valid DTO with name + 1+ fields creates rows in both tables; returned shape includes the field array with `position` ordering preserved.
  - Update: changing field labels, adding a field, removing a field, and reordering fields all persist correctly; concurrent fields with the same label are allowed (no uniqueness constraint on label).
  - Delete: cascades to template_field rows. Deletion is idempotent — repeat delete returns not-found.
  - Validation: empty `name` rejected with 400; field with no rules allowed; rule shape mismatch (e.g., `maxCharacters` without `value`) rejected with 400.
  - JSONB rules round-trip: each of the six rule types written and read back equals input.
  - Auth: requests without JWT return 401; requests from a user without `text-counter` app access return 403.
- **Verification:** All controller + service tests pass; manual `curl` against a test JWT can create and list a template; the response shape matches the DTO.

### U3. Vision extraction endpoint

- **Goal:** A single endpoint that accepts an image upload plus a mode (`general` | `template`) plus an optional `templateId`, calls the AI vision provider, parses the JSON response, and returns the extracted text. No image or text is persisted.
- **Requirements:** R9, R10, R11, R12, R13; supports F1, F2.
- **Dependencies:** U1 (module + DI), U2 (template lookup for label list).
- **Files:**
  - `apps/api/src/mini-apps/text-counter/extraction.controller.ts` (create)
  - `apps/api/src/mini-apps/text-counter/services/extraction.service.ts` (create)
  - `apps/api/src/mini-apps/text-counter/services/vision-prompt-builder.ts` (create — pure prompt builder, easy to unit-test)
  - `apps/api/src/mini-apps/text-counter/services/extraction-response-parser.ts` (create — pure JSON parser/validator)
  - `apps/api/src/mini-apps/text-counter/dtos/extract-request.dto.ts` (create — `mode`, `templateId`, plus the file via Multer)
  - `apps/api/src/mini-apps/text-counter/dtos/extract-response.dto.ts` (create — union for general vs template responses)
  - `apps/api/src/mini-apps/text-counter/services/extraction.service.spec.ts` (create)
  - `apps/api/src/mini-apps/text-counter/services/vision-prompt-builder.spec.ts` (create)
  - `apps/api/src/mini-apps/text-counter/services/extraction-response-parser.spec.ts` (create)
- **Approach:** Controller mirrors image-library's `FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25*1024*1024, files: 1 } })`. Validate the uploaded file with `ImageFileValidationService` (inject via constructor — it's exported from image-library's module or relocate to `_platform` if needed; if relocation is required, document and do it here). Service `extract(req, orgId)` flow: validate file → if template mode, fetch template by id+orgId (404 if not found) → build prompt via `vision-prompt-builder` → call `AIService.analyzeImage({ images: [{ base64, mimeType }], prompt })` with no provider override (the service resolves the configured `AIModality.Vision` default internally) → parse + validate JSON via `extraction-response-parser` (reject if shape is wrong, surface a 502-style error so the client knows it was an AI parsing failure) → return response. Buffer reference is dropped before return. No DB write of extracted text or image.
- **Technical design (per-unit):** The two parsers (prompt builder and response parser) are pure functions intentionally split out so the AI integration test surface stays narrow — the service test mocks `AIService.analyzeImage` and exercises the orchestration; the parser tests cover JSON shape edge cases without touching the AI client.
- **Patterns to follow:** `apps/api/src/mini-apps/image-library/image-library.controller.ts` (Multer + validation), `apps/api/src/ai/ai.service.ts` (vision call), `apps/api/src/mini-apps/image-library/services/image-file-validation.service.ts` (reuse).
- **Test scenarios:**
  - **Covers AE1.** General mode: given a mock `AIService.analyzeImage` returning `{"regions":["HEADLINE","Body copy","Visit example.com"]}`, the service returns `{ regions: [3 items] }`.
  - **Covers AE2.** Template mode: given a template with fields `[headline, body, cta, disclaimer]` and a mock AI returning 4 matches + 1 unassigned, the service returns the same shape with all four fields present.
  - Missing template in template mode: `mode=template` without `templateId` returns 400; `templateId` for a deleted template returns 404; `templateId` for a different org's template returns 404 (not 403 — avoid existence leak).
  - File validation: PNG/JPG/WEBP/GIF accepted; HEIC rejected with 400; > 25 MB rejected with 400/413; PDF rejected (Deferred to Follow-Up).
  - AI response malformed: parser returns shape error; service maps to a 502-style error response with a generic "extraction failed" message and logs the raw AI text at debug level (no PII at error level).
  - AI response missing fields: in template mode, AI returns matches with only 3 of 4 fields; service fills the missing field with empty text and returns successfully.
  - Auth: unauthenticated request returns 401; user without `text-counter` app access returns 403.
  - **Privacy assertion (Covers AE9 in part):** after a successful extract call, no row is created in the `text_counter` schema (no image rows, no extracted-text rows, no audit rows) — verify via direct DB query in test.
  - Prompt builder: given a template with field labels, the produced prompt mentions each label exactly once and instructs JSON-only output.
  - Response parser: valid general response, valid template response, missing top-level keys, extra unexpected keys (tolerate or reject — pick and test), embedded code fences in the AI text (`\`\`\`json ... \`\`\``) are stripped before JSON parse.
- **Verification:** Integration test against a mocked `AIService` passes for both modes; manual `curl` with a real image + a real test template returns reasonable extracted text; no rows appear in the `text_counter.image_*` namespace because none should exist.

### U4. Web HTTP services and local types

- **Goal:** Wire the web mini app's HTTP layer to the new API. Define local types mirroring the API shapes (per the `@api/mini-apps/*` import restriction), and create two services: templates CRUD and extraction.
- **Requirements:** Underpins R3, R4, R5, R6, R8, R9, R10, R19.
- **Dependencies:** U2, U3 (API shapes need to be settled).
- **Files:**
  - `apps/web/src/app/mini-apps/text-counter/models/template.types.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/models/extraction.types.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/services/text-counter-templates.service.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/services/text-counter-extraction.service.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/services/text-counter-templates.service.spec.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/services/text-counter-extraction.service.spec.ts` (create)
- **Approach:** Both services use `HttpClient` + `environment.apiUrl` + the `ResponseEnvelope` shape (`Observable<{ data: T }>`), mirroring `apps/web/src/app/mini-apps/image-library/services/image-library.service.ts`. Auth headers come from the existing global interceptor. Types are duplicated by hand from the API DTOs — that duplication is the cost of the `no-restricted-imports` boundary and is the established pattern; surface any drift via a regen step or future codegen as a follow-up.
- **Patterns to follow:** `apps/web/src/app/mini-apps/image-library/services/image-library.service.ts`, `apps/web/src/app/mini-apps/image-library/models/image-library.types.ts`.
- **Test scenarios:**
  - Templates service: list → emits parsed array; create → POSTs the right body and emits the created template with field IDs; update → PUTs and emits updated shape; delete → emits void on 204.
  - Extraction service: general-mode call posts FormData with `file` + `mode=general` and no `templateId`; template-mode call posts FormData with `file` + `mode=template` + `templateId`; both surface the right typed response.
  - HTTP error: 4xx and 5xx surface a typed error (whatever the project's error envelope is) — tests assert the error path; don't swallow.
  - **Covers AE8 in part.** Listing templates from one org returns only those templates (verified via mocked HTTP response shape, not org enforcement — that's U2's territory).
- **Verification:** All service tests pass via Karma; types compile against a freshly-regenerated `api-manifest.json` (visual review since there's no codegen).

### U5. Three-tab home page restructure

- **Goal:** Refactor the existing `text-counter-home` page so the current paste-text experience becomes the first tab in a three-tab layout. The other two tabs are placeholders wired to the new sub-components (filled in U6 and U9). The paste-text tab's behavior, settings panel, and localStorage policy are unchanged.
- **Requirements:** R1, R2.
- **Dependencies:** None (can run in parallel with backend); U6 and U9 will mount into this scaffold.
- **Files:**
  - `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/text-counter-home.component.ts` (modify — extract current content into `text-counter-text-mode.component`, wrap in `p-tabs`)
  - `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/text-counter-home.component.html` (modify — `p-tabs` + three `p-tabpanel`)
  - `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/text-counter-home.component.scss` (modify — minor)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-text-mode/text-counter-text-mode.component.ts` (create — extract from current home)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-text-mode/text-counter-text-mode.component.html` (create — moved content)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-text-mode/text-counter-text-mode.component.scss` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-text-mode/text-counter-text-mode.component.spec.ts` (create — same coverage as today's home spec, just relocated)
- **Approach:** PrimeNG v20 tab API: `<p-tabs value="text">` containing `<p-tablist>` with `<p-tab value="text">`, `<p-tab value="image-general">`, `<p-tab value="image-template">`, and `<p-tabpanels>` with three `<p-tabpanel>`. `TabsModule` is already in the shared module — no extra import. Default selected tab is "text" so existing users see no change. The text-mode component owns everything that's in the current `text-counter-home.component` today (textarea, settings panel, target indicator, stats display). The home component becomes a thin shell that hosts the tabs.
- **Patterns to follow:** `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/` (current implementation — preserve behavior verbatim during the extract). The PrimeFlex prohibition from `docs/solutions/ui-bugs/primeflex-classes-not-available-in-primeng-v20-tailwind-stack-2026-04-01.md` applies — Tailwind utilities only.
- **Test scenarios:**
  - Existing `text-counter-home.component.spec` assertions about text counting, settings persistence, target indicator continue to pass — just relocated to the text-mode component spec. No regression in counts, target, or settings.
  - Tab switch: home renders all three tabs; clicking each switches the visible panel; default visible tab on first load is "text".
  - localStorage settings key (`text-counter:settings:v1`) is still read/written by the text-mode component and unchanged in shape.
  - **Test expectation: none for the home shell itself beyond rendering the tabs** — substantive behavior tests live in the per-mode component specs.
- **Verification:** A user opening the existing text-counter URL sees the paste-text tab pre-selected with identical behavior; the other two tabs render their placeholder components.

### U6. Image (general) mode component

- **Goal:** The "Image (general)" tab: upload one or more images, call the extraction service in general mode for each, render one card per image containing rows of extracted text with the same counts and indicators as paste-text mode.
- **Requirements:** R3, R4, R12, R13, R20.
- **Dependencies:** U4 (extraction service), U5 (tab scaffold).
- **Files:**
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-general/text-counter-image-general.component.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-general/text-counter-image-general.component.html` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-general/text-counter-image-general.component.scss` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-general/text-counter-image-general.component.spec.ts` (create)
- **Approach:** Standalone component, signal-based state, `OnPush`, selector `app-text-counter-image-general`. Imports `FileUploadModule` directly (mirroring image-library). Multi-file selection via `p-fileupload` with `multiple` + `customUpload` (call our service per file rather than letting PrimeNG do the POST). One signal `images: Signal<ImageExtraction[]>` where each entry has `{ id, file, status: 'pending'|'extracting'|'done'|'error', regions: string[], error?: string }`. For each finished image, render a card with rows; each row reuses `computeStats(text, settings)` from `services/text-counter.util.ts` and renders the same indicator pattern as paste-text mode (character/word counts, target indicator). Counts settings come from the same `text-counter-settings.util.ts`. No persistence — closing the tab or navigating away drops the state.
- **Patterns to follow:** `apps/web/src/app/mini-apps/image-library/pages/image-library-home/image-library-home.component.ts` (file upload UX, error surfacing).
- **Test scenarios:**
  - **Covers AE1.** Single image, three extracted regions → card renders with three rows; each row shows expected character and word counts for its text.
  - Multi-image upload (three files): three cards render side-by-side; each finishes independently; one failing doesn't block the others.
  - Per-image error: extraction API returns error → that card renders an error state with retry; other cards render normally.
  - Extraction in-flight: upload starts → card renders with a loading state; transitions to done when response arrives.
  - Inline edit on a row: editing the text updates that row's counts immediately (re-uses paste-mode behavior).
  - **Covers AE9 in part.** Refreshing the browser clears all uploaded images and extracted text — the component state is in-memory only.
  - Settings changes: changing the paste-mode settings (e.g., `countWhitespaceAsCharacter: false`) is reflected immediately in all rendered rows.
- **Verification:** Manual upload of a JPG with three text regions yields a card with three rows; counts match what paste-mode would produce for the same text; cards survive multi-image upload without stomping each other.

### U7. Validation rule evaluator

- **Goal:** A pure utility that evaluates a list of validation rules against a text value (using existing count semantics) and returns per-rule pass/fail with failure details. Powers template-mode validation in U9.
- **Requirements:** R14, R15.
- **Dependencies:** None (pure function, can land anytime).
- **Files:**
  - `apps/web/src/app/mini-apps/text-counter/services/text-counter-validation.util.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/services/text-counter-validation.util.spec.ts` (create)
- **Approach:** Pure function `evaluateRules(text: string, rules: Rule[], settings: TextCounterSettings): RuleResult[]`. Internally uses `computeStats` for counts so paste-mode and template-mode produce identical numbers given identical settings. The `Rule` type is defined in `apps/web/src/app/mini-apps/text-counter/models/template.types.ts` (created in U4) alongside the `TemplateField` shape; U7 imports it from there rather than redefining it locally.
  - `maxCharacters`: `stats.characters <= value` (passes when equal); failure detail `"35 / 25 characters"`.
  - `maxWords`: same shape on words.
  - `minCharacters`: `stats.characters >= value`. Empty text fails (drives R21 empty-field flagging).
  - `minWords`: same shape on words. Empty text fails.
  - `singleLine`: text contains no `\n`. Empty text passes.
  - `forbiddenWords`: case-insensitive substring search; failure detail names matched terms (e.g., `"contains: competitor-x"`).
- **Patterns to follow:** `apps/web/src/app/mini-apps/text-counter/services/text-counter.util.ts` — pure function shape, no Angular imports, spec runs as a plain Karma/Jasmine spec.
- **Test scenarios:**
  - **Covers AE4.** `"This is a longer headline\nwith a break"` against `[{type:'maxCharacters', value:25}, {type:'singleLine'}]` returns both rules failing with appropriate details.
  - `maxCharacters` with equal length: pass.
  - `maxCharacters` with empty text: pass.
  - `minCharacters` with empty text: fail (drives empty-field flagging).
  - `minCharacters` with above-minimum text: pass.
  - `maxWords` with whitespace-only text and various `wordRule` settings (whitespace vs alphanumeric): counts respect settings; test both modes.
  - `singleLine` with empty text: pass; with single `\n`: fail; with text after a trailing `\n`: fail.
  - `forbiddenWords` with case-insensitive match: `["Free", "GUARANTEED"]` against `"Limited time — free guaranteed!"` fails with both terms surfaced.
  - `forbiddenWords` with substring (not whole-word): `["limit"]` against `"unlimited"` fails (substring match is the V1 semantics).
  - Empty rules array → empty results array, no errors.
  - Multiple rules, mixed pass/fail → each result is independent, order preserved.
- **Verification:** All evaluator specs pass; the result shape matches what U9 will consume.

### U8. Template authoring UI

- **Goal:** Inline dialog reachable from the template picker (in U9). Users in the org can create a new template (name + ordered fields, each with rules), edit, or delete. No separate admin route.
- **Requirements:** R5, R6, R7, R19; supports F3.
- **Dependencies:** U4 (templates service).
- **Files:**
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-template-editor/text-counter-template-editor.component.ts` (create — dialog content)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-template-editor/text-counter-template-editor.component.html` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-template-editor/text-counter-template-editor.component.scss` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-template-editor/text-counter-template-editor.component.spec.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-rule-editor/text-counter-rule-editor.component.ts` (create — per-rule editor sub-component)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-rule-editor/text-counter-rule-editor.component.html` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-rule-editor/text-counter-rule-editor.component.spec.ts` (create)
- **Approach:** Hosted in a PrimeNG `Dialog` (modal). Form is signal-based with reactive forms or template-driven — match the existing project convention (likely template-driven given the simple-component style in current `text-counter-home`). Fields list is reorderable (use a simple up/down for V1; the drag-and-drop pattern in U9 is a heavier lift than this field reorder needs). Each field has a label input and an "add rule" button that opens the rule editor; the rule editor switches its form by rule type (the six V1 types). Save calls the templates service; delete prompts confirmation. The dialog is opened from the picker via an output event.
- **Patterns to follow:** `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/text-counter-home.component.ts` for the signal-based standalone pattern. PrimeNG `Dialog` from the shared module (verify it's exported).
- **Test scenarios:**
  - Create flow: open dialog → name "Holiday Carousel" → add field "headline" with `maxCharacters: 25` + `singleLine` → save → templates service `create` called with the expected payload; on success, dialog emits close + new template.
  - Edit flow: open with existing template → rename field, add a rule, remove a rule, reorder fields → save → service `update` called with the expected delta payload.
  - Delete flow: confirm dialog → service `delete` called.
  - Form validation: empty template name disables save; field with empty label disables save; numeric rule values must be positive integers.
  - **Covers AE8 in part (UI side).** Saved template appears in the picker on close — verified via the picker re-fetching from the templates service (U9 will mount this).
  - Error from API on save: dialog stays open and surfaces error; user can retry.
- **Verification:** Manual: open the dialog from the placeholder template picker (U9 will provide the real one — can stub it temporarily), build a multi-field template with rules from each of the six types, save, see it appear in the API DB.

### U9. Image + template mode component

- **Goal:** The "Image + template" tab. Multi-image upload, per-image template selector with picker UI (and "Manage templates" affordance opening the U8 dialog), AI-driven extraction + label-matching, drag-and-drop reassignment between fields and unassigned pool, inline edit of any chunk, live validation against the template's rules, and an unassigned pool rendered below the fields with counts on each pool chunk.
- **Requirements:** R5, R6, R7, R8, R9, R10, R14, R15, R16, R17, R18, R19, R20, R21; implements F2.
- **Dependencies:** U4 (services), U5 (tab scaffold), U7 (validation evaluator), U8 (template authoring dialog).
- **Files:**
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-template/text-counter-image-template.component.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-template/text-counter-image-template.component.html` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-template/text-counter-image-template.component.scss` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-template/text-counter-image-template.component.spec.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-card/text-counter-image-card.component.ts` (create — single-image card with fields + pool)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-card/text-counter-image-card.component.html` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-card/text-counter-image-card.component.scss` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-image-card/text-counter-image-card.component.spec.ts` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-template-picker/text-counter-template-picker.component.ts` (create — combines `p-select` with "Manage templates" affordance)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-template-picker/text-counter-template-picker.component.html` (create)
  - `apps/web/src/app/mini-apps/text-counter/components/text-counter-template-picker/text-counter-template-picker.component.spec.ts` (create)
- **Approach:** The mode component owns the multi-image list (signal `imageCards: ImageCard[]` where each card has `{ id, file, templateId, status, assignments: Record<fieldId, string>, unassigned: string[] }`). The per-image card is its own component for testability and drag scoping. Inside a card:
  - Template picker at top.
  - Field rows below — each row uses `CdkDropList` with `cdkDropListConnectedTo` referencing the unassigned pool and the other field rows in the same card (NOT across cards — origin R18). Each field renders a `cdkDrag` chunk containing the assigned text + an inline-editable input + `evaluateRules(text, rules, settings)` results.
  - Unassigned pool below the fields — a `CdkDropList` rendering chunks as `cdkDrag` items, each showing its text + character/word counts (R20). The pool sits visually below the field list, not above.
  - Drag scoping is enforced by `cdkDropListConnectedTo` only listing within-card lists — dragging from card A to card B's lists is simply not a valid drop target (R18, AE6).
  - Live validation: each field renders pass/fail indicators driven by `evaluateRules`. Empty fields render neutral unless a min-bearing rule fails (R21).
  - "Manage templates" affordance in the picker opens the U8 dialog; on close, refresh the picker list.
- **Patterns to follow:** Existing `text-counter-home.component.ts` for the signal-based standalone shape. Angular Material's CDK docs for `cdkDropList` + `cdkDropListConnectedTo` semantics. `apps/web/src/app/mini-apps/image-library/pages/image-library-home/image-library-home.component.ts` for upload UX.
- **Test scenarios:**
  - **Covers AE2.** Template with 4 fields + AI response with 5 regions → 4 fields show AI-proposed text; the 5th region appears in the unassigned pool with its counts.
  - **Covers AE3.** Drag a chunk from `body` to `disclaimer` → `body` becomes empty, `disclaimer` shows the dragged text, both fields' validation results update immediately.
  - **Covers AE5.** Inline-edit a field's text from `"V1sit example.c0m"` to `"Visit example.com"` → counts and validation update on every keystroke or on blur (whichever the standard project pattern is — match paste-mode behavior).
  - **Covers AE6.** Two image cards rendered — attempt to drag from card 1's `headline` to card 2's `headline` → drop is not accepted; the chunk stays in card 1.
  - **Covers AE7.** Upload two images, pick template "A" for image 1 and template "B" for image 2 → each card renders its own template's fields; switching template on image 1 doesn't change image 2.
  - **Covers AE9.** After completing assignments and refreshing → all extracted text gone, all assignments gone, all template selections gone, but the templates themselves are still in the picker (they're persisted server-side).
  - Drag from a field back to the unassigned pool → field becomes empty; pool shows the chunk with counts (R20).
  - Drag from unassigned pool to an empty field → field shows the chunk and validates; pool no longer shows it.
  - Empty field with `minCharacters: 5` rule → field renders fail indicator (R21).
  - Empty field with only `maxCharacters: 25` rule → field renders neutral (R21).
  - Template deleted while in use (concurrency edge): user has template T loaded → another user (mocked: service returns 404 on next list) deletes T → on next picker refresh, T disappears from the picker; the in-flight assignments remain in the card (no automatic data loss), but saving/re-running extraction with a deleted template returns 404 → UI surfaces "this template no longer exists, pick another".
  - Extraction error per image: one image's call fails → only that card shows the error state; other cards proceed normally.
  - Settings change (e.g., `countWhitespaceAsCharacter: false`) → counts and validations update across all currently rendered cards.
- **Verification:** Manual end-to-end: log in to an org, create a template via the "Manage templates" affordance, upload 2 carousel slides, pick one template for each, drag a misassigned chunk to the right field, edit an OCR typo, see the pool show orphans with counts, refresh the page and confirm everything is gone except the saved template.

---

## Test Strategy

Each implementation unit lists its own scenarios. Project-wide notes:

- API unit/integration tests use Jest (existing setup under `apps/api/`).
- Web component and util tests use Karma/Jasmine (existing setup under `apps/web/`).
- The pre-commit hook runs lint-staged + duplicate DTO detection + tests (per CLAUDE.md). Plan-wide expectation: every unit lands with green tests; no `--no-verify` without user permission.
- Cross-unit: when both U7 and U9 are in place, an end-to-end happy-path test (mock the AI service, real evaluator, real drag) should exercise AE2 → AE3 → AE5 in a single spec to catch wiring regressions across the validation/drag boundary.

---

## System-Wide Impact

- **API surface added.** First real endpoints under `apps/api/src/mini-apps/text-counter/`. After this lands, `api-manifest.json` includes the template CRUD and extraction routes. Re-run `npm run api:manifest` as part of U2/U3.
- **Schema added.** New `text_counter` Postgres schema with `template` and `template_field` tables. Schema bootstrap is automatic via `apps/mini-apps.json`; table creation requires the migration in U1.
- **AI service consumer added.** First mini-app to call `AIService.analyzeImage`. No new provider config required if the org has set `AIConfig.defaultProviders[AIModality.Vision]`; if not, the deployment story needs that env config before the extraction endpoint is usable.
- **No cross-mini-app imports.** All new files live under `apps/api/src/mini-apps/text-counter/` or `apps/web/src/app/mini-apps/text-counter/`. The web side imports only from `@platform/`, `@shared/`, and local files — never from `@api/mini-apps/text-counter`, in line with the project's `no-restricted-imports`.
- **Bundle size.** Adding `CdkDropList`/`FileUploadModule`/`Dialog` to a previously tiny mini app will grow the lazy chunk; the project already has a flagged warning that the initial bundle exceeds 1MB (per the memory note). This change adds to a lazy-loaded chunk, not the initial bundle, so the warning shouldn't worsen — verify after build.

---

## Risk Analysis & Mitigation

- **AI response shape drift.** Vision providers may return JSON wrapped in code fences, with extra commentary, or with the wrong key names — especially across different default models. *Mitigation:* the `extraction-response-parser` is split from the service for unit-test isolation; it strips common code-fence wrappers and validates shape strictly before returning. On parse failure, the endpoint returns a 502-style error with a clear message rather than silently returning malformed data.
- **AI matching accuracy below useful threshold.** If the AI consistently mis-assigns text to fields (especially with subtle distinctions like "subhead" vs "body"), users will spend more time dragging than they save in retyping. *Mitigation:* drag-and-drop and inline edit are first-class; the unassigned pool surfaces orphans rather than dropping them; the "per-field hints" follow-up is already listed under Deferred to Follow-Up Work as the planned response if accuracy is poor.
- **Provider cost.** Each extraction call is a vision-model invocation. *Mitigation:* no images are cached server-side in V1, so duplicate uploads incur duplicate cost; the image-hash cache is listed under origin scope boundaries as deferred. Worth tracking actual cost-per-extraction in monitoring once live.
- **Privacy regression.** The existing text-counter has a strict no-content-storage posture. *Mitigation:* the privacy assertion test in U3 (no DB rows after extract) and the localStorage-only ephemeral state in U6/U9 enforce this in code, not just convention. The `Test expectation` annotations in U5/U6/U9 explicitly cover the refresh-clears-everything behavior (AE9).
- **Cross-mini-app type drift.** Hand-mirrored types between API DTOs and web types can drift. *Mitigation:* keep field names identical between the API DTOs and the web `models/` mirrors; a follow-up codegen pass from `api-manifest.json` to web types is on the table if drift becomes a problem.
- **Pre-commit duplicate DTO detection.** The pre-commit hook checks for duplicate DTOs across mini-apps; the rule and field DTOs introduced here must not collide with image-library or other mini-app DTOs of similar names. *Mitigation:* use specific, mini-app-prefixed names where ambiguous (`TemplateField` is OK; `Field` would not be).

---

## Deferred Implementation Notes

- The exact method to drop the file buffer from memory after the AI call (whether explicit `buffer = null;` is meaningful in Node/V8, or whether structural scoping is enough) is an implementation detail. Decide while writing U3.
- The precise PrimeNG `Dialog` API (selector, `[(visible)]` two-way binding, footer/header projection) — verify against the installed v20 docs and existing usages in the codebase when implementing U8.
- The `cdkDropListConnectedTo` connection pattern across N image cards needs an indexable list; whether to use template refs, IDs, or programmatic `ViewChildren` queries is a U9 implementation detail.
- Whether the rule editor sub-component uses one shared form with a discriminated union or one form per rule type is a U8 micro-decision.
- The `singleLine` rule's empty-text behavior (pass vs fail) is settled in U7's test scenarios: empty passes (no line break exists). Confirm during implementation.

---

## Outstanding Questions

### Deferred to Implementation

- **[Affects U3][Needs research]** What exact JSON-mode invocation is supported by the default `AIModality.Vision` provider in this codebase's config? `AIService.analyzeImage` may already enforce structured output; if not, U3 needs to handle text-mode AI responses defensively. Confirm by reading the relevant provider's `analyzeImage` implementation when starting U3.
- **[Affects U3]** Whether `ImageFileValidationService` is exported by `image-library.module.ts` for cross-mini-app DI or whether it should be relocated to `_platform/`. Cross-mini-app imports are forbidden per CLAUDE.md (`Mini apps are self-contained - never import across app boundaries`), so relocation is likely required. Decide at U3 time and do the move there if so.
- **(Resolved during review — kept for record)** `apps/mini-apps.json` already registers `text-counter`; `apps/api/src/mini-apps/mini-apps.module.ts` already imports `TextCounterModule`; PrimeNG `DialogModule` is already exported by `apps/web/src/app/shared/primeng.module.ts`. None of these need additional import or registration work.

---

## References

- Origin: `docs/brainstorms/2026-05-18-text-counter-image-extraction-and-templates-brainstorm.md`
- Prior art (mini-app + Postgres + image upload): `docs/plans/2026-05-12-001-feat-image-library-mini-app-plan.md`
- Prior art (existing text-counter): `docs/plans/2026-05-14-001-feat-text-counter-mini-app-plan.md`
- PrimeFlex regression note (PrimeFlex is NOT installed; Tailwind only): `docs/solutions/ui-bugs/primeflex-classes-not-available-in-primeng-v20-tailwind-stack-2026-04-01.md`
- Project rules: `CLAUDE.md`, `AGENTS.md`, `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `apps/web/src/app/mini-apps/text-counter/AGENTS.md`, `PRD_DEFAULTS.md`
