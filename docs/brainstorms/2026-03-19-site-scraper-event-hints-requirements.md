---
date: 2026-03-19
topic: site-scraper-event-hints
---

# Site Scraper Event Hints

## Problem Frame

Pharma and regulated-industry customers need to capture every visual state of interactive web pages for compliance review. Sites commonly use accordions, carousels, tabbed content, hover menus, and login-gated sections. Our scraper currently captures only the default page state, missing content behind these interactions. Competitor Veeva Web2PDF solves this with "event hints" that instruct the renderer to perform interactions before/between screenshots.

## Requirements

### Hint Definition

- R1. Users define hints via a JSON/form builder in the scraper web UI before starting a crawl. No site-side HTML attributes required.
- R2. Hints can be defined at two levels:
  - **Global hints** that apply to every page in the crawl
  - **Per-URL hints** that apply only to pages matching a specific URL pattern
- R3. Per-URL hints use glob patterns for matching (e.g., `/products/*`, `*/accordion-page`). Per-URL hints override global hints when both match the same page.

### Hint Actions (Full Veeva Parity)

- R4. Supported action types:
  - **click** — Click an element (CSS selector). Supports `count` for repeated clicks (e.g., carousel next button).
  - **hover** — Hover over an element to trigger menus/tooltips.
  - **fill** — Enter text into an input field (selector + value).
  - **fillSubmit** — Click a submit button after fill actions (for login flows).
  - **wait** — Pause for a specified duration (milliseconds) to let animations or async content settle.
  - **remove** — Remove an element from the DOM before screenshot (e.g., overlays, banners).
- R5. Each hint specifies a CSS selector to target the element on the page.

### Hint Execution

- R6. Hints execute in a defined order: wait (global page wait) -> site entry actions (login/modal dismiss) -> sequenced hints (by explicit order) -> unsequenced hints.
- R7. Each hint has an optional `seq` (sequence number) to control execution order. Hints without `seq` execute after all sequenced hints.
- R8. Each hint has an optional `waitAfter` (milliseconds) to pause after the action completes, allowing animations or content to load.
- R9. Hints marked as `siteEntry: true` execute once per crawl session (not per page). Used for login flows and initial modal dismissal.

### Screenshot Capture

- R10. Each hint supports a `snapshot` option controlling screenshot behavior:
  - **before** — Capture a screenshot before executing the action
  - **after** — Capture a screenshot after executing the action (default)
  - **both** — Capture before and after
  - **never** — Execute the action but do not capture a screenshot
- R11. Multiple screenshots per page are generated when multiple hints trigger snapshots. Each screenshot is stored separately with metadata indicating which hint/state it represents.
- R12. The existing "default" screenshot (page as-loaded, before any hints) is always captured as the baseline.

### Device Targeting

- R13. Each hint has an optional `device` filter (smartphone/tablet/desktop/all) so hints only execute at matching viewport widths. Default: all.

## Scope Boundaries

- Hints are defined upfront before crawl start only. No mid-crawl hint editing.
- No Chrome extension or browser plugin for hint creation in v1.
- No visual/WYSIWYG hint builder (point-and-click on a live page) in v1 — users specify CSS selectors manually.
- No auto-detection of interactive elements. Users must know the site structure.
- Hint execution failures (selector not found, element not clickable) are logged but do not fail the page — the scraper continues with remaining hints and captures what it can.

## Success Criteria

- A pharma site with accordion sections produces screenshots showing every expanded state when click hints are configured.
- A site requiring login can be scraped when fill + fillSubmit hints provide credentials as a siteEntry flow.
- Global hints (e.g., "remove cookie banner overlay") apply to all pages without per-URL repetition.
- Per-URL hints allow capturing a carousel on `/products` without affecting other pages.
- Multiple screenshots per page are stored and visible in the job results UI with labels indicating the interaction state.

## Key Decisions

- **JSON form builder, not data attributes**: Our users typically don't control the HTML of sites they scrape. A UI-based hint builder is more accessible than requiring site modifications.
- **Full Veeva action parity**: Pharma compliance requires the complete interaction vocabulary (click, hover, fill, fillSubmit, wait, remove). Shipping a subset would leave gaps that block adoption.
- **Multiple snapshots per page**: Pharma compliance requires documenting every visual state, not just the final state. This is a core differentiator for the regulated-industry use case.
- **Upfront definition only**: Keeping the job lifecycle simple. Mid-crawl editing adds significant complexity to the queue/Lambda architecture with minimal v1 value.

## Dependencies / Assumptions

- The Lambda handler (PlaywrightCrawler requestHandler) will execute hints between navigation and screenshot capture. Playwright's `page.click()`, `page.hover()`, `page.fill()`, and `page.evaluate()` support all required actions.
- The ScrapedPage entity's `screenshots` JSONB column can store multiple screenshots per page with hint metadata.
- The SQS PageWorkMessage will carry hints as part of the message payload. Current message size (~1KB) has headroom within SQS's 256KB limit.

## Outstanding Questions

### Deferred to Planning

- [Affects R11][Technical] How should multiple screenshots per page be stored and labeled in the ScrapedPage entity? Extend the existing `screenshots` JSONB array with a `hintLabel` field, or create a separate structure?
- [Affects R9][Needs research] For siteEntry hints (login flows), how do we persist the authenticated browser session across multiple Lambda invocations? Crawlee's cookie/storage persistence, or pass cookies via the SQS message?
- [Affects R1][Technical] What should the hint JSON schema look like? Design the form builder UI fields and the underlying JSON structure during planning.
- [Affects R13][Technical] How should device targeting map to viewport widths? Define the breakpoint ranges (e.g., smartphone < 768px, tablet < 1024px, desktop >= 1024px).

## Next Steps

-> `/ce:plan` for structured implementation planning.
