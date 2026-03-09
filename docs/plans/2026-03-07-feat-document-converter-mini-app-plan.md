---
title: "feat: Document Converter Mini App"
type: feat
status: active
date: 2026-03-07
origin: docs/brainstorms/2026-03-07-document-converter-app-brainstorm.md
source_repo: /Users/ivan.mayes/Documents/GitHub/vml-docs-converter
---

# feat: Document Converter Mini App

## Overview

Port the standalone `vml-docs-converter` repository into the vml-ai-labs multi-app platform as a mini-app called `document-converter`. Users upload documents (DOCX, PDF, XLSX, PPTX) and get Markdown output via an async job queue with real-time SSE status updates.

The strategy is **copy wholesale** for pure conversion logic and **adapt** infrastructure to use platform services (see brainstorm: docs/brainstorms/2026-03-07-document-converter-app-brainstorm.md).

## Problem Statement / Motivation

The document conversion functionality currently lives in a separate repo (`vml-docs-converter`) with its own auth, deployment, and infrastructure. Moving it into the multi-app platform:

- Shares auth/org/space infrastructure (no duplicate user management)
- Uses shared services (S3, AI, notifications)
- Follows the mini-app architecture for clean isolation
- Enables per-organization enablement via the app toggle system
- Reduces operational overhead (single deployment)

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Angular Frontend (mini-app)                        │
│  /apps/document-converter                           │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │
│  │ Upload   │ │ Job List │ │ SSE Connection    │   │
│  │ Component│ │ Table    │ │ Service           │   │
│  └────┬─────┘ └────┬─────┘ └────────┬──────────┘   │
└───────┼────────────┼────────────────┼───────────────┘
        │            │                │
        ▼            ▼                ▼
┌─────────────────────────────────────────────────────┐
│  NestJS API (mini-app controller)                   │
│  @RequiresApp('document-converter')                 │
│  POST /apps/document-converter/upload               │
│  GET  /apps/document-converter/jobs                 │
│  GET  /apps/document-converter/events (SSE)         │
└───────┬────────────┬────────────────┬───────────────┘
        │            │                │
   ┌────▼────┐  ┌────▼────┐   ┌──────▼──────┐
   │ S3      │  │ TypeORM │   │ pg-boss     │
   │ (exist) │  │ (exist) │   │ (new shared)│
   └─────────┘  └─────────┘   └──────┬──────┘
                                      │
                               ┌──────▼──────┐
                               │ Worker      │
                               │ ┌─────────┐ │
                               │ │Converters│ │
                               │ │DOCX/PDF/ │ │
                               │ │XLSX/PPTX │ │
                               │ └─────────┘ │
                               └─────────────┘
```

### Processing Pipeline

```
Upload → Validate (50MB, MIME, magic bytes) → S3 Store → Create Job (PENDING)
  → Queue to pg-boss → Worker picks up → Mark PROCESSING → SSE notify
  → Download from S3 → ConverterFactory.convert() → Upload output to S3
  → Mark COMPLETED → SSE notify → Delete input file
