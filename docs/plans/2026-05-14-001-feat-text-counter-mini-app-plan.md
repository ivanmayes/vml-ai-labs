---
title: "feat: Add text-counter mini-app"
type: feat
status: completed
date: 2026-05-14
---

# feat: Add text-counter mini-app

## Summary

A new client-side-only mini-app that gives users a textarea, live character / word / line counts, optional derived stats (sentences, paragraphs, reading and speaking time), and a settings panel whose preferences persist in `localStorage`. No API endpoints, no DB entity — the scaffolded backend stays as inert stubs.

---

## Problem Frame

The platform doesn't yet have a lightweight standalone writing/counting utility. Users editing copy in WPP Open today reach for external sites (wordcounter.net etc.) for the same job. A small in-platform tool removes that context switch and gives us a clean example of a zero-backend mini-app for future contributors to follow.

---

## Requirements

- R1. New mini-app registered in `apps/mini-apps.json` with key `text-counter`, displayName "Text Counter", and a sensible icon — discoverable from the toolbox grid like every other mini-app.
- R2. Single page at `/apps/text-counter` rendering a textarea, a live stats panel, and a settings panel. PrimeNG components throughout; design tokens (`--p-*`) for color; no raw HTML form controls.
- R3. Character, word, and line counts always shown. Sentences, paragraphs, reading time, and speaking time individually toggleable in settings.
- R4. Word counting supports two rules: whitespace-split (default) and alphanumeric-token. Character counting can include/exclude whitespace and include/exclude line breaks, each independently configurable.
- R5. Optional target count (characters OR words) with a visual indicator when the current value exceeds the target.
- R6. All settings persist to `localStorage` under a single versioned key. Reload restores the user's last-used settings. Corrupt or version-mismatched stored settings fall back silently to defaults.
- R7. Typed text is NOT persisted anywhere — privacy default, no surprise restoration on next visit.
- R8. The settings panel can be reset to defaults via a single action.
- R9. The mini-app contributes no API routes and no entity. The scaffolded NestJS controller is deleted; the module exists but registers no controllers and no entities. (`SchemaBootstrapService` will still `CREATE SCHEMA IF NOT EXISTS "text_counter"` on API boot as a side effect of the manifest entry — accepted, see Risks.)

---

## Scope Boundaries

- No file upload, drag-and-drop import, or paste-from-URL flows.
- No export of stats (CSV, copy-to-clipboard of a report, etc.).
- No history of past counts, multi-document tabs, or saved snippets.
- No server-side persistence of settings (per-user, per-org). `localStorage` only.
- No shareable URLs or collaborative editing.
- No locale-aware word segmentation (Intl.Segmenter, CJK splitting). Whitespace-split is acceptable for v1.
- No diff or comparison mode against another text.
- No backend endpoints beyond the inert scaffold stubs.

### Deferred to Follow-Up Work

- Locale-aware word segmentation via `Intl.Segmenter` for CJK / non-spaced scripts: future iteration if user demand emerges.
- Org-scoped server-side settings sync: only if cross-device persistence becomes a real need.

---

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/console/create-app.console.ts` — the `CreateApp` scaffold. Writes API + Web boilerplate, decline the sample entity prompt.
- `apps/web/src/app/mini-apps/image-library/` — most recent mini-app; reference for component shape, signal-based state, `OnPush` change detection, and `localStorage` usage (`pageSizeKey` pattern in `pages/image-library-home/image-library-home.component.ts`).
- `apps/web/src/app/shared/primeng.module.ts` — `PrimeNgModule` re-exports the common PrimeNG components used by mini-apps.
- `apps/mini-apps.json` — the manifest the scaffold updates; CreateApp adds the entry automatically.
- `apps/web/src/app/app.routes.ts` — the `// MINIAPP_ROUTES_REF` marker the scaffold inserts the route under.
- `apps/api/src/mini-apps/mini-apps.module.ts` — the `// MINIAPP_MODULES_REF` marker the scaffold uses.

### Institutional Learnings

- `docs/solutions/ui-bugs/primeflex-classes-not-available-in-primeng-v20-tailwind-stack-2026-04-01.md` — use Tailwind v4 utilities, not PrimeFlex `col-*` / `grid` classes. Image-library mini-app's AGENTS.md reinforces this.

