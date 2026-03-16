# Brainstorm: Site Scraper Bulk Download

**Date:** 2026-03-16
**Status:** Draft
**Author:** AI-assisted brainstorm

---

## What We're Building

A bulk download feature for the Site Scraper mini-app that lets users export an entire scrape job's data as a streaming ZIP file. Users can choose which content types to include:

- **HTML** — The stored HTML snapshots of each page
- **Markdown** — HTML converted to markdown on-the-fly (best-effort automated via `node-html-markdown` or similar)
- **Screenshots** — Full-page PNG screenshots at each captured viewport width
- **All three** — Combined download with all content types

The download is scoped to a single job (all completed pages) and triggered from the job detail page.

## Why This Approach

**Server-side streaming ZIP** was chosen over background jobs or client-side assembly because:

1. **Simplest implementation** — One new API endpoint, no background job infrastructure, no S3 staging
2. **Immediate response** — First bytes stream instantly, avoiding Heroku's 30s timeout and giving the user immediate feedback
3. **No extra storage** — ZIP is assembled on-the-fly from existing S3 objects, never stored
4. **Browser-native UX** — Standard file download, no multi-step "prepare then download" flow
5. **Fits typical scale** — Jobs are typically under 1000 pages; streaming handles this well

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Delivery format | Streaming ZIP | Simplest, no staging, immediate browser download |
| Download scope | Per-job, all completed pages | Keeps UI simple — one download button per job |
| Markdown conversion | Best-effort automated | Library like `node-html-markdown` or `turndown`; good enough for content migration and AI ingestion |
| Image content | Screenshots only (existing S3 data) | No inline image extraction needed; screenshots already captured during scrape |
| Format selection | Query param (`format=html,markdown,screenshots`) | Comma-separated list lets user pick any combination |

## Proposed UX Flow

1. User navigates to job detail page (existing)
2. User clicks a **"Download"** button (new) in the header actions area
3. A small popover/dialog appears with checkboxes: HTML, Markdown, Screenshots
4. User selects desired formats and clicks "Download"
5. Browser initiates a native file download (streaming ZIP)
6. ZIP file named: `{hostname}-{jobId-first8}.zip`

## Proposed ZIP Structure

```
example.com-a1b2c3d4/
├── html/
│   ├── index.html
│   ├── about.html
│   └── blog/
│       ├── post-1.html
│       └── post-2.html
├── markdown/
│   ├── index.md
│   ├── about.md
│   └── blog/
│       ├── post-1.md
│       └── post-2.md
└── screenshots/
    ├── index-1920w.png
    ├── index-768w.png
    ├── about-1920w.png
    └── blog/
        ├── post-1-1920w.png
        └── post-2-1920w.png
```

File paths derived from the page URL path. Filenames slugified from the URL path segment. Screenshots suffixed with viewport width.

## API Design

```
GET /organization/:orgId/apps/site-scraper/jobs/:jobId/download
  ?format=html,markdown,screenshots   (required, comma-separated)
```

**Response:**
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="{hostname}-{jobId-first8}.zip"`
- Body: streaming ZIP data

**Auth:** Standard JWT (existing mini-app auth guard)

**Implementation approach:**
1. Load all completed pages for the job from DB
2. Initialize `archiver('zip', { zlib: { level: 5 } })` piped to the response
3. For each page:
   - If `html` requested: stream the HTML from S3 into the archive
   - If `markdown` requested: stream the HTML from S3, pipe through markdown converter, add to archive
   - If `screenshots` requested: stream each screenshot from S3 into the archive
4. Finalize the archive

## Resolved Questions

1. **URL-to-filepath mapping** — Use the URL path directly, sanitized. Strip query params. Trailing `/` becomes `index`. Collisions get a numeric suffix (e.g., `about-1.html`). This keeps the ZIP browsable and matches the site's structure.

2. **Progress indication** — Browser's native download progress bar is sufficient. No in-app progress needed.

3. **Size limits** — No artificial limits. The 1000-request crawl cap provides a natural bound. Users can download everything.
