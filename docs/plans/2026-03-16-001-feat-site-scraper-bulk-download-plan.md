---
title: "feat: Site Scraper Bulk Download"
type: feat
status: active
date: 2026-03-16
origin: docs/brainstorms/2026-03-16-site-scraper-bulk-download-brainstorm.md
---

# feat: Site Scraper Bulk Download

## Enhancement Summary

**Deepened on:** 2026-03-16
**Sections enhanced:** 8
**Research agents used:** archiver best practices, NestJS streaming, URL-to-filepath sanitization, architecture review, security review, performance review

### Key Improvements
1. **HMAC-signed download tokens** instead of in-memory store — eliminates dyno restart / multi-dyno issues
2. **ZIP Slip prevention** — comprehensive path sanitization algorithm with path traversal defense
3. **Archiver backpressure** — await each stream's `end` event before appending next entry (critical for memory safety)
4. **Cache HTML when both HTML + markdown requested** — saves 50% of S3 requests for dual-format downloads
5. **`X-Accel-Buffering: no`** header to prevent proxy buffering of streamed response
6. **Write manifest.json first** — ensures first byte sent within Heroku's 30s timeout
7. **ZIP64 mode** — required for archives that may exceed 4GB (1000+ pages with screenshots)
8. **`archive.destroy()` after `archive.abort()`** — proper cleanup on disconnect

### Security Findings to Address
- ZIP Slip (HIGH) — path traversal via crafted URLs
- Token in URL logs (MEDIUM) — add `Referrer-Policy: no-referrer`
- Download concurrency (MEDIUM) — add per-user limit

---

## Overview

Add a streaming ZIP download endpoint to the Site Scraper mini-app. Users select content format(s) — HTML, Markdown, Screenshots — and download all completed pages from a scrape job as a single ZIP file streamed directly to the browser. No server-side staging or background jobs needed.

## Problem Statement / Motivation

After a scrape completes, users currently can only view pages one at a time and download individual HTML files or screenshots. There's no way to export an entire scrape job's data for offline archival, content migration to a CMS, or AI/LLM ingestion. Users need bulk export across three use cases: offline archives (HTML + screenshots), content migration (markdown), and AI ingestion (markdown).

(see brainstorm: `docs/brainstorms/2026-03-16-site-scraper-bulk-download-brainstorm.md`)

## Proposed Solution

A single new API endpoint streams a ZIP directly to the browser. The `archiver` library assembles the ZIP on-the-fly, fetching S3 objects as streams and piping them through. Markdown conversion uses the existing `turndown` dependency. Authentication uses HMAC-signed download tokens to enable native browser downloads without shared state.

### Key Decisions (from brainstorm)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Delivery | Streaming ZIP | No S3 staging, immediate browser download, simplest approach |
| Scope | Per-job, all completed pages | One download button per job detail page |
| Markdown | `turndown` (already installed) | Battle-tested, already configured in `docx.converter.ts` |
| Images | Screenshots only (existing S3 data) | No inline image extraction needed |
| Format selection | Query param `format=html,markdown,screenshots` | Comma-separated, any combination |
| File paths | URL-path based, sanitized | Collisions get numeric suffix, query params stripped |
| Progress | Browser native | No in-app progress bar needed |
| Size limits | None | 1000-request crawl cap provides natural bound |

## Technical Approach

### Architecture

```
Frontend                          API                              S3
─────────                    ──────────                    ────────────
1. Click Download
2. Select formats (popover)
3. POST /download-token  ──→  HMAC-sign {jobId,userId,orgId,exp}
                         ←──  { token }
4. window.open(
   /download?token=X     ──→  Verify HMAC signature + expiry
   &format=html,md)            Load completed pages
                               Write manifest.json to archive (first byte!)
                               For each page:
                                 GET S3 object stream  ──→  Return stream
                                 Pipe through archiver ←──
                               Pipe archive → response
                         ←──  Streaming ZIP bytes
5. Browser saves ZIP
```

### Auth: HMAC-Signed Download Token

> **Research insight:** In-memory token stores fail on dyno restart and multi-dyno deployments. HMAC-signed tokens eliminate shared state entirely — any dyno can verify them.

Instead of storing tokens in memory (like the SSE pattern), use a stateless signed token:

```typescript
// Generate (POST /download-token, JWT-authenticated)
const payload = JSON.stringify({ jobId, userId, orgId, exp: Date.now() + 300_000 });
const signature = createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
const token = Buffer.from(payload).toString('base64url') + '.' + signature;

// Verify (GET /download, any dyno)
const [payloadB64, sig] = token.split('.');
const payload = Buffer.from(payloadB64, 'base64url').toString();
const expected = createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new UnauthorizedException();
const data = JSON.parse(payload);
if (data.exp < Date.now()) throw new UnauthorizedException('Token expired');
```

This is a one-time-use token by convention (download starts immediately). Even if replayed, it only triggers another download of the same user's own data — no security escalation.

**File:** `apps/api/src/mini-apps/site-scraper/site-scraper.controller.ts`

### New S3 Method: `getObjectStream`

The existing `download()` method buffers the entire S3 object into memory. For streaming, we need the raw `Readable` from `GetObjectCommand`.

**File:** `apps/api/src/_core/third-party/aws/aws.s3.service.ts`

```typescript
async getObjectStream(key: string): Promise<Readable> {
    const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
    });
    const response = await this.s3Client.send(command);
    if (!response.Body) {
        throw new Error(`Empty response body for key: ${key}`);
    }
    return response.Body as Readable;
}
```

### New Service: `SiteScraperExportService`

**File:** `apps/api/src/mini-apps/site-scraper/services/site-scraper-export.service.ts`

Handles the ZIP assembly logic:

```typescript
@Injectable()
export class SiteScraperExportService {
    private readonly turndown: TurndownService;

    async streamJobExport(
        job: ScrapeJob,
        pages: ScrapedPage[],
        formats: Set<'html' | 'markdown' | 'screenshots'>,
        res: Response,
    ): Promise<void> {
        const archive = archiver('zip', {
            zlib: { level: 1 },  // Level 1: fast, good enough for text
            zip64: true,         // Required for archives >4GB
        });

        let activeStream: Readable | null = null;

        // Error handling BEFORE piping
        archive.on('error', (err) => {
            this.logger.error('Archive error:', err);
            if (!res.destroyed) res.destroy();
        });

        archive.on('warning', (err) => {
            if (err.code !== 'ENOENT') archive.emit('error', err);
        });

        // Client disconnect handling
        res.on('close', () => {
            if (!res.writableFinished) {
                archive.abort();
                archive.destroy();
                if (activeStream && !activeStream.destroyed) {
                    activeStream.destroy();
                }
            }
        });

        archive.pipe(res);

        // Write manifest FIRST — ensures first byte within Heroku's 30s timeout
        const manifest = this.buildManifest(job, pages, formats);
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

        const pathTracker = new Map<string, number>(); // collision tracking
        const needsBoth = formats.has('html') && formats.has('markdown');

        for (const page of pages) {
            if (res.destroyed) break;

            const basePath = this.urlToFilePath(page.url, job.url, pathTracker);

            try {
                if (needsBoth && page.htmlS3Key) {
                    // Cache HTML buffer when both formats requested (saves S3 round-trip)
                    const htmlBuffer = await this.s3Service.download(page.htmlS3Key);
                    archive.append(htmlBuffer, { name: `html/${basePath}.html` });

                    const markdown = this.turndown.turndown(htmlBuffer.toString('utf-8'));
                    archive.append(markdown, { name: `markdown/${basePath}.md` });
                } else {
                    if (formats.has('html') && page.htmlS3Key) {
                        activeStream = await this.s3Service.getObjectStream(page.htmlS3Key);
                        archive.append(activeStream, { name: `html/${basePath}.html` });
                        await this.waitForStreamEnd(activeStream);
                        activeStream = null;
                    }

                    if (formats.has('markdown') && page.htmlS3Key) {
                        const htmlBuffer = await this.s3Service.download(page.htmlS3Key);
                        const markdown = this.turndown.turndown(htmlBuffer.toString('utf-8'));
                        archive.append(markdown, { name: `markdown/${basePath}.md` });
                    }
                }

                if (formats.has('screenshots')) {
                    for (const shot of page.screenshots) {
                        if (res.destroyed) break;
                        activeStream = await this.s3Service.getObjectStream(shot.s3Key);
                        archive.append(activeStream, {
                            name: `screenshots/${basePath}-${shot.viewport}w.png`,
                            store: true,  // No compression for PNGs
                        });
                        await this.waitForStreamEnd(activeStream);
                        activeStream = null;
                    }
                }
            } catch (err) {
                // Per-file error handling — skip and continue
                this.logger.warn(`Skipping ${page.url}: ${err.message}`);
                if (activeStream && !activeStream.destroyed) {
                    activeStream.destroy();
                    activeStream = null;
                }
            }
        }

        archive.finalize();
    }

    private waitForStreamEnd(stream: Readable): Promise<void> {
        return new Promise<void>((resolve) => {
            stream.on('end', resolve);
            stream.on('error', () => resolve()); // Resolve on error — skip file
        });
    }
}
```