### External References

- None — well-patterned local work, no high-risk surfaces.

---

## Key Technical Decisions

- **No API surface, no DB entity.** Delete the scaffolded `text-counter.controller.ts` and drop its import from `text-counter.module.ts`. The module exists (for manifest consistency) but registers no controllers and no entities. The web side's scaffolded `services/text-counter.service.ts` is also deleted — replaced by U2's pure util and U3's settings util. Rationale: every byte of state lives client-side; the empty schema and empty backend module are acceptable trade-offs for a uniform manifest entry.
- **Pure counting utility, separate from the component.** A single function `computeStats(text, settings) -> Stats` lives in `services/text-counter.util.ts`. Easy to unit-test, easy to reason about, no Angular dependencies.
- **Versioned `localStorage` key with merge-onto-defaults.** Store under `text-counter:settings:v1`. On read, parse and merge stored values onto `DEFAULT_SETTINGS` (unknown keys dropped, missing keys default in). Reserve a `version` bump for genuinely breaking changes (key rename, type change). Rationale: strict-shape validation would silently reset every preference whenever we add a new setting; merge-onto-defaults handles additive changes for free.
- **Settings persistence as a plain util, not an Angular service.** A `text-counter-settings.util.ts` exports `loadSettings()`, `saveSettings(s)`, `resetSettings()`, and `DEFAULT_SETTINGS`. The component holds settings in a local signal. Matches the util-not-service shape of U2; testable without `TestBed`.
- **Signal-based state, OnPush change detection.** Matches the image-library pattern; live counting on every keystroke is cheap enough that no debounce is needed for typical input sizes.
- **No `live-update` toggle in v1 settings.** The synthesis floated this; on reflection, "type and see the number update" is the whole job of the tool — making it optional adds a setting that no one will reach for. Out of scope; can be added later if anyone asks.
- **PrimeNG components for every interactive control.** `Textarea`, `Card`, `ToggleSwitch` (PrimeNG v20 rename of `InputSwitch`; selector `p-toggleswitch`), `SelectButton` or `Select` (PrimeNG v20 rename of `Dropdown`; selector `p-select`) for the word-rule, `InputNumber` for WPM and target value, `Button` for reset. `ToggleSwitchModule` is already exported from `apps/web/src/app/shared/primeng.module.ts`; `SelectModule`, `InputNumberModule`, and the textarea directive will need to be imported directly in the home component (they are not in `PrimeNgModule` today, and the no-cross-mini-app-boundary rule discourages extending the shared module from a mini-app).

---

## Open Questions

### Resolved During Planning

- Should typed text persist across reloads? Resolved: no. Privacy default, no surprise restoration.
- Should there be a `live-update` toggle? Resolved: no — the tool's whole purpose is live counting (see Key Technical Decisions).
- Should the API side be skipped entirely? Resolved: no — keeping the scaffolded stubs keeps the mini-app surface uniform across the manifest and makes future expansion (if ever needed) trivial. The cost is a few unused boilerplate files.

### Deferred to Implementation

- Exact PrimeNG component for the word-rule selector (`SelectButton` vs. `Dropdown`) — pick whichever looks cleaner in the actual layout.
- Whether the settings panel sits beside the textarea (sidebar) or below it (collapsible card) — settle during the UI pass, no decision-time information available.

---

## Implementation Units

### U1. Scaffold the mini-app

**Goal:** Run the `CreateApp` console to register `text-counter` across manifest, API module, web routes, and create the API/web directory skeleton.

**Requirements:** R1, R9

**Dependencies:** None

**Files:**
- Create (via scaffold):
  - `apps/api/src/mini-apps/text-counter/text-counter.module.ts`
  - `apps/api/src/mini-apps/text-counter/text-counter.controller.ts`
  - `apps/api/src/mini-apps/text-counter/text-counter.service.ts`
  - `apps/api/src/mini-apps/text-counter/AGENTS.md`
  - `apps/web/src/app/mini-apps/text-counter/text-counter.routes.ts`
  - `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/text-counter-home.component.ts`
  - `apps/web/src/app/mini-apps/text-counter/services/text-counter.service.ts`
  - `apps/web/src/app/mini-apps/text-counter/AGENTS.md`
