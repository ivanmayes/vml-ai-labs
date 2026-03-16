---
title: "feat: Add Site Scraper Mini App"
type: feat
status: completed
date: 2026-03-14
origin: docs/brainstorms/2026-03-14-site-scraper-brainstorm.md
---

# feat: Add Site Scraper Mini App

## Enhancement Summary

**Deepened on:** 2026-03-14
**Agents used:** 12 (TypeScript, Architecture, Security, Performance, Data Integrity, Pattern Recognition, Simplicity, Frontend Races, Crawlee Docs, NestJS+Playwright, Angular Gallery, Deployment Verification)

### Key Improvements from Deep Review

1. **SSRF hardening** -- DNS rebinding protection via Playwright `page.route()` interceptor on ALL requests, not just initial URL validation
2. **Stored XSS prevention** -- Force `Content-Disposition: attachment` on HTML presigned URLs; never render saved HTML inline
3. **Memory safety** -- Stream screenshots to S3 immediately per-viewport (don't accumulate buffers); reduce `maxConcurrency` to 2, `maxOpenPagesPerBrowser` to 1
4. **Data integrity** -- Atomic SQL counter increments, `UNIQUE(scrapeJobId, url)` constraint, transaction-wrapped page saves, `enumName` prefix for enum types
5. **Simplified architecture** -- Merge `CrawlerService` into worker (YAGNI), defer thumbnail generation to v2, drop per-user job limits for v1
6. **Pattern compliance** -- Add CLI markers, use `@CurrentOrg()`, rename `dto/` to `dtos/`, add `ParseUUIDPipe`, define SSE event enum with typed payloads
7. **Frontend race prevention** -- SSE reconnection with fresh token + REST reconciliation, lazy-load images via IntersectionObserver, `switchMap` for viewport changes
8. **Heroku deployment** -- Standard-2X dyno mandatory, `playwright-core` (not full `playwright`), `enableShutdownHooks()` in main.ts, `PLAYWRIGHT_BUILDPACK_BROWSERS=chromium`

### Simplifications Applied (YAGNI)

- Removed `CrawlerService` abstraction -- crawl logic inlined in worker
- Deferred thumbnail generation to v2
- Removed `@VersionColumn` on ScrapeJob (no concurrent writers in v1)
- Removed `pgBossJobId` entity field
- Simplified error to `ScrapeError` type (not inline object)
- Removed per-user/per-org concurrent job limits for v1 (batchSize:1 is global limit)
- Removed `scrape-job-response.dto.ts` (return entity directly)
- Merged `page-status.enum.ts` into `job-status.enum.ts`
- Inlined `crawl-result.types.ts` in worker

---

## Overview

Build a new mini app called **Site Scraper** that allows users to enter a URL and kicks off a background job to crawl, screenshot, and save the HTML of every discovered page. The app automatically dismisses cookie/privacy popups before screenshotting, producing clean visual captures for client site audits.

**Key decisions carried forward from brainstorm:**
- Crawlee `PlaywrightCrawler` for crawl orchestration (not raw Playwright or custom crawler)
- `@duckduckgo/autoconsent` for cookie popup dismissal (not IDCAC or Consent-O-Matic)
- pg-boss for job queue (existing platform pattern)
- S3 for file storage (existing `AwsS3Service`)
- Configurable depth limit + viewport breakpoints
- Gallery grid UI with click-to-expand
- One-off scrapes only (no scheduling in v1)

## Problem Statement / Motivation

VML teams need to capture comprehensive visual snapshots of client websites for audits, reviews, and archival. Currently this is a manual process - opening each page, taking screenshots at different viewport sizes, and saving HTML. This app automates the entire workflow: enter a URL, configure options, and receive a complete visual catalog of the site.

## Proposed Solution

A full-stack mini app following existing platform patterns:

1. **API**: NestJS controller + service + worker, with pg-boss queue integration
2. **Web**: Angular standalone components with PrimeNG, gallery grid for results
3. **Scraping Engine**: Crawlee `PlaywrightCrawler` with autoconsent + stealth plugins
4. **Storage**: Screenshots (PNG) and HTML files stored in S3
5. **Real-time Updates**: SSE for live progress during crawls

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Angular Web App                                        │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐│
│  │ New Scrape│  │ Job List │  │ Results Gallery        ││
│  │ Form     │  │ + Status │  │ (thumbnails + expand)  ││
│  └────┬─────┘  └────┬─────┘  └────────┬───────────────┘│
│       │              │                 │                │
│       │         SSE Connection         │ Presigned URLs │
└───────┼──────────────┼─────────────────┼────────────────┘
        │              │                 │
┌───────┼──────────────┼─────────────────┼────────────────┐
│  NestJS API          │                 │                │
│  ┌────▼─────┐  ┌─────▼─────┐  ┌───────▼──────────────┐ │
│  │Controller│  │SSE Ctrl   │  │PresignedURL endpoint │ │
│  │POST /jobs│  │GET /events│  │GET /pages/:id/asset  │ │
│  └────┬─────┘  └───────────┘  └──────────────────────┘ │
│       │                                                 │
│  ┌────▼──────────────────────────────────────────────┐  │
│  │  SiteScraperService                               │  │
│  │  - createJob() → pg-boss queue                    │  │
│  │  - getJobs(), getJob(), getPages()                │  │
│  │  - markJobRunning/Completed/Failed                │  │
│  └────┬──────────────────────────────────────────────┘  │
│       │                                                 │
│  ┌────▼──────────────────────────────────────────────┐  │
│  │  ScraperWorkerService (pg-boss consumer)          │  │
│  │  - Launches Crawlee PlaywrightCrawler per job     │  │
│  │  - preNavigationHook: autoconsent injection       │  │
│  │  - requestHandler:                                │  │
│  │    1. Wait for page load + dismiss popups         │  │
│  │    2. For each viewport: resize → screenshot → S3 │  │
│  │    3. page.content() → save HTML → S3             │  │
│  │    4. enqueueLinks() for page discovery           │  │
│  │    5. Update ScrapedPage entity in DB             │  │
│  │    6. Emit SSE progress event                     │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Entities (schema: site_scraper)                  │  │
│  │  - ScrapeJob                                      │  │
│  │  - ScrapedPage                                    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Implementation Phases

#### Phase 1: Scaffold + Data Model

**Tasks:**
- [ ] Run `npm run console:dev CreateApp` to scaffold `site-scraper` mini app
- [ ] Update controller route to `organization/:orgId/apps/site-scraper`
- [ ] Create `ScrapeJob` entity at `apps/api/src/mini-apps/site-scraper/entities/scrape-job.entity.ts`
- [ ] Create `ScrapedPage` entity at `apps/api/src/mini-apps/site-scraper/entities/scraped-page.entity.ts`
- [ ] Create job status enum at `apps/api/src/mini-apps/site-scraper/types/job-status.enum.ts`
- [ ] Create SSE event types at `apps/api/src/mini-apps/site-scraper/types/sse-events.types.ts`
- [ ] Create DTOs at `apps/api/src/mini-apps/site-scraper/dto/`
- [ ] Add `SITE_SCRAPER_QUEUE` constant to `apps/api/src/_platform/queue/pg-boss.config.ts`
- [ ] Add `SiteScraperJobData` interface to `apps/api/src/_platform/queue/pg-boss.types.ts`
- [ ] Add `sendSiteScraperJob()` and `workSiteScraperQueue()` methods to `PgBossService`

**Entity: ScrapeJob** (`scrape_jobs` table, schema: `site_scraper`)

```typescript
// apps/api/src/mini-apps/site-scraper/entities/scrape-job.entity.ts
@Entity({ name: 'scrape_jobs', schema: 'site_scraper' })
@Index('idx_ss_jobs_user_org_status', ['userId', 'organizationId', 'status', 'createdAt'])
export class ScrapeJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Column({ type: 'int', default: 3 })
  maxDepth: number;

  @Column({ type: 'jsonb', default: [1920] })
  viewports: number[];  // e.g. [375, 768, 1024, 1920]

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING })
  status: JobStatus;

  @Column({ type: 'int', default: 0 })
  pagesDiscovered: number;

  @Column({ type: 'int', default: 0 })
  pagesCompleted: number;

  @Column({ type: 'int', default: 0 })
  pagesFailed: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pgBossJobId: string;

  @Column({ type: 'jsonb', nullable: true })
  error: { code: string; message: string; timestamp: string } | null;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'fk_ss_job_user' })
  user: User;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId', foreignKeyConstraintName: 'fk_ss_job_org' })
  organization: Organization;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date;

  @VersionColumn()
  version: number;

  // State machine transition method (follow ConversionJob pattern)
  transitionTo(newStatus: JobStatus): void { /* ... */ }
}
```

**Entity: ScrapedPage** (`scraped_pages` table, schema: `site_scraper`)

```typescript
// apps/api/src/mini-apps/site-scraper/entities/scraped-page.entity.ts
@Entity({ name: 'scraped_pages', schema: 'site_scraper' })
@Index('idx_ss_pages_job_status', ['scrapeJobId', 'status'])
export class ScrapedPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  scrapeJobId: string;

  @ManyToOne(() => ScrapeJob, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scrapeJobId', foreignKeyConstraintName: 'fk_ss_page_job' })
  scrapeJob: ScrapeJob;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string;  // Page <title> extracted from HTML

  @Column({ type: 'int', default: 0 })
  depth: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  htmlS3Key: string;

  @Column({ type: 'jsonb', default: [] })
  screenshots: { viewport: number; s3Key: string; sizeBytes: number }[];

  @Column({ type: 'enum', enum: PageStatus, default: PageStatus.PENDING })
  status: PageStatus;  // pending | completed | failed

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

**ERD:**

```mermaid
erDiagram
    Organization ||--o{ ScrapeJob : has
    User ||--o{ ScrapeJob : creates
    ScrapeJob ||--o{ ScrapedPage : contains

    ScrapeJob {
        uuid id PK
        varchar url
        int maxDepth
        jsonb viewports
        enum status
        int pagesDiscovered
        int pagesCompleted
        int pagesFailed
        jsonb error
        uuid userId FK
        uuid organizationId FK
        timestamptz startedAt
        timestamptz completedAt
    }

    ScrapedPage {
        uuid id PK
        uuid scrapeJobId FK
        varchar url
        varchar title
        int depth
        varchar htmlS3Key
        jsonb screenshots
        enum status
        varchar errorMessage
    }
```

**pg-boss queue integration:**

```typescript
// Add to pg-boss.config.ts
export const SITE_SCRAPER_QUEUE = 'site-scraper';

// Add to pg-boss.types.ts
export interface SiteScraperJobData {
  jobId: string;
  url: string;
  maxDepth: number;
  viewports: number[];
  userId: string;
  organizationId: string;
}
```

**DTOs:**

```typescript
// apps/api/src/mini-apps/site-scraper/dto/create-scrape-job.dto.ts
export class CreateScrapeJobDto {
  @IsUrl({}, { message: 'Must be a valid URL' })
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxDepth?: number = 3;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(320, { each: true })
  @Max(3840, { each: true })
  viewports?: number[] = [1920];
}
```

**Success criteria:**
- Database migrations run cleanly
- Entity schema isolation in `site_scraper` PostgreSQL schema
- pg-boss queue registered on app boot

---

#### Phase 2: Scraping Engine + Worker

**Tasks:**
- [ ] Install npm packages: `crawlee`, `@crawlee/playwright`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `@duckduckgo/autoconsent`
- [ ] Create `ScraperWorkerService` at `apps/api/src/mini-apps/site-scraper/services/scraper-worker.service.ts`
- [ ] Create `CrawlerService` at `apps/api/src/mini-apps/site-scraper/services/crawler.service.ts` (Crawlee wrapper)
- [ ] Create `SiteScraperService` at `apps/api/src/mini-apps/site-scraper/services/site-scraper.service.ts` (DB operations)
- [ ] Implement SSE service at `apps/api/src/mini-apps/site-scraper/services/scraper-sse.service.ts`
- [ ] Update `site-scraper.module.ts` to register all entities, controllers, and services

**CrawlerService** (wraps Crawlee):

```typescript
// apps/api/src/mini-apps/site-scraper/services/crawler.service.ts
@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  async crawlSite(options: {
    url: string;
    maxDepth: number;
    viewports: number[];
    onPageCrawled: (page: CrawledPageResult) => Promise<void>;
    onPageDiscovered: (count: number) => void;
    signal?: AbortSignal;
  }): Promise<CrawlResult> {
    const { url, maxDepth, viewports, onPageCrawled, onPageDiscovered, signal } = options;

    // Configure Crawlee PlaywrightCrawler
    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 200,    // Safety limit
      maxConcurrency: 3,           // Heroku dyno memory constraints
      requestHandlerTimeoutSecs: 120,
      navigationTimeoutSecs: 30,

      launchContext: {
        // Use playwright-extra with stealth
        launcher: chromium,        // from playwright-extra
        launchOptions: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        },
      },

      // Pre-navigation: inject autoconsent for cookie popup dismissal
      preNavigationHooks: [
        async ({ page }) => {
          // Inject autoconsent rules
          const autoconsentRules = require('@duckduckgo/autoconsent/rules/rules.json');
          await page.evaluate((rules) => {
            window.__autoconsent_rules = rules;
          }, autoconsentRules);
        },
      ],

      // Main request handler: screenshot + save HTML per page
      requestHandler: async ({ request, page, enqueueLinks, log }) => {
        if (signal?.aborted) throw new Error('Job cancelled');

        const currentDepth = request.userData.depth || 0;
        log.info(`Processing: ${request.url} (depth: ${currentDepth})`);

        // Wait for page to be fully loaded
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

        // Dismiss cookie popups via autoconsent
        await this.dismissCookiePopups(page);

        // Wait a beat for popup animations to complete
        await page.waitForTimeout(1000);

        // Capture screenshots at each viewport
        const screenshots: { viewport: number; buffer: Buffer }[] = [];
        for (const width of viewports) {
          await page.setViewportSize({ width, height: 800 });
          await page.waitForTimeout(500); // Let layout reflow
          const buffer = await page.screenshot({ fullPage: true, type: 'png' });
          screenshots.push({ viewport: width, buffer });
        }

        // Save HTML
        const html = await page.content();
        const title = await page.title();

        // Callback to parent (worker service)
        await onPageCrawled({
          url: request.url,
          title,
          depth: currentDepth,
          html,
          screenshots,
        });

        // Discover more links (only if within depth limit)
        if (currentDepth < maxDepth) {
          const enqueuedCount = await enqueueLinks({
            strategy: 'same-hostname',
            userData: { depth: currentDepth + 1 },
          });
          onPageDiscovered(enqueuedCount.processedRequests.length);
        }
      },

      failedRequestHandler: async ({ request, log }) => {
        log.error(`Failed: ${request.url} after ${request.retryCount} retries`);
      },
    });

    await crawler.run([{ url, userData: { depth: 0 } }]);

    return {
      totalPages: crawler.stats.state.requestsFinished,
      failedPages: crawler.stats.state.requestsFailed,
    };
  }

  private async dismissCookiePopups(page: Page): Promise<void> {
    try {
      // Use autoconsent to detect and dismiss cookie consent banners
      // Inject the autoconsent content script
      const { ConsentOMaticCMP } = await import('@duckduckgo/autoconsent');
      // ... autoconsent integration
      // Fallback: try common dismiss selectors
      const dismissSelectors = [
        '[id*="cookie"] button[class*="accept"]',
        '[id*="consent"] button[class*="accept"]',
        '[class*="cookie"] button[class*="accept"]',
        'button[id*="accept-cookies"]',
        '.cc-dismiss',
        '#onetrust-accept-btn-handler',
        '.cmpboxbtn.cmpboxbtnyes',
      ];
      for (const selector of dismissSelectors) {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch {
      // Cookie popup dismissal is best-effort
    }
  }
}
```

**ScraperWorkerService** (follows ConversionWorkerService pattern):

```typescript
// apps/api/src/mini-apps/site-scraper/services/scraper-worker.service.ts
@Injectable()
export class ScraperWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly activeJobs = new Set<string>();
  private readonly abortControllers = new Map<string, AbortController>();
  private isShuttingDown = false;

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly scraperService: SiteScraperService,
    private readonly crawlerService: CrawlerService,
    private readonly s3Service: AwsS3Service,
    private readonly sseService: ScraperSseService,
  ) {}

  async onModuleInit() {
    await this.pgBossService.workSiteScraperQueue(
      this.processJob.bind(this),
      { batchSize: 1 },  // One crawl at a time (resource intensive)
    );
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    for (const [, controller] of this.abortControllers) {
      controller.abort();
    }
    // Wait for active jobs with 30s timeout (same as ConversionWorkerService)
  }

  private async processSingleJob(job: PgBoss.Job<SiteScraperJobData>) {
    const { jobId, url, maxDepth, viewports, userId, organizationId } = job.data;
    const abortController = new AbortController();
    this.abortControllers.set(jobId, abortController);
    this.activeJobs.add(jobId);

    try {
      await this.scraperService.markJobRunning(jobId, job.id);

      // Emit SSE: job started
      this.sseService.emitJobEvent(jobId, userId, organizationId, 'job:started', {
        id: jobId, status: 'running',
      });

      const result = await this.crawlerService.crawlSite({
        url,
        maxDepth,
        viewports,
        signal: abortController.signal,

        onPageCrawled: async (pageResult) => {
          // Upload screenshots to S3
          const screenshots = [];
          for (const ss of pageResult.screenshots) {
            const s3Key = `site-scraper/${jobId}/screenshots/${this.urlToFileName(pageResult.url)}-${ss.viewport}w.png`;
            await this.s3Service.upload({
              key: s3Key,
              buffer: ss.buffer,
              contentType: 'image/png',
            });
            screenshots.push({ viewport: ss.viewport, s3Key, sizeBytes: ss.buffer.length });
          }

          // Upload HTML to S3
          const htmlS3Key = `site-scraper/${jobId}/html/${this.urlToFileName(pageResult.url)}.html`;
          await this.s3Service.upload({
            key: htmlS3Key,
            buffer: Buffer.from(pageResult.html, 'utf-8'),
            contentType: 'text/html; charset=utf-8',
          });

          // Save ScrapedPage entity
          await this.scraperService.savePageResult(jobId, {
            url: pageResult.url,
            title: pageResult.title,
            depth: pageResult.depth,
            htmlS3Key,
            screenshots,
          });

          // Emit SSE: page completed
          this.sseService.emitJobEvent(jobId, userId, organizationId, 'page:completed', {
            url: pageResult.url,
            title: pageResult.title,
            pagesCompleted: await this.scraperService.getCompletedPageCount(jobId),
          });
        },

        onPageDiscovered: async (count) => {
          await this.scraperService.incrementPagesDiscovered(jobId, count);
          this.sseService.emitJobEvent(jobId, userId, organizationId, 'pages:discovered', {
            newPages: count,
          });
        },
      });

      // Mark job completed
      await this.scraperService.markJobCompleted(jobId, result.totalPages, result.failedPages);
      this.sseService.emitJobEvent(jobId, userId, organizationId, 'job:completed', {
        id: jobId, totalPages: result.totalPages, failedPages: result.failedPages,
      });

    } catch (error) {
      await this.scraperService.markJobFailed(jobId, error);
      this.sseService.emitJobEvent(jobId, userId, organizationId, 'job:failed', {
        id: jobId, error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.activeJobs.delete(jobId);
      this.abortControllers.delete(jobId);
    }
  }

  private urlToFileName(url: string): string {
    return url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 200);
  }
}
```

**Heroku deployment considerations:**
- `maxConcurrency: 3` in Crawlee to stay within dyno memory limits (512MB standard-1x)
- `batchSize: 1` for the worker - one crawl job at a time since each launches a browser
- `--no-sandbox` flag for Chromium on Heroku (no root user)
- `--disable-dev-shm-usage` to avoid `/dev/shm` size issues on containers
- Playwright binary needs to be installed via Heroku buildpack or at build time
- Consider adding `playwright install chromium --with-deps` to build scripts

**Success criteria:**
- Worker picks up jobs from pg-boss queue and crawls sites
- Screenshots and HTML uploaded to S3
- Cookie popups dismissed automatically
- SSE events broadcast during crawl progress
- Graceful shutdown with 30s timeout

---

#### Phase 3: API Controller + Endpoints

**Tasks:**
- [ ] Create main controller at `apps/api/src/mini-apps/site-scraper/site-scraper.controller.ts`
- [ ] Create SSE controller at `apps/api/src/mini-apps/site-scraper/site-scraper-sse.controller.ts`
- [ ] Wire up module imports in `site-scraper.module.ts`

**API Endpoints:**

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/organization/:orgId/apps/site-scraper/jobs` | Create a new scrape job |
| `GET` | `/organization/:orgId/apps/site-scraper/jobs` | List scrape jobs (paginated) |
| `GET` | `/organization/:orgId/apps/site-scraper/jobs/:jobId` | Get job details |
| `DELETE` | `/organization/:orgId/apps/site-scraper/jobs/:jobId` | Cancel/delete a job |
| `GET` | `/organization/:orgId/apps/site-scraper/jobs/:jobId/pages` | List scraped pages for a job |
| `GET` | `/organization/:orgId/apps/site-scraper/pages/:pageId/screenshot` | Get presigned URL for screenshot |
| `GET` | `/organization/:orgId/apps/site-scraper/pages/:pageId/html` | Get presigned URL for HTML |
| `POST` | `/organization/:orgId/apps/site-scraper/sse-token` | Get SSE auth token |
| `GET` | `/organization/:orgId/apps/site-scraper/events` | SSE event stream |

**Controller pattern** (follows DocumentConverterController):

```typescript
@Controller('organization/:orgId/apps/site-scraper')
@RequiresApp('site-scraper')
@UseGuards(AuthGuard('jwt'))
export class SiteScraperController {
  @Post('jobs')
  async createJob(
    @Param('orgId') orgId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateScrapeJobDto,
  ): Promise<ResponseEnvelope<ScrapeJob>> { /* ... */ }

  @Get('jobs')
  async listJobs(
    @Param('orgId') orgId: string,
    @CurrentUser() user: User,
    @Query() findOptions: FindOptions,
  ): Promise<ResponseEnvelopeFind<ScrapeJob>> { /* ... */ }

  @Get('pages/:pageId/screenshot')
  async getScreenshot(
    @Param('pageId') pageId: string,
    @Query('viewport') viewport: number,
  ): Promise<ResponseEnvelope<{ url: string }>> {
    // Generate presigned S3 URL for the screenshot
  }
}
```

**Success criteria:**
- All endpoints return proper `ResponseEnvelope` format
- Auth guards and `@RequiresApp` decorator applied
- Pagination working for job listing
- Presigned URLs generated for S3 assets

---

#### Phase 4: Web UI

**Tasks:**
- [ ] Create scrape form page at `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-home/`
- [ ] Create job detail page at `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-job/`
- [ ] Create gallery component at `apps/web/src/app/mini-apps/site-scraper/components/page-gallery/`
- [ ] Create screenshot viewer component at `apps/web/src/app/mini-apps/site-scraper/components/screenshot-viewer/`
- [ ] Create Angular HTTP service at `apps/web/src/app/mini-apps/site-scraper/services/site-scraper.service.ts`
- [ ] Create SSE service at `apps/web/src/app/mini-apps/site-scraper/services/site-scraper-sse.service.ts`
- [ ] Configure routes at `apps/web/src/app/mini-apps/site-scraper/site-scraper.routes.ts`

**Home Page (New Scrape + Job List):**

```
┌─────────────────────────────────────────────────────────┐
│  Site Scraper                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ New Scrape ───────────────────────────────────────┐ │
│  │  URL: [https://example.com________________] [Scan] │ │
│  │                                                     │ │
│  │  Depth: [▼ 3]   Viewports: [✓375] [✓768] [✓1920]  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ Recent Jobs ──────────────────────────────────────┐ │
│  │  URL              Status    Pages   Date           │ │
│  │  example.com      ✅ Done    42     Mar 14, 2026   │ │
│  │  client-site.com  ⏳ 67%    18/27  Mar 14, 2026   │ │
│  │  old-site.org     ❌ Failed  0      Mar 13, 2026   │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Job Detail Page (Gallery Grid):**

```
┌─────────────────────────────────────────────────────────┐
│  ← Back   example.com - 42 pages scraped               │
├─────────────────────────────────────────────────────────┤
│  Viewport: [All ▼]   Sort: [Depth ▼]                   │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ [thumb]  │ │ [thumb]  │ │ [thumb]  │ │ [thumb]  │  │
│  │ /        │ │ /about   │ │ /contact │ │ /blog    │  │
│  │ 1920px   │ │ 1920px   │ │ 1920px   │ │ 1920px   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ [thumb]  │ │ [thumb]  │ │ [thumb]  │ │ [thumb]  │  │
│  │ /pricing │ │ /faq     │ │ /team    │ │ /careers │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

**PrimeNG Components to use:**
- `p-inputtext` for URL input
- `p-select` for depth selection
- `p-multiselect` or `p-togglebutton` for viewport selection
- `p-button` for submit
- `p-table` for job list (paginated)
- `p-tag` for status badges
- `p-galleria` or custom grid for screenshot thumbnails
- `p-dialog` for full-size screenshot viewer
- `p-progressbar` for in-progress jobs
- `p-breadcrumb` for navigation

**Type imports** (from `@api/` path alias, never duplicate):
```typescript
import { ScrapeJob } from '@api/mini-apps/site-scraper/entities/scrape-job.entity';
import { ScrapedPage } from '@api/mini-apps/site-scraper/entities/scraped-page.entity';
import { CreateScrapeJobDto } from '@api/mini-apps/site-scraper/dto/create-scrape-job.dto';
import { JobStatus } from '@api/mini-apps/site-scraper/types/job-status.enum';
```

**Success criteria:**
- Form validates URL, depth, and viewport inputs
- Real-time progress updates via SSE during active crawls
- Gallery grid displays screenshot thumbnails from S3 presigned URLs
- Click-to-expand shows full-size screenshot
- HTML download link per page

---

## System-Wide Impact

### Interaction Graph

- User submits scrape job → Controller validates → SiteScraperService creates entity → PgBossService queues job → ScraperWorkerService picks up → CrawlerService launches Crawlee → Per-page: S3 upload + DB save + SSE emit → Job completion: update entity + SSE emit

### Error Propagation

- **URL validation errors**: Caught in DTO validation (class-validator), returned as 400
- **Site unreachable**: Crawlee's `failedRequestHandler` catches per-page; if all pages fail, job marked as FAILED
- **S3 upload failures**: Caught in worker, page marked as FAILED, job continues for remaining pages
- **Browser crash**: Crawlee handles browser restart internally; worker catches top-level error
- **pg-boss job timeout**: Configured via `expireInSeconds`; job retried up to `retryLimit`

### State Lifecycle Risks

- **Partial crawl failure**: Job can have mix of completed and failed pages. `pagesFailed` counter tracks this. Job status is `COMPLETED` (with failures noted) rather than `FAILED` unless the crawl couldn't start at all.
- **S3 orphans on job deletion**: Need cleanup logic to delete S3 prefix `site-scraper/{jobId}/` when job is deleted.
- **Browser process leak**: Crawlee manages browser lifecycle, but `onModuleDestroy` must ensure crawler is shut down.

### API Surface Parity

- No existing site scraping interfaces. This is a new capability.
- Follows the same patterns as document-converter for: job lifecycle, SSE events, S3 storage, presigned URLs.

---

## Acceptance Criteria

### Functional Requirements

- [ ] User can enter a URL and start a scrape job
- [ ] Configurable crawl depth (1-5, default 3)
- [ ] Configurable viewport breakpoints (selection from preset widths)
- [ ] Automatic cookie/privacy popup dismissal before screenshots
- [ ] Full-page PNG screenshots at each configured viewport
- [ ] HTML content saved for each page
- [ ] Real-time progress updates during crawl (pages discovered, pages completed)
- [ ] Gallery grid view of all screenshots for a completed job
- [ ] Click to expand any screenshot to full size
- [ ] Download HTML file for any scraped page
- [ ] Job history list with status, page counts, and timestamps
- [ ] Cancel an in-progress scrape job
- [ ] Delete a completed job (cleans up S3 files)

### Non-Functional Requirements

- [ ] Crawl stays within same hostname (no cross-domain)
- [ ] Safety limit of 200 pages per crawl
- [ ] Screenshots stored as PNG in S3
- [ ] Job processing via pg-boss (not blocking API server)
- [ ] Graceful shutdown waits for active crawl to complete (30s timeout)
- [ ] Works on Heroku standard-1x dynos (512MB RAM)

### Quality Gates

- [ ] Entity migration runs without errors
- [ ] All API endpoints return proper ResponseEnvelope format
- [ ] DTOs imported from `@api/` in web app (never duplicated)
- [ ] PrimeNG components used throughout (no raw HTML inputs)
- [ ] `--p-` design tokens used for colors (no hardcoded hex)

---

## Critical Gaps (from SpecFlow Analysis)

The following gaps were identified by the SpecFlow analyzer and best practices research. All are addressed in this plan:

### 1. SSRF Protection (Security - Critical)

The crawler runs server-side and could access internal infrastructure if not guarded. Add a `UrlValidationService` that:
- Resolves hostnames to IPs and rejects private/reserved ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- Enforces HTTPS-only (reject `http://`)
- Strips credentials from URLs (`https://user:pass@...`)
- Rejects IP-based URLs and `localhost`
- Max URL length: 2048 characters

### 2. Thumbnail Generation (Performance - Critical)

Loading full-resolution screenshots (1-5MB each) in a gallery grid is unusable. During the crawl, generate a 400px-wide thumbnail alongside each full screenshot:
- Store as separate S3 key: `site-scraper/{jobId}/{pageId}/thumb-{viewport}w.png`
- Add `thumbnailS3Key` to the screenshots JSON: `{ viewport, s3Key, thumbnailS3Key, sizeBytes }`
- Gallery loads thumbnails; full-size loaded on click-to-expand

### 3. Crawlee Storage Configuration (Infrastructure)

Crawlee writes to local disk by default. On Heroku (ephemeral filesystem), use:
```typescript
const config = new Configuration({
  persistStorage: false,  // Memory-only, no disk writes
  purgeOnStart: true,
});
```
Results go directly to S3 via `AwsS3Service` in the `requestHandler`.

### 4. Heroku Playwright Buildpack (Deployment Blocker)

Add the Playwright community buildpack before the Node.js buildpack:
```bash
heroku buildpacks:add --index 1 https://github.com/playwright-community/heroku-playwright-buildpack
```
Set `PLAYWRIGHT_BUILDPACK_BROWSERS=chromium` to install only Chromium and minimize slug size.
Recommended dyno: Standard-2X (1GB RAM) for worker processes.

### 5. Crawlee Memory Management

For Heroku Standard-2X (1GB):
```typescript
browserPoolOptions: {
  retireBrowserAfterPageCount: 30,  // Prevent memory creep
  maxOpenPagesPerBrowser: 3,
},
autoscaledPoolOptions: {
  maxConcurrency: 3,
  desiredConcurrency: 1,  // Start low, autoscale up
},
```
Launch args must include: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`

### 6. Lazy-loaded Content Handling

Before screenshotting, scroll to bottom and back to trigger lazy-loaded images:
```typescript
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(300);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
```

### 7. Gallery Pagination

For large result sets (200+ pages x 4 viewports), paginate the gallery at 20 items per page with virtual scrolling.

### 8. Job Resource Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max pages per job | 200 | Crawlee `maxRequestsPerCrawl` |
| Max concurrent jobs per user | 1 | Browser is memory-intensive |
| Max concurrent jobs per org | 3 | Fair resource sharing |
| Max depth | 5 | Prevents runaway discovery |
| pg-boss `expireInSeconds` | 1800 (30 min) | Deep crawls take time |
| Min delay between requests | 1 second | Respectful crawling |

---

## Dependencies & Risks

### Dependencies
- **Playwright binary on Heroku**: Requires `heroku-playwright-buildpack` added before `heroku/nodejs`. Set `PLAYWRIGHT_BUILDPACK_BROWSERS=chromium`.
- **Heroku ephemeral filesystem**: Crawlee configured with `persistStorage: false` to use memory-only storage. Results go directly to S3.
- **S3 bucket**: Already configured for existing apps. No new setup needed.
- **pg-boss**: Already running. Just adding a new queue.

### Risks
- **Memory pressure**: Playwright + Chromium uses significant RAM. Mitigated by: `maxConcurrency: 3`, `batchSize: 1`, `retireBrowserAfterPageCount: 30`, Standard-2X dyno.
- **Crawl duration**: Deep crawls of large sites could take 10-30+ minutes. pg-boss `expireInSeconds: 1800` (30 minutes) with 2 retries.
- **Bot detection**: Some sites actively block headless browsers. Stealth plugin helps but isn't foolproof. Failed pages are marked and crawl continues.
- **Autoconsent coverage**: Not all cookie popups are covered. Fallback CSS selectors for common CMPs.
- **SSRF**: Mitigated by `UrlValidationService` rejecting private IPs, localhost, and HTTP URLs.
- **Slug size**: Chromium adds ~350MB to slug. Heroku 500MB limit is tight. Install chromium-only (not Firefox/WebKit).

---

## File Structure (New Files)

```
apps/api/src/mini-apps/site-scraper/
├── AGENTS.md
├── site-scraper.module.ts
├── site-scraper.controller.ts
├── site-scraper-sse.controller.ts
├── dto/
│   ├── create-scrape-job.dto.ts
│   └── scrape-job-response.dto.ts
├── entities/
│   ├── scrape-job.entity.ts
│   └── scraped-page.entity.ts
├── services/
│   ├── site-scraper.service.ts          # DB operations
│   ├── crawler.service.ts               # Crawlee wrapper
│   ├── scraper-worker.service.ts        # pg-boss consumer
│   └── scraper-sse.service.ts           # SSE management
└── types/
    ├── job-status.enum.ts
    ├── page-status.enum.ts
    ├── sse-events.types.ts
    └── crawl-result.types.ts

apps/web/src/app/mini-apps/site-scraper/
├── AGENTS.md
├── site-scraper.routes.ts
├── pages/
│   ├── site-scraper-home/
│   │   ├── site-scraper-home.component.ts
│   │   ├── site-scraper-home.component.html
│   │   └── site-scraper-home.component.scss
│   └── site-scraper-job/
│       ├── site-scraper-job.component.ts
│       ├── site-scraper-job.component.html
│       └── site-scraper-job.component.scss
├── components/
│   ├── page-gallery/
│   │   ├── page-gallery.component.ts
│   │   ├── page-gallery.component.html
│   │   └── page-gallery.component.scss
│   └── screenshot-viewer/
│       ├── screenshot-viewer.component.ts
│       ├── screenshot-viewer.component.html
│       └── screenshot-viewer.component.scss
└── services/
    ├── site-scraper.service.ts
    └── site-scraper-sse.service.ts
```

---

## Research Insights (from Deepen-Plan)

### Security (CRITICAL -- implement before any code)

**SSRF Hardening -- DNS rebinding + subresource protection:**
The initial URL validation is insufficient. A Playwright `page.route()` interceptor must validate the destination IP of EVERY request (redirects, iframes, subresources, JS fetches):

```typescript
// In requestHandler, BEFORE any navigation
page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  const resolved = await dns.promises.resolve4(url.hostname).catch(() => []);
  if (resolved.some(ip => isPrivateIP(ip))) {
    await route.abort('blockedbyclient');
    return;
  }
  await route.continue();
});
```

Block: `169.254.169.254` (AWS metadata), `10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `fd00::/8`, `metadata.google.internal`.

