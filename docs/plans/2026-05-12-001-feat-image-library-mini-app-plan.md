---
title: 'feat: Add image-library mini-app'
type: feat
status: active
date: 2026-05-12
origin: docs/brainstorms/2026-05-12-image-library-brainstorm.md
---

# feat: Add image-library mini-app

## Summary

Scaffold a new `image-library` mini-app via the existing `CreateApp` console (with a manual controller-path fix to support per-space scoping), store images in a per-app Postgres schema with tags as `text[]` + GIN index, reuse `S3Service` for storage, and implement the web layer by extending the `site-scraper-home` page pattern with PrimeNG autocomplete chips, Web Share API, and a canvas-based Clipboard image-paste helper.

---

## Problem Frame

The brainstorm origin establishes the user-facing problem (Slack/Drive-based image sharing is unstructured, no fast tag filter, no fast path to AI chat). This plan executes that work as the first per-space mini-app in the repo — see origin for full context.

---

## Requirements

Carried from origin (`docs/brainstorms/2026-05-12-image-library-brainstorm.md`):

- R1. Per-space library route, accessible only to space members.
- R2. Grid view, newest-first default sort.
- R3. User-controlled page-size selector with at least three options; selection persists per user.
- R4. Desktop and mobile uploads (file picker + camera).
- R5. Accept PNG / JPEG / WebP / GIF; clear inline error on oversize.
- R6. Free-form tags; no fixed taxonomy.
- R7. Tag autocomplete suggests existing tags from the current space.
- R8. Tag matching is case-insensitive.
- R9. Filter by selected tags using AND logic.
- R10. "ALL" control clears all active filters.
- R11. Share action: Web Share API on mobile, `mailto:` / `sms:` / "Copy link" on desktop.
- R12. "Copy image" places image bytes on the OS clipboard for AI-chat paste.
- R13. Download action saves the original file.

**Origin actors:** A1 (uploader), A2 (viewer), A3 (external recipient).
**Origin flows:** F1 (upload with tags), F2 (find and share), F3 (copy into AI chat).
**Origin acceptance examples:** AE1 (R9, R10), AE2 (R7, R8), AE3 (R11), AE4 (R12), AE5 (R5).

---

## Scope Boundaries

- No cross-space or global library.
- No shared `_platform/assets` module or cross-app `source` flag.
- No folders / albums / collections.
- No version history, approvals, rights/licensing, or watermarking.
- No backend-sent email or SMS.
- No built-in image editing.
- No comments / reactions / @mentions.
- No bulk multi-select operations.
- No external imports (Slack / Drive / Dropbox / DAM sync).
- No moderation gate before an upload is visible.
- No image-level ACLs — visibility is "every space member sees every image."
- No upload-role-gating.

### Deferred to Follow-Up Work

- **HEIC server-side transcode**: rejected in v1 with a friendly error; transcoding via `sharp`/libvips deferred to a future PR.
- **Server-side thumbnails / responsive variants**: v1 serves originals directly via signed URLs.
- **Keyset pagination / infinite scroll**: offset pagination in v1.
- **Migrate `document-converter` to a shared assets module**: outside this plan; only considered if a second consumer materializes.
- **Per-user "my uploads" filter / activity feed**.

---

## Context & Research

### Relevant Code and Patterns

- Mini-app module pattern: `apps/api/src/mini-apps/site-scraper/site-scraper.module.ts` (markers `// MINIAPP_ENTITY_IMPORT` / `// MINIAPP_ENTITY_REF`).
- Mini-app aggregator: `apps/api/src/mini-apps/mini-apps.module.ts` (markers `// MINIAPP_MODULES_IMPORT` / `// MINIAPP_MODULES_REF`).
- Reference controller (upload + S3 + cleanup): `apps/api/src/mini-apps/document-converter/document-converter.controller.ts` (lines 115-200 in the upload path).
- File validation primer: `apps/api/src/mini-apps/document-converter/services/file-validation.service.ts` (magic-byte + mime + filename hardening; image variant follows the same shape).
- S3 primitives: `AwsS3Service` at `apps/api/src/_core/third-party/aws/aws.s3.service.ts` (re-exported as `AwsS3Service` via `apps/api/src/_platform/aws/index.ts`).
- App-access guard (API): `apps/api/src/_platform/guards/has-app-access.guard.ts` (requires `:orgId` in route).
- Space-access guard (API): `apps/api/src/space/guards/space-access.guard.ts` (requires `:spaceId` or `:id` in route).
- App-access guard (web): `apps/web/src/app/shared/guards/app-access.guard.ts` (reads `route.url[0].path` as app key).
- Web page reference (grid + paginator): `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-home/site-scraper-home.component.{ts,html}`.
- Web upload reference: `apps/web/src/app/mini-apps/document-converter/components/document-converter.component.ts` (uses `p-fileUpload [customUpload]`).
- Schema bootstrap: `apps/api/src/_platform/database/schema-bootstrap.service.ts` (creates per-app schemas from `apps/mini-apps.json`).
- Console generators: `apps/api/src/console/create-app.console.ts`, `apps/api/src/console/add-app-entity.console.ts`, templates under `apps/api/src/console/partials/mini-app/`.