- Modify (via scaffold):
  - `apps/mini-apps.json` — adds `text-counter` entry
  - `apps/api/src/mini-apps/mini-apps.module.ts` — adds `TextCounterModule` import + ref
  - `apps/web/src/app/app.routes.ts` — adds `/apps/text-counter` route

**Approach:**
- Run `npm run console:dev CreateApp` from `apps/api/`. App name: `text-counter`. Display name: `Text Counter`. Description: short user-facing line ("Count characters, words, and more, with configurable settings."). Decline the sample entity prompt.
- After scaffold, edit `apps/mini-apps.json` only to change the icon from the default `pi pi-box` to something more fitting (e.g. `pi pi-pencil` or `pi pi-align-left`).
- **Delete the scaffolded API controller** (`apps/api/src/mini-apps/text-counter/text-counter.controller.ts`) and remove its import + `controllers: [...]` array from `text-counter.module.ts`. The module file stays so `MiniAppsModule` can import it for manifest parity.
- **Delete the scaffolded web service stub** (`apps/web/src/app/mini-apps/text-counter/services/text-counter.service.ts`) — U2 and U3 replace it with two purpose-built utils.
- **Clean up unused scaffold imports** in the remaining API files: the generated service ships with `FindManyOptions, FindOptionsWhere, Repository` from typeorm — none are used in a no-entity app. Remove them so `npm run validate` stays clean. (Actually, since the controller is being deleted and the service has nothing to do, evaluate whether to delete the API service too — keep it only if `TextCounterModule` still needs to declare something in `providers`.)
- Leave the scaffolded web home component as a placeholder; U4 rewrites it.

**Patterns to follow:**
- The `CreateApp` flow used for `image-library` (most recent run, May 12 2026).

**Test scenarios:**
- Test expectation: none — scaffolding only, no behavior to test. Verification is "the app appears in the toolbox grid and `/apps/text-counter` routes successfully."

**Verification:**
- After `npm run start:dev` + `npm run web:dev`, the toolbox grid lists "Text Counter" and clicking it routes to `/apps/text-counter` with the scaffolded placeholder card rendered (will be replaced in U4).
- `npm run validate` passes.

---

### U2. Counting utility + tests

**Goal:** A pure function that takes a text string and a settings object and returns the full set of derived stats. No Angular, no DOM.

**Requirements:** R3, R4

**Dependencies:** U1

**Files:**
- Create: `apps/web/src/app/mini-apps/text-counter/services/text-counter.util.ts`
- Create: `apps/web/src/app/mini-apps/text-counter/services/text-counter.util.spec.ts`
- Create: `apps/web/src/app/mini-apps/text-counter/models/` (new directory; U1 scaffold only creates `services/`, `components/`, and `pages/`)
- Create: `apps/web/src/app/mini-apps/text-counter/models/text-counter.types.ts` (settings + stats interfaces)

**Approach:**
- Export a `TextCounterSettings` interface (counting flags, word rule, WPM values, derived-stat toggles, target spec) and a `TextStats` interface (`characters`, `words`, `lines`, `sentences`, `paragraphs`, `readingTimeMinutes`, `speakingTimeMinutes`, plus the over-target boolean).
- Export `computeStats(text: string, settings: TextCounterSettings): TextStats`.
- Character count algorithm (explicit order): start with `n = text.length`. If `countLineBreaksAsCharacter === false`, subtract the count of `\n` characters from `n`. Then if `countWhitespaceAsCharacter === false`, subtract the count of remaining whitespace characters that are NOT line breaks (regex: `/[^\S\n]/g`) from `n`. This ordering avoids double-counting line breaks (which are whitespace). Examples: `"line1\nline2"` → with both flags true = 11; with `countLineBreaksAsCharacter: false` = 10; with both false = 10 (whitespace pass matches nothing else); `"a b\nc"` → both flags true = 5; line-break false = 4; both false = 3.
- Word count: when `wordRule === 'whitespace'`, split on `/\s+/` and drop empty entries; when `'alphanumeric'`, match `/[\p{L}\p{N}']+/gu` length. Empty/whitespace-only input returns 0 either way.
- Line count: `text === '' ? 0 : text.split('\n').length`.
- Sentences: split on `/[.!?]+(?:\s|$)/`, drop empty entries.
- Paragraphs: split on `/\n\s*\n+/`, drop empty entries.
- Reading/speaking time: `Math.ceil(words / wpm)` minutes, with a floor of `< 1` displayed as "< 1 min" handled in the component, not the util.
- Over-target: when `settings.target.enabled`, compare the relevant count (characters or words) against `settings.target.value`.