> **Research insight (archiver backpressure):** `archive.append()` queues entries internally. Without awaiting each stream's `end` event, hundreds of entries queue unbounded in memory. The `waitForStreamEnd` pattern provides manual backpressure by limiting to one in-flight stream at a time.

> **Research insight (performance):** When both HTML and markdown are requested, caching the HTML buffer saves one S3 `GetObject` per page. For 500 pages, this eliminates ~500 S3 requests (~25 seconds of TTFB latency).

### URL-to-FilePath Mapping (ZIP Slip Prevention)

> **Security finding (HIGH):** Scraped page URLs could contain path traversal sequences like `../../etc/passwd`. The URL-to-path function MUST sanitize against ZIP Slip (CVE-2018-1002200).

```typescript
urlToFilePath(
    pageUrl: string,
    siteOrigin: string,
    pathTracker: Map<string, number>,
): string {
    const parsed = new URL(pageUrl);
    let pathname = decodeURIComponent(parsed.pathname);

    // 1. Strip leading slash
    pathname = pathname.replace(/^\/+/, '');

    // 2. CRITICAL: Remove path traversal sequences
    pathname = pathname.replace(/\.\.\//g, '').replace(/\.\./g, '');

    // 3. Handle empty/root path and trailing slashes
    if (!pathname || pathname.endsWith('/')) {
        pathname = pathname + 'index';
    }
    if (!pathname) pathname = 'index';

    // 4. Sanitize each segment
    const segments = pathname.split('/').map(seg => {
        // Replace unsafe filesystem chars with hyphens
        seg = seg.replace(/[\\:*?"<>|]/g, '-');
        // Replace spaces
        seg = seg.replace(/\s+/g, '-');
        // Remove null bytes and control chars
        seg = seg.replace(/[\x00-\x1f\x7f]/g, '');
        // Trim trailing dots/spaces (Windows)
        seg = seg.replace(/[. ]+$/, '');
        // Windows reserved names
        if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(seg)) {
            seg = '_' + seg;
        }
        // Truncate segments to 100 chars
        if (seg.length > 100) seg = seg.substring(0, 100);
        // Collapse consecutive hyphens
        seg = seg.replace(/-{2,}/g, '-');
        return seg;
    }).filter(Boolean);

    let result = segments.join('/') || 'index';

    // 5. Case-insensitive collision detection (Windows/macOS)
    const normalized = result.toLowerCase();
    if (pathTracker.has(normalized)) {
        const count = pathTracker.get(normalized)! + 1;
        pathTracker.set(normalized, count);
        result = `${result}-${count}`;
    } else {
        pathTracker.set(normalized, 0);
    }

    return result;
}
```

### Controller Endpoints

**File:** `apps/api/src/mini-apps/site-scraper/site-scraper.controller.ts`

#### 1. Generate Download Token

```
POST /organization/:orgId/apps/site-scraper/jobs/:jobId/download-token
Authorization: Bearer <jwt>

Response: { status: "success", data: { token: string } }
```

- Validates job exists, belongs to user+org
- Validates job has `pagesCompleted > 0`
- HMAC-signs `{jobId, userId, orgId, exp}` with `JWT_SECRET`
- Returns token

#### 2. Stream Download

```
GET /organization/:orgId/apps/site-scraper/jobs/:jobId/download
  ?token=<download-token>
  &format=html,markdown,screenshots

Response Headers:
  Content-Type: application/zip
  Content-Disposition: attachment; filename="example.com-a1b2c3d4.zip"
  Transfer-Encoding: chunked
  X-Accel-Buffering: no
  Cache-Control: no-store
  Referrer-Policy: no-referrer
  Content-Encoding: identity
```

- Verifies HMAC signature and expiry (stateless — works on any dyno)
- Validates `format` against allowlist: `['html', 'markdown', 'screenshots']`
- Loads completed pages for the job
- Sets response headers **before** piping
- Pipes `SiteScraperExportService.streamJobExport()` to response

> **Research insight:** Set `X-Accel-Buffering: no` to prevent nginx/proxy from buffering the entire response. Set `Content-Encoding: identity` to prevent the `compression()` middleware from double-compressing the ZIP.