**Stored XSS -- HTML presigned URLs:**
```typescript
// ALWAYS force download, never inline render
await this.s3Service.generatePresignedUrl({
  key: htmlS3Key,
  responseContentDisposition: 'attachment; filename="page.html"',
  responseContentType: 'text/plain',
});
```

**Org-scoped auth on presigned URL endpoints:**
```typescript
// In getScreenshot/getHtml service methods
const page = await this.pageRepo.findOne({
  where: { id: pageId, scrapeJob: { organizationId: orgId } },
  relations: ['scrapeJob'],
});
if (!page) throw new NotFoundException();
```

**Error message sanitization:**
Strip IPs and internal details before sending errors via SSE to clients.

### Performance (P0 -- must fix)

**Stream screenshots to S3 immediately:**
```typescript
// DON'T accumulate buffers across viewports
for (const width of viewports) {
  await page.setViewportSize({ width, height: 800 });
  const buffer = await page.screenshot({ fullPage: true, type: 'png' });
  await s3Service.upload({ key, buffer, contentType: 'image/png' });
  // buffer eligible for GC immediately
}
```

**Crawlee configuration for Heroku Standard-2X (1GB):**
```typescript
const crawler = new PlaywrightCrawler({
  maxRequestsPerCrawl: 200,
  maxConcurrency: 2,           // NOT 3 -- memory constraint
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: 60,
  navigationTimeoutSecs: 30,
  maxRequestsPerMinute: 60,
  browserPoolOptions: {
    retireBrowserAfterPageCount: 15,
    maxOpenPagesPerBrowser: 1,   // Serialize within browser
  },
  launchContext: {
    launcher: chromium,
    launchOptions: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox',
             '--disable-dev-shm-usage', '--disable-gpu',
             '--js-flags=--max-old-space-size=512'],
    },
  },
}, new Configuration({ persistStorage: false, purgeOnStart: true }));
```