### Institutional Learnings

- **PrimeFlex is NOT installed.** `docs/solutions/ui-bugs/primeflex-classes-not-available-in-primeng-v20-tailwind-stack-2026-04-01.md` — use Tailwind v4 utilities throughout. The image grid uses `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4` directly on the parent, no `col-*` wrapper divs.

### External References

- PrimeNG v20 AutoComplete (chip-input mode via `[multiple]="true"`): used for both filter chips and tag editor.
- W3C Clipboard API (`navigator.clipboard.write` + `ClipboardItem`) — required for `image/png` clipboard write on Chrome / Edge / Safari 16+ / Firefox.
- Web Share API (`navigator.canShare`, `navigator.share`) with `files` payload — mobile Safari/Chrome supported; desktop falls back to mailto/sms/copy-link.

---

## Key Technical Decisions

- **Self-contained mini-app, not a shared assets module**: matches the existing mini-app isolation rule in `CLAUDE.md`. Rationale carried from origin.
- **API path: `organization/:orgId/space/:spaceId/apps/image-library`**: keeps `HasAppAccessGuard` (`:orgId`) and `SpaceAccessGuard` (`:spaceId`) both wired. The `CreateApp` console writes `@Controller('apps/<name>')` which fails the access guard — manual rewrite required after scaffold (captured in U1).
- **Web route: `/apps/image-library/:spaceId`**: keeps `appAccessGuard` happy (it reads `route.url[0].path`) and threads space context. Entry from launcher without `:spaceId` resolves to a space picker or auto-redirects.
- **Tag storage: `text[]` column + GIN index** on `image_assets.tags`. Filter via `tags @> ARRAY[$1, …]` for AND logic. Tag autocomplete queries `unnest(tags)` across the current space with `ILIKE`.
- **Pagination: offset-based** via PrimeNG's built-in `p-table [paginator]`. Keyset pagination deferred.
- **Page-size persistence: `localStorage`** keyed by `il:pageSize:<spaceId>`. Server-side user settings deferred.
- **File-validation service is image-specific** — copies the document-converter pattern but allow-lists PNG / JPEG / WebP / GIF only. Magic-byte verification is mandatory (mime header can lie).
- **HEIC rejected in v1** with a clear message ("Convert to JPEG or set iOS Camera → Formats → Most Compatible"). Server-side transcode deferred.
- **Size cap: 25 MB** per file. Sync request/response; no progress streaming, no worker queue.
- **Share strategy**: `navigator.canShare({ files: […] })` first; on failure fall back to `mailto:` (signed URL in body, not a data URL — mail clients strip those) and `sms:` (mobile only). `mailto:` will NOT carry the image as an attachment; users get a link.
- **Clipboard image strategy**: fetch the signed URL into a Blob → draw onto a `<canvas>` → `canvas.toBlob('image/png')` → write to clipboard as `ClipboardItem`. Always re-encode to PNG for consistent ingestion across Claude / ChatGPT / Gemini.
- **Delete authorization**: any space member can delete any image in their space (consistent with "no upload-role-gating" in origin Scope Boundaries). Audit log can be added later if needed.
- **FK constraint prefix `fk_il_`** and index prefix `idx_il_` to stay under Postgres's 63-char limit and match the existing `fk_dc_*` / `fk_ss_*` convention.

---

## Open Questions

### Resolved During Planning

- **Tag storage shape**: `text[]` + GIN (vs. join table). Resolved.
- **Pagination mechanism**: offset (vs. keyset / scroll). Resolved.
- **Page-size persistence**: `localStorage` (vs. server-side user settings). Resolved.
- **HEIC in v1**: reject (vs. accept-and-transcode). Resolved.
- **Mailto: image attach**: not viable; URL-only. Resolved.
- **Clipboard re-encode**: always PNG (vs. preserve original). Resolved.

### Deferred to Implementation

- **Default page-size value**: 25 vs. 50. Pick once the grid layout is visible at typical viewports.
- **Signed URL TTL**: likely 1 hour; confirm against any caching concerns at runtime.
- **Whether the "home" route `/apps/image-library` (no `:spaceId`) auto-redirects to the user's only space or shows a picker**. Depends on how many spaces the typical user has — defer until first test in WPP Open.
- **Whether to surface upload progress on desktop**. Doc-converter does not; the existing pattern is no-progress. Revisit if 25 MB feels slow at runtime.
- **Whether `Content-Disposition: attachment; filename=...` on the signed URL is enough for mobile Safari to "Save to Photos"**, or whether we need an explicit blob-download fallback.

---

## Output Structure

