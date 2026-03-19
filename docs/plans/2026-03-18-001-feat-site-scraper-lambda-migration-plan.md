---
title: "feat: Migrate Site Scraper to AWS Lambda Per-Page Architecture"
type: feat
status: active
date: 2026-03-18
origin: docs/brainstorms/2026-03-18-site-scraper-lambda-migration-brainstorm.md
---

# feat: Migrate Site Scraper to AWS Lambda Per-Page Architecture

## Enhancement Summary

**Deepened on:** 2026-03-18
**Review agents used:** Architecture Strategist, Security Sentinel, Performance Oracle, Code Simplicity Reviewer, TypeScript Reviewer, Deployment Verification Agent, Pattern Recognition Specialist (7 agents)

### Major Simplification: Eliminate DynamoDB

The simplicity review identified that **DynamoDB is unnecessary** at this scale. PostgreSQL can handle URL deduplication via `INSERT ... ON CONFLICT DO NOTHING` on the existing `scraped_pages` table. This eliminates ~585 lines of code, removes an entire AWS service dependency, and cuts implementation time by ~35% (from 10 days to ~6.5 days).

**Revised architecture**: Lambda sends discovered links back to Heroku in the callback. Heroku deduplicates against PostgreSQL and enqueues new URLs to SQS. This centralizes all state in PostgreSQL.

### Key Improvements from Reviews

1. **Remove secrets from SQS messages** — `callbackSecret`, `callbackUrl`, `queueUrl`, `s3Bucket` must be Lambda env vars, not per-message fields (flagged by Security, Architecture, TypeScript, Pattern, Performance)
2. **Eliminate DynamoDB entirely** — Use PostgreSQL for URL frontier/dedup; Lambda sends discovered links in callback; Heroku deduplicates and enqueues to SQS (Simplicity)
3. **Fix completion detection** — Use PostgreSQL atomic counters (`pagesCompleted + pagesFailed >= pagesDiscovered`) with a mandatory periodic sweep as safety net (Architecture, Performance)
4. **Configure PostgreSQL connection pool** — Add explicit `max: 15` to TypeORM; at 20 concurrent Lambdas, callbacks will exhaust default pool (Performance)
5. **Reuse browser across Lambda invocations** — Initialize Chrome in module scope, close pages not browser; saves 2-4s per warm invocation (Performance)
6. **Define `LambdaPageResultDto`** — Full class-validator decorated DTO for callback payloads; validates S3 key prefixes match `site-scraper/{jobId}/` (TypeScript, Security)
7. **Replace HMAC with Bearer token auth** — For internal service-to-service calls over TLS, a shared secret Bearer token provides equivalent security with less complexity (Simplicity)
8. **Fix SSRF IPv6 gaps** — Add `::ffff:` prefixed IPv4-mapped addresses to blocklist; test against `169.254.169.254` (Security)
9. **Follow existing naming conventions** — Files: `aws.sqs.service.ts`, `aws.dynamodb.service.ts`; Classes: `AwsSqsService`; Env vars: `AWS_SQS_SCRAPER_QUEUE_URL` prefix (Pattern)
10. **Slim SQS message** — Only per-page data (`jobId`, `url`, `urlHash`, `depth`); all config from Lambda env vars (TypeScript, Performance, Pattern)
11. **Parallelize S3 uploads** — Upload all screenshots + thumbnails concurrently after capture; saves ~800ms/page (Performance)
12. **Add per-job wall-clock timeout** — Mark FAILED after 30 minutes; prevents runaway costs (Performance)
13. **Fix pre-existing hardcoded download token secret** — Remove `'download-token-secret'` fallback in `site-scraper.controller.ts:81-84` (Security)

### New Considerations Discovered

