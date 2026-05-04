---
title: "feat: WPP Open Agent Updater — polish (delta-sync fix, agent re-pointing, workspace-aware UX)"
type: feat
status: completed
date: 2026-05-04
origin: docs/plans/2026-04-01-001-feat-open-agent-updater-improvements-plan.md
---

# feat: WPP Open Agent Updater — polish

## Overview

Five fixes to harden the agent updater against the failure modes observed running the existing `RFI Agent Updater` task in production:

1. **Box `modifiedAt` parsing** — unwrap the SDK's `DateTimeWrapper` so delta-sync actually skips unchanged files (currently every file looks like epoch 0).
2. **Agent picker passes `projectId`** — frontend currently lets the backend re-resolve `projectId` from `osContext`, which masks the saved task value and yields an empty agent list when the resolved project differs.
3. **Stop silently overwriting `wppOpenProjectId`** — the response handler clobbers the form value with `resolvedProjectId`, hiding the actual stored value from the user.
4. **Allow re-pointing project/agent in Edit + surface a workspace-mismatch warning** — saved task is currently un-editable for `wppOpenProjectId` / `wppOpenAgentId`; with no warning when the saved project isn't reachable from the current OS context, the only remediation is to delete and recreate.
5. **Typed `WppOpenPermissionError` + pre-flight gate on Run Now** — the worker logs `WPP Open API error: 403` and hides whether the user can fix it. Fail fast in `triggerRun` and present an actionable message.

Goal: a task created in workspace A can be **opened, diagnosed, and re-pointed or run** from workspace B without trial-and-error.

## Problem Frame

The current implementation binds `task.wppOpenProjectId` and `task.wppOpenAgentId` immutably at creation time. When a user later opens the same task from a different OS context (different `application/<uuid>/...` URL), three bugs compound:

- The Edit form's agent dropdown calls `POST /agents` with **no `projectId`**, only `osContext`. The backend resolves `osContext` → some internal CS project, returns its agents. If that internal project differs from the task's saved one, the saved `wppOpenAgentId` won't match any agent in the response → dropdown shows the placeholder ("Select an agent"), even though the task's agent name still appears in the list view (cached on the entity).
- The handler then silently patches `wppOpenProjectId` on the form to the resolved value, so the user can no longer see what is actually stored.
- Run Now still uses `task.wppOpenProjectId` from the database (correct) but if the current user/osContext can't access that external project, the worker's token-validation `listAgents` call returns 403 with the opaque error code `ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT`. The run row records "WPP Open API error: 403" — useless for self-service.

Separately, the Box SDK returns `modifiedAt` as a `DateTimeWrapper` instance with `.value: Date`. The current `scanFolder` code does not unwrap `.value`, falls through to `toString()` → `[object Object]` → `Invalid Date` → resets to `new Date(0)`. Every file passes the date filter every run, so delta-sync is effectively disabled and the agent's knowledge base is rewritten in full each run (1346 files re-uploaded in production today).

## Requirements Trace

- R1. Box `modifiedAt` is parsed to the actual file modification timestamp; unchanged files are skipped on subsequent runs.
- R2. `loadAgents()` sends the form's current `wppOpenProjectId` to the backend; backend uses it without falling back to `osContext` resolution.
- R3. `loadAgents()` response no longer overwrites the form's `wppOpenProjectId`; the form always shows what is (or will be) saved.
- R4. Edit task can re-point `wppOpenProjectId` and `wppOpenAgentId`. When the saved project is not reachable from the current OS context, the form shows a clear inline warning above the picker and the agent dropdown gracefully reflects "no agents" with a "Re-point" affordance.
- R5. The worker maps WPP Open 403 / "ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT" to a typed `WppOpenPermissionError`; the run row's `errorMessage` reads "Saved WPP Open project not accessible from this workspace — open the task in a workspace where you have project access, or re-point the task".
- R6. `triggerRun` validates token + project access **synchronously** before enqueueing — when the user clicks Run Now from a workspace without access, they get an immediate 4xx in the UI rather than a queued run that fails seconds later.

## Scope Boundaries

