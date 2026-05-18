---
date: 2026-05-18
topic: text-counter-image-extraction-and-templates
---

# Text-Counter Image Extraction and Templates

## Summary

Add image upload to the text-counter mini-app. A vision AI extracts the text from a flat creative; the user then either gets a row-per-text count list (general mode) or matches the extracted text against an org-scoped template of labeled fields with per-field validation rules (template mode). Multiple images can be processed in one session, each with its own template choice. The existing paste-text mode stays as the third tab.

---

## Problem Frame

Client teams reviewing creative output from agencies and designers typically receive flat rasterized exports — JPGs, PNGs, PDFs where text is baked into the image. Today, they retype each text element by hand into the existing text-counter to check character counts. For a campaign with several creatives, each containing several text fields (headline, body, CTA, disclaimer), the retype-and-check loop is the slow part. They also can't easily enforce per-field rules like "headline must be 25 chars max and one line" — they have to remember the rule, eyeball the result, and repeat for each field on each creative. The pain is the *full workflow*: getting text out of the image AND matching it to the right field-with-rule, not either piece in isolation.

---

## Actors

- A1. Org user — uploads images, picks templates per image, drags or edits extracted text into fields, reads validation feedback. The same user may also author or edit org-scoped templates.
- A2. Vision AI — extracts text regions from an uploaded image and, when a template is selected, proposes a mapping from each region to one of the template's labeled fields. Does **not** count characters or evaluate validation rules.

---

## Key Flows

- F1. General image extraction (no template)
  - **Trigger:** User uploads one or more images on the "Image (general)" tab.
  - **Actors:** A1, A2.
  - **Steps:** User uploads images → AI extracts each distinct text region per image → each region renders as a row with the same counts and indicators as the existing paste-text mode → user can edit any row inline to correct OCR errors → counts update live.
  - **Outcome:** User has one count card per image, with one row per extracted text region.
  - **Covered by:** R3, R4, R12, R13, R20.