**Note:** This endpoint uses `@Res()` to access the raw Express response for streaming. This breaks the `ResponseEnvelope` pattern, which is expected for binary download endpoints. Errors before streaming starts use standard NestJS exceptions. Errors after streaming starts call `archive.abort()` + `res.destroy()`.

### Frontend Changes

#### Download Button + Format Popover

**File:** `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-job/site-scraper-job.component.html`

Add a "Download" button in the header actions area (alongside Retry). Visible when `job.pagesCompleted > 0` and job is not `pending` or `running`.

Clicking opens a PrimeNG `OverlayPanel` with:
- Checkboxes: HTML, Markdown, Screenshots (all checked by default)
- "Download" button (disabled when no checkboxes selected)

#### Download Service Methods

**File:** `apps/web/src/app/mini-apps/site-scraper/services/site-scraper.service.ts`

```typescript
getDownloadToken(jobId: string): Observable<{ status: string; data: { token: string } }> {
    return this.http.post<{ status: string; data: { token: string } }>(
        `${this.baseUrl}/jobs/${jobId}/download-token`, {});
}

getDownloadUrl(jobId: string, token: string, formats: string[]): string {
    const format = formats.join(',');
    return `${this.baseUrl}/jobs/${jobId}/download?token=${encodeURIComponent(token)}&format=${format}`;
}
```

#### Download Flow in Component

**File:** `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-job/site-scraper-job.component.ts`

```typescript
downloading = signal(false);

startDownload(formats: string[]): void {
    this.downloading.set(true);
    this.scraperService.getDownloadToken(this.jobId).subscribe({
        next: (res) => {
            const url = this.scraperService.getDownloadUrl(
                this.jobId, res.data.token, formats
            );
            window.open(url, '_self');
            // Re-enable button after brief delay (download started)
            setTimeout(() => this.downloading.set(false), 3000);
        },
        error: () => {
            this.downloading.set(false);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Could not initiate download',
            });
        },
    });
}
```

### ZIP Structure

```
example.com-a1b2c3d4/
├── manifest.json           ← page index: url, title, included files, skipped files
├── html/
│   ├── index.html
│   ├── about.html
│   └── blog/
│       └── my-post.html
├── markdown/
│   ├── index.md
│   ├── about.md
│   └── blog/
│       └── my-post.md
└── screenshots/
    ├── index-1920w.png
    ├── about-1920w.png
    ├── about-768w.png
    └── blog/
        └── my-post-1920w.png
```

Only requested format directories are included. `manifest.json` is always included and written first (guarantees first byte within Heroku timeout).

## System-Wide Impact

- **S3 service change**: Adding `getObjectStream()` to the shared `AwsS3Service`. This is additive — no existing methods change. Exposed through `_platform/aws` barrel export.
- **New dependency**: `archiver` + `@types/archiver` for ZIP streaming.
- **No dependency needed for markdown**: `turndown` is already installed.
- **Memory**: Sequential page processing with stream-level backpressure keeps steady-state memory at ~3-5 MB regardless of job size. HTML pages buffered one at a time (~500KB) for markdown conversion.
- **Heroku timeout**: `manifest.json` written immediately as first ZIP entry, sending first bytes well within Heroku's 30s initial response timeout. Subsequent data flows continuously per-file, avoiding the 55s idle timeout.
- **Compression middleware**: `Content-Encoding: identity` header prevents the global `compression()` middleware from double-compressing the ZIP.
- **No database changes**: Uses existing entities as-is.
- **ZIP64**: Enabled by default in archiver config to support archives >4GB.

## Acceptance Criteria

- [x] New `getObjectStream(key)` method on `AwsS3Service` returns a Readable stream
- [x] `POST /jobs/:jobId/download-token` generates an HMAC-signed token (5-minute expiry)
- [x] `GET /jobs/:jobId/download?token=...&format=html` streams a ZIP with HTML files
- [x] `GET /jobs/:jobId/download?token=...&format=markdown` streams a ZIP with markdown files converted from HTML via turndown
- [x] `GET /jobs/:jobId/download?token=...&format=screenshots` streams a ZIP with full-res PNG screenshots
- [x] `GET /jobs/:jobId/download?token=...&format=html,markdown,screenshots` includes all three
- [x] ZIP file paths derived from page URLs with full sanitization (path traversal stripped, unsafe chars replaced, case-insensitive collision detection)
- [x] ZIP includes a `manifest.json` at root with page metadata (written first for Heroku timeout safety)
- [x] Missing S3 objects are skipped (not fatal), logged server-side, listed in manifest
- [x] Browser disconnect aborts ZIP assembly — `archive.abort()` + `archive.destroy()` + active stream cleanup
- [x] Screenshots use `store` (no compression); HTML/markdown use zlib level 1
- [x] Download button visible on job detail page when `pagesCompleted > 0` and job not `pending`/`running`
- [x] Format selection via PrimeNG Popover with checkboxes
- [x] Invalid/missing `format` param returns 400
- [x] Invalid/expired token returns 401
- [x] Job not found or unauthorized returns 404
- [x] Job with 0 completed pages returns 422
- [x] Response headers include `X-Accel-Buffering: no`, `Content-Encoding: identity`, `Referrer-Policy: no-referrer`
- [x] When both HTML + markdown requested, HTML fetched once from S3 and reused
- [x] Each S3 stream awaited (`end` event) before appending next entry (backpressure)