- **PostgreSQL connection exhaustion** is the new bottleneck with concurrent callbacks (Performance)
- **Completion detection race condition** between link discovery and callback timing (Architecture, Performance)
- **S3 key injection via callback** — Must validate S3 keys match expected `site-scraper/{jobId}/` prefix (Security)
- **SQS scaling ramp-up** takes 3-4 minutes to reach full concurrency from cold start (Performance)
- **Lambda browser reuse** across invocations within same execution context is critical optimization (Performance)
- **DLQ consumer can be deferred** to a follow-up phase (Simplicity)
- **Cost estimate revised** to ~$1.28 per 1000-page job (vs $3.00 original estimate) (Performance)

### Revised Architecture (Post-Review)

```
Heroku API (Control Plane)
  Job CRUD --> SQS (seed URL message)
  Callback <-- Lambda results (Bearer token auth)
  SSE <-- DB-driven events
  Dedup via PostgreSQL UNIQUE constraint
  Completion via: pagesCompleted + pagesFailed >= pagesDiscovered

SQS Queue (page-work) --> Lambda (x20 concurrent)
  SQS DLQ (retention only, no consumer yet)

Lambda:
  Receives: { jobId, url, urlHash, depth }
  Reads config from env vars (callbackUrl, s3Bucket, etc.)
  Renders page, screenshots to S3 (parallel uploads)
  Discovers links --> sends in callback to Heroku
  Heroku deduplicates via INSERT ON CONFLICT DO NOTHING
  Heroku enqueues new URLs to SQS
```

### Revised Effort Estimate

| Phase | Original | Revised | Savings |
|-------|----------|---------|---------|
| Infrastructure (CDK) | 2 days | 1 day | No DynamoDB |
| Lambda Worker | 3 days | 2 days | No DynamoDB dedup logic |
| Heroku API Changes | 2 days | 1.5 days | No DynamoDB service |
| Testing & Deploy | 2 days | 1.5 days | Same |
| Cleanup | 1 day | 0.5 days | Same |
| **Total** | **10 days** | **~6.5 days** | **35% reduction** |

## Overview

Replace the in-process Playwright/Chromium scraper worker on Heroku with a distributed, serverless architecture using AWS Lambda container images, SQS for job distribution, and DynamoDB for URL deduplication. Each page is processed by an independent Lambda invocation, enabling massive parallelism (20 concurrent workers) while keeping the Heroku API as the control plane for job management, auth, SSE, and the admin dashboard.

This solves the fundamental memory constraint: Chromium (200-400MB) + NestJS API cannot coexist in a 512MB Heroku dyno. The vml.com scrape (900+ pages, 4 viewports) consistently OOMs at ~1052MB despite browser retirement, buffer optimizations, and single-page concurrency.

(see brainstorm: `docs/brainstorms/2026-03-18-site-scraper-lambda-migration-brainstorm.md`)

## Problem Statement

The site scraper runs Playwright/Chromium inside the Heroku API process. Chromium alone needs 200-400MB RAM, and each full-page screenshot can consume 5-50MB as a JPEG buffer. On a 512MB dyno, this means the process exceeds Heroku's 1024MB SIGKILL threshold after ~80 pages on a heavy site like vml.com. Despite browser retirement every 20 pages, buffer copy elimination, and `maxOpenPagesPerBrowser: 1`, the fundamental problem remains: **Chromium and the NestJS API cannot share the same memory space**.

Additionally, the current architecture is serial — one page at a time, one job at a time. A 1000-page site takes ~4 hours. Multiple users cannot scrape simultaneously.

## Proposed Solution

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Heroku API (Control Plane)                                    │
│                                                               │
│  Job CRUD ──► SQS (seed URL)     Callback ◄── Lambda results │
│  SSE ◄── DB polling              DynamoDB ◄── URL frontier    │
│  Auth, Admin, Export             S3 ◄── screenshots/HTML      │
└──────────────────────────────────────────────────────────────┘
        │                                    ▲
        ▼                                    │
┌─────────────┐    ┌─────────────────────────┤
│  SQS Queue  │───►│  Lambda (x20 concurrent) │
│  (page-work)│    │  Container w/ Chromium    │
│             │◄───│  Per-page: render,        │
│  DLQ        │    │  screenshot, S3 upload,   │
└─────────────┘    │  discover links,          │
                   │  callback to Heroku       │
                   └───────────────────────────┘
