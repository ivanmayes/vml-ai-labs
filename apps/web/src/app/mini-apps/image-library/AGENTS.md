# Image Library — Web

Per-space image library. First mini-app routed under `/apps/<key>/:spaceId`.

## Routing

- `/apps/image-library/:spaceId` — main library page. If no `:spaceId` is provided (launcher entry from `toolbox-grid` which doesn't thread space context), the home component renders an inline message instructing the user to open the library from a space page or visit the URL directly. v2 should add a per-space toolbox-grid surface that threads `:spaceId` automatically.

## Layout

- Tailwind v4 utilities only — NO PrimeFlex (see `docs/solutions/ui-bugs/primeflex-classes-not-available-in-primeng-v20-tailwind-stack-2026-04-01.md`).
- Grid is `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` on the parent, no `col-*` wrappers.
- All colors via `--p-*` design tokens; no hardcoded hex.

## Clipboard + Web Share

- `services/image-clipboard.util.ts` re-encodes images to PNG via `<canvas>` before `navigator.clipboard.write` — consistent ingestion across Claude / ChatGPT / Gemini. Returns `false` on any failure (older browsers, cross-origin iframe without `clipboard-write`); caller falls back to "Copy link".
- `services/image-share.util.ts` prefers the OS share sheet with a `File` payload; falls back to `mailto:` (signed URL in body) + `sms:` (mobile only) + "Copy link".
- **WPP Open iframe**: clipboard image-write requires `allow="clipboard-write"` on the embedding iframe. If unset, every user falls into "Copy link" — verify in production before claiming AE4 ships.

## Types

- API response shapes mirrored in `models/image-library.types.ts`. The cross-app `no-restricted-imports` rule blocks `@api/mini-apps/...` imports inside any mini-app, and web bans the `*Dto` suffix — so the standard "import from `@api/`" rule doesn't apply here. Any API DTO change needs a corresponding edit in `image-library.types.ts`.

## What's NOT here

- No tag editing on existing images (read-only chips in detail). See origin doc Deferred to Follow-Up Work.
- No multi-select / bulk operations.
- No image editing.
- No thumbnail generation — grid serves the originals via signed URLs (1 hr TTL).