```text
apps/api/src/mini-apps/image-library/
├── AGENTS.md
├── image-library.module.ts
├── image-library.controller.ts
├── image-library.controller.spec.ts
├── entities/
│   └── image-asset.entity.ts
├── dtos/
│   ├── index.ts
│   ├── upload-image.dto.ts
│   ├── list-images-query.dto.ts
│   ├── image-response.dto.ts
│   └── tag-suggest-query.dto.ts
└── services/
    ├── index.ts
    ├── image-library.service.ts
    ├── image-library.service.spec.ts
    ├── image-file-validation.service.ts
    └── image-file-validation.service.spec.ts

apps/web/src/app/mini-apps/image-library/
├── AGENTS.md
├── image-library.routes.ts
├── pages/
│   └── image-library-home/
│       ├── image-library-home.component.ts
│       ├── image-library-home.component.html
│       ├── image-library-home.component.scss
│       └── image-library-home.component.spec.ts
├── components/
│   ├── image-upload/
│   │   ├── image-upload.component.ts
│   │   ├── image-upload.component.html
│   │   ├── image-upload.component.scss
│   │   └── image-upload.component.spec.ts
│   ├── image-detail-dialog/
│   │   ├── image-detail-dialog.component.ts
│   │   ├── image-detail-dialog.component.html
│   │   ├── image-detail-dialog.component.scss
│   │   └── image-detail-dialog.component.spec.ts
│   └── tag-chip-input/
│       ├── tag-chip-input.component.ts
│       ├── tag-chip-input.component.html
│       └── tag-chip-input.component.spec.ts
├── services/
│   ├── image-library.service.ts
│   ├── image-library.service.spec.ts
│   └── util/
│       ├── image-clipboard.util.ts
│       ├── image-clipboard.util.spec.ts
│       ├── image-share.util.ts
│       └── image-share.util.spec.ts

apps/api/migrations/
└── <timestamp>-CreateImageLibrarySchema.ts
```

The migration timestamp is generated at run time. The file layout is a scope declaration — the implementer may merge or split files as the work reveals natural seams.

---

## Implementation Units

### U1. Scaffold image-library mini-app and fix per-space controller path

**Goal:** Generate API + web skeleton via the `CreateApp` console, then rewrite the generated controller to use the per-space path with both access guards attached.

**Requirements:** R1.

**Dependencies:** None.

**Files:**
- Create (via generator): `apps/api/src/mini-apps/image-library/{image-library.module.ts,image-library.controller.ts,image-library.service.ts,AGENTS.md}`
- Create (via generator): `apps/web/src/app/mini-apps/image-library/{image-library.routes.ts,services/image-library.service.ts,AGENTS.md,pages/image-library-home/image-library-home.component.ts,components/}`
- Modify (via generator): `apps/mini-apps.json` (entry added; generator hardcodes `icon: 'pi pi-box'`), `apps/api/src/mini-apps/mini-apps.module.ts` (markers replaced), `apps/web/src/app/app.routes.ts` (marker replaced).
- Modify (manual): `apps/mini-apps.json` — change the new entry's `icon` from `pi pi-box` to `pi pi-images` (the generator at `apps/api/src/console/create-app.console.ts` does not prompt for an icon).
- Modify (manual): `apps/api/src/mini-apps/image-library/image-library.controller.ts` — change `@Controller('apps/image-library')` to `@Controller('organization/:orgId/space/:spaceId/apps/image-library')`, add `@UseGuards(AuthGuard('jwt'), HasAppAccessGuard, SpaceAccessGuard)` at class level, add `@RequiresApp('image-library')`.
- Modify (manual): `apps/api/src/mini-apps/image-library/image-library.module.ts` — import `SpaceModule` (or equivalent) so `SpaceAccessGuard` resolves its `SpaceUserService` + `SpaceService` deps.
- Modify (manual): `apps/web/src/app/mini-apps/image-library/image-library.routes.ts` — set the home route to `:spaceId`.

**Approach:**
- Run `npm run console:dev CreateApp`, answer name `image-library`, display name `Image Library`, description "Per-space image library for upload, tag, find, and share", icon `pi pi-images`, sample entity = no.
- Verify the rollback path runs cleanly if the generator fails.
- After scaffold, rewrite the controller's class-level decorators to the per-space shape and import deps in the module.
- Boot the API locally to confirm `SchemaBootstrapService` creates the `image_library` schema.

**Patterns to follow:**
- `apps/api/src/mini-apps/site-scraper/site-scraper.module.ts` — class-level guard composition + `@RequiresApp` usage.
- `apps/api/src/mini-apps/site-scraper/site-scraper.controller.ts` — `:orgId` in the controller path.

**Test scenarios:**
- Test expectation: none — pure scaffold. (Verification block covers the smoke check.)

**Verification:**
- `npm run start:dev` boots without errors.
- `psql` shows `image_library` schema exists (created by `SchemaBootstrapService`).
- Web build succeeds; `/apps/image-library/<some-space-id>` resolves to the placeholder home page when the app is enabled for the org.
- `GET /organization/:orgId/space/:spaceId/apps/image-library/health` (or whatever stub the generator wrote) returns 200 only when the caller is a member of the space and the org has the app enabled; 403 otherwise.

---

### U2. ImageAsset entity, DTOs, and schema migration

**Goal:** Define the persistent shape for image rows and wire it into the mini-app module.

**Requirements:** R1, R2, R4, R6, R9.

**Dependencies:** U1.