```

### Component Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Control plane | Heroku NestJS API (existing) | Job CRUD, auth, SSE, admin, export |
| Page work queue | SQS Standard Queue | Distribute page URLs to Lambda workers |
| Dead letter queue | SQS Standard Queue | Capture failed pages after 4 attempts |
| Page worker | Lambda container image (2GB, 120s timeout) | Render page, screenshot, upload, discover links |
| URL frontier | DynamoDB (on-demand, TTL) | Atomic URL deduplication, depth tracking, page counting |
| Storage | S3 (existing) | Screenshots, HTML, thumbnails |
| Callback API | NestJS endpoint on Heroku | Receive page results from Lambda, update DB, emit SSE |
| Infrastructure | AWS CDK (TypeScript) | SQS, DynamoDB, Lambda, ECR, IAM |
| CI/CD | GitHub Actions | Build container image, push to ECR, update Lambda |

## Technical Approach

### Phase 1: AWS Infrastructure (CDK Stack)

Set up the foundational AWS resources using CDK.

#### 1.1 CDK Project Setup

Create `infra/` directory at project root with a CDK TypeScript app.

```
infra/
├── bin/
│   └── scraper-infra.ts          # CDK app entry point
├── lib/
│   └── scraper-stack.ts          # Main stack definition
├── cdk.json
├── tsconfig.json
└── package.json
```

**`infra/lib/scraper-stack.ts`** — defines:

- **SQS Standard Queue** (`scraper-page-work`)
  - Visibility timeout: 12 minutes (6x Lambda timeout of 2 min)
  - Message retention: 7 days
  - DLQ with `maxReceiveCount: 4`
- **SQS DLQ** (`scraper-page-work-dlq`)
  - Retention: 14 days
  - CloudWatch alarm on depth > 0
- **DynamoDB Table** (`scraper-url-frontier`)
  - Partition key: `jobId` (String)
  - Sort key: `urlHash` (String — SHA-256 of normalized URL)
  - On-demand billing
  - TTL attribute: `expiresAt`
  - GSI: `jobId-status-index` (PK: `jobId`, SK: `status`) for completion queries
- **ECR Repository** (`scraper-lambda`)
  - Lifecycle policy: keep last 10 tagged images
  - Image scanning on push
- **Lambda DockerImageFunction** (`scraper-page-worker`)
  - Memory: 2048 MB
  - Timeout: 2 minutes
  - Architecture: x86_64 (Chrome requirement)
  - Reserved concurrency: 25
  - SQS event source mapping: batchSize 1, maxConcurrency 20
  - Environment: `URL_TABLE_NAME`, `QUEUE_URL`, `CALLBACK_URL`, `CALLBACK_SECRET` (from SSM), `S3_BUCKET`
- **IAM roles** with least-privilege grants via CDK L2 constructs
- **SSM Parameter** (`/scraper/callback-secret`) — HMAC shared secret

#### 1.2 DynamoDB URL Frontier Schema

```typescript
interface UrlFrontierItem {
  jobId: string;           // Partition key
  urlHash: string;         // Sort key — SHA-256 of normalized URL
  url: string;             // Original URL (for display/debugging)
  hostname: string;        // Seed hostname (for same-origin filtering)
  depth: number;           // Crawl depth from seed
  status: 'pending' | 'in_flight' | 'completed' | 'failed';
  discoveredAt: number;    // Unix epoch seconds
  completedAt?: number;    // When processing finished
  expiresAt: number;       // TTL — job creation + 48 hours
}
```

**Deduplication pattern**: `PutItem` with `ConditionExpression: 'attribute_not_exists(urlHash)'`. First writer wins, duplicates get `ConditionalCheckFailedException` (silently ignored).

**Completion query**: GSI query `jobId = :jobId AND status = :status` to count pending/in_flight items. Job is complete when `pending = 0 AND in_flight = 0`.

---

### Phase 2: Lambda Container Image

#### 2.1 Dockerfile

```
lambda/scraper/
├── Dockerfile
├── package.json
├── tsconfig.json
├── .dockerignore
└── src/
    ├── handler.ts              # Lambda entry point
    ├── browser.ts              # Chromium launch + page rendering
    ├── screenshots.ts          # Viewport screenshot + S3 upload
    ├── link-discovery.ts       # Extract links, filter same-hostname
    ├── url-frontier.ts         # DynamoDB dedup operations
    ├── callback.ts             # HMAC-signed HTTP callback to Heroku
    ├── cookie-dismissal.ts     # Autoconsent + manual selectors
    ├── ssrf-protection.ts      # DNS resolution + private IP checks
    └── utils/
        ├── normalize-url.ts    # URL normalization for dedup
        └── download-filter.ts  # Skip PDFs, ZIPs, etc.