```

## Technical Approach

### Implementation Phases

#### Phase 1: Foundation (shared infrastructure)

Add pg-boss as a shared platform service and upgrade the S3 service.

- [ ] Install npm dependencies in `apps/api/`: `pg-boss`, `mammoth`, `turndown`, `pdf-parse`, `xlsx`, `officeparser`, `yauzl`
- [ ] Create `apps/api/src/_platform/queue/pg-boss.service.ts` — copy from source `queue/pg-boss.service.ts`, adapt config to use platform DATABASE_URL
- [ ] Create `apps/api/src/_platform/queue/pg-boss.config.ts` — copy from source `queue/pg-boss.config.ts`
- [ ] Create `apps/api/src/_platform/queue/pg-boss.types.ts` — shared queue types
- [ ] Create `apps/api/src/_platform/queue/index.ts` — barrel export
- [ ] Update `apps/api/src/_platform/platform.module.ts` — register PgBossService as provider + export
- [ ] Upgrade S3: Create `apps/api/src/_core/third-party/aws/aws.s3.service.ts` — injectable NestJS service wrapping the existing static S3 class, adding `download()`, `generatePresignedUrl()`, `delete()`, `deleteMany()`, `exists()` methods using AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- [ ] Register `AwsS3Service` in CommonModule as a provider + export
- [ ] Run tests to verify no regressions

**Success criteria:** `PgBossService` initializes on app startup, `AwsS3Service` can upload/download/presign

#### Phase 2: Core Conversion Engine (copy from source)

Scaffold the mini-app and port all conversion logic.

- [ ] Run `cd apps/api && npm run console:dev CreateApp` with name `document-converter`, display name `Document Converter`, include sample entity `n`
- [ ] Create domain error types: `apps/api/src/mini-apps/document-converter/errors/domain.errors.ts` — copy from source `_core/errors/domain.errors.ts` (ConversionTimeoutError, ConversionFailedError, FileCorruptedError, PasswordProtectedError, UnsupportedFeatureError)
- [ ] Create types directory and copy from source:
  - `apps/api/src/mini-apps/document-converter/types/job-status.enum.ts` — copy from source `conversion/types/job-status.enum.ts`
  - `apps/api/src/mini-apps/document-converter/types/conversion-error.types.ts` — copy from source
  - `apps/api/src/mini-apps/document-converter/types/sse-events.types.ts` — copy from source
- [ ] Create converters directory and copy from source (adapt error imports only):
  - `apps/api/src/mini-apps/document-converter/converters/base.converter.ts`
  - `apps/api/src/mini-apps/document-converter/converters/docx.converter.ts`
  - `apps/api/src/mini-apps/document-converter/converters/pdf.converter.ts`
  - `apps/api/src/mini-apps/document-converter/converters/xlsx.converter.ts`
  - `apps/api/src/mini-apps/document-converter/converters/pptx.converter.ts`
  - `apps/api/src/mini-apps/document-converter/converters/pandoc.runner.ts`
  - `apps/api/src/mini-apps/document-converter/converters/converter.factory.ts`
  - `apps/api/src/mini-apps/document-converter/converters/index.ts`
- [ ] Create DTOs — copy from source `conversion/dtos/`:
  - `apps/api/src/mini-apps/document-converter/dto/upload-file.dto.ts`
  - `apps/api/src/mini-apps/document-converter/dto/job-response.dto.ts`
  - `apps/api/src/mini-apps/document-converter/dto/job-list-query.dto.ts`
  - `apps/api/src/mini-apps/document-converter/dto/download-response.dto.ts`
  - `apps/api/src/mini-apps/document-converter/dto/index.ts`
- [ ] Create file validation service — copy from source, update file size limit to 50MB:
  - `apps/api/src/mini-apps/document-converter/services/file-validation.service.ts`
- [ ] Run converter unit tests to verify they pass after copy

**Success criteria:** All converters instantiate, ConverterFactory can convert each file type, FileValidationService validates files correctly

#### Phase 3: Entity, Service, and Worker (adapt from source)

Port the job entity, conversion service, and queue worker with platform adaptations.

- [ ] Create ConversionJob entity: `apps/api/src/mini-apps/document-converter/entities/conversion-job.entity.ts` — copy from source, adapt:
  - Set `schema: 'document_converter'`
  - Add `organizationId` FK to Organization entity
  - Keep optimistic locking (`@VersionColumn`)
  - Keep all indexes
- [ ] Create SseToken entity: `apps/api/src/mini-apps/document-converter/entities/sse-token.entity.ts` — copy from source, set `schema: 'document_converter'`
- [ ] Register entities in mini-app module's `TypeOrmModule.forFeature([])`
- [ ] Create ConversionService: `apps/api/src/mini-apps/document-converter/services/conversion.service.ts` — copy from source, adapt:
  - Inject `AwsS3Service` instead of source's S3 service
  - Use `@CurrentOrg()` org scoping pattern
  - Keep optimistic locking, idempotency, queue position logic
- [ ] Create ConversionSseService: `apps/api/src/mini-apps/document-converter/services/conversion-sse.service.ts` — copy from source as-is (self-contained EventEmitter pattern)
- [ ] Create SseTokenService: `apps/api/src/mini-apps/document-converter/services/sse-token.service.ts` — copy from source, use mini-app schema
- [ ] Create S3CleanupService: `apps/api/src/mini-apps/document-converter/services/s3-cleanup.service.ts` — copy from source, use `AwsS3Service`
- [ ] Create ConversionWorkerService: `apps/api/src/mini-apps/document-converter/services/conversion-worker.service.ts` — copy from source, adapt:
  - Use platform `PgBossService` for queue operations
  - Use `AwsS3Service` for S3 operations
  - Use `ConverterFactory` for conversion
  - Keep AbortController cancellation, DLQ routing, front-matter wrapping
- [ ] Create DlqAlertService: `apps/api/src/mini-apps/document-converter/services/dlq-alert.service.ts` — copy from source, optionally inject platform NotificationService

**Success criteria:** ConversionService CRUD works, Worker processes jobs end-to-end, SSE broadcasts status updates

#### Phase 4: Controller (adapt from source)

Port the REST controller with mini-app decorators.

- [ ] Replace scaffolded controller with full implementation: `apps/api/src/mini-apps/document-converter/document-converter.controller.ts` — adapt from source:
  - `@RequiresApp('document-converter')` on class
  - `@Controller('apps/document-converter')` route prefix
  - `@UseGuards(AuthGuard())` on all endpoints (except SSE)
  - Use `@CurrentOrg()` for organization scoping
  - Use `@CurrentUser()` for user identification
  - Import models from `_platform/models`
  - Endpoints:
    - `POST /upload` — multipart file upload with FileInterceptor
    - `GET /jobs` — list jobs with pagination/filtering
    - `GET /jobs/:id` — get job details
    - `GET /jobs/:id/download` — presigned download URL
    - `DELETE /jobs/:id` — cancel job
    - `POST /jobs/:id/retry` — retry failed job
    - `POST /sse-token` — generate SSE auth token
    - `GET /events` — SSE endpoint (public, token-based auth)
  - Rate limiting: 20 uploads/15min, 10 downloads/min
- [ ] Update mini-app module to register all services and converters
- [ ] Run API tests

**Success criteria:** All 8 endpoints respond correctly, auth + app guard enforced, rate limits work

#### Phase 5: Frontend (minimal fresh UI)

Build a simple Angular UI for the document converter.

- [ ] Update web routes: `apps/web/src/app/mini-apps/document-converter/document-converter.routes.ts` — add child routes for home page
- [ ] Create conversion service: `apps/web/src/app/mini-apps/document-converter/services/document-converter.service.ts` — Angular HttpClient service with:
  - `uploadFile(file: File): Observable<JobResponse>`
  - `listJobs(params?): Observable<JobListResponse>`
  - `getJob(id: string): Observable<JobResponse>`
  - `getDownloadUrl(id: string): Observable<DownloadResponse>`
  - `cancelJob(id: string): Observable<void>`
  - `retryJob(id: string): Observable<void>`
  - `generateSseToken(): Observable<SseToken>`
  - Signals: `jobs`, `loading`, `error`
- [ ] Create SSE connection service: `apps/web/src/app/mini-apps/document-converter/services/sse-connection.service.ts` — EventSource wrapper with reconnection
- [ ] Create home page component: `apps/web/src/app/mini-apps/document-converter/pages/converter-home/converter-home.component.ts`:
  - PrimeNG FileUpload (drag-drop, accept `.docx,.pdf,.xlsx,.pptx`, maxFileSize 50MB)
  - p-table for job list (columns: filename, status, created, actions)
  - p-tag for status badges (color-coded: PENDING=info, PROCESSING=warning, COMPLETED=success, FAILED=danger, CANCELLED=secondary)
  - p-button actions: Download (completed), Retry (failed), Cancel (pending/processing)
  - p-toast for notifications (job completed, errors)
  - Auto-refresh via SSE connection
- [ ] Create SCSS styling using PrimeNG design tokens (no hardcoded colors)

**Success criteria:** User can upload a file, see it in the job list, watch status update via SSE, and download the result

#### Phase 6: Tests (port + new)

- [ ] Copy converter tests from source (adapt imports):
  - `apps/api/src/mini-apps/document-converter/converters/base.converter.spec.ts`
  - `apps/api/src/mini-apps/document-converter/converters/docx.converter.spec.ts`
  - `apps/api/src/mini-apps/document-converter/converters/pdf.converter.spec.ts`
  - `apps/api/src/mini-apps/document-converter/converters/xlsx.converter.spec.ts`
  - `apps/api/src/mini-apps/document-converter/converters/converter.factory.spec.ts`
- [ ] Copy file validation tests: `apps/api/src/mini-apps/document-converter/services/file-validation.service.spec.ts`
- [ ] Copy job status tests: `apps/api/src/mini-apps/document-converter/types/job-status.enum.spec.ts`
- [ ] Write new integration tests:
  - `apps/api/src/mini-apps/document-converter/document-converter.controller.spec.ts` — test all endpoints with mocked services
  - `apps/api/src/mini-apps/document-converter/services/conversion.service.spec.ts` — test job CRUD with mocked DB
- [ ] Write platform service tests:
  - `apps/api/src/_platform/queue/pg-boss.service.spec.ts` — test queue operations with mocked pg-boss
- [ ] Add test script to `package.json`: `"test:app:document-converter": "cd apps/api && jest --testPathPattern=mini-apps/document-converter"`
- [ ] Run full test suite: `npm test`

**Success criteria:** All converter tests pass, integration tests pass, no regressions in existing tests

## System-Wide Impact

### Interaction Graph

1. **Upload request** → ThrottlerGuard → HasAppAccessGuard (checks `document-converter` enabled for org) → AuthGuard → FileInterceptor (multer memory storage) → Controller.upload → FileValidationService.validate → AwsS3Service.upload → ConversionService.createJob → PgBossService.sendConversionJob → SSE broadcast `JOB_CREATED`
2. **Worker processing** → PgBossService picks up job → ConversionWorkerService.processJob → AwsS3Service.download → ConverterFactory.convert → AwsS3Service.upload (output) → ConversionService.markJobCompleted → SSE broadcast `JOB_COMPLETED` → AwsS3Service.delete (input cleanup)
3. **Download request** → Auth + app guard → ConversionService.getDownloadInfo → AwsS3Service.generatePresignedUrl → return URL

### Error & Failure Propagation

| Error Source | Error Type | Handling | Retry? |
|-------------|-----------|----------|--------|
| File upload | InvalidFileError | Return 400 to client | No |
| S3 upload failure | S3UploadError | Return 500, no job created | User re-uploads |
| Conversion timeout | ConversionTimeoutError | Mark FAILED, send to DLQ after max retries | Yes (3x) |
| Password-protected | PasswordProtectedError | Mark FAILED immediately | No |
| Corrupted file | FileCorruptedError | Mark FAILED, send to DLQ | No |
| Worker crash | pg-boss auto-retry | Job re-queued by pg-boss | Yes (auto) |
| S3 download failure | S3Error | Mark FAILED, retry | Yes |
| Database error | TypeORM error | Log + return 500 | Yes (auto via pg-boss) |

### State Lifecycle Risks

- **Partial S3 upload**: File uploaded to S3 but job creation fails → orphaned S3 object. Mitigation: S3CleanupService cron deletes objects without matching jobs.
- **Worker crash mid-conversion**: Job stays in PROCESSING. Mitigation: pg-boss `expireInSeconds` auto-fails expired jobs.
- **Optimistic lock conflict**: Two workers try to update same job. Mitigation: `@VersionColumn` throws, only one succeeds. The other retries read.
- **App disabled while jobs in queue**: Pending jobs remain but new uploads blocked by HasAppAccessGuard. Workers continue processing existing jobs (designed behavior).

### Integration Test Scenarios

1. **Full upload-to-download cycle**: Upload DOCX → wait for COMPLETED status → download presigned URL → verify Markdown output
2. **Idempotent upload**: Upload same file with same idempotency key twice → second request returns existing job (not duplicate)
3. **Job cancellation**: Upload file → cancel while PENDING → verify status is CANCELLED and worker skips it
4. **Failed retry**: Upload corrupted file → job fails → retry → verify retryCount incremented
5. **SSE real-time updates**: Connect SSE → upload file → verify JOB_CREATED and JOB_COMPLETED events received

## Acceptance Criteria

### Functional Requirements

- [ ] Users can upload DOCX, PDF, XLSX, PPTX files up to 50MB
- [ ] Files are validated (MIME type, extension, magic bytes, ZIP structure)
- [ ] Uploaded files are stored in S3 and a conversion job is queued
- [ ] Worker processes jobs asynchronously with proper timeout handling (60s default, 120s PDF)
- [ ] Converted Markdown output is stored in S3
- [ ] Users can download converted output via time-limited presigned URLs (1h URL, 24h job expiry)
- [ ] Job list shows all user's jobs with status, filtering, and pagination
- [ ] Real-time status updates via SSE connection
- [ ] Failed jobs can be retried (up to 3 times with exponential backoff)
- [ ] Jobs can be cancelled while PENDING or PROCESSING
- [ ] Idempotency keys prevent duplicate uploads
- [ ] Rate limiting: 20 uploads/15min, 10 downloads/min per user
- [ ] Organization must have `document-converter` enabled (enforced by HasAppAccessGuard)

### Non-Functional Requirements

- [ ] All converter unit tests pass (ported from source)
- [ ] Integration tests for controller + service layer
- [ ] PgBossService works as shared platform service
- [ ] No regressions in existing platform tests (27 API + 17 web)
- [ ] Follows mini-app boundary rules (no `_core/` imports, no cross-app imports)
- [ ] AGENTS.md generated for the mini-app

### Quality Gates

- [ ] `npm test` passes (all suites)
- [ ] ESLint passes
- [ ] No hardcoded colors in SCSS
- [ ] PrimeNG components used (no custom HTML controls)

## Dependencies & Risks

### New npm Dependencies

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| pg-boss | ^10.4.0 | Job queue | Low — uses existing PostgreSQL |
| mammoth | ^1.11.0 | DOCX conversion | Low — stable, well-maintained |
| turndown | ^7.2.2 | HTML → Markdown | Low — stable |
| pdf-parse | ^1.1.1 | PDF text extraction | Low — v1 API, simple |
| xlsx | ^0.18.5 | Excel parsing | Medium — large package, SheetJS licensing |
| officeparser | ^5.2.2 | PPTX extraction | Low — straightforward |
| yauzl | ^3.0.0 | ZIP validation | Low — security validation only |
| @aws-sdk/client-s3 | ^3.x | S3 SDK v3 | Low — official AWS SDK |
| @aws-sdk/s3-request-presigner | ^3.x | Presigned URLs | Low — official AWS SDK |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| pg-boss schema conflicts | Medium | Uses separate `pgboss` schema, auto-created |
| Large package size (xlsx) | Low | Only loaded server-side |
| Pandoc not installed on server | Low | Optional fallback, Mammoth is primary |
| S3 bucket permissions | Medium | Verify IAM policy allows presigned URLs |
| Memory pressure from large files | Medium | 50MB limit + streaming where possible |

## File Map

### New Files (estimated ~35 files)

```
apps/api/src/
  _platform/queue/
    pg-boss.service.ts          # Shared queue service
    pg-boss.config.ts           # Queue configuration
    pg-boss.types.ts            # Shared types
    pg-boss.service.spec.ts     # Tests
    index.ts                    # Barrel export
  _core/third-party/aws/
    aws.s3.service.ts           # Injectable S3 service (SDK v3)
  mini-apps/document-converter/
    document-converter.module.ts        # NestJS module (updated from scaffold)
    document-converter.controller.ts    # REST controller (8 endpoints)
    AGENTS.md                           # AI agent rules (auto-generated)
    converters/
      base.converter.ts                 # Abstract base (copied)
      docx.converter.ts                 # DOCX engine (copied)
      pdf.converter.ts                  # PDF engine (copied)
      xlsx.converter.ts                 # XLSX engine (copied)
      pptx.converter.ts                 # PPTX engine (copied)
      pandoc.runner.ts                  # Pandoc fallback (copied)
      converter.factory.ts             # Factory (copied)
      index.ts                         # Barrel export
      base.converter.spec.ts           # Tests (copied)
      docx.converter.spec.ts
      pdf.converter.spec.ts
      xlsx.converter.spec.ts
      converter.factory.spec.ts
    entities/
      conversion-job.entity.ts         # Job entity (adapted)
      sse-token.entity.ts              # SSE token entity (adapted)
    dto/
      upload-file.dto.ts               # Upload DTO (copied)
      job-response.dto.ts              # Response DTOs (copied)
      job-list-query.dto.ts            # List query DTO (copied)
      download-response.dto.ts         # Download DTO (copied)
      index.ts
    types/
      job-status.enum.ts               # Status enum (copied)
      conversion-error.types.ts        # Error types (copied)
      sse-events.types.ts              # SSE types (copied)
    errors/
      domain.errors.ts                 # Error classes (copied)
    services/
      conversion.service.ts            # Job CRUD (adapted)
      file-validation.service.ts       # File validation (copied, 50MB limit)
      conversion-sse.service.ts        # SSE service (copied)
      sse-token.service.ts             # Token service (copied)
      s3-cleanup.service.ts            # Cleanup cron (adapted)
      conversion-worker.service.ts     # Queue worker (adapted)
      dlq-alert.service.ts             # DLQ alerts (copied)
      conversion.service.spec.ts       # Tests (new)
      file-validation.service.spec.ts  # Tests (copied)
    document-converter.controller.spec.ts  # Tests (new)