**Files:**
- Create: `apps/api/src/mini-apps/image-library/entities/image-asset.entity.ts`
- Create: `apps/api/src/mini-apps/image-library/dtos/upload-image.dto.ts`
- Create: `apps/api/src/mini-apps/image-library/dtos/list-images-query.dto.ts`
- Create: `apps/api/src/mini-apps/image-library/dtos/image-response.dto.ts`
- Create: `apps/api/src/mini-apps/image-library/dtos/tag-suggest-query.dto.ts`
- Create: `apps/api/src/mini-apps/image-library/dtos/index.ts` (barrel)
- Modify: `apps/api/src/mini-apps/image-library/image-library.module.ts` — replace `// MINIAPP_ENTITY_IMPORT` / `// MINIAPP_ENTITY_REF` (or run `npm run console:dev AddAppEntity image-library ImageAsset` and then hand-edit the entity).
- Create: `apps/api/migrations/<timestamp>-CreateImageLibrarySchema.ts` — adds the GIN index on `tags` (TypeORM `@Index` cannot express GIN cleanly). Source migrations live in `apps/api/migrations/` as TypeScript; `apps/api/src/migrations-js/*.js` is the compiled runtime path consumed by TypeORM, not a source location.

**Approach:**
- Entity columns: `id` (uuid PK), `organizationId` (uuid, FK → `organizations.id`, `fk_il_image_org`), `spaceId` (uuid, FK → `spaces.id`, `fk_il_image_space`), `userId` (uuid, FK → `users.id`, uploader, `fk_il_image_user`), `s3Key` (text, not null), `mime` (text, not null), `sizeBytes` (int, not null), `originalFilename` (text, not null), `tags` (text[], not null, default `'{}'`), `createdAt` / `updatedAt`.
- Indices: btree `(spaceId, createdAt DESC)` named `idx_il_images_space_recent`; GIN on `tags` named `idx_il_images_tags`; btree `(organizationId)` named `idx_il_images_org`.
- Entity decorator: `@Entity({ name: 'image_assets', schema: 'image_library' })`.
- DTOs:
  - `UploadImageDto`: `tags?: string[]` (max 50 tags, max 40 chars each, normalize to lowercase-trim before persist? — defer normalization decision to U3 implementation).
  - `ListImagesQueryDto`: `tags?: string[]`, `page?: number` (default 1), `pageSize?: number` (default 25, max 100), `sort?: 'newest' | 'oldest'` (default `newest`).
  - `ImageResponseDto`: `id`, `signedUrl`, `mime`, `sizeBytes`, `originalFilename`, `tags`, `createdAt`, `uploadedBy { id, email }`.
  - `TagSuggestQueryDto`: `q?: string`, `limit?: number` (default 20, max 50).

**Patterns to follow:**
- `apps/api/src/mini-apps/site-scraper/entities/scrape-job.entity.ts` — FK names, `toPublic()` helper, `@Index` usage where btree suffices.
- `apps/api/src/mini-apps/document-converter/dtos/upload-file.dto.ts` — class-validator decorators on DTO fields (mirror exact decorators used there).

**Test scenarios:**
- Happy: persist a row with `tags: ['Brand', 'Smirnoff']`, read back, verify `tags` round-trips as an array.
- Happy: persist with `tags: []` (default).
- Edge: persist with 50 tags (the cap).
- Edge: reject DTO with 51 tags via class-validator.
- Integration: GIN index exists post-migration (`SELECT indexname FROM pg_indexes WHERE tablename = 'image_assets' AND indexname = 'idx_il_images_tags'`).

**Verification:**
- TypeORM startup logs show no schema-sync drift in `synchronize` mode.
- Migration applies cleanly on a fresh DB.
- Repository can save and retrieve an `ImageAsset` row.

---

### U3. Upload endpoint with image-specific validation and S3 cleanup

**Goal:** Accept a multipart image upload, validate it (size, mime, magic bytes, filename), push to S3, persist the row, and clean up on failure.

**Requirements:** R4, R5, R6.

**Dependencies:** U2.

**Files:**
- Modify: `apps/api/src/mini-apps/image-library/image-library.controller.ts` — add `POST /images` handler.
- Create: `apps/api/src/mini-apps/image-library/services/image-library.service.ts` — `createImage(orgId, spaceId, userId, file, tags)`.
- Create: `apps/api/src/mini-apps/image-library/services/image-file-validation.service.ts` — `validate(file)`.
- Create: `apps/api/src/mini-apps/image-library/services/image-file-validation.service.spec.ts`.
- Create: `apps/api/src/mini-apps/image-library/services/image-library.service.spec.ts`.
- Modify: `apps/api/src/mini-apps/image-library/image-library.module.ts` — register both services.