```

**Base image**: `node:20-slim` (NOT Alpine — Chromium incompatible with musl libc)

**Chrome**: Installed via `@puppeteer/browsers install chrome@stable` (pinned version for reproducibility)

**Key dependencies**: `playwright-core`, `sharp`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-sqs`, `@aws-sdk/client-s3`, `@duckduckgo/autoconsent`

**Browser launch args** (critical for Lambda):
```
--single-process --no-sandbox --disable-setuid-sandbox
--disable-dev-shm-usage --disable-gpu --no-zygote
--use-angle=swiftshader
```

**Target image size**: ~575MB (node:20-slim 200MB + Chrome 300MB + deps 75MB)

#### 2.2 Lambda Handler (`src/handler.ts`)

```typescript
// Pseudocode — the actual handler flow
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const message: PageWorkMessage = JSON.parse(record.body);

      // 1. Check if job is cancelled (DynamoDB jobStatus or callback check)
      if (await isJobCancelled(message.jobId)) {
        continue; // Silently skip, don't retry
      }

      // 2. Mark URL as in_flight in DynamoDB
      await markUrlInFlight(message.jobId, message.urlHash);

      // 3. Launch browser, render page, dismiss cookies
      const { page, browser } = await launchAndRender(message.url);

      // 4. Take screenshots at each viewport, upload to S3
      const screenshots = await captureAndUpload(page, message);

      // 5. Get page HTML, upload to S3
      const htmlS3Key = await uploadHtml(page, message);

      // 6. Get page title
      const title = await page.title();

      // 7. Discover links (same-hostname, not download URLs)
      const discoveredLinks = await discoverLinks(page, message.seedHostname);

      // 8. Close browser
      await browser.close();

      // 9. Deduplicate links via DynamoDB conditional writes
      const newUrls = await deduplicateAndEnqueue(
        message.jobId, discoveredLinks, message.depth + 1,
        message.maxDepth, message.seedHostname, message.queueUrl
      );

      // 10. Callback to Heroku with results
      await callbackToHeroku(message, {
        url: message.url,
        title,
        htmlS3Key,
        screenshots,
        status: 'completed',
        newUrlsDiscovered: newUrls.length,
      });

      // 11. Mark URL as completed in DynamoDB
      await markUrlCompleted(message.jobId, message.urlHash);

    } catch (error) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
```

#### 2.3 SQS Message Schema

```typescript
interface PageWorkMessage {
  jobId: string;
  url: string;
  urlHash: string;          // SHA-256 of normalized URL
  depth: number;
  maxDepth: number;
  maxPages: number;         // Cap total pages per job (default 1000)
  viewports: number[];      // e.g., [375, 768, 1024, 1920]
  seedHostname: string;     // For same-origin link filtering
  callbackUrl: string;      // Heroku callback endpoint
  callbackSecret: string;   // HMAC secret for signing callbacks
  queueUrl: string;         // SQS queue URL for enqueuing discovered links
  s3Bucket: string;
  s3Prefix: string;         // `site-scraper/${jobId}/`
}
```

---

### Phase 3: Heroku API Changes

#### 3.1 New Internal Callback Endpoint

**`POST /internal/scraper/page-result`**

Receives page results from Lambda workers. Secured via HMAC signature verification.