**Reduce wait times (saves ~7min on 200-page crawl):**
- Cookie popup wait: 300ms (not 1000ms)
- Viewport reflow: use `page.waitForFunction(() => document.readyState === 'complete')` (not 500ms)

**Batch presigned URL endpoint:**
Add `GET /jobs/:jobId/presigned-urls?viewport=1920&page=1&pageSize=20` to avoid 800 individual API calls for the gallery.

### Data Integrity

**Atomic counter increments (prevent race conditions with maxConcurrency: 2):**
```typescript
await this.jobRepository.createQueryBuilder()
  .update(ScrapeJob)
  .set({ pagesCompleted: () => '"pagesCompleted" + 1' })
  .where('id = :jobId', { jobId })
  .execute();
```

**Transaction-wrapped page saves:**
```typescript
await this.dataSource.transaction(async (manager) => {
  await manager.save(ScrapedPage, pageEntity);
  await manager.increment(ScrapeJob, { id: jobId }, 'pagesCompleted', 1);
});
```

**Enum name prefix (prevent TypeORM collision with document-converter):**
```typescript
@Column({ type: 'enum', enum: JobStatus, enumName: 'ss_job_status' })
```

**JSONB default as string (DDL safety):**
```typescript
@Column({ type: 'jsonb', default: () => "'[1920]'" })
viewports: number[];
```