**Approach:**
- Handler uses `FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } })`.
- Body field `tags` parsed as a JSON-string array (mirrors how doc-converter passes side-data with the multipart payload).
- `ImageFileValidationService.validate()`:
  1. Reject empty files and size-mismatch (buffer length vs. reported size).
  2. Sanitize filename (no null bytes, no control chars, no path traversal — copy from `FileValidationService`).
  3. Mime-type allow-list: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
  4. Extension allow-list: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`.
  5. Magic-byte check against the first N bytes per format.
  6. Detect HEIC via magic bytes (`ftypheic` / `ftypheix` / `ftypmif1`) and return a *specific* user-friendly error indicating the format isn't supported in v1.
- On validation success:
  - `s3Key = ${appPrefix}/${spaceId}/${uuid}.${ext}` where `appPrefix = 'image-library'`.
  - `AwsS3Service.upload({ key, buffer, contentType, metadata: { orgId, spaceId, userId } })`.
  - Persist row.
  - On row-insert failure, explicit `S3Service.delete(key)` before re-throwing (mirrors `document-converter.controller.ts:187-199`).
- Response: 201 with `ImageResponseDto` (no need to issue the signed URL on upload — caller can re-list).

**Technical design (directional only; this is approach, not code):**

```text
Request
  │
  ▼
FileInterceptor (memory, 25MB cap, single file)
  │
  ▼
Guards (Jwt → HasAppAccess(orgId, image-library) → SpaceAccess(spaceId))
  │
  ▼
ImageFileValidationService.validate(file)
  ├── empty?           → 400 EmptyFile
  ├── size mismatch?   → 400 InvalidUpload
  ├── filename unsafe? → 400 InvalidFilename
  ├── mime not allowed → 400 UnsupportedMime
  ├── magic = HEIC     → 415 HeicNotSupportedInV1 (specific message)
  ├── magic mismatch   → 400 MimeMagicMismatch
  └── ok
       │
       ▼
AwsS3Service.upload(key, buffer, contentType, metadata)
       │
       ▼
repo.save(ImageAsset)
       │
       ├── ok → 201 ImageResponseDto
       └── fail → AwsS3Service.delete(key) → rethrow