- F2. Template-driven extraction and validation
  - **Trigger:** User uploads one or more images on the "Image + template" tab and picks a template for each image.
  - **Actors:** A1, A2.
  - **Steps:** User uploads images → for each image, user picks a template from the org's template list → AI extracts text regions and proposes a label per region for that template → each image renders as a card with the template's fields and the AI-proposed text per field, plus an "unassigned" pool below the fields containing any regions the AI could not confidently map (and any extras beyond the template's field count) → user corrects by dragging chunks between fields, between a field and the unassigned pool, and by inline-editing the text in any field or pool chunk → validation runs live against the template's rules; pass/fail indicators show per field.
  - **Outcome:** Each image card shows fully assigned, edited, and validated text per template field, plus any orphan text in the unassigned pool.
  - **Covered by:** R5, R6, R7, R8, R9, R10, R14, R15, R16, R17, R18, R20, R21.

- F3. Template authoring
  - **Trigger:** Any org user opens the template management UI from the template picker.
  - **Actors:** A1.
  - **Steps:** User creates a new template (name) → adds an ordered list of fields (each with a label) → for each field, picks one or more validation rules and configures them (e.g., "max characters: 25", "single line") → saves. Any user in the same org can edit or delete the template.
  - **Outcome:** Template is available in the picker for everyone in the org.
  - **Covered by:** R5, R6, R7, R19.

---

## Requirements

**Modes and entry points**
- R1. The text-counter home page presents three tabs on one screen: "Text" (existing paste-text mode), "Image (general)", and "Image + template".
- R2. The existing paste-text mode is unchanged in behavior, settings, and storage — it remains the default tab for users who arrive expecting the current tool.

**General image mode**
- R3. The user can upload one or more images (PNG, JPG, PDF — formats to confirm in planning) on the "Image (general)" tab.
- R4. For each image uploaded in general mode, the AI extracts each distinct text region as a separate item, and the UI displays each item as a row with the same counts and indicators the paste-text mode produces (characters, words, lines, sentences, paragraphs, reading/speaking time, optional target — controlled by the same existing settings).

**Templates (data model and authoring)**
- R5. A template is a named, org-scoped object containing an ordered list of fields. Each field has a label and an ordered list of validation rules.
- R6. Any user in an org can create, edit, or delete any template owned by their org. There is no admin gate.
- R7. Templates persist server-side. They are scoped to the user's organization and visible only to that org.
- R19. The template picker is reachable from both image modes; the same picker offers a "Manage templates" action that opens the template authoring UI.

**Template image mode (extraction and matching)**
- R8. The user can upload one or more images on the "Image + template" tab and pick a template independently for each image.
- R9. When a template is selected for an image, the AI's job is to (a) extract distinct text regions and (b) propose, for each region, which of the template's labeled fields it best matches. The AI does not count characters and does not evaluate rules.
- R10. If the AI cannot confidently map a region to any field, or there are more extracted regions than the template has fields, the unmatched regions appear in an "unassigned" pool rendered below the field list for that image card.

**Validation rules (per field)**
- R14. Each template field supports the following rule types in V1: max characters, max words, min characters or words, single-line (no line breaks), forbidden words/phrases (list of strings the text must not contain).
- R15. Validation runs live as the user drags, drops, or edits text. The UI shows a per-field pass/fail indicator. The component performs all counting and rule evaluation — not the AI.

**Correction UX**
- R16. The user can drag any text chunk (in a field or in the unassigned pool) into any other field of the same image card, or back to the unassigned pool. Dropping replaces the destination field's current text; the source chunk leaves its previous location.
- R17. The user can inline-edit the text inside any field or unassigned-pool chunk to fix OCR character-level errors (e.g., `1` vs `l`, `0` vs `O`). Edits update counts and validation immediately.
- R18. Drag-and-drop is scoped to within a single image card. The user cannot drag a chunk from one image's card into another image's card.

**Unassigned-pool presentation**
- R20. Every chunk in the unassigned pool displays the same counts (characters, words) as a field row, even though no validation rules apply to it. The pool sits visually below the template fields for the image, not above.

**Empty fields**
- R21. A template field with no assigned text renders as empty. If the field has rules whose minimum is unmet by emptiness (e.g., min-length, required content via "forbidden words"-style positives), the field shows a fail indicator; otherwise it shows neutral (no pass and no fail).

**Persistence and privacy**
- R11. Uploaded images are sent to the AI vision provider for extraction and are not stored server-side after the request completes.
- R12. Extracted text is not persisted server-side. It lives only in the browser session and is lost when the user closes or refreshes the page.
- R13. The R7-style "text content is never persisted" privacy posture from the existing paste-text mode extends to the new image modes — only templates are persisted.

---

## Acceptance Examples

- AE1. **Covers R3, R4, R20.** Given a user is on the "Image (general)" tab, when they upload a JPG containing three visible text blocks ("HEADLINE", "Body copy paragraph", "Visit example.com"), then the UI renders one card for the image with three rows, each showing character and word counts.
- AE2. **Covers R9, R10.** Given a template with fields `[headline, body, cta, disclaimer]` and an image whose AI extraction returns five text regions, when the user submits the image, then the AI proposes four mappings (one per field, best guess) and the fifth region appears in the unassigned pool below the field list for that image card.
- AE3. **Covers R10, R16.** Given the AI assigned the legal disclaimer text to the `body` field by mistake, when the user drags that chunk from `body` into `disclaimer`, then the `body` field becomes empty and the `disclaimer` field shows the dragged text and its validation against the disclaimer field's rules.
- AE4. **Covers R14, R15.** Given a `headline` field with rules `max characters: 25` and `single line`, when the assigned text is `"This is a longer headline\nwith a break"`, then the field shows fail with both rule violations indicated (35 chars > 25, and contains a line break).
- AE5. **Covers R17.** Given the AI extracted `"V1sit example.c0m"` into the `cta` field (OCR misread), when the user inline-edits the field to `"Visit example.com"`, then the counts and validation indicators update immediately.
- AE6. **Covers R18.** Given two image cards rendered side-by-side, when the user attempts to drag a chunk from image card 1's `headline` into image card 2's `headline`, then the drop is not accepted and the chunk stays in its original location.
- AE7. **Covers R8.** Given the user uploads two images in template mode, when they pick template `"Meta Feed Ad"` for image 1 and template `"Google Display Banner"` for image 2, then each image card renders that image's chosen template's fields independently.
- AE8. **Covers R6, R7.** Given user X creates template `"Holiday Carousel"` in org Alpha, when user Y in org Alpha opens the template picker, then `"Holiday Carousel"` appears in their list; when user Z in org Beta opens the picker, then `"Holiday Carousel"` does not appear.
- AE9. **Covers R11, R12, R13.** Given a user completes a template-mode session with extracted text in fields, when the user refreshes the browser, then all extracted text is gone, all field assignments are gone, and the template selections are gone — only the persisted org templates themselves remain.

---

## Success Criteria

- A user who today retypes text from a JPG into the paste-text counter can instead upload the JPG, get the same counts without typing, and (in template mode) see per-field pass/fail against rules they configured once.
- For a 5-image carousel with a 4-field template per image, the user can produce a fully validated result in a meaningfully shorter time than retyping each field by hand for each image.
- AI extraction errors (wrong field assignment, missed regions, OCR character mis-reads) can be fully corrected by the user via drag-and-drop and inline edit, without needing to re-upload the image or contact support.
- A downstream planner can read this doc and not need to invent product behavior on: which modes exist, what a template is, what rules exist in V1, where extracted text goes when there are too many or too few regions, what persists server-side and what doesn't, and what the AI is and is not responsible for.

---

## Scope Boundaries

- Batch validation over many creatives at once (campaign-level dashboards, multi-creative reports) is deferred. The unblock here is the per-creative workflow.
- Saved or named validation "checks" (audit-trail records of "this image was validated against this template at this time, here's the pass/fail") are deferred.
- Custom regex rules and "required to include" (specific token must appear) rules are deferred. The five V1 rule types are the floor.
- A curated system-wide template library shipped by VML (e.g., "Meta Feed Ad", "Google Display Banner" defaults) is deferred. Orgs author their own.
- Admin-gated template authoring (only certain users can create/edit templates) is deferred — V1 is flat org-anyone-creates.
- Image hash cache (re-uploading the same image is free because the OCR result is cached) is deferred.
- Last-session resume (closing the tab and returning to find your image + extracted text again) is deferred. Extracted text is intentionally ephemeral.
- Cross-image drag-and-drop of chunks is deferred — drag is scoped to a single image card.
- PDF/CSV export of validation results is deferred.

---

## Key Decisions

- **Templates are org-scoped, anyone-creates, no admin gate.** Rationale: optimize for speed of authoring over governance for V1. The user explicitly preferred this over the admin-gated and system-library options.
- **Drag-and-drop reassignment plus an unassigned pool below fields with counts.** Rationale: AI matching does not need to be perfect; orphan and extra text is visible, not hidden. Counts on pool chunks let the user see how much "extra" they have at a glance.
- **Only templates persist server-side; images and extracted text stay ephemeral.** Rationale: preserves the existing text-counter's R7 privacy posture without making the new feature an exception.
- **Three tabs on one page (paste / image-general / image-template), not a separate route.** Rationale: existing users keep their experience by default; the new modes are discoverable without splitting the mini-app.
- **Multi-image with per-image template choice.** Rationale: explicit user revision from "multi-image, same template" — flexibility wins, at the cost of more UI surface (one card per image, each with its own template selector).
- **AI is responsible for extraction and label-matching only; counting and rule evaluation stay in the component.** Rationale: counting is deterministic and already implemented; keeping it client-side avoids paying the AI to do something a pure function already does, and keeps results consistent with the existing paste-text mode.

---

## Dependencies / Assumptions

- The existing AI provider infrastructure under `apps/api/src/_core/third-party/ai/providers/` (Anthropic, OpenAI, Google, Bedrock, Azure-OpenAI) includes at least one provider whose model supports image input. *Unverified assumption* — planning must confirm which provider/model exposes a multimodal call usable for OCR-style extraction in this codebase. If no provider does, the plan must add one.
- The mini-app architectural guidance from `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, and `PRD_DEFAULTS.md` (PostgreSQL schema isolation per app, PrimeNG-only components, `--p-` tokens for colors, no cross-mini-app imports) applies to the new API entities and web components.
- The existing text-counter web module's "no `_core` imports from mini apps; use `_platform/` services" rule is preserved when adding API calls from the web side.
- The current `text-counter` mini-app has no API surface (deliberately client-only). This feature introduces the first API endpoints under `apps/api/src/mini-apps/text-counter/` — for vision extraction and template CRUD.
- Image upload UX and file-validation patterns can borrow from the existing `image-library` mini-app (`apps/api/src/mini-apps/image-library/services/image-file-validation.service.ts`).

---

## Outstanding Questions

### Resolve Before Planning

- *(none — product shape is settled.)*

### Deferred to Planning

- [Affects R9, R11][Needs research] Which vision provider and model to use for extraction + label-matching, and the cost/quality trade-off at expected request volume. The existing provider abstraction supports several; planning should pick and justify.
- [Affects R9][Technical] Whether the AI prompt for label-matching should receive *only* the field labels, or also field-level hints (e.g., "headline is usually the largest text", "disclaimer is usually the smallest"). Affects matching accuracy vs template authoring burden.
- [Affects R3, R8][Technical] Supported image formats and per-file size limits — confirm against vision provider limits and reuse image-library's validation patterns.
- [Affects R5, R6][Technical] Concurrency behavior when a template is edited or deleted while another user has it loaded in an active session. Likely answer: snapshot at session start and let stale template-picker entries silently disappear, but specify in planning.
- [Affects R16][Technical] Drag-and-drop library or pattern within the existing PrimeNG + Angular signals setup — CDK DragDrop is the obvious candidate, confirm in planning.
- [Affects R14][Technical] Forbidden-words rule semantics: case-sensitive default, whole-word vs substring match, and whether the comparison is per-occurrence or per-field. Spec in planning.