### TypeScript Patterns

**ScrapeError type (matching ConversionError pattern):**
```typescript
export type ScrapeErrorCode = 'CRAWL_TIMEOUT' | 'CRAWL_FAILED' | 'SSRF_BLOCKED'
  | 'S3_ERROR' | 'BROWSER_CRASH' | 'SITE_UNREACHABLE' | 'JOB_CANCELLED';

export interface ScrapeError {
  code: ScrapeErrorCode;
  message: string;
  retryable: boolean;
  timestamp: string;
}
```

**SSE event enum with typed payloads:**
```typescript
export enum ScraperSSEEventType {
  CONNECTION = 'connection',
  HEARTBEAT = 'heartbeat',
  JOB_STARTED = 'job:started',
  PAGE_COMPLETED = 'page:completed',
  PAGES_DISCOVERED = 'pages:discovered',
  JOB_COMPLETED = 'job:completed',
  JOB_FAILED = 'job:failed',
  JOB_CANCELLED = 'job:cancelled',
}
```

**Hash-based S3 filenames (prevent collision):**
```typescript
private urlToFileName(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  const readable = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 100);
  return `${readable}-${hash}`;
}
```

### Crawlee API Notes

- `maxCrawlDepth` is NOT a direct constructor option -- use `request.userData.depth` tracking in `enqueueLinks`
- Use `postNavigationHooks` (not pre) for cookie dismissal -- modals appear after page load
- `Configuration` is the **second** constructor argument, not part of options
- `enqueueLinks` default strategy is `same-hostname`
- Use `errorHandler` for per-attempt logging, `failedRequestHandler` for final failure handling