**Patterns to follow:**
- No-Angular-imports util style of `apps/web/src/app/mini-apps/image-library/services/image-clipboard.util.ts`. Note that file is browser-only (touches `navigator`, canvas); `text-counter.util.ts` will be genuinely pure (string in, object out) — closer in spirit to the pure pipes under `apps/web/src/app/shared/pipes/`.
- Existing Karma/Jasmine spec style of `apps/web/src/app/shared/pipes/*.spec.ts` (component specs also exist under `wpp-open-agent-updater/` and elsewhere, but the pipe specs are the closest match for a pure-function util test).

**Test scenarios:**
- Happy path: empty string returns zeros across all fields.
- Happy path: `"hello world"` with default settings returns 2 words, 11 characters (whitespace included), 1 line, 1 sentence, 1 paragraph.
- Happy path: multi-paragraph input ("a.\n\nb!\n\nc?") returns 3 sentences, 3 paragraphs, 3 words.
- Edge case: `"   "` (only whitespace) returns 0 words and the correct character count for both `countWhitespaceAsCharacter` true and false.
- Edge case: `"line1\nline2\nline3"` returns 3 lines; with `countLineBreaksAsCharacter: false`, characters = 15, not 17.
- Edge case (CJK / non-Latin): `"你好世界"` (4 ideographs) returns 1 word under whitespace rule, 4 under alphanumeric rule (each `\p{L}` matches one CJK char). Pin this expected behavior so the limitation is visible; the UI surfaces a script-aware note in U4.
- Edge case: word rule comparison — `"don't can't"` returns 2 words under both rules; `"hello, world!"` returns 2 words under both rules; `"a1b2 c3-d4"` returns 2 under whitespace rule and 3 under alphanumeric rule (matches `a1b2`, `c3`, `d4` via `/[\p{L}\p{N}']+/gu`).
- Edge case: trailing/leading whitespace doesn't inflate word count.
- Edge case: WPM of 0 — guard against divide-by-zero (return 0 or fall back to default — pick one and test it).
- Happy path: target check — over-target boolean flips true when `characters > target.value` and `target.unit === 'characters'`.
- Edge case: target unit `'words'` triggers the over-target flag against the word count, not the character count.

**Verification:**
- Running `npm test` (or the web-app spec runner) passes the new spec file.
- Function is pure (same inputs always yield same outputs) and has no Angular imports.

---

### U3. Settings persistence util + tests

**Goal:** Plain functions that load, save, and reset `TextCounterSettings` against `localStorage`, merging stored values onto defaults so additive setting changes never silently nuke a user's preferences.

**Requirements:** R6, R8

**Dependencies:** U2 (for the `TextCounterSettings` type)

**Files:**
- Create: `apps/web/src/app/mini-apps/text-counter/services/text-counter-settings.util.ts`
- Create: `apps/web/src/app/mini-apps/text-counter/services/text-counter-settings.util.spec.ts`