- No change to the auth model — runs continue to use the user's fresh osContext token (no service account credential storage).
- No change to Box auth (still JWT/Enterprise) or the converter pipeline.
- No new persistence — we do not store per-file content hashes. Delta-sync remains timestamp-based; the fix is purely the parser bug.
- No multi-workspace task replication. A task still belongs to whichever WPP Open external project it was created in. Re-pointing changes the project on a single record.
- No removal of the "core fields immutable" decision from the prior plan — we are softening it for `wppOpenProjectId` / `wppOpenAgentId` only, not `boxFolderId`.

## Context & Research

### Observed in production today

- Run `4b73cac7-1d52-4976-9fae-50a739f58296` (current healthy run): scanned 1346 files, **0 skipped by date** despite the task having two prior runs — direct symptom of the modifiedAt parser bug.
- Runs `57d944fc…`, `d6384c73…` from earlier today: same `RFI Agent Updater` task, opened from URL `application/2bf5df03-…` instead of `application/32d43090-…`, both 403'd at token validation. Browser inspection confirmed the form displayed `UpzobLayjowdnfzZdorWo` (resolved from osContext) while the worker's queue payload sent `4zBQjXPNiqDP8UDGSc1Zg` (the actually-saved value).

### Relevant code

- **Box DateTime parsing**: `apps/api/src/mini-apps/wpp-open-agent-updater/services/box.service.ts:200-228`. `rawModified` falls through `instanceof Date` (false — it is `DateTimeWrapper`), `typeof string` (false), and lands in the toString branch where `Object.prototype.toString` returns `[object Object]`.
- **Box SDK shape**: `node_modules/box-typescript-sdk-gen/lib/internal/utils.js:87` — `class DateTimeWrapper { constructor(value) { this.value = value } }` where `value` is a real `Date`.
- **Frontend `loadAgents`**: `apps/web/src/app/mini-apps/wpp-open-agent-updater/components/task-form/task-form.component.ts:353-403`. Calls `service.listAgents(token, { osContext })` — does not pass `projectId` from the form.
- **Frontend listAgents service**: `apps/web/src/app/mini-apps/wpp-open-agent-updater/services/wpp-open-agent-updater.service.ts:171-190` — already accepts `options.projectId`, just isn't being given one.
- **Form overwrite on response**: `task-form.component.ts:385-388` — `if (result.resolvedProjectId) form.patchValue({ wppOpenProjectId: result.resolvedProjectId })`.
- **Edit field disable**: `task-form.component.ts:313-315` — `boxFolderId`, `wppOpenProjectId`, `wppOpenAgentId` all disabled in edit mode.
- **`updateTask` payload**: `task-form.component.ts:425-431` — does not include `wppOpenProjectId` or `wppOpenAgentId`. Backend `updaterTaskService.updateTask` would also need to accept them.
- **`updateTask` service**: `apps/api/src/mini-apps/wpp-open-agent-updater/services/updater-task.service.ts` (find the `updateTask` method) — confirm/add support for these fields.
- **Worker token validation**: `apps/api/src/mini-apps/wpp-open-agent-updater/services/run-worker.service.ts:126-146`. Throws generic `Error("WPP Open token validation failed: ...")`.
- **CS error parsing**: `apps/api/src/mini-apps/wpp-open-agent-updater/services/wpp-open-agent.service.ts` — the response body already contains `errors[0].code === "ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT"`. We need to surface that, not just the HTTP status.

### Institutional learnings (still relevant)

- WPP Open `osContext.hierarchy` is the correct source; `context.workspace` is deprecated.
- A WPP Open project's "external project ID" (azId) ≠ the CS internal project ID returned by `resolveProjectId`. Storing one and querying with the other produces this exact failure mode.

## Key Technical Decisions