```

**Patterns to follow:**
- `apps/api/src/mini-apps/document-converter/document-converter.controller.ts` lines 115-200.
- `apps/api/src/mini-apps/document-converter/services/file-validation.service.ts` — magic-byte tables.

**Test scenarios:**
- Happy: PNG, 1 MB, tags `['brand', 'smirnoff']` → 201 + row exists + S3 object exists at expected key.
- Happy: JPEG without tags → 201 + tags persisted as `[]`.
- Happy: WebP and GIF round-trip cleanly.
- Edge: 25 MB exactly → 201. 25 MB + 1 byte → 413.
- Edge: 0-byte file → 400.
- Edge: filename `../../etc/passwd.png` → 400 (sanitized).
- Edge: 50 tags → 201; 51 tags → 400 (class-validator).
- Error: **Covers AE5 (oversize → inline error).** Oversize upload returns a clear error naming the file and the limit.
- Error: PDF disguised as `image/png` → 400 (magic-byte mismatch); S3 untouched.
- Error: HEIC upload → 415 with a message that mentions the iOS Camera Format setting; S3 untouched.
- Error: Non-member of `:spaceId` → 403 (SpaceAccessGuard).
- Error: Org does not have `image-library` enabled → 403 (HasAppAccessGuard).
- Integration: simulate row-insert failure (mock repo to throw); verify `S3Service.delete` is called with the same key before the error propagates.

**Verification:**
- Upload-curl against a local API attaches an image and returns 201.
- The S3 object exists at `image-library/<spaceId>/<uuid>.png`.
- DB row links org / space / user / tags correctly.

---

### U4. List, filter, delete, and tag-suggest endpoints

**Goal:** Read-side endpoints supporting filtered listing with pagination, single delete (with S3 cleanup), and tag autocomplete.

**Requirements:** R2, R3, R6, R7, R8, R9, R10.

**Dependencies:** U3.

**Files:**
- Modify: `apps/api/src/mini-apps/image-library/image-library.controller.ts` — add `GET /images`, `DELETE /images/:id`, `GET /tags`.
- Modify: `apps/api/src/mini-apps/image-library/services/image-library.service.ts` — add `listImages`, `deleteImage`, `suggestTags`.
- Modify: `apps/api/src/mini-apps/image-library/services/image-library.service.spec.ts`.

**Approach:**
- `GET /images`: parse `ListImagesQueryDto`. SQL via TypeORM query builder uses `where("space_id = :spaceId AND organization_id = :orgId")` plus `andWhere("tags @> :tags::text[]", { tags })` when filters present. Order by `createdAt DESC`. Pagination via offset (`page`, `pageSize`). Each row maps to `ImageResponseDto` with a fresh signed URL (`AwsS3Service.generatePresignedUrl({ key, expiresIn: 3600, responseContentDisposition: 'attachment; filename="..."' })`).
- `DELETE /images/:id`: lookup row by `(id, spaceId, organizationId)`; if missing → 404. Delete S3 object first, then the row. If S3 delete fails with `NoSuchKey`, swallow and continue (cleanup is best-effort). Other S3 errors abort and surface.
- `GET /tags`: case-insensitive substring match against the current space's existing tags. SQL: `SELECT tag, COUNT(*) AS uses FROM (SELECT DISTINCT id, unnest(tags) AS tag FROM image_library.image_assets WHERE space_id = $1 AND organization_id = $2) t WHERE ($3 = '' OR tag ILIKE '%' || $3 || '%') GROUP BY tag ORDER BY uses DESC, tag ASC LIMIT $4`. Returns `[{ tag, uses }]` so the web can rank popular tags.

**Patterns to follow:**
- `apps/api/src/mini-apps/site-scraper/site-scraper.service.ts` for list/query-builder usage.
- Same signed-URL pattern as `apps/api/src/mini-apps/document-converter/document-converter.controller.ts` download paths.

**Test scenarios:**
- Happy: list returns newest-first with default page 1, size 25.
- Happy: list with `tags=['brand']` returns only images carrying that tag.
- Happy: **Covers AE1.** list with `tags=['bar', 'brand:smirnoff']` returns only images with BOTH; list with `tags=[]` returns all images (the "ALL" behavior).
- Happy: each item's `signedUrl` resolves with a 200 from S3 within the TTL.
- Edge: `pageSize=100` honored; `pageSize=200` clamped to 100 (DTO validator).
- Edge: `page=0` rejected (DTO validator).
- Edge: filter that matches nothing returns `total: 0`, `items: []`.
- Error: delete of image in a different space → 404.
- Error: delete by non-member of the space → 403.
- Integration: deleting an image removes both the DB row and the S3 object; subsequent GET returns 404.
- Integration: deleting an image whose S3 object is already gone (mock S3 to throw `NoSuchKey`) succeeds and removes the row.
- Happy: **Covers AE2.** tag-suggest with `q=bra` matches `Brand` and `brand:smirnoff` case-insensitively; results ordered by use-count desc, then alpha.
- Edge: tag-suggest with `q=''` returns the top tags in the space.
- Edge: tag-suggest with no images returns `[]`.

**Verification:**
- `curl` round-trip against local API returns expected shapes.
- Postgres EXPLAIN on the list query shows the GIN index used when `tags` filter is present.

---

### U5. Web — library home page (grid, tag filter, page size, ALL)

**Goal:** Browse-and-filter UI for a space's library.

**Requirements:** R1, R2, R3, R6, R7, R8, R9, R10.

**Dependencies:** U4.

**Files:**
- Modify: `apps/web/src/app/mini-apps/image-library/pages/image-library-home/image-library-home.component.{ts,html,scss}`
- Create: `apps/web/src/app/mini-apps/image-library/pages/image-library-home/image-library-home.component.spec.ts`
- Modify: `apps/web/src/app/mini-apps/image-library/services/image-library.service.ts` — `listImages`, `suggestTags`, `deleteImage`.
- Create: `apps/web/src/app/mini-apps/image-library/services/image-library.service.spec.ts`
- Create: `apps/web/src/app/mini-apps/image-library/components/tag-chip-input/tag-chip-input.component.{ts,html,spec.ts}` — wraps `p-autoComplete [multiple]="true"`, accepts a `suggest$` callback so it can be reused in upload + detail dialogs.
- Modify: `apps/web/src/app/mini-apps/image-library/image-library.routes.ts` — path `:spaceId`.

**Approach:**
- Standalone component using signals; read `:spaceId` from `route.paramMap`.
- State signals: `images`, `loading`, `total`, `selectedTags`, `pageSize` (init from `localStorage.getItem('il:pageSize:<spaceId>')` || `25`), `page` (default 1).
- On `selectedTags` / `pageSize` / `page` change → debounced re-fetch.
- Filter chip-input via `<app-tag-chip-input>` wrapping `p-autoComplete [multiple]="true"`; `(completeMethod)` calls `service.suggestTags(spaceId, q)`.
- "ALL" button: clears `selectedTags` and refetches.
- Page-size: `p-select` with `[25, 50, 100]`; on change writes to `localStorage` and refetches.
- Grid: Tailwind v4 `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`. Each card uses `p-card` with thumbnail-from-signed-URL, filename truncated, tag chips (`p-tag`), and a click handler that opens the image-detail dialog (U6).
- Skeleton: 8 `p-skeleton` cards during initial fetch.
- Empty state: `p-message` "No images yet" + a prompt to upload.

**Patterns to follow:**
- `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-home/site-scraper-home.component.{ts,html}` — page-size selector, table+paginator pattern.
- `apps/web/src/app/mini-apps/wpp-open-agent-updater/components/task-form/task-form.component.ts` — signal-based component patterns.

**Test scenarios:**
- Happy: route `/apps/image-library/<spaceId>` triggers a list call with the right `spaceId` and default page-size.
- Happy: selecting two tags refetches with `tags=['brand','smirnoff']` and renders only the filtered results.
- Happy: clicking "ALL" clears the chip-input and refetches.
- Happy: changing `pageSize` to 50 persists to `localStorage` and refetches.
- Edge: `localStorage` value is corrupted (`'abc'`) → component falls back to default 25.
- Edge: empty list renders the empty state, not the grid.
- Error: list call fails → shows a `p-message` with retry; does not throw uncaught.
- Integration: tag-chip-input `completeMethod` debounces calls and de-duplicates rapid keystrokes.

**Verification:**
- Visit `/apps/image-library/<spaceId>` in the running dev server; grid loads, filter works, page-size persists across a hard refresh.
- Lighthouse / DevTools: no console errors, no `::ng-deep`, no hardcoded colors.

---

### U6. Web — upload, image detail, share, copy, download, delete

**Goal:** Complete the user-facing actions for an image: upload (with optional tags), view detail, edit tags, share, copy-to-clipboard, download, delete.

**Requirements:** R4, R5, R11, R12, R13.

**Dependencies:** U5.

**Files:**
- Create: `apps/web/src/app/mini-apps/image-library/components/image-upload/image-upload.component.{ts,html,scss,spec.ts}`
- Create: `apps/web/src/app/mini-apps/image-library/components/image-detail-dialog/image-detail-dialog.component.{ts,html,scss,spec.ts}`
- Create: `apps/web/src/app/mini-apps/image-library/services/util/image-clipboard.util.ts` + `.spec.ts`
- Create: `apps/web/src/app/mini-apps/image-library/services/util/image-share.util.ts` + `.spec.ts`
- Modify: `apps/web/src/app/mini-apps/image-library/pages/image-library-home/image-library-home.component.{ts,html}` — host the upload component and the detail dialog.

**Approach:**

*Upload UI*
- `p-fileUpload [customUpload]="true" [multiple]="false" accept="image/png,image/jpeg,image/webp,image/gif"` with `[capture]="'environment'"` on the underlying `<input>` for mobile camera support. The component runs its own `(uploadHandler)` that:
  1. Reads file, optionally surfaces the size cap inline before POST.
  2. Posts FormData with the file and `tags` field (JSON-stringified array from the chip input).
  3. On success → emit `imageCreated` so the home page prepends the new row.
  4. On error → toast via `MessageService` with the server's user-friendly message (HEIC, oversize, mime mismatch).

*Detail dialog*
- Triggered by clicking a card. Shows the full-size image (signed URL), filename, uploader, created date, tag editor (`<app-tag-chip-input>` with current tags pre-populated; saving tags is deferred — see Open Questions), and an action bar:
  - **Download** — `<a [href]="signedUrl" [download]="originalFilename">`.
  - **Share** — calls `imageShareUtil.share(image)`; opens OS share sheet when supported, else opens a small popover with "Email", "Text" (mobile only), "Copy link".
  - **Copy image** — calls `imageClipboardUtil.copyImageToClipboard(signedUrl)`; toast on success; on failure (permission denied / unsupported), falls back to "Copy link" and a warning toast.
  - **Delete** — `confirmDialog` → `service.deleteImage` → close dialog → remove row from home grid.

*Share util*

```text
share(image):
  if navigator.canShare?({ files: [File] }):
    fetch(signedUrl) → blob → new File(...)
    return navigator.share({ files: [file], title: filename })
  else:
    return ShareFallbackPayload {
      url: signedUrl,
      mailto: `mailto:?subject=${encodeURIComponent(filename)}&body=${encodeURIComponent(signedUrl)}`,
      sms:   isMobile ? `sms:?body=${encodeURIComponent(signedUrl)}` : null,
    }