apps/web/src/app/mini-apps/document-converter/
    document-converter.routes.ts               # Routes (from scaffold)
    AGENTS.md                                  # AI agent rules (auto-generated)
    services/
      document-converter.service.ts            # HTTP + signals service
      sse-connection.service.ts                # SSE wrapper
    pages/converter-home/
      converter-home.component.ts              # Main page
      converter-home.component.html            # Template
      converter-home.component.scss            # Styles
```

### Modified Files

```
apps/api/package.json                          # New dependencies
apps/api/src/_platform/platform.module.ts      # Add PgBossService
apps/api/src/common.module.ts                  # Add AwsS3Service
apps/api/src/mini-apps/mini-apps.module.ts     # Import DocumentConverterModule
apps/mini-apps.json                            # Add document-converter entry
apps/web/src/app/app.routes.ts                 # Add document-converter route
package.json                                   # Add test:app:document-converter script
```

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-07-document-converter-app-brainstorm.md](docs/brainstorms/2026-03-07-document-converter-app-brainstorm.md) — Key decisions: copy converters wholesale, async+SSE architecture, pg-boss as shared platform service, minimal fresh UI, 50MB file limit

### Internal References

- Source repo: `/Users/ivan.mayes/Documents/GitHub/vml-docs-converter`
- Mini-app scaffolding: `apps/api/src/console/create-app.console.ts`
- S3 service: `apps/api/src/_core/third-party/aws/aws.s3.ts`
- Platform module: `apps/api/src/_platform/platform.module.ts`
- App guard: `apps/api/src/_platform/guards/has-app-access.guard.ts`
- PRD_DEFAULTS.md queue guidance: pg-boss recommended
- AGENTS.md mini-app boundary rules

### External References

- [pg-boss documentation](https://github.com/timgit/pg-boss/blob/master/docs/readme.md)
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js)
- [Turndown](https://github.com/mixmark-io/turndown)
- [pdf-parse](https://www.npmjs.com/package/pdf-parse)
- [SheetJS](https://docs.sheetjs.com/)
- [officeparser](https://github.com/nicktoh/officeparser)