- **Unwrap `DateTimeWrapper.value` first.** In `box.service.ts`, before the existing `instanceof Date` check, add: `if (rawModified && typeof rawModified === 'object' && rawModified.value instanceof Date) { modifiedAt = rawModified.value; }`. The previous toString branch stays as a last-resort; warnings should now disappear in practice. Do not import the SDK's `DateTime` class — duck-type on `.value instanceof Date` so this remains resilient to minor SDK shape changes.
- **`loadAgents` always sends `projectId` when the form has one.** The backend resolution path stays as a fallback for create-mode-with-no-osContext, but in edit mode (or any mode where the form already holds a project ID) we send it. Keeps the worker and the UI on the same identifier and stops the silent ID swap.
- **Remove the form-overwrite from the listAgents response.** The original intent was "if backend resolved a CS internal id, persist that for next time" — but it conflates display with storage and conceals stale state. Move the resolved-id semantics into the backend: when creating a task, the create endpoint can resolve once and persist the canonical id; on edit, the form just displays whatever is stored.
- **Make `wppOpenProjectId` / `wppOpenAgentId` editable in Edit; `boxFolderId` stays immutable.** Box folder identity is the task's true "primary key" from the user's mental model (it's the source of truth). Project + agent are routing — re-pointing them is exactly the operation we need.
- **Workspace-mismatch warning is a derived signal, not new state.** When the form mounts in edit mode with a saved `wppOpenProjectId`, after the (now correctly-passed) `loadAgents` call returns, if the response is `403 / ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT`, render a banner above the project field: "This task's saved project is not accessible from your current workspace. Switch workspace, or re-point this task to a project here." The banner does not block save unless the project is changed.
- **Typed `WppOpenPermissionError`.** New error class in `wpp-open-agent.service.ts`. Throw when CS returns `errors[0].code === "ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT"`. Worker maps it to a clear `errorMessage` on the run row. Controller maps it to HTTP 403 with the same message body for the synchronous Run Now path.
- **Synchronous pre-flight in `triggerRun`.** Before `pgBossService.sendAgentUpdaterJob`, call `wppOpenAgentService.listAgents(token, task.wppOpenProjectId, osContext)` once. On `WppOpenPermissionError`, throw a `ForbiddenException` from the controller — the UI shows a toast immediately. This duplicates the worker's check but trades one extra round-trip for fail-fast UX. The worker still does its own check (defense-in-depth and supports future cron-triggered runs without a user session).
- **Run row error message normalization.** Replace the existing `error instanceof Error ? error.message : 'Unknown error'` in `failRun` callsite with a small mapper: `WppOpenPermissionError → "Saved WPP Open project not accessible from this workspace…"`, anything else → existing behavior.

## Implementation Units

Listed in suggested merge order. Each unit is independent enough to ship on its own.

### U1 — Box `modifiedAt` parser fix

- File: `apps/api/src/mini-apps/wpp-open-agent-updater/services/box.service.ts`
- Add `DateTimeWrapper` unwrapping branch (`rawModified.value instanceof Date`) before the existing checks at `:200-228`.
- Add a unit test: `box.service.spec.ts` — feed a fake entry with `modifiedAt = { value: new Date('2025-01-01') }` and assert `results[0].modifiedAt.toISOString() === '2025-01-01T00:00:00.000Z'`. Add a regression case for the previous bug: `modifiedAt = {}` should warn, not crash, and default to epoch.
- Verify on staging by running the existing `RFI Agent Updater` task twice in quick succession — second run should report `~1346 skipped by date, ~0 new/modified`.

### U2 — Frontend passes `projectId` to listAgents

- File: `apps/web/src/app/mini-apps/wpp-open-agent-updater/components/task-form/task-form.component.ts:353-403`
- Always include `projectId: this.form.get('wppOpenProjectId')?.value` in the options when present.
- Backend already prefers `body.projectId` over osContext resolution (`wpp-open-agent-updater.controller.ts:179`) — no API change needed.
- Test: `task-form.component.spec.ts` — mount in edit mode with a known `wppOpenProjectId`, mock `listAgents`, assert the call's `options.projectId` matches the form value.

### U3 — Stop overwriting `wppOpenProjectId` on response

- File: `task-form.component.ts:385-388`
- Delete the `patchValue({ wppOpenProjectId: result.resolvedProjectId })` line.
- For new tasks where resolution mattered: have the **backend** apply resolution at create time only. Add a small step in `updaterTaskService.createTask` (or the controller) that, if `osContext` is provided and the request's `wppOpenProjectId` differs from `resolveProjectId(token, osContext)`, persists the resolved value. Keep `resolvedProjectId` in the listAgents response purely informational.
- Test: `task-form.component.spec.ts` — listAgents response with a different `resolvedProjectId` must NOT mutate `form.get('wppOpenProjectId').value`.

### U4 — Make project + agent editable in Edit

- Files:
  - `task-form.component.ts:313-315` — remove `disable()` on `wppOpenProjectId` and `wppOpenAgentId`. `boxFolderId` stays disabled.
  - `task-form.component.ts:425-431` — include `wppOpenProjectId` and `wppOpenAgentId` (and `wppOpenAgentName` from the resolved agent) in the `updateTask` payload.
  - `apps/web/src/app/mini-apps/wpp-open-agent-updater/services/wpp-open-agent-updater.service.ts` — extend `updateTask` request type accordingly.
  - `apps/api/src/mini-apps/wpp-open-agent-updater/dtos/update-task.dto.ts` — add optional `wppOpenProjectId`, `wppOpenAgentId`, `wppOpenAgentName`.
  - `apps/api/src/mini-apps/wpp-open-agent-updater/services/updater-task.service.ts` — apply these fields in `updateTask`.
- Test: integration `wpp-open-agent-updater.controller.e2e-spec.ts` — PUT with new project/agent updates the entity; subsequent triggerRun uses the new values.

### U5 — Workspace-mismatch banner

- File: `task-form.component.ts` — add a signal `projectInaccessible` set when `loadAgents` errors with the typed permission error code (web-side detection by message string until U6 lands).
- Render an inline warning above the `wppOpenProjectId` field: "This task's saved project is not accessible from your current workspace. Re-point or switch workspace."
- After U6 ships, the backend response will include a stable error code instead of relying on string matching.

### U6 — Typed `WppOpenPermissionError` + pre-flight in `triggerRun`

- Files:
  - `apps/api/src/mini-apps/wpp-open-agent-updater/services/wpp-open-agent.service.ts` — new `class WppOpenPermissionError extends Error` with a `code: 'ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT'`. Thrown from the CS API call wrapper when response body contains that code.
  - `run-worker.service.ts:126-146` — catch and rethrow as a typed error with the human message.
  - `updater-task.service.ts` `triggerRun` — call `wppOpenAgentService.listAgents(token, task.wppOpenProjectId, osContext)` BEFORE `sendAgentUpdaterJob`. On `WppOpenPermissionError`, throw `ForbiddenException` with the human message; the UI already surfaces 403s as toasts.
  - `failRun` callsite (`run-worker.service.ts:84-90`) — map `WppOpenPermissionError` to "Saved WPP Open project not accessible from this workspace…" before persisting to the run row.
- Test:
  - Unit: `wpp-open-agent.service.spec.ts` — given a CS response with `ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT`, throws `WppOpenPermissionError` not generic.
  - Unit: `run-worker.service.spec.ts` — `processRun` failing with `WppOpenPermissionError` writes the human message to the run row, not "WPP Open API error: 403".
  - Integration: `triggerRun` with an inaccessible project returns 403 synchronously and does not enqueue a job (assert pg-boss was not called).

## Open Questions

- Should re-pointing a task to a different agent **clear or preserve** the existing run history? Default proposal: preserve, but add a `wppOpenAgentChangedAt` audit column so run history can be visually grouped if needed later. Not blocking for this plan — surface to user before U4 ships.
- Should the workspace-mismatch banner offer a one-click "Open this task in the correct workspace" link? Would require persisting the task's source `application/<uuid>` URL or hierarchy at creation time — out of scope for this round, worth a follow-up plan.

## Validation Plan

1. **U1 alone**: production `RFI Agent Updater` first run after deploy completes; second run within 5 minutes shows `~0 new/modified` in worker logs and run row reports `filesProcessed: 0` (or only newly-modified files).
2. **U2 + U3**: open the existing task from URL `application/2bf5df03-…` (the workspace where the project isn't accessible). Form must continue to display the saved `wppOpenProjectId` (`4zBQ…`), not silently swap to `Upzob…`. Agent dropdown empty + new banner from U5 visible.
3. **U4**: from URL `application/32d43090-…` (the workspace where the project IS accessible), open the task, change agent to a different one in the dropdown, save, click Run Now — worker logs the new agent ID, no errors.
4. **U6**: from URL `application/2bf5df03-…`, click Run Now without re-pointing — UI shows immediate 403 toast with the human message; no entry appears in `task_runs` table.

## Out of Scope (recorded for follow-up)

- Service-account run mode (cron, no user session). Will need separate token strategy.
- Per-file content hashing for delta sync. Timestamp-based filtering is sufficient once U1 lands.
- Multi-project support per task (a task that syncs into multiple agents simultaneously).
