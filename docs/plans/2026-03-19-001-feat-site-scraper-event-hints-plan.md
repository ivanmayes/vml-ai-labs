---
title: "feat: Add Event Hints for Site Scraper"
type: feat
status: active
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-site-scraper-event-hints-requirements.md
---

# feat: Add Event Hints for Site Scraper

## Enhancement Summary

**Deepened on:** 2026-03-19
**Sections enhanced:** 6 (Proposed Solution, Technical Approach, System-Wide Impact, Acceptance Criteria, Risk Analysis, new Security section)
**Research agents used:** Playwright Interaction Patterns, Cookie Serialization, Security Sentinel, Performance Oracle

### Key Improvements
1. **Hard cap of 5 hints per page** — performance analysis showed N=10 hints with M=3 viewports exceeds Lambda timeout. Hint screenshots reduced to primary viewport only.
2. **Session state via S3, not SQS** — store serialized `storageState()` (cookies + localStorage) in S3 with KMS encryption. Pass S3 key in SQS messages. Eliminates message size concerns and adds encryption at rest.
3. **Security hardening** — force `css=` prefix on all selectors (prevents Playwright engine injection), encrypt fill values at application layer before persisting, validate selector length/content.
4. **Stream-and-upload pattern** — upload each screenshot immediately after capture instead of accumulating buffers. Eliminates OOM risk.

### Critical Findings from Research
- **Playwright `page.evaluate()` for remove is safe** against JS injection (selector passed as serialized argument), but complex CSS selectors can cause ReDoS
- **`context.storageState()`** is superior to raw `cookies()` — captures cookies AND localStorage in one call, round-trips through JSON with full fidelity
- **Lambda timeout is 120s** (not 60s) — the 60s is Crawlee's `requestHandlerTimeoutSecs`. Actual budget is larger than originally planned.
- **`locator.fill()` + `blur()`** is the correct pattern for triggering framework change detection (React, Angular)

---

## Overview

Add user-configurable "event hints" to the site scraper so the Lambda renderer can interact with pages (click, hover, fill forms, remove elements) before and between screenshots. This enables pharma/regulated-industry customers to capture every visual state of interactive pages for compliance review. Modeled on Veeva Web2PDF's hint system, with a JSON form builder UI instead of HTML data attributes.

## Problem Statement

The scraper currently captures only the default page state. Interactive content — accordions, carousels, tabbed panels, hover menus, login-gated sections — is invisible in screenshots. Pharma compliance requires documenting every visual state. (see origin: `docs/brainstorms/2026-03-19-site-scraper-event-hints-requirements.md`)

## Proposed Solution

Add a `hints` JSONB column to the ScrapeJob entity carrying hint configuration through the full pipeline: Web UI form builder -> API DTO -> ScrapeJob entity -> SQS PageWorkMessage -> Lambda handler -> Playwright interactions -> multi-screenshot capture -> callback with hint metadata.

### Hint JSON Schema

```typescript
/** Top-level hint configuration on a ScrapeJob */
interface HintConfig {
  /** Hints applied to every page in the crawl */
  global: EventHint[];
  /** Hints applied only to pages matching the URL pattern */
  perUrl: UrlHintGroup[];
}

interface UrlHintGroup {
  /** Glob pattern matched against page URL pathname (e.g., "/products/*") */
  pattern: string;
  /** Hints for pages matching this pattern */
  hints: EventHint[];
}

interface EventHint {
  /** Action to perform */
  action: 'click' | 'hover' | 'fill' | 'fillSubmit' | 'wait' | 'remove';
  /** CSS selector targeting the element (not required for 'wait') */
  selector?: string;
  /** For 'click': number of times to click (default: 1) */
  count?: number;
  /** For 'fill': text value to enter */
  value?: string;
  /** For 'wait': duration in ms. For others: pause after action (ms) */
  waitAfter?: number;
  /** Execution order (lower runs first). Unsequenced hints run last. */
  seq?: number;
  /** Screenshot behavior: before action, after action, both, or never */
  snapshot?: 'before' | 'after' | 'both' | 'never';
  /** Device filter: only execute at matching viewport widths */
  device?: 'smartphone' | 'tablet' | 'desktop' | 'all';
  /** If true, executes once on the first page only (login/modal dismiss) */
  siteEntry?: boolean;
  /** Human-readable label for this hint's screenshots */
  label?: string;
}
```

**Device breakpoints:** smartphone < 768px, tablet 768-1023px, desktop >= 1024px.