```

The dialog renders the fallback payload as a small popover when the util returns it.

*Clipboard util*

```text
copyImageToClipboard(signedUrl):
  blob = fetch(signedUrl).then(r => r.blob())
  if blob.type === 'image/png':
    item = new ClipboardItem({ 'image/png': blob })
  else:
    canvas = decodeBlobToCanvas(blob)
    pngBlob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    item = new ClipboardItem({ 'image/png': pngBlob })
  await navigator.clipboard.write([item])
```

This is directional. The implementer should handle revoking the object URL after decode and trap clipboard rejections to surface the fallback.

**Patterns to follow:**
- `apps/web/src/app/mini-apps/document-converter/components/document-converter.component.ts` — `p-fileUpload [customUpload]` + error toast handling.
- `apps/web/src/app/pages/my-account/my-account.page.ts` (just shipped) — clipboard error handling and toast pattern.

**Test scenarios:**

Upload:
- Happy: PNG upload posts FormData with `file` and `tags` fields; on 201, `imageCreated` emits the new image; toast "Uploaded".
- Error: oversize file → server returns 413; toast shows the file name and "max 25 MB"; nothing is added to the grid.
- Error: HEIC file → server returns 415 with the HEIC-specific message; toast shows that message verbatim.

Share:
- Happy: with `navigator.canShare` true, calls `navigator.share` with a `files` payload; emits `shared` once promise resolves.
- Happy: with `canShare` false, returns the fallback payload; "Email" link opens the user's mail client with subject and signed URL in body; on desktop the SMS option is absent.
- Edge: `navigator.share` rejects with `AbortError` (user cancels) — no toast, no error surfaced.

Copy:
- Happy: **Covers AE4.** With an `image/png` source, writes a single `ClipboardItem` with `image/png`; toast "Image copied".
- Happy: With a `image/webp` source, canvas re-encodes to `image/png` then writes to clipboard.
- Error: clipboard permission denied → falls back to writing the signed URL as text; warning toast "Couldn't copy image — copied link instead."
- Error: `ClipboardItem` not supported (very old browser) → same fallback; warning toast.

Download:
- Happy: anchor with `download` attribute triggers browser save; filename matches `originalFilename`.

Delete:
- Happy: confirm-dialog "Delete this image?" → API call → dialog closes → row removed from grid.
- Error: API delete fails → toast; row stays.

**Verification:**
- Manual end-to-end: upload from desktop drag-drop, upload from iPhone camera (via Safari), filter, share via OS share sheet on iPhone, copy on macOS Chrome and paste into Claude → image attaches.
- Karma tests pass.

---

## System-Wide Impact

- **Interaction graph:** New schema `image_library` joined into `SchemaBootstrapService`'s startup loop (via `apps/mini-apps.json` registration). New entity registered via TypeORM `autoLoadEntities`. New route segment under `apps/` parent on web. No changes to existing mini-apps.
- **Error propagation:** Validation errors surface as 400/413/415 with user-friendly bodies; API guards (jwt/app-access/space-access) follow existing 401/403 conventions. Web converts these to `MessageService` toasts with the server message text.
- **State lifecycle risks:** Orphan S3 objects on row-insert failure are explicitly cleaned up in `createImage`. Best-effort S3 cleanup on delete (NoSuchKey is non-fatal). No background workers, so no partial-state risk from interrupted jobs.
- **API surface parity:** `image-library` is the first per-space mini-app. Future per-space mini-apps should reuse the `:orgId/space/:spaceId/apps/<name>` shape. No changes to existing per-org mini-apps' contracts.
- **Integration coverage:** `image-library.controller.spec.ts` tests should exercise the validation/upload/cleanup path with mocked S3 (matches doc-converter test posture). Manual cross-browser test for clipboard + share is required since unit mocks cannot prove that paste-into-Claude works.
- **Unchanged invariants:** `HasAppAccessGuard`, `appAccessGuard`, `SchemaBootstrapService`, `SpaceAccessGuard`, `S3Service`, `MessageService`, `PrimeNgModule` — all consumed unchanged. `apps/mini-apps.json` only gains a row, no existing rows touched.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `CreateApp` generator writes an org-scoped controller path; missing this manual rewrite would silently bypass `SpaceAccessGuard`. | U1 makes the manual rewrite a named step with a verification check (403 for non-member). |
| Clipboard image-write support varies — older Safari/Firefox may reject `ClipboardItem` with `image/png`. | Util traps the rejection and falls back to "Copy link" with a warning toast (U6). |
| `mailto:` cannot reliably carry an attachment; users may expect it to. | Subject says "Image link" and body includes the signed URL; dialog UI labels the action "Email link" not "Email image" to set expectations. |
| Signed URLs expire (default 1h). A user who emails or texts a link and the recipient opens it 2h later sees 403. | Signed URLs are explicitly time-bounded; we accept this in v1 and document it. v2 could regenerate fresh URLs server-side via a redirect endpoint. |
| HEIC rejection blocks iPhone users with default camera settings. | Friendly error message names the iOS Camera → Formats → Most Compatible setting. v2 transcode is in Deferred. |
| Per-space schema bootstrap depends on `apps/mini-apps.json` registration running before TypeORM migrations on first boot. | `SchemaBootstrapService` already runs at startup; verify in U1 that the new schema is created before the migration runs. |
| GIN index on `tags` slows write throughput. | Upload-heavy use is rare; the index pays off on every filter query. Accept the trade. |

---

## Documentation / Operational Notes

- `apps/api/src/mini-apps/image-library/AGENTS.md` is auto-generated by `CreateApp`; review and tighten it after U1 if the partial leaves filler.
- Update `apps/web/src/app/mini-apps/image-library/AGENTS.md` similarly.
- No new env vars; no new infra.
- Heroku deploy unchanged — pushing to `main` triggers the existing API + Web workflows (memory: `vml-ai-labs-api` and `vml-ai-labs-web`).
- Operational expectation: S3 bucket capacity grows linearly with upload volume; monitor via existing AWS dashboards. No per-image retention policy in v1.
- After landing, capture decisions worth preserving (space-scoping pattern, tag storage choice, clipboard fallback strategy) via `/ce-compound` so the next per-space mini-app inherits the path.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-12-image-library-brainstorm.md](docs/brainstorms/2026-05-12-image-library-brainstorm.md)
- Mini-app pattern: `apps/api/src/mini-apps/site-scraper/`, `apps/api/src/mini-apps/document-converter/`
- Console generators: `apps/api/src/console/create-app.console.ts`, `apps/api/src/console/add-app-entity.console.ts`
- S3 primitives: `apps/api/src/_core/third-party/aws/aws.s3.service.ts`
- Guards: `apps/api/src/_platform/guards/has-app-access.guard.ts`, `apps/api/src/space/guards/space-access.guard.ts`
- Web page reference: `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-home/`
- Lint constraints: `apps/web/eslint.config.mjs`, `apps/web/.stylelintrc.json`
- Institutional learning: `docs/solutions/ui-bugs/primeflex-classes-not-available-in-primeng-v20-tailwind-stack-2026-04-01.md`