## Files to Create/Modify

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `apps/api/src/_core/third-party/aws/aws.s3.service.ts` | Modify | Add `getObjectStream()` method |
| 2 | `apps/api/src/mini-apps/site-scraper/services/site-scraper-export.service.ts` | **Create** | ZIP assembly, markdown conversion, URL-to-path mapping, manifest generation |
| 3 | `apps/api/src/mini-apps/site-scraper/site-scraper.controller.ts` | Modify | Add download-token and download endpoints with HMAC auth |
| 4 | `apps/api/src/mini-apps/site-scraper/site-scraper.module.ts` | Modify | Register `SiteScraperExportService` |
| 5 | `apps/api/package.json` | Modify | Add `archiver` + `@types/archiver` |
| 6 | `apps/web/src/app/mini-apps/site-scraper/services/site-scraper.service.ts` | Modify | Add `getDownloadToken()` and `getDownloadUrl()` |
| 7 | `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-job/site-scraper-job.component.ts` | Modify | Add download state, format selection, `startDownload()` |
| 8 | `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-job/site-scraper-job.component.html` | Modify | Add Download button + OverlayPanel |

## Dependencies & Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| ZIP Slip via crafted URLs | HIGH | Comprehensive path sanitization: strip `../`, remove unsafe chars, validate each segment |
| Large ZIPs (50+ GB for 1000-page jobs with screenshots) | MEDIUM | Sequential streaming with backpressure. Memory stays at ~3-5 MB. ZIP64 enabled. |
| Heroku initial response timeout (30s) | MEDIUM | `manifest.json` written as first ZIP entry — first bytes arrive in <1s |
| Heroku idle timeout (55s between chunks) | LOW | Data flows continuously per-file. S3 reads are fast within same region. |
| Browser disconnect mid-stream | LOW | `res.on('close')` → `archive.abort()` + `archive.destroy()` + active stream cleanup |
| Missing S3 objects | LOW | Per-file try/catch, skip and continue. Manifest lists skipped files. |
| Compression middleware double-compressing ZIP | LOW | `Content-Encoding: identity` header bypasses compression |
| Token leaks in URL/logs | MEDIUM | `Referrer-Policy: no-referrer`; HMAC tokens are time-limited (5min) and scoped to specific job+user |
| Concurrent downloads exhausting memory | LOW | Memory per download is ~3-5MB. Add per-user limit (max 2) if needed later. |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-16-site-scraper-bulk-download-brainstorm.md](docs/brainstorms/2026-03-16-site-scraper-bulk-download-brainstorm.md) — Key decisions carried forward: streaming ZIP delivery, per-job scope, best-effort markdown via turndown, screenshots only, URL-path-based file naming.

### Internal References

- SSE token pattern: `apps/api/src/mini-apps/site-scraper/site-scraper.controller.ts:58-64`
- S3 service (add getObjectStream): `apps/api/src/_core/third-party/aws/aws.s3.service.ts:183-215`
- Turndown configuration: `apps/api/src/_platform/converters/docx.converter.ts:1-55`
- HTML download endpoint: `apps/api/src/mini-apps/site-scraper/site-scraper.controller.ts:519-575`
- Job detail component: `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-job/site-scraper-job.component.html:26-35`

### External References

- `archiver` npm package — streaming ZIP creation (GitHub: archiverjs/node-archiver)
- archiver backpressure issues: GitHub #414, #422, #233, #476
- ZIP Slip vulnerability: CVE-2018-1002200
- PKWARE APPNOTE.TXT — ZIP file format specification
- Heroku request timeout: 30s initial byte, 55s idle
- NestJS streaming files: `@Res()` with manual lifecycle control