### Research Insights: Hint JSON Schema

**DTO Validation Limits (from security + performance research):**
- Max 50 global hints, 20 per-URL groups, 50 hints per group
- Max selector length: 500 characters
- Max fill value length: 1000 characters
- Max label length: 100 characters
- Max glob pattern nesting: 5 levels of braces
- Reject selectors containing: `>>`, `text=`, `xpath=`, `javascript:`, backticks, `expression(`

**Use `picomatch` over `minimatch`** for glob matching — better worst-case performance, no ReDoS risk with pathological patterns.

### Key Architectural Decisions

1. **Override semantics**: When per-URL hints match a page, they **fully replace** global hints for that page. This is the simplest model and matches Veeva's behavior. (see origin: R3)

2. **Click with count**: `count: 5` with `snapshot: after` produces **one screenshot** after all 5 clicks. Users wanting per-click screenshots define separate hints with sequential `seq` values.

3. **siteEntry session persistence** *(updated from research)*: Execute siteEntry hints on the **first page only**. Use `page.context().storageState()` (not raw `cookies()`) to capture cookies AND localStorage. Store encrypted in S3 at `{s3Prefix}session-state.json` with KMS encryption. Pass `sessionStateS3Key` in subsequent PageWorkMessages. Child-page Lambdas create browser context with `storageState` option for pre-navigation injection.

4. **Credential security** *(hardened from security review)*:
   - Encrypt fill values at the application layer using `crypto.createCipheriv()` with `PII_SIGNING_KEY` before persisting to JSONB and before SQS messages
   - Lambda decrypts at execution time using the same key from env vars
   - Strip `value` fields from ALL API responses (not just GET — apply response interceptor)
   - Force `css=` prefix on all user selectors passed to Playwright APIs
   - Clear `sessionCookies` from ScrapeJob on terminal states (completed/failed/cancelled)
   - Enable SQS SSE-KMS encryption on both work queue and DLQ

5. **Hint execution budget** *(revised from performance analysis)*: Total hint execution budget of **55 seconds** (within the 120s Lambda timeout, not the 60s Crawlee handler timeout). Hard cap of **5 hints per page**. Hint screenshots captured at **primary viewport only** (not all viewports). Wall-clock deadline check before each hint.

6. **Multiple glob match**: When multiple per-URL patterns match the same page, their hints are **merged** (all hints from all matching patterns execute). Deduplication by selector + action.

### Performance Budget (120s Lambda Timeout)

```
Phase 1 - Navigation + networkidle + cookies:  20s
Phase 2 - Baseline screenshots (all viewports): 8s
Phase 3 - Hint execution + hint screenshots:   55s
  - Per hint: execute (2s) + 1 viewport screenshot (3s) = 5s
  - Max 5 hints * 5s = 25s typical, 55s deadline
Phase 4 - HTML upload + link discovery:          5s
Phase 5 - S3 upload flush + callback POST:      10s
Safety margin:                                  22s
```

## Technical Approach

### Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌────────────────┐
│  Web UI     │───>│  API         │───>│  SQS        │───>│  Lambda        │
│  Form       │    │  DTO + Entity│    │  Message    │    │  Handler       │
│  Builder    │    │  + Service   │    │  + hints    │    │  + hint engine │
└─────────────┘    └──────┬───────┘    └─────────────┘    └───────┬────────┘
                          │                                       │
                          │  callback with                  S3    │ screenshots
                          │<──── hint metadata ──────────── ←─────│ + session state
                          │      + sessionStateS3Key              │