```typescript
// apps/api/src/mini-apps/site-scraper/site-scraper-internal.controller.ts

@Controller('internal/scraper')
export class SiteScraperInternalController {
  @Post('page-result')
  @HttpCode(200)
  async receivePageResult(
    @Headers('x-signature') signature: string,
    @Headers('x-timestamp') timestamp: string,
    @Body() body: LambdaPageResultDto,
    @Req() req: Request,
  ) {
    // 1. Verify HMAC signature (replay protection: reject if timestamp > 5min old)
    // 2. Verify job exists and is RUNNING (return 410 if cancelled/completed)
    // 3. Upsert page result (INSERT ... ON CONFLICT DO UPDATE for idempotency)
    // 4. Increment pagesCompleted (or pagesFailed)
    // 5. Increment pagesDiscovered by newUrlsDiscovered count
    // 6. Emit SSE event (page:completed or page:failed)
    // 7. Check completion: query DynamoDB for pending/in_flight count
    //    If zero: mark job COMPLETED (or COMPLETED_WITH_ERRORS)
  }
}
```

**Idempotency**: Use `INSERT ... ON CONFLICT (scrapeJobId, url) DO UPDATE` to handle Lambda retries safely.

**Cancellation response**: Return `410 Gone` for cancelled jobs. Lambda interprets this as "stop, don't enqueue more links."

#### 3.2 Modified Job Creation Flow

Update `SiteScraperService.createJob()`:

1. Create `ScrapeJob` entity as before (status: PENDING)
2. Instead of sending to pg-boss, send seed URL to SQS
3. Write seed URL to DynamoDB frontier table
4. Mark job as RUNNING immediately
5. Emit SSE `job:started` event

```typescript
// In site-scraper.service.ts — new method
async createJobWithLambda(input: CreateJobInput): Promise<ScrapeJob> {
  const job = await this.createJobEntity(input);

  // Write seed URL to DynamoDB
  await this.dynamoService.putUrl({
    jobId: job.id,
    urlHash: hashUrl(input.url),
    url: input.url,
    hostname: new URL(input.url).hostname,
    depth: 0,
    status: 'pending',
    expiresAt: Math.floor(Date.now() / 1000) + 48 * 3600,
  });

  // Send seed URL to SQS
  await this.sqsService.sendPageWork({
    jobId: job.id,
    url: input.url,
    urlHash: hashUrl(input.url),
    depth: 0,
    maxDepth: input.maxDepth,
    maxPages: 1000,
    viewports: input.viewports,
    seedHostname: new URL(input.url).hostname,
    callbackUrl: this.configService.get('LAMBDA_CALLBACK_URL'),
    callbackSecret: this.configService.get('LAMBDA_CALLBACK_SECRET'),
    queueUrl: this.configService.get('SQS_SCRAPER_QUEUE_URL'),
    s3Bucket: this.configService.get('AWS_S3_BUCKET'),
    s3Prefix: `site-scraper/${job.id}/`,
  });

  // Mark as RUNNING
  await this.markJobRunning(job.id);

  return job;
}
```

#### 3.3 Job Completion Detection

Replace the current in-process completion (crawler finishes its `run()` call) with a polling-based approach:

**Option A (recommended)**: The callback endpoint checks completion on every page result:

```typescript
// In the callback handler, after saving page result:
const frontier = await this.dynamoService.getJobCounts(jobId);
// { pending: 0, in_flight: 0, completed: 245, failed: 3 }

if (frontier.pending === 0 && frontier.in_flight === 0) {
  await this.markJobCompleted(jobId);
  this.sseService.emitJobCompleted(jobId, ...);
}
```

This is checked on every callback, so completion is detected within seconds of the last page finishing.

**Option B (safety net)**: A periodic sweep (every 30 seconds) checks all RUNNING jobs for completion, similar to the existing `failStaleRunningJobs()` pattern.

#### 3.4 Job Cancellation

When a user cancels a job:

1. Mark job as CANCELLED in PostgreSQL (existing `markJobCancelled()`)
2. Purge remaining SQS messages for this job (filter by `jobId` message attribute — note: SQS standard queues don't support per-attribute purge, so we rely on callback rejection)
3. Update DynamoDB: set all `pending` items to `cancelled` for this job
4. Callback handler returns `410 Gone` for any Lambda callbacks on cancelled jobs
5. In-flight Lambdas complete their current page but results are discarded
6. Orphaned S3 objects cleaned up asynchronously (existing `cleanupJobS3Objects()`)

#### 3.5 New Platform Services

**`apps/api/src/_platform/aws/sqs.service.ts`** — SQS v3 client wrapper:
- `sendPageWork(message: PageWorkMessage)` — sends to scraper queue
- Uses `@aws-sdk/client-sqs` v3

**`apps/api/src/_platform/aws/dynamo.service.ts`** — DynamoDB v3 client wrapper:
- `putUrl(item: UrlFrontierItem)` — conditional write for dedup
- `getJobCounts(jobId: string)` — query GSI for status counts
- `cancelJobUrls(jobId: string)` — batch update pending -> cancelled
- Uses `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` v3

Both registered in `PlatformModule` alongside existing `AwsS3Service`.

#### 3.6 Feature Flag

Add a `USE_LAMBDA_SCRAPER` environment variable. When `true`, job creation uses the Lambda flow. When `false` (or unset), uses the existing pg-boss + in-process Crawlee worker.

This enables:
- Gradual rollout
- Instant rollback if Lambda has issues
- Side-by-side testing

---

### Phase 4: CI/CD & Deployment

#### 4.1 GitHub Actions Workflow

**`.github/workflows/scraper-lambda.yml`**:

- Trigger: push to `main` with changes in `lambda/scraper/**`
- Steps: checkout, configure AWS (OIDC), login to ECR, build Docker image, push to ECR, update Lambda function code
- Uses `docker/build-push-action` with GitHub Actions cache for fast rebuilds
- Tags with commit SHA + `latest`

#### 4.2 CDK Deployment

**`.github/workflows/scraper-infra.yml`** (manual trigger or on `infra/**` changes):

- Runs `cdk diff` as a PR check
- Runs `cdk deploy --require-approval never` on merge to main
- Uses OIDC for AWS authentication (no static credentials)

#### 4.3 Environment Variables

New env vars needed on Heroku:

| Variable | Purpose |
|----------|---------|
| `USE_LAMBDA_SCRAPER` | Feature flag (true/false) |
| `SQS_SCRAPER_QUEUE_URL` | SQS page-work queue URL |
| `DYNAMODB_URL_TABLE` | DynamoDB table name |
| `LAMBDA_CALLBACK_URL` | Public URL for Lambda callbacks |
| `LAMBDA_CALLBACK_SECRET` | HMAC shared secret (also in SSM) |

---

### Phase 5: Migration & Cleanup

#### 5.1 Migration Strategy

1. Deploy CDK stack (creates SQS, DynamoDB, ECR, Lambda)
2. Deploy Lambda container image to ECR
3. Deploy Heroku API with `USE_LAMBDA_SCRAPER=false` (feature flag off)
4. Test with feature flag on for specific test jobs (manual DB toggle)
5. Enable `USE_LAMBDA_SCRAPER=true` for all new jobs
6. Monitor for 1 week
7. Remove pg-boss scraper worker code and Playwright dependencies from Heroku

#### 5.2 Heroku Cleanup (after migration confirmed)

Remove from `apps/api/package.json`:
- `crawlee`
- `playwright-extra`, `playwright-core`
- `puppeteer-extra-plugin-stealth`
- `@duckduckgo/autoconsent`
- `@ghostery/adblocker-playwright`
- `sharp` (only if not used elsewhere)

Remove `playwright-core install chromium` from `heroku-postbuild`.

This significantly reduces Heroku slug size and baseline memory usage.

## System-Wide Impact

### Interaction Graph

1. **Job creation**: User -> Controller -> `SiteScraperService.createJobWithLambda()` -> DynamoDB (seed URL) -> SQS (seed message) -> DB (job RUNNING)
2. **Page processing**: SQS -> Lambda -> Chromium render -> S3 upload -> DynamoDB (link dedup) -> SQS (new links) -> HTTP callback -> Heroku controller -> DB (page result) -> SSE (event)
3. **Completion**: Callback handler -> DynamoDB query (counts) -> DB (job COMPLETED) -> SSE (event)
4. **Cancellation**: Controller -> DB (CANCELLED) -> DynamoDB (cancel pending) -> Callback handler returns 410 -> Lambda stops enqueuing

### Error & Failure Propagation

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Lambda crash mid-page | SQS re-delivers after visibility timeout | DynamoDB `in_flight` status resets on retry; S3 objects may be orphaned (cleanup job) |
| Callback to Heroku fails | Lambda reports failure, SQS retries | Callback is idempotent (upsert); S3 objects already uploaded |
| DynamoDB conditional write fails | Expected for duplicates | `ConditionalCheckFailedException` is silently ignored |
| SQS enqueue fails after DynamoDB write | URL marked in DynamoDB but never processed | Safety net: periodic sweep checks DynamoDB for `pending` items older than 5 minutes |
| Heroku dyno restarts during callback | Lambda gets HTTP error, SQS retries | Idempotent callback handles re-delivery |
| DLQ message (4 failed attempts) | Page permanently failed | DLQ consumer marks page as `failed` via callback; job completes with errors |

### State Lifecycle Risks

- **Orphaned S3 objects**: Lambda uploads to S3 but callback fails or job is cancelled. Mitigated by existing `cleanupJobS3Objects()` which deletes by S3 prefix.
- **Stale DynamoDB items**: TTL (48 hours) automatically cleans up. No manual intervention needed.
- **SQS messages for cancelled jobs**: Lambdas process them but callback returns 410. Compute is wasted but data integrity is maintained.

## Acceptance Criteria

### Functional Requirements

- [ ] A scrape job for vml.com (900+ pages, 4 viewports) completes successfully without OOM
- [ ] Pages are processed in parallel (target: 20 concurrent Lambdas)
- [ ] A 200-page site completes in under 5 minutes (vs ~30 minutes today)
- [ ] SSE events still show real-time page completions in the UI
- [ ] Job cancellation stops new page processing within 30 seconds
- [ ] Failed pages are retried up to 3 times before going to DLQ
- [ ] Job retry preserves already-completed pages
- [ ] Existing features (export, admin dashboard, job viewer) work unchanged
- [ ] Feature flag allows instant rollback to pg-boss worker

### Non-Functional Requirements

- [ ] Lambda container image size < 700MB
- [ ] Lambda cold start < 15 seconds
- [ ] Average page processing time < 60 seconds
- [ ] Cost per 1000-page job < $3.00
- [ ] DynamoDB TTL cleans up frontier items within 48 hours
- [ ] HMAC callback authentication prevents unauthorized result injection
- [ ] SSRF protection in Lambda matches current Heroku implementation
- [ ] Same-hostname link filtering prevents cross-site scraping

### Quality Gates

- [ ] CDK stack deploys without errors (`cdk deploy`)
- [ ] Lambda handler has unit tests (mocked browser, SQS, DynamoDB)
- [ ] Callback endpoint has integration tests (HMAC verification, idempotency)
- [ ] GitHub Actions workflow builds and pushes container image
- [ ] Load test: 5 concurrent jobs, 100 pages each, all complete successfully

## Dependencies & Prerequisites

- AWS account with permissions to create Lambda, SQS, DynamoDB, ECR, IAM roles
- AWS CDK v2 installed (`npm install -g aws-cdk`)
- Docker installed locally for building container images
- GitHub OIDC provider configured in AWS IAM for CI/CD
- Heroku API accessible from Lambda (public HTTPS endpoint)
- `LAMBDA_CALLBACK_SECRET` generated and stored in both Heroku env vars and AWS SSM

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Lambda cold starts cause user confusion (no progress for 15s) | High | Low | UI already handles "Running, 0 pages" state; cold start is amortized |
| Chromium incompatible with Lambda container runtime | Low | High | Validated pattern: `node:20-slim` + Chrome for Testing works. Many production precedents. |
| DynamoDB hot partitions under burst writes | Low | Medium | On-demand mode handles bursts; `jobId` as partition key distributes load |
| Callback endpoint overwhelmed by 20 concurrent Lambdas | Medium | Medium | NestJS handles concurrent requests well; Heroku router distributes; rate limiting if needed |
| SQS message dedup race (two Lambdas discover same link) | High | None | DynamoDB conditional write handles this atomically — by design |
| Runaway costs from massive sites | Medium | Medium | `maxPages: 1000` cap; Lambda reserved concurrency limit; CloudWatch billing alarm |

## Implementation Phases

### Phase 1: Infrastructure (CDK + Container) — ~2 days
- CDK stack with SQS, DynamoDB, ECR, Lambda, IAM
- Dockerfile with Chromium, playwright-core, sharp
- Lambda handler skeleton (no business logic yet)
- GitHub Actions workflow for ECR push

### Phase 2: Lambda Worker Logic — ~3 days
- Port page rendering from `scraper-worker.service.ts` requestHandler
- Screenshot capture + S3 upload
- Link discovery + DynamoDB dedup + SQS enqueue
- HMAC-signed callback to Heroku
- SSRF protection, cookie dismissal, stealth plugin
- Error handling + SQS batch failure reporting

### Phase 3: Heroku API Changes — ~2 days
- Internal callback endpoint with HMAC verification
- SQS and DynamoDB platform services
- Modified job creation flow (SQS instead of pg-boss)
- Completion detection via DynamoDB counts
- Cancellation flow updates
- Feature flag (`USE_LAMBDA_SCRAPER`)

### Phase 4: Integration Testing & Deployment — ~2 days
- End-to-end test: create job -> Lambda processes -> pages appear in DB -> SSE events
- Load test: multiple concurrent jobs
- Deploy CDK stack to production AWS
- Deploy Heroku with feature flag off, then enable
- Monitor vml.com scrape to completion

### Phase 5: Cleanup — ~1 day
- Remove Crawlee/Playwright from Heroku dependencies
- Remove `heroku-postbuild` Chromium install
- Update documentation
- Archive pg-boss scraper worker code

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-18-site-scraper-lambda-migration-brainstorm.md](docs/brainstorms/2026-03-18-site-scraper-lambda-migration-brainstorm.md) — Key decisions carried forward: Lambda per-page via SQS, DynamoDB URL frontier, API callback to Heroku, 50 concurrent Lambda cap, container image packaging.