**Approach:**
- Exports: `DEFAULT_SETTINGS`, `loadSettings(): TextCounterSettings`, `saveSettings(s: TextCounterSettings): void`, `resetSettings(): TextCounterSettings`. No Angular service class.
- Storage key constant: `text-counter:settings:v1`. Stored payload is `{ version: 1, settings }`.
- On `loadSettings`: try `JSON.parse` the stored value; if it parses and `version === 1`, return `{ ...DEFAULT_SETTINGS, ...parsed.settings }` filtered to known keys (drop unknown keys to avoid leaking forward-compat noise). On parse failure, version mismatch, or any thrown error, return `DEFAULT_SETTINGS`. Don't delete the bad value — next `saveSettings` overwrites.
- The `target` sub-object is merged shallowly: `{ ...DEFAULT_SETTINGS.target, ...parsed.settings.target }` so partial target objects don't lose fields.
- `saveSettings` writes `JSON.stringify({ version: 1, settings })` under the key.
- `resetSettings` removes the key and returns `DEFAULT_SETTINGS`.
- All three functions guard `typeof localStorage !== 'undefined'` for SSR safety (cheap).
- Defaults chosen for common-tool ergonomics: `countWhitespaceAsCharacter: true`, `countLineBreaksAsCharacter: false`, `wordRule: 'whitespace'`, `showSentences: true`, `showParagraphs: true`, `showReadingTime: true`, `showSpeakingTime: false`, `readingWpm: 250`, `speakingWpm: 130`, `target: { enabled: false, unit: 'characters', value: 280 }`.

**Patterns to follow:**
- `localStorage` getter/setter shape used in `apps/web/src/app/mini-apps/image-library/pages/image-library-home/image-library-home.component.ts` (`pageSizeKey` helpers) — adapt the guarded get-with-fallback pattern, but lift it into a util module rather than inline component helpers.

**Test scenarios:**
- Happy path: with empty `localStorage`, `loadSettings()` returns deep-equal `DEFAULT_SETTINGS`.
- Happy path: `saveSettings(custom)` followed by `loadSettings()` returns the custom object.
- Happy path: `resetSettings()` removes the key; subsequent `loadSettings()` returns defaults.
- Happy path (forward-compat additive change): stored payload is missing a newly-added boolean key (e.g., simulate the future by storing `{...DEFAULT_SETTINGS, showReadingTime: undefined}` then deleting that key from the stringified payload). `loadSettings` returns defaults filled in for the missing key while preserving all other stored values. This is the core regression test for the merge-onto-defaults design.
- Error path: `localStorage` contains invalid JSON — `loadSettings()` returns defaults, does not throw.
- Error path: stored payload has `version: 0` — treated as unrecognized; defaults returned.
- Error path: stored payload is an empty object `{}` — defaults returned (no required keys, falls through to merge with all defaults).
- Edge case: `saveSettings` round-trips a target with `enabled: true, unit: 'words', value: 500` faithfully.
- Edge case: stored payload has a partial `target` (only `enabled: true`) — merged target keeps the other defaults (`unit`, `value`).
- Edge case: stored payload has an extra unknown key (`legacyFooBar: true`) — `loadSettings` drops it; subsequent `saveSettings` does not re-emit it.

**Verification:**
- Spec file passes (Karma/Jasmine). Manually toggling a setting in the UI, refreshing the page, and seeing the toggle preserved confirms wiring (covered by U4 verification).

---

### U4. Home component UI (textarea + stats + settings)

**Goal:** Replace the scaffolded home component with the actual UI — textarea, live stats panel, settings panel, reset action. Bind to the util (U2) and service (U3).

**Requirements:** R2, R3, R5, R7, R8

**Dependencies:** U2, U3

**Files:**
- Modify: `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/text-counter-home.component.ts`
- Create: `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/text-counter-home.component.html`
- Create: `apps/web/src/app/mini-apps/text-counter/pages/text-counter-home/text-counter-home.component.scss`

