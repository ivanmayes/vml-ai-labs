# Site Scraper - Brainstorm

**Date:** 2026-03-14
**Status:** Draft

---

## What We're Building

A mini app called **Site Scraper** that lets users enter a URL and kicks off a background job to crawl, screenshot, and save the HTML of every discovered page on the site. The app automatically dismisses cookie/privacy popups before capturing screenshots, ensuring clean visual snapshots for client site audits.

### Core Features

- **URL input** - User enters a starting URL and configures crawl depth and viewport breakpoints
- **Automated crawling** - Discovers pages via link-following with a configurable depth limit (default: 2-3 levels)
- **Full-page screenshots** - Captures each page at user-selected viewport widths (e.g., 375, 768, 1024, 1920)
- **HTML saving** - Saves the rendered HTML of each page
- **Privacy popup removal** - Automatically dismisses cookie consent banners and privacy popups before screenshotting
- **Background processing** - Crawl jobs run asynchronously via pg-boss queue with progress updates via SSE
- **Gallery UI** - Results displayed as a thumbnail grid with click-to-expand, plus HTML download links

### Primary Use Case

Client site audits - capturing visual snapshots of client websites for review, comparison, or archival purposes.

---

## Why This Approach

### Tool Stack Decision

After researching all major Node.js scraping tools, the recommended stack is:

| Concern | Tool | Rationale |
|---------|------|-----------|
| Crawling + Orchestration | **Crawlee** (`PlaywrightCrawler`) | All-in-one: link discovery, screenshots, HTML, concurrency, retries, deduplication. TypeScript-first. Apache 2.0. ~69K weekly downloads. |
| Browser Engine | **Playwright** (via Crawlee) | Best auto-waiting, 12.7M npm weekly downloads, Microsoft-backed. Overtook Puppeteer. |
| Cookie Popup Dismissal | **@duckduckgo/autoconsent** | 100+ Consent Management Platforms supported (OneTrust, Cookiebot, Quantcast, etc.). Actively maintained by DuckDuckGo. Injectable into Playwright pages. |
| Bot Detection Evasion | **playwright-extra** + **puppeteer-extra-plugin-stealth** | Hides headless browser fingerprints. Documented Crawlee integration. |
| Sitemap Discovery | **sitemapper** | Optional enhancement - seed Crawlee's RequestQueue from sitemap.xml for better coverage. |

### Why Crawlee over raw Playwright

- **Built-in link discovery** via `enqueueLinks()` with same-hostname strategy
- **Automatic URL deduplication** via `RequestQueue`
- **Auto-scaled concurrency** via `AutoscaledPool` (adjusts based on CPU/memory)
- **Retry with backoff** built in
- **`saveSnapshot()`** captures screenshot + HTML in one call
- Avoids reinventing crawl orchestration, which is error-prone

### Why autoconsent over alternatives

- **"I Don't Care About Cookies"** (idcac) - Outdated, last maintained Nov 2023
- **Consent-O-Matic** - Browser extension only, no standalone Node.js API
- **autoconsent** - Actively maintained by DuckDuckGo, injectable as client-side script, 100+ CMP rules, battle-tested in DuckDuckGo's browsers

### Architecture Pattern

Follows the existing mini app patterns:

1. **API Controller** validates input, creates a `ScrapeJob` entity, queues a pg-boss job
2. **Worker Service** picks up the job, runs Crawlee `PlaywrightCrawler`
3. **Per-page handler**: autoconsent dismisses popups -> screenshot at each viewport -> save HTML -> upload all to S3 -> `enqueueLinks()` for discovery
4. **SSE** pushes real-time progress updates to the frontend (pages discovered, pages completed, errors)
5. **Results** stored as S3 keys in DB entity rows; frontend fetches presigned URLs for display

---

## Key Decisions

1. **Crawlee-managed crawling** - Use Crawlee's `PlaywrightCrawler` as the crawl orchestrator rather than writing a custom crawler loop
2. **pg-boss for job queue** - Consistent with existing mini apps, no Redis dependency
3. **S3 for storage** - Screenshots and HTML files uploaded to S3 using existing `AwsS3Service`
4. **Configurable depth limit** - User sets max crawl depth (default 2-3) rather than full-site or single-page
5. **Configurable viewport breakpoints** - User selects which widths to capture (375, 768, 1024, 1920)
6. **One-off scrapes only** - No recurring/scheduled scrapes for v1
7. **Gallery grid UI** - Thumbnail grid of screenshots with click-to-expand and HTML download links
8. **autoconsent for popups** - DuckDuckGo's library injected via Crawlee's `preNavigationHooks`
9. **Stealth plugin** - Use `playwright-extra` + stealth to avoid bot detection blocking

---

## NPM Packages to Add

```
crawlee
@crawlee/playwright
playwright
playwright-extra
puppeteer-extra-plugin-stealth
@duckduckgo/autoconsent
sitemapper (optional - for sitemap.xml seeding)
```

---

## Data Model (Conceptual)

### ScrapeJob Entity
- `id` (UUID)
- `organizationId` (FK to Organization)
- `url` (starting URL)
- `maxDepth` (number, default 3)
- `viewports` (JSON array of widths, e.g., [375, 768, 1920])
- `status` (enum: pending, running, completed, failed)
- `pagesDiscovered` (number)
- `pagesCompleted` (number)
- `startedAt`, `completedAt` (timestamps)
- `errorMessage` (nullable string)

### ScrapedPage Entity
- `id` (UUID)
- `scrapeJobId` (FK to ScrapeJob)
- `url` (the page URL)
- `depth` (how deep from the starting URL)
- `htmlS3Key` (S3 key for saved HTML)
- `screenshots` (JSON array of `{ viewport: number, s3Key: string }`)
- `status` (enum: pending, completed, failed)
- `errorMessage` (nullable string)

---

## Open Questions

_None remaining - all key decisions have been made._

---

## Out of Scope (v1)

- Recurring/scheduled scrapes
- Side-by-side comparison across scrape runs
- PDF export of screenshots
- Authentication/login support for protected pages
- Cross-domain crawling
