---
date: 2026-05-12
topic: image-library
---

# Image Library Mini-App

## Summary

A space-scoped image library mini-app — lighter than a DAM, optimized for fast upload-tag-share collaboration between internal teams and clients. Open-ended tags with autocomplete, tag-based filtering, mobile + desktop responsive, client-side share via OS share sheet / mailto / sms, and one-click "copy image to clipboard" so the image pastes directly into Claude / ChatGPT / Gemini.

---

## Problem Frame

Internal teams and client account teams routinely exchange images — shelf shots, brand activations at on-premise venues (bars, restaurants), market photography, retailer-specific assets. The current path runs through Slack search, shared Drive folders, and ad-hoc texts. None of these surfaces tag-based filtering, none make it easy to drop an image into an AI assistant for analysis or rewriting, and a real DAM is too heavy for the speed and informality teams want.

The pain is highest in three moments: (1) a team member has the image but no fast way to share it from where it lives, (2) someone needs an image they know was sent before but can't find it without scrolling Slack, and (3) someone wants to pull an image into an AI chat and is stuck doing a download → upload round-trip.

---

## Actors

- A1. **Space member (uploader)** — anyone with access to a space; can upload images and add tags.
- A2. **Space member (viewer)** — anyone with access to a space; browses, filters, shares, copies.
- A3. **External recipient** — the person on the other end of a text/email share. Not an app user; receives a link or attachment via their own messaging app.

---

## Key Flows

- F1. **Upload with tags (desktop or mobile)**
  - **Trigger:** Space member taps "Upload" inside the image library.
  - **Actors:** A1.
  - **Steps:** Pick image(s) via file picker (or camera on mobile) → optionally enter tags using an autocomplete that suggests existing tags from this space → submit → image appears in the library.
  - **Outcome:** Image is stored, visible to all space members, indexed by its tags.
  - **Covered by:** R1, R3, R4, R5.

- F2. **Find and share an image**
  - **Trigger:** Space member opens the library to find an image they want to send to a client.
  - **Actors:** A2, A3.
  - **Steps:** Filter by one or more tags (or pick "ALL" to clear filters) → adjust page size if needed → tap an image → tap "Share" → on mobile the OS share sheet opens; on desktop, choose "Email" (`mailto:` link prefilled) or "Text" (`sms:` link prefilled where supported) or copy a shareable URL.
  - **Outcome:** External recipient receives the image (mobile share sheet attaches the file directly when supported, otherwise a link).
  - **Covered by:** R2, R6, R7, R8, R9, R10.

- F3. **Copy image into AI chat**
  - **Trigger:** Space member wants to analyze, caption, or rework an image in Claude / ChatGPT / Gemini.
  - **Actors:** A2.
  - **Steps:** Open library → find image (filter as needed) → tap "Copy image" → switch to AI chat → paste.
  - **Outcome:** Image attaches in the AI chat as if drag-dropped from the desktop, no download/re-upload required.
  - **Covered by:** R11.

---

## Requirements

**Library page (per space)**

- R1. The app SHALL render an image library view at a per-space route, accessible only to members of that space.
- R2. The library SHALL display images in a grid with newest-first sort by default.
- R3. The library SHALL provide a user-controlled page-size selector with at least three options (e.g., 25 / 50 / 100). The selected size persists per user.

**Upload**

- R4. The app SHALL accept image uploads from desktop (file picker, drag-and-drop) and mobile (file picker or camera capture).
- R5. The app SHALL accept standard web image formats — at minimum PNG, JPEG, WebP, and GIF. Exact size limits are deferred to planning, but oversize uploads MUST surface a clear inline error rather than failing silently.

**Tagging**

- R6. Tags SHALL be free-form text. There is no fixed taxonomy and no required tag fields.
- R7. The tag input SHALL autocomplete against existing tags from the current space. The seed list (Market, Channel, Retailer, Bar, Restaurant, Brand) is presented as suggested tag *examples* in onboarding copy / help text, not enforced as fields.
- R8. Tag values SHALL be case-insensitive when matching for autocomplete and filtering (e.g., "Brand" and "brand" are the same tag).

**Filtering**

- R9. The library SHALL filter the visible image set by one or more selected tags (AND logic — an image must carry every selected tag to appear).
- R10. The library SHALL provide an "ALL" control that clears all active tag filters and returns the unfiltered view.

**Share and copy**