### Frontend Patterns

**SSE reconnection with fresh token + REST reconciliation:**
- On `EventSource.onerror`: close old source, fetch new SSE token, create new EventSource, cap retries with exponential backoff
- On reconnect success: immediately `GET /jobs/:jobId` to reconcile missed events
- Establish SSE connection BEFORE submitting job to avoid missing start events

**Gallery image loading:**
- Use `IntersectionObserver` directive for lazy-loading thumbnails
- Show PrimeNG `p-skeleton` during load, fade in on `(load)` event
- Use `@for (page of pages(); track page.id)` with `update()` (not `set()`) to prevent re-renders
- On viewport change: use `switchMap` to cancel stale image loads

**EventSource in Angular:**
```typescript
this.zone.runOutsideAngular(() => {
  this.eventSource = new EventSource(url);
  this.eventSource.addEventListener('page:completed', (e) => {
    this.zone.run(() => this.handlePageCompleted(JSON.parse(e.data)));
  });
});
```

### Heroku Deployment Checklist

- [ ] Add `heroku-playwright-buildpack` BEFORE `heroku/nodejs` buildpack
- [ ] Set `PLAYWRIGHT_BUILDPACK_BROWSERS=chromium`
- [ ] Use `playwright-core` package (not `playwright`) -- let buildpack provide Chromium
- [ ] Standard-2X dyno (1GB) mandatory for worker
- [ ] Verify `enableShutdownHooks()` exists in `main.ts`
- [ ] Verify slug size stays under 500MB with Chromium (~350MB)
- [ ] Set pg-boss `expireInSeconds: 1800` for scraper queue
- [ ] Test Chromium launch with `--no-sandbox` on Heroku

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-14-site-scraper-brainstorm.md](docs/brainstorms/2026-03-14-site-scraper-brainstorm.md) — Key decisions: Crawlee + autoconsent stack, pg-boss queue, S3 storage, gallery grid UI, configurable depth + viewports

### Internal References

- Worker pattern: `apps/api/src/mini-apps/document-converter/services/conversion-worker.service.ts`
- SSE pattern: `apps/api/src/mini-apps/document-converter/services/conversion-sse.service.ts`
- Entity pattern: `apps/api/src/mini-apps/document-converter/entities/conversion-job.entity.ts`
- Module pattern: `apps/api/src/mini-apps/document-converter/document-converter.module.ts`
- pg-boss config: `apps/api/src/_platform/queue/pg-boss.config.ts`
- pg-boss types: `apps/api/src/_platform/queue/pg-boss.types.ts`
- S3 service: `apps/api/src/_core/third-party/aws/aws.s3.service.ts`
- Architectural defaults: `PRD_DEFAULTS.md`

### External References

- Crawlee docs: https://crawlee.dev/
- Playwright docs: https://playwright.dev/
- @duckduckgo/autoconsent: https://github.com/duckduckgo/autoconsent
- puppeteer-extra-plugin-stealth: https://github.com/berstend/puppeteer-extra