```

### Implementation Phases

#### Phase 1: Data Model + Pipeline (Foundation)

Add hints to the full data pipeline without any execution logic. Jobs with hints pass through but hints are ignored by the Lambda.

**Files to modify:**

1. **`apps/api/src/mini-apps/site-scraper/dtos/create-scrape-job.dto.ts`**
   - Add `EventHintDto`, `UrlHintGroupDto`, `HintConfigDto` classes with class-validator decorators
   - Add `@IsOptional() @ValidateNested() @Type(() => HintConfigDto) hints?: HintConfigDto` to `CreateScrapeJobDto`
   - Enforce validation limits: max counts, selector length, reject dangerous patterns

2. **`apps/api/src/mini-apps/site-scraper/entities/scrape-job.entity.ts`**
   - Add `@Column({ type: 'jsonb', nullable: true }) hints: HintConfig | null`
   - Add `@Column({ type: 'varchar', nullable: true }) sessionStateS3Key: string | null` (S3 reference, not inline cookies)

3. **`apps/api/src/mini-apps/site-scraper/types/page-work-message.types.ts`**
   - Add `hints?: EventHint[]` (resolved hints for this specific page, not the full HintConfig)
   - Add `sessionStateS3Key?: string` (S3 key for session state)

4. **`apps/api/src/mini-apps/site-scraper/services/site-scraper.service.ts`**
   - Update `createJob()` and `createJobWithLambda()` signatures to accept hints
   - Encrypt fill values before persisting to entity
   - In `enqueueDiscoveredUrls()`: resolve hints for each child URL (match globs, apply override logic)
   - In callback handler: if `sessionStateS3Key` is returned, store on ScrapeJob and include in future messages
   - In `markJobCompleted()`, `markJobFailed()`, `markJobCancelled()`: clear `sessionStateS3Key` and delete the S3 object

5. **`apps/api/src/mini-apps/site-scraper/site-scraper.controller.ts`**
   - Pass `dto.hints` to `createJob()`

6. **`apps/api/src/mini-apps/site-scraper/entities/scraped-page.entity.ts`**
   - Extend `ScreenshotRecord` with `hintLabel?: string`, `hintIndex?: number`, `snapshotTiming?: 'baseline' | 'before' | 'after'`

7. **`apps/api/src/mini-apps/site-scraper/dtos/lambda-page-result.dto.ts`**
   - Add `hintLabel`, `hintIndex`, `snapshotTiming` to `ScreenshotResultDto`
   - Add optional `sessionStateS3Key` to `LambdaPageResultDto`

8. **`lambda/scraper/src/types.ts`**
   - Add `EventHint` interface and Zod schema for `hints` and `sessionStateS3Key` in `PageWorkMessageSchema`
   - Extend `ScreenshotRecord` with hint metadata fields
   - Add `sessionStateS3Key` to `CallbackPayload`

9. **New file: `apps/api/src/mini-apps/site-scraper/types/event-hint.types.ts`**
   - Shared TypeScript interfaces for `EventHint`, `UrlHintGroup`, `HintConfig`
   - Hint resolution function: `resolveHintsForUrl(config: HintConfig, pageUrl: string): EventHint[]`
   - Use `picomatch` for glob matching (better performance than `minimatch`)

10. **Database migration**
    - Add `hints` JSONB column (nullable) to `scrape_jobs` table in `site_scraper` schema
    - Add `session_state_s3_key` VARCHAR column (nullable) to `scrape_jobs` table

11. **`infra/lib/scraper-stack.ts`**
    - Add `encryption: sqs.QueueEncryption.KMS_MANAGED` to both work queue and DLQ

- [ ] DTO validation with nested class-validator decorators + security limits
- [ ] Entity JSONB column following `viewports` pattern
- [ ] Fill value encryption at application layer before persistence
- [ ] PageWorkMessage carries resolved hints per page
- [ ] Zod schema in Lambda validates hint structure
- [ ] ScreenshotRecord extended with hint metadata (backward compatible — new fields optional)
- [ ] Session state stored in S3 with KMS encryption, referenced by S3 key
- [ ] Hint resolution logic: glob matching with `picomatch`, override semantics
- [ ] Migration adds nullable columns (zero-downtime, backward compatible)
- [ ] SQS encryption enabled

#### Phase 2: Lambda Hint Execution Engine

Implement the hint execution logic in the Lambda handler.

**Files to modify:**

12. **New file: `lambda/scraper/src/hint-executor.ts`**
    - `executeHints(page, hints, primaryViewport, message, pageId): Promise<ScreenshotRecord[]>`
    - Sorts hints by execution order: siteEntry (if first page) -> sequenced (by seq) -> unsequenced
    - For each hint (max 5):
      - Check wall-clock deadline (55s budget)
      - Check device filter against primary viewport
      - If `snapshot: 'before'` or `snapshot: 'both'`: capture screenshot at primary viewport
      - Execute the action
      - If `snapshot: 'after'` or `snapshot: 'both'`: capture screenshot at primary viewport
    - Wrap each hint in try/catch — log failures, continue with next hint
    - Stream-and-upload: upload each screenshot immediately, don't accumulate buffers
    - Return all hint screenshots with metadata

    Action implementations (from Playwright research):
    ```typescript
    click:      page.locator(`css=${selector}`).click({ timeout: 5000 }) × count
                // Use locator for auto-wait + actionability checks
    hover:      page.locator(`css=${selector}`).hover({ timeout: 5000 })
                // Capture screenshot while hover state is active
    fill:       page.locator(`css=${selector}`).fill(decryptedValue)
                page.locator(`css=${selector}`).blur()  // trigger change event
    fillSubmit: page.locator(`css=${selector}`).click({ timeout: 5000 })
    wait:       page.waitForTimeout(waitAfter)
    remove:     page.locator(`css=${selector}`).evaluate(el => el.remove())
                // Use locator.evaluate — keeps selector in Playwright's resolver
    ```

    **Key pattern: `css=` prefix on ALL user selectors** — prevents Playwright from interpreting `text=`, `xpath=`, or `>>` chaining operators.

13. **`lambda/scraper/src/handler.ts`**
    - After cookie dismissal, before default screenshot capture:
      - If `message.sessionStateS3Key`: load from S3, create context with `storageState`
      - If `message.hints` is non-empty: call `executeHints()`
    - After hint execution: capture default screenshots (baseline — R12)
    - If this page has siteEntry hints: extract `storageState()`, save to S3 with KMS, include `sessionStateS3Key` in callback
    - Merge hint screenshots + baseline screenshots in callback payload

14. **`lambda/scraper/src/screenshots.ts`**
    - Refactor to stream-and-upload pattern: upload each screenshot immediately after capture
    - Extract `captureSingleViewport(page, viewport, s3Key)` for reuse by hint executor
    - Skip thumbnail generation for hint screenshots (unnecessary for comparison artifacts)
    - Use JPEG quality 60 for hint screenshots (quality 85 for baseline)

- [ ] Hint executor module with isolated, testable functions
- [ ] `css=` prefix on all user selectors (security)
- [ ] Stream-and-upload pattern (memory safety)
- [ ] `locator.fill()` + `blur()` for change event triggers
- [ ] `locator.evaluate(el => el.remove())` instead of raw `page.evaluate()` (security)
- [ ] Device targeting filter by viewport width
- [ ] Execution order: siteEntry -> sequenced -> unsequenced
- [ ] 55-second execution budget with wall-clock deadline
- [ ] Hard cap of 5 hints per page
- [ ] Hint screenshots at primary viewport only (not all viewports)
- [ ] Try/catch per hint — failures logged, not fatal
- [ ] Session state via S3 `storageState()` (cookies + localStorage)
- [ ] Fill value decryption at execution time

#### Phase 3: Web UI Form Builder

Build the hint configuration form in the Angular scraper UI.

**Files to modify:**

15. **`apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-home/site-scraper-home.component.ts`**
    - Add `formHints: HintConfig` signal/property
    - Add methods: `addGlobalHint()`, `removeGlobalHint()`, `addUrlGroup()`, `removeUrlGroup()`, `addUrlHint()`, `removeUrlHint()`
    - Update `submitJob()` to include hints in API call

16. **`apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-home/site-scraper-home.component.html`**
    - Add collapsible "Event Hints" section after viewports
    - Global hints: list of hint cards with action/selector/options fields
    - Per-URL section: pattern input + list of hint cards
    - Use PrimeNG components: `p-accordion` for sections, `p-select` for action type, `pInputText` for selectors, `p-inputNumber` for numeric fields, `p-selectButton` for snapshot/device options
    - Add/remove buttons for dynamic lists
    - Show conditional fields: `value` input only for fill action, `count` only for click

17. **`apps/web/src/app/mini-apps/site-scraper/services/site-scraper.service.ts`**
    - Add `HintConfig`, `EventHint`, `UrlHintGroup` interfaces (or import from `@api/`)
    - Update `createJob()` to pass `hints` field

18. **`apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-job/site-scraper-job.component.ts` + `.html`**
    - Update screenshot gallery to handle multiple screenshots per page
    - Show hint label and snapshot timing metadata
    - Group screenshots by hint state (baseline, hint 1 before, hint 1 after, etc.)
    - Show "N states captured" badge on pages with hint screenshots

- [ ] Collapsible hint builder section in job creation form
- [ ] Dynamic add/remove for global hints and per-URL groups
- [ ] Action-specific fields shown conditionally (value for fill, count for click)
- [ ] PrimeNG components throughout (p-accordion, p-select, p-inputText, etc.)
- [ ] Password masking for fill values in the form (type="password")
- [ ] Job results gallery updated for multi-screenshot display
- [ ] Hint metadata labels visible on screenshots

#### Phase 4: Tests

19. **New file: `lambda/scraper/src/__tests__/hint-executor.spec.ts`**
    - Unit tests for each action type (click, hover, fill, fillSubmit, wait, remove)
    - Verify `css=` prefix applied to all selectors
    - Execution order tests (siteEntry -> sequenced -> unsequenced)
    - Device targeting filter tests
    - Budget enforcement tests (wall-clock deadline)
    - Hard cap enforcement (max 5 hints)
    - Failure isolation tests (selector not found -> continues)
    - Stream-and-upload pattern (no buffer accumulation)

20. **Update: `lambda/scraper/src/__tests__/handler.spec.ts`**
    - Test hint execution is called when hints present in message
    - Test hint execution is skipped when no hints
    - Test session state loading from S3
    - Test session state saving for siteEntry pages

21. **`apps/api/src/mini-apps/site-scraper/types/__tests__/event-hint.spec.ts`**
    - Glob pattern matching tests (picomatch)
    - Override resolution tests (global vs per-URL full replacement)
    - Multiple pattern merge tests
    - Fill value encryption/decryption round-trip

- [ ] Hint executor: action execution, ordering, budgeting, failure isolation, selector prefixing
- [ ] Handler integration: hints present/absent, session state S3 flow
- [ ] Hint resolution: glob matching, overrides, merges
- [ ] DTO validation: nested hint validation, security limits, edge cases
- [ ] Fill value encryption round-trip

## Security Considerations

### Before v1 Ships (P0)

1. **Force `css=` selector prefix** — Prevent Playwright engine injection (`text=`, `xpath=`, `>>` chaining). One-line fix per action in hint-executor.ts.

2. **Encrypt fill values** — Use `crypto.createCipheriv()` with AES-256-GCM and `PII_SIGNING_KEY`. Encrypt before JSONB persistence and before SQS messages. Decrypt in Lambda at execution time.

3. **Validate selectors** — Max 500 chars, reject `>>`, `text=`, `xpath=`, `javascript:`, backticks, `expression(`. Enforce at DTO layer.

4. **Enable SQS encryption** — Add `encryption: sqs.QueueEncryption.KMS_MANAGED` to both queues in CDK stack.

5. **Clear session state on job completion** — Delete S3 session state object and null out `sessionStateS3Key` in `markJobCompleted/Failed/Cancelled()`.

6. **Strip fill values from all API responses** — Apply a response interceptor that redacts `value` fields, not just specific GET endpoints.

### Pre-existing Issues Found (Fix Alongside)

7. **Download token secret fallback** — `DOWNLOAD_TOKEN_SECRET` falls back to `'download-token-secret'` if env vars missing. Fail hard on startup instead.

8. **CDK output contains callback secret** — Verify `cdk.out/` is in `.gitignore`. Consider moving to Secrets Manager.

## System-Wide Impact

### Interaction Graph

Job creation -> DTO validates + encrypts hints -> Entity stores encrypted hints JSONB -> Service resolves per-page hints via glob matching -> SQS message carries resolved hints (encrypted fill values) -> Lambda decrypts fill values, executes hints via Playwright -> Screenshots uploaded to S3 with hint metadata -> Session state saved to S3 with KMS -> Callback delivers hint screenshots + sessionStateS3Key -> Service stores extended ScreenshotRecords -> Web UI displays multi-screenshot gallery.

### Error Propagation

Hint failures are isolated per-hint (try/catch). A failed hint logs a warning and skips to the next hint. The page still completes with whatever screenshots were captured. This matches the scope boundary: "failures are logged but do not fail the page." (see origin: scope boundaries)

### State Lifecycle Risks

- **siteEntry session state**: Stored in S3 after seed page callback. If the seed page Lambda fails before callback, no session state is stored and subsequent pages won't have auth. Mitigation: siteEntry pages retry via SQS. Session state deleted on job terminal state.
- **Partial hint execution**: If Lambda times out mid-hint, partial screenshots may be uploaded. The callback sends whatever was captured. No orphaned state.
- **Cookie expiry**: Long-running crawls may outlive session cookies. Lambda should detect stale sessions (login page redirect) and report `session_expired` status.

### API Surface Parity

- The pg-boss `scraper-worker.service.ts` should also support hints for feature parity. It's simpler there (same browser, cookies persist naturally). Implement in a follow-up.

## Acceptance Criteria

### Functional Requirements

- [ ] A job with click hints on accordion selectors produces screenshots showing each expanded state
- [ ] A job with fill + fillSubmit siteEntry hints can scrape a login-gated site
- [ ] Global hints (e.g., remove overlay) apply to all pages without per-URL repetition
- [ ] Per-URL hints with glob patterns apply only to matching pages
- [ ] Per-URL hints fully replace global hints for matched pages
- [ ] Multiple screenshots per page are stored with hint label metadata
- [ ] Baseline screenshot (before any hints) is always captured (R12)
- [ ] Jobs without hints work exactly as before (backward compatible)
- [ ] Hint failures are logged but do not fail the page
- [ ] fill/fillSubmit values are encrypted at rest and redacted in all API responses
- [ ] Session state stored in S3 with KMS encryption, deleted on job completion

### Non-Functional Requirements

- [ ] Hard cap of 5 hints per page, 55-second execution budget
- [ ] Hint screenshots at primary viewport only (stream-and-upload pattern)
- [ ] SQS message with hints stays under 200KB (with validation)
- [ ] Lambda memory usage stays under 2GB (no buffer accumulation)
- [ ] All user selectors prefixed with `css=` before Playwright API calls

### Quality Gates

- [ ] hint-executor.spec.ts covers all 6 action types, ordering, budgeting, failure isolation, selector prefixing
- [ ] handler.spec.ts covers hint present/absent, session state S3 flow
- [ ] event-hint.spec.ts covers glob matching, resolution, fill encryption round-trip
- [ ] TypeScript compiles cleanly across API + Lambda

## Dependencies & Prerequisites

- Crawlee Lambda refactor (completed 2026-03-19) — hints build on the PlaywrightCrawler handler
- `picomatch` package for glob pattern matching (add to API dependencies)
- No database migration blockers — new nullable columns are backward compatible
- `PII_SIGNING_KEY` env var must be set (for fill value encryption)

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hint execution exceeds Lambda timeout | Medium | Page fails | 55s budget + 5-hint cap + wall-clock deadline |
| SQS message too large with many hints | Low | Page not queued | Validate payload size + DTO limits |
| siteEntry cookies expire mid-crawl | Medium | Auth pages fail | Detect stale session (login redirect), log warning |
| CSS selectors break on site updates | High | Hints don't fire | Try/catch per hint, log failures |
| Fill values leaked in logs/DB | Medium | Security issue | AES-256-GCM encryption + response interceptor |
| Playwright selector injection | Low | Engine abuse | Force `css=` prefix + selector validation |
| Screenshot buffer OOM | Medium | Lambda crash | Stream-and-upload pattern (no accumulation) |
| Complex CSS selector ReDoS | Low | Budget exhausted | Selector length limit + per-hint timeout |

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-19-site-scraper-event-hints-requirements.md](docs/brainstorms/2026-03-19-site-scraper-event-hints-requirements.md) — Key decisions: JSON form builder (not data attributes), full Veeva action parity, multiple snapshots per page, upfront definition only, glob patterns for per-URL matching.

### Internal References

- Job creation DTO: `apps/api/src/mini-apps/site-scraper/dtos/create-scrape-job.dto.ts`
- ScrapeJob entity: `apps/api/src/mini-apps/site-scraper/entities/scrape-job.entity.ts`
- ScrapedPage entity: `apps/api/src/mini-apps/site-scraper/entities/scraped-page.entity.ts`
- PageWorkMessage types: `apps/api/src/mini-apps/site-scraper/types/page-work-message.types.ts`
- Lambda handler: `lambda/scraper/src/handler.ts`
- Lambda screenshots: `lambda/scraper/src/screenshots.ts`
- Lambda types: `lambda/scraper/src/types.ts`
- Callback DTO: `apps/api/src/mini-apps/site-scraper/dtos/lambda-page-result.dto.ts`
- Site scraper service: `apps/api/src/mini-apps/site-scraper/services/site-scraper.service.ts`
- CDK stack: `infra/lib/scraper-stack.ts`
- Web UI home: `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-home/`
- Web scraper service: `apps/web/src/app/mini-apps/site-scraper/services/site-scraper.service.ts`

### External References

- Veeva Web2PDF Hints: https://veevaweb2pdf.com/hints
- Playwright Locators: https://playwright.dev/docs/locators
- Playwright Authentication (storageState): https://playwright.dev/docs/auth
- Playwright Actions: https://playwright.dev/docs/input
- picomatch (glob matching): https://github.com/micromatch/picomatch