### Internal References

- Scraper worker: `apps/api/src/mini-apps/site-scraper/services/scraper-worker.service.ts`
- S3 service: `apps/api/src/_core/third-party/aws/aws.s3.service.ts`
- Legacy Lambda helper: `apps/api/src/_core/third-party/aws/aws.lambda.ts`
- Legacy SQS helper: `apps/api/src/_core/third-party/aws/aws.sqs.ts`
- pg-boss config: `apps/api/src/_platform/queue/pg-boss.config.ts`
- Platform module: `apps/api/src/_platform/platform.module.ts`
- PRD defaults: `PRD_DEFAULTS.md`
- Site scraper plan: `docs/plans/2026-03-14-001-feat-site-scraper-mini-app-plan.md`
- API deployment: `.github/workflows/api.yml`

### External References

- [Playwright on Lambda containers (Mamezou)](https://developer.mamezou-tech.com/en/blogs/2024/07/19/lambda-playwright-container-tips/)
- [SQS event source mapping scaling (AWS Docs)](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)
- [DynamoDB conditional writes (AWS Docs)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html)
- [Lambda container images (AWS Docs)](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)
- [CDK DockerImageFunction (AWS Docs)](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.DockerImageFunction.html)
- [GitHub OIDC for AWS (AWS Docs)](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