**Approach:**
- Convert the scaffolded component to use external template + style files (matches `image-library-home`).
- `ChangeDetectionStrategy.OnPush`, standalone, imports `PrimeNgModule`, `FormsModule`, `CommonModule`.
- Signal state: `text` (string), `settings` (TextCounterSettings). A `computed` signal derives `stats` from `(text, settings)` via `computeStats`.
- On `ngOnInit`: call `loadSettings()` from the settings util and seed the `settings` signal. Do NOT load any text — R7.
- Settings panel uses PrimeNG controls: `p-toggleswitch` (ToggleSwitch) for booleans, `p-selectButton` or `p-select` (Select; v20 rename of Dropdown) for `wordRule`, `p-inputnumber` for WPM values and target value, `p-select` for target unit. A `p-button` "Reset to defaults" performs a single-click reset (no confirmation dialog) — calls `resetSettings()` and updates the signal.
- **Target sub-controls when `target.enabled` is false:** keep the unit-selector and value `p-inputnumber` visible but disabled (via PrimeNG's `[disabled]`). Avoids layout shift and gives users a clear preview of what they'll edit when they flip the toggle on.
- Any settings change calls `saveSettings(current)` — straightforward, no debounce; users tweak settings infrequently.
- Stats panel shows always-visible counts (characters, words, lines) prominently (larger font + `--p-text-color` emphasis), then conditionally renders the optional rows based on the matching `show*` toggles in a smaller, muted row group.
- Over-target indication: a small PrimeNG `Tag` (severity `danger`) rendered next to the relevant count when `stats.overTarget` is true. No near-target/approaching state in v1.
- **Script-aware footnote:** below the stats panel, render a small muted line: "Word counting is optimized for space-separated scripts. CJK and other non-spaced scripts may not produce meaningful word counts." Always visible (no toggle); uses `--p-text-muted-color`.
- Layout: Tailwind v4 utilities. No PrimeFlex. Use `--p-*` color tokens for any custom styles. Responsive: textarea full-width on small screens; stats panel sits below; on `md+` screens, stats panel can sit beside the textarea.

**Patterns to follow:**
- Component shape, file layout, and module imports from `apps/web/src/app/mini-apps/image-library/pages/image-library-home/image-library-home.component.{ts,html,scss}`.
- AGENTS.md guidance in `apps/web/src/app/mini-apps/image-library/AGENTS.md` (Tailwind utilities only; design tokens; no PrimeFlex).

**Test scenarios:**
- Test expectation: none — mini-app page components are not unit-tested in this repo (no spec exists for `image-library-home` or `site-scraper-home`). The behavioral surface is fully covered by U2 (counting) and U3 (settings persistence) specs; the component is a thin composition of those.

**Verification:**
- `npm run web:dev`, navigate to `/apps/text-counter`, type into the textarea — character/word/line counts update live.
- Toggle each `show*` setting — the corresponding row appears or disappears.
- Change `wordRule` and confirm the word count updates accordingly.
- Toggle character-count modifiers (`countWhitespaceAsCharacter`, `countLineBreaksAsCharacter`) — character count reflects the change.
- Set a target value and watch the over-target tag appear when exceeded.
- Refresh the page — settings persist, text does NOT.
- Click "Reset to defaults" — every control returns to its default value; the change persists across a refresh.
- `npm run validate` passes (lint + typecheck).
- Visually verify on small + large viewports — no overflow, no broken layout.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Word-rule unit semantics ambiguous for hyphenated / contraction-heavy text (`don't`, `state-of-the-art`). | Define expected counts in U2 test scenarios so behavior is pinned. The CJK / non-Latin limitation is also pinned in tests + surfaced in the UI footnote (R4 scope is space-separated scripts only). |
| Future settings additions break old stored payloads. | Merge-onto-defaults pattern (U3): unknown keys dropped, missing keys default in. The `v1` version stays in place for genuinely breaking changes (key rename or type change), which will get an explicit migration when needed. |
| Manifest entry creates an empty `text_counter` PostgreSQL schema on every API boot via `SchemaBootstrapService`. | Accepted as a manifest side effect. The schema is empty, costs nothing, and removing it would require either skipping the manifest entry (breaks R1 — app disappears from toolbox) or adding a per-app opt-out (out of scope for this PR). The API-side `AGENTS.md` generated for `text-counter` will note this so the next maintainer doesn't try to "fix" it. |
| Stale API module file becomes confusing later (no controllers, no entity). | Generated `text-counter.module.ts` carries an explanatory comment that this is a client-only mini-app; the deleted controller's intent is recorded in this plan and in the commit message. |

---

## Sources & References

- Reference mini-app: `apps/web/src/app/mini-apps/image-library/`
- Scaffold console: `apps/api/src/console/create-app.console.ts`
- Layout learning: `docs/solutions/ui-bugs/primeflex-classes-not-available-in-primeng-v20-tailwind-stack-2026-04-01.md`
- Manifest: `apps/mini-apps.json`