- R11. Each image SHALL offer a "Share" action that:
  - on devices supporting the Web Share API (mobile Safari, mobile Chrome), opens the OS share sheet with the image attached when possible (falling back to a link when image-attach isn't supported);
  - on desktop, exposes "Email" (`mailto:` with prefilled subject and the image's shareable URL in the body), "Text" (`sms:` link where the browser supports it), and "Copy link" actions.
- R12. Each image SHALL offer a "Copy image" action that places the image bytes (as `image/png` or the original mime type) on the OS clipboard via the Clipboard API, so pasting into Claude / ChatGPT / Gemini attaches the image directly.

**Download**

- R13. Each image SHALL offer a "Download" action that saves the original file to the user's device on both desktop and mobile.

---

## Acceptance Examples

- AE1. **Covers R9, R10.** Given a library with images tagged `bar` and `brand:smirnoff`, when the user selects both tags, only images carrying both tags appear; when they then click "ALL", every image in the space reappears.
- AE2. **Covers R7, R8.** Given the space already contains tags `Brand`, `brand:smirnoff`, and `Retailer`, when a user types `bra` into the tag input, autocomplete suggests `Brand` and `brand:smirnoff` (case-insensitive match).
- AE3. **Covers R11.** Given a user on mobile Safari taps "Share" on an image, the OS share sheet opens with the image attached so they can send via Messages, Mail, WhatsApp, etc.; given a user on desktop Chrome taps "Email", their default mail client opens with the subject prefilled and the image's URL in the body.
- AE4. **Covers R12.** Given a user clicks "Copy image", when they switch to a Claude chat and press Cmd+V (or Ctrl+V), the image attaches to the message just as if it were dragged from Finder.
- AE5. **Covers R5.** Given the size cap is exceeded on upload, the user sees an inline error naming the file and the limit; the rest of the batch (if any) is unaffected.

---

## Success Criteria

- A space member can upload, tag, find, and share an image in under 30 seconds without leaving the app.
- "Copy image" → paste into an AI chat produces an attached image on the first try, on the major browsers we care about (Chrome, Safari, Edge on desktop; Safari, Chrome on mobile).
- After two weeks of internal use, the team's image-share Slack traffic for at least one active space measurably drops in favor of library links.
- A downstream agent (`ce-plan`) can take this doc and produce a plan without inventing product behavior, scope, or success criteria — only technical decisions.

---

## Scope Boundaries

- No cross-space or global library — each library is space-isolated.
- No shared `assets` platform module or cross-app `source` flag. The mini-app owns its own entity (decision under "Self-contained mini-app" below).
- No folders, albums, or collections inside a space.
- No version history, approvals, rights/licensing metadata, or watermarking — the explicit "lighter than DAM" positioning.
- No backend-sent email or SMS — no SES, Twilio, or other transactional-messaging dependency for this feature.
- No built-in image editing (crop, resize, annotate, redact).
- No comments, reactions, or @mentions on images.
- No bulk multi-select operations (delete several at once, share several at once) in v1.
- No external imports (Slack, Drive, Dropbox, DAM sync).
- No moderation or approval gate before an upload is visible.
- No image-level ACLs — visibility is "every space member sees every image in that space."
- No upload-role-gating — anyone in the space can upload.

---

## Key Decisions

- **Self-contained mini-app, not a shared `assets` module.** Follows the existing mini-app pattern (`document-converter`, `site-scraper`, `wpp-open-agent-updater`) where each app owns its own entity and never imports across app boundaries. Rejected building a `_platform/assets` module now: would force a doc-converter migration and contradict the isolation rule in `CLAUDE.md`. Rejected the hybrid "design-for-promotion" path because the speculative complexity does not pay back until a second consumer actually exists.
- **Open-ended tags with autocomplete, not a fixed schema.** The originally listed tags (Market / Channel / Retailer / Bar / Restaurant / Brand) become *suggestions* surfaced by autocomplete, not enforced columns. Lets each space evolve its own vocabulary without a migration.
- **Client-side share only.** Web Share API on mobile, `mailto:` / `sms:` on desktop. Rejected backend-sent email/SMS to avoid pulling in Twilio and the recipient-auth question (signed URL vs login wall) that comes with branded delivery.
- **Copy actual image bytes to OS clipboard.** Clipboard API with an image blob, not a URL. This is the distinctive value vs "just another folder of images" — pasting straight into an AI chat is the moment users will remember.
- **Reuse `S3Service` for storage primitives.** The mini-app has its own upload endpoint, DTO, and validation, but the bytes-to-S3 plumbing already lives at `apps/api/src/_core/third-party/aws/aws.s3.service.ts`. No reason to reinvent.

---

## Dependencies / Assumptions

- **S3 service is healthy.** `apps/api/src/_core/third-party/aws/aws.s3.service.ts` already exposes upload, presigned-URL, and delete primitives. Verified present.
- **Space-membership guard exists and is reusable.** `SpaceAdminGuard` and related session/space query infrastructure are already used by other features; the library page will plug into the same access pattern. To be verified in planning.
- **Whole-space visibility.** Every member of a space sees every image uploaded to that space. No per-user or per-image ACLs in v1.
- **Newest-first default sort.** Confirmed as the default; alternate sort orders deferred.
- **Standard web image formats only** (PNG / JPEG / WebP / GIF). Exact mime-type whitelist and max file size set during planning.
- **Tag autocomplete data lives in this app's own schema** — no dependency on tag tables in other mini-apps.
- **Browser support for the Clipboard API's image-write path** — modern Chrome, Safari (16+), Edge, Firefox. Older browsers degrade to "Copy link" only.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Maximum file size, exact mime-type whitelist, and whether server-side image re-encoding (e.g., HEIC → JPEG for cross-platform compatibility) is needed.
- [Affects R1, R3][Technical] Whether page-size preference persists in user settings (server-side) or `localStorage` (client-side per device).
- [Affects R2][Technical] Whether image listing uses keyset pagination, offset pagination, or infinite scroll under the hood. The user-facing requirement is just "page size selector"; the mechanism is a planner call.
- [Affects R11][Technical] Whether `mailto:` should include the image as a data URL (won't survive most mail clients) or only the shareable URL. Investigate.
- [Affects R6, R7][Needs research] Whether tags are stored as a separate `image_tags` table or as a `text[]` column on the image row, given Postgres's GIN-index support for array filtering.
- [Affects R12][Needs research] Whether to copy in original format or always re-encode to `image/png` on the client before clipboard write. Some AI chat surfaces handle PNG more reliably than HEIC/WebP.
