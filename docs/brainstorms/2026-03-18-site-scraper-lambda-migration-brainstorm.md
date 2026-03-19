# Brainstorm: Site Scraper Lambda Migration

**Date:** 2026-03-18
**Status:** Ready for planning
**Participants:** Ivan Mayes, Claude

## Problem Statement

The site scraper runs inside the Heroku API dyno (512MB RAM). Chromium alone needs 200-400MB, leaving insufficient headroom for large sites. The vml.com scrape (900+ pages, 4 viewports) consistently OOMs at ~1052MB despite browser retirement every 20 pages, buffer optimizations, and single-page concurrency. This is a fundamental architectural constraint — Chromium and the NestJS API cannot share a 512MB process.

## What We're Building

A serverless scraping pipeline that offloads page-level rendering to AWS Lambda, using SQS for job distribution and DynamoDB for URL deduplication. The Heroku API remains the control plane (job CRUD, SSE, auth) while Lambda containers handle the heavy browser work.

### Architecture Overview

```
User -> Heroku API -> SQS (page-work queue)
                  \-> DynamoDB (URL frontier)

SQS -> Lambda (per-page worker, container image with Chromium)
   \-> Lambda screenshots -> S3
   \-> Lambda discovers links -> DynamoDB check -> SQS (new pages)
   \-> Lambda writes page result -> PostgreSQL

Heroku API polls PostgreSQL for progress -> SSE to frontend
```

### Components

1. **Heroku API (control plane)** — Job CRUD, auth, SSE, admin dashboard. No longer runs Chromium. Sends seed URL to SQS on job creation.

2. **SQS Standard Queue (page-work)** — Distributes individual page URLs to Lambda workers. Message contains: `{ jobId, url, depth, maxDepth, viewports, organizationId }`.

3. **Lambda Container Image (page worker)** — Docker image based on `ghcr.io/nickvdyck/chromium-lambda` or similar. Each invocation: launches Chromium, renders one page, takes screenshots at all viewports, uploads to S3, saves page result to PostgreSQL, discovers links and enqueues new ones.

4. **DynamoDB Table (URL frontier)** — Tracks all discovered URLs per job. Atomic conditional writes prevent duplicate processing. Schema: `PK: jobId, SK: normalizedUrl, depth: number, status: pending|processing|completed|failed`.

5. **SQS Result Queue or DB Polling** — Heroku API polls PostgreSQL for page completion counts. SSE events generated from DB state changes (existing pattern). No new result queue needed.

## Why This Approach

### Why Lambda per-page (not ECS Fargate)?
- **Massive parallelism**: 50+ pages simultaneously. A 200-page site finishes in 2-3 minutes instead of 30+.
- **Cost efficiency**: Pay only for execution time. No idle containers waiting for jobs.
- **Natural scaling**: SQS + Lambda scales automatically. No capacity planning.
- **Isolation**: Each page gets its own Chromium instance. One page crash doesn't affect others.

### Why container image (not Lambda layers)?
- Full control over Chromium version and dependencies
- No 250MB layer size constraint (container images up to 10GB)
- Easier to include sharp, autoconsent, adblocker, stealth plugin
- Reproducible builds via Dockerfile

### Why DynamoDB for deduplication (not SQS FIFO)?
- No 300 msg/s throughput limit (standard SQS is unlimited)
- Atomic conditional writes are perfect for "first discoverer wins"
- Can query frontier state for monitoring/debugging
- Survives Lambda retries (idempotent)

### Why keep Heroku as control plane?
- All auth, org-scoping, WPP Open integration stays unchanged
- SSE infrastructure already works
- Minimal migration risk — just replace the worker, not the API
- pg-boss can be retained for non-scraper queues

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution model | Lambda per-page via SQS | Maximum parallelism, pay-per-use, natural scaling |
| Lambda packaging | Container image (Docker) | Full Chromium control, no size limits, reproducible |
| URL deduplication | DynamoDB conditional writes | Atomic, scalable, queryable, survives retries |
| Coordination | DB polling from Heroku | Simple, uses existing PostgreSQL, no new infra |
| Page discovery | Each Lambda discovers + enqueues | Iterative discovery works naturally with SQS |
| Job completion | Lambda checks "all pages done" | Last Lambda to complete checks DynamoDB frontier |

## Cost Estimate (vml.com scale: ~1000 pages)

| Resource | Usage | Cost |
|----------|-------|------|
| Lambda (2GB, 30s avg/page) | 1000 invocations x 30s | ~$1.00 |
| S3 (screenshots + HTML) | ~5GB writes | ~$0.02 |
| DynamoDB (URL frontier) | ~5000 writes + 5000 reads | ~$0.01 |
| SQS (messages) | ~2000 messages | ~$0.001 |
| **Total per large job** | | **~$1.03** |

## Resolved Questions

1. **Lambda concurrency**: Cap at 50 concurrent Lambdas per job. Prevents overwhelming PostgreSQL connection limits on Heroku Postgres. 50 parallel workers finish 1000 pages in ~10 minutes.

2. **Cold start mitigation**: Accept cold starts (~8-10s). Pages take 15-30s to process anyway, so cold start is amortized. Provisioned concurrency adds cost with little benefit.

3. **Job completion detection**: Heroku polls page counts. Existing SSE polling checks `pagesCompleted + pagesFailed == pagesDiscovered` with SQS queue empty as confirmation. Slight delay (poll interval) but reliable and simple.

4. **Error handling / retries**: SQS built-in retry (3 attempts), then Dead Letter Queue. Failed pages saved as `status: 'failed'` via API callback. Job marked COMPLETED_WITH_ERRORS if any pages failed. No infinite retries.

5. **pg-boss**: Keep pg-boss for non-scraper queues (WPP Open Agent Updater uses it). For scraping, SQS replaces pg-boss as the job distribution mechanism. pg-boss still used for initial job creation trigger if desired, or remove entirely for scraper flow.

6. **Database connectivity**: API callback to Heroku. Lambda POSTs to `POST /internal/scraper/page-result` with page data. No DB credentials in Lambda, no VPC needed. Heroku handles all DB writes through its existing connection pool. Secured via a shared secret/API key in Lambda env vars.

## Open Questions

1. **Deployment pipeline**: How to build and push the Lambda container image? GitHub Actions to ECR on push to main? Or manual deploy initially?

2. **Infrastructure as Code**: Use CDK, Terraform, or manual AWS Console setup for SQS, DynamoDB, Lambda, ECR? CDK is natural for a Node.js project.
