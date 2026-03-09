---
title: Document Converter Mini App
date: 2026-03-07
status: active
source_repo: /Users/ivan.mayes/Documents/GitHub/vml-docs-converter
---

# Document Converter Mini App

## What We're Building

A mini-app within vml-ai-labs that lets users upload documents (DOCX, PDF, XLSX, PPTX) and converts them to Markdown. This is a port of the standalone `vml-docs-converter` repo into the multi-app platform architecture.

## Why This Approach

The existing `vml-docs-converter` is a proven, battle-tested system with comprehensive conversion logic, async job processing, and real-time status updates. Rather than rebuilding from scratch, we port the core conversion engines wholesale and adapt the infrastructure layer to use vml-ai-labs' shared services.

## Source Repository Analysis

**Source:** `/Users/ivan.mayes/Documents/GitHub/vml-docs-converter`
**Stack:** NestJS 11 + Angular 20 (same as vml-ai-labs)

### Conversion Engines (copy wholesale)

| Format | Library | Approach |
|--------|---------|----------|
| DOCX | Mammoth 1.11.0 + Turndown 7.2.2 | Semantic HTML extraction → Markdown |
| PDF | pdf-parse 1.1.1 | Direct text extraction with metadata |
| XLSX | SheetJS 0.18.5 | Multi-sheet parsing → Markdown tables |
| PPTX | officeparser 5.2.2 | Slide text extraction |
| DOCX (fallback) | Pandoc CLI | Shell exec with timeout/isolation |

### Processing Pipeline (copy with adaptation)

```
Upload → Validate → S3 Store → Queue (pg-boss) → Convert → S3 Output → SSE Notify
```

- Job status state machine: PENDING → PROCESSING → COMPLETED / FAILED / CANCELLED
- Optimistic locking on status updates
- 60s timeout (120s for PDF), AbortSignal support
- Rate limiting: 20 uploads/15min, 10 downloads/min
- Idempotency keys prevent duplicate jobs

### Test Coverage (source)

- 26 API specs (converters, services, controllers, e2e, performance)
- 27 frontend specs (services, components, SSE)

## Key Decisions

### 1. Copy vs Recreate Strategy

**Copy wholesale (pure logic, no framework coupling):**
- All 4 converter classes + base converter + factory
- FileValidation service (MIME/size/extension checks)
- Job status enum + state machine transitions
- DTOs (upload, response, download, list)
- Converter unit tests

**Adapt to platform patterns:**
- ConversionJob entity → mini-app schema (`document_converter`), org FK
- Controller → `@RequiresApp('document-converter')`, `@CurrentOrg()`
- S3 calls → use existing `_core/third-party/aws/aws.s3.ts`
- SSE system → adapt within mini-app boundary
- pg-boss queue → add as new shared dependency

**Recreate (mini-app patterns):**
- Module wiring (mini-app module pattern)
- Route registration (lazy-loaded under `/apps/document-converter`)
- Frontend → minimal UI built fresh with PrimeNG (not porting the full polished UI)

### 2. Architecture: Async + SSE

Keep the async architecture from the source repo:
- pg-boss for job queuing (uses PostgreSQL, no new infrastructure)
- SSE for real-time status updates to the browser
- Non-blocking uploads — user can queue multiple conversions

### 3. S3 Strategy: Use Existing Platform Service

Adapt converters to use vml-ai-labs' existing `_core/third-party/aws/aws.s3.ts` instead of copying the source's S3 logic. Less duplication, consistent with platform conventions.

### 4. Frontend: Minimal UI

Build a simple fresh UI with PrimeNG components rather than porting the full polished frontend:
- PrimeNG FileUpload for drag-drop
- Simple p-table for job list
- p-tag for status indicators
- Toast notifications for completion/errors

### 5. Testing: Converter Tests + Integration

- Copy all converter unit tests (pure logic, directly portable)
- Add integration tests for mini-app wiring (controller, service, guards)
- Skip frontend tests initially

### 6. Queue System: pg-boss

Add pg-boss as a new dependency. It's already recommended in PRD_DEFAULTS.md and uses PostgreSQL (already available) — no new infrastructure.

## New Dependencies to Add

| Package | Version (source) | Purpose |
|---------|-----------------|---------|
| pg-boss | 10.4.0 | PostgreSQL-backed job queue |
| mammoth | 1.11.0 | DOCX → HTML conversion |
| turndown | 7.2.2 | HTML → Markdown conversion |
| pdf-parse | 1.1.1 | PDF text extraction |
| xlsx | 0.18.5 | Excel spreadsheet parsing |
| officeparser | 5.2.2 | PowerPoint text extraction |

**Optional CLI tool:** Pandoc (fallback DOCX converter, checked via `which pandoc`)

## Files to Copy from Source

### Direct Copy (adapt imports only)
```
conversion/converters/base.converter.ts
conversion/converters/docx.converter.ts
conversion/converters/pdf.converter.ts
conversion/converters/xlsx.converter.ts
conversion/converters/pptx.converter.ts
conversion/converters/converter.factory.ts
conversion/services/file-validation.service.ts
conversion/enums/job-status.enum.ts
conversion/dto/*.ts
```

### Copy + Adapt
```
conversion/conversion.service.ts          → adapt to mini-app service pattern, use platform S3
conversion/conversion.controller.ts       → adapt to @RequiresApp, @CurrentOrg
conversion/entities/conversion-job.entity.ts → schema: 'document_converter', org FK
conversion/services/conversion-sse.service.ts → adapt SSE within mini-app
queue/queue.module.ts                     → extract pg-boss setup as shared service
queue/queue.service.ts                    → adapt worker to mini-app context
```

### Tests to Copy
```
conversion/converters/base.converter.spec.ts
conversion/converters/docx.converter.spec.ts
conversion/converters/pdf.converter.spec.ts
conversion/converters/converter.factory.spec.ts
conversion/services/file-validation.service.spec.ts
conversion/enums/job-status.enum.spec.ts
```

## Resolved Questions

1. **Async vs sync processing?** → Keep async with pg-boss + SSE (matches source, handles large files)
2. **S3 integration approach?** → Use existing platform S3 service
3. **Frontend scope?** → Minimal UI built fresh, not full port
4. **Testing level?** → Port converter tests + add integration tests
5. **Queue system?** → pg-boss (already recommended in PRD_DEFAULTS, PostgreSQL-backed)

## Open Questions

None — all resolved.

## Additional Resolved Questions

6. **pg-boss scope?** → Shared platform service in `_platform/`. Document-converter is the first consumer, but any mini-app can use it.
7. **File size limit?** → 50MB (more generous than source's 25MB for large presentations/spreadsheets)
8. **Download link expiry?** → Keep source defaults: 24h job expiry + 1h presigned S3 URLs
