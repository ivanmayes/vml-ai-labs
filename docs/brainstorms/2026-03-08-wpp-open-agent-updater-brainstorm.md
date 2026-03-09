# Brainstorm: WPP Open Agent Updater

**Date:** 2026-03-08
**Status:** Complete
**Next step:** `/ce:plan docs/brainstorms/2026-03-08-wpp-open-agent-updater-brainstorm.md`

---

## What We're Building

A mini-app that automates updating WPP Open agent knowledge from Box folder contents. Users configure **tasks** that link a Box folder to a WPP Open agent, then run them manually to sync updated files into the agent's knowledge base.

### Core Flow

1. **Configure a Task** — User enters a Box folder ID and selects a WPP Open agent from a list
2. **Run a Task** — System connects to Box, finds files modified since the last run, downloads them, converts them via the existing document converter, and upserts them into the WPP Open agent's knowledge
3. **View Results** — Summary list of past runs with drill-down to per-file details

### Three Featuresets

1. **Box Folder Connection** — Enter a Box folder ID, validate it, browse/preview contents
2. **WPP Open Agent Selection** — List available agents from WPP Open, select one as the target
3. **Task Configuration & Execution** — CRUD for task configs, manual run triggering, run history

---

## Why This Approach

### Queue-Based Processing (pg-boss)

We chose async queue-based processing over synchronous requests because:

- **Large folders** — Box folders may contain many files; synchronous processing would risk HTTP timeouts
- **Progress tracking** — pg-boss provides natural job state management (pending → processing → completed/failed)
- **Scheduling foundation** — When WPP Open credentials for service accounts are resolved, the queue infrastructure is already in place for scheduled runs
- **Resilience** — Failed files can be retried without re-running the entire task; job state persists across server restarts
- **Consistency** — Follows the document converter's established pg-boss pattern in this codebase

### Reusing Existing Services

- **Document converter** services already handle file-to-text conversion for all supported formats
- **Box integration** code from `vyc-modular-video-builder` provides a production-ready Box SDK wrapper with JWT/Enterprise auth
- **WPP Open client** already exists in `_core/third-party/wpp-open/` — needs a `_platform` wrapper service for mini-app access
- **WPP Open agent CRUD** patterns from `unite-chat-test` provide the agent listing, knowledge update, and auth patterns

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Processing model** | Queue-based (pg-boss) | Handles large folders, enables future scheduling |
| **Multiple tasks** | Yes, many per org | Different folder/agent combos as needed |
| **Folder traversal** | Recursive | Process all files in folder and subfolders |
| **Change detection** | Last run timestamp | Compare Box file modified dates against last successful run timestamp |
| **File types** | All document converter supported formats | Leverage full converter capability |
| **Auth for manual runs** | User's existing WPP Open session | Users are already authenticated via WPP Open through the platform |
| **Run history** | Summary list + detail page | List view shows run stats; detail page shows per-file results |
| **V1 scope** | Manual runs only | Scheduled runs deferred until WPP Open service account credentials are available |
| **Converter sharing** | Extract to `_platform/` | Shared converter services accessible to all mini-apps |
| **Box folder validation** | Validate + preview on entry | Show folder name and file count for user confirmation |
| **WPP Open project context** | Derived from session | Automatically extracted from user's WPP Open auth |

---

## Data Model (Conceptual)

### Task (Configuration)

- `id` (UUID)
- `organizationId` (FK)
- `name` (user-friendly label)
- `boxFolderId` (string — Box folder identifier)
- `wppOpenAgentId` (string — WPP Open agent identifier)
- `wppOpenProjectId` (string — WPP Open project context)
- `lastRunAt` (timestamp, nullable — when last successful run completed)
- `status` (active/paused/archived)
- `createdById` (FK to user)
- Standard timestamps

### TaskRun (Execution History)

- `id` (UUID)
- `taskId` (FK)
- `status` (pending/processing/completed/failed/cancelled)
- `startedAt`, `completedAt` (timestamps)
- `filesFound` (count of files detected as changed)
- `filesProcessed` (count successfully processed)
- `filesFailed` (count that failed)
- `errorMessage` (nullable — overall run error)
- `triggeredById` (FK to user)
- Standard timestamps

### TaskRunFile (Per-File Detail)

- `id` (UUID)
- `taskRunId` (FK)
- `boxFileId` (string)
- `fileName` (string)
- `fileSize` (bigint)
- `status` (pending/processing/converted/uploaded/failed)
- `errorMessage` (nullable)
- `processedAt` (timestamp)

---

## External Service Integration

### Box API

- **Auth:** JWT/Enterprise authentication using env vars (`BOX_ENTERPRISE_ID`, `BOX_PUBLIC_KEY_ID`, `BOX_PRIVATE_KEY`, `BOX_PASSPHRASE`)
- **Package:** `box-typescript-sdk-gen`
- **Key operations:** List folder contents (recursive), get file metadata, download file content
- **Rate limiting:** 8 concurrent workers for batch operations

### WPP Open API

- **Auth:** User's WPP Open JWT token (passed from frontend session) with CS auth scheme
- **Base URLs:**
  - Agent listing: `https://creative.wpp.ai/v1/aihub/agents`
  - Agent config CRUD: `https://creative.wpp.ai/v1/agent-configs/{projectId}/results/{agentId}`
  - Project resolution: `PUT /v1/project/external/open`
- **Required headers:** `Origin: https://open-web-cs.wpp.ai`, `Referer: https://open-web-cs.wpp.ai/`
- **Knowledge update format:** TBD — needs API exploration to determine how knowledge documents are structured within the agentConfig payload

### Document Converter

- Reuse existing `ConverterFactory` and converter implementations from the document converter mini-app
- These are currently scoped to the document-converter module — will need to be made accessible (either shared via platform or directly imported as a cross-app exception)

---

## Open Questions

1. **WPP Open knowledge structure** — How are knowledge documents represented in the agentConfig JSON? Is it an array of document objects, raw text, file references, or something else? This needs API exploration before implementation.

---

## Resolved Questions

1. **Document converter service sharing** — Extract converter services from the document-converter mini-app to `_platform/` as shared services. Both mini-apps will import from the platform layer.

2. **Box folder validation** — Validate + preview. When the user enters a Box folder ID, immediately check it exists and show the folder name and file count so the user can confirm they have the right folder.

3. **WPP Open project context** — Derived from the user's existing WPP Open auth session. No manual project/workspace selection needed; the project context is extracted automatically.

---

## Out of Scope (V1)

- Scheduled/automatic runs (blocked on WPP Open service account credentials)
- Webhook-based triggers from Box (file change notifications)
- Bi-directional sync (only Box → WPP Open)
- File deletion handling (removing knowledge when files are deleted from Box)
- Multiple Box folders per task (one folder → one agent per task)
