# Image Library — API

Per-space image library. First mini-app to use `SpaceAccessGuard`.

## Routing

- Path: `organization/:orgId/space/:spaceId/apps/image-library/...`
- Guards (class-level): `AuthGuard('jwt')`, `HasAppAccessGuard` (via `@RequiresApp`), `SpaceAccessGuard`.
- `SpaceAccessGuard` reads `:spaceId` from the URL and calls `SpaceUserService.hasSpaceAccess`. Both deps live in `CommonModule` — this module re-imports it.

## Tags

- Stored as `text[]` column on `image_assets` with a GIN index (`idx_il_images_tags`).
- Filter via `tags @> ARRAY[...]::text[]` (AND logic, GIN-accelerated).
- Tag-suggest queries `unnest(tags)` per space, ranked by use count.
- Tags are case-preserving but case-insensitive for dedupe and filter intent. Normalization happens on write (`normalizeTags`).

## Uploads

- Multipart via `FileInterceptor('file', { memoryStorage, fileSize: 25 MB })`.
- `ImageFileValidationService` enforces: empty/oversize, filename safety (no path traversal, no control bytes), extension allow-list (`.png`/`.jpg`/`.jpeg`/`.webp`/`.gif`), MIME allow-list, magic-byte verification at correct offsets.
- HEIC is detected via the ISO BMFF `ftyp` brand and **rejected** in v1 with an `InvalidFileTypeError`. Server-side transcode (via `sharp`) is deferred.
- S3 key shape: `image-library/<spaceId>/<uuid>.<ext>`. Bucket-level access controls assumed unchanged from the doc-converter pattern.
- On row-insert failure, the orphan S3 object is explicitly deleted before the error propagates.

## EXIF / privacy note (v1)

EXIF / IPTC metadata is **preserved as-uploaded** in v1. GPS coordinates, device serial numbers, and timestamps embedded in JPEG/WebP/HEIC files will be visible to all space members and via shared signed URLs. A future PR should add a metadata-stripping step in `ImageFileValidationService` (recommended approach: `sharp` re-encode through a pixel pipeline). Document this risk to users uploading in-market photography.

## Signed URLs

- `AwsS3Service.generatePresignedUrl` with `expiresIn: 3600` (1 hour) and explicit `responseContentDisposition: 'inline; filename=...'`.
- TTL is the same for every read; rate-limit the list endpoint at the platform layer if needed.

## What's NOT here

- No background worker / queue — uploads are sync request/response.
- No SSE — read endpoints poll-friendly via `Cache-Control` defaults.
- No tag-editing endpoint on existing images in v1 (see `Deferred to Follow-Up Work` in the plan).
- No image transcoding, thumbnail generation, or responsive variants.
- No bulk operations.
