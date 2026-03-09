# Brainstorm: Multi-App Platform Architecture

**Date:** 2026-03-07
**Status:** Draft
**Participants:** Ivan Mayes, Claude

## What We're Building

A platform architecture that transforms the VML Open Boilerplate into a multi-developer, multi-app umbrella system. Multiple developers can independently build full-stack "mini apps" within the existing monorepo, sharing auth, organization, user, space, and project infrastructure, plus shared services like AI, notifications, and storage — without stepping on each other's code or data.

### Core Capabilities

1. **Interactive CLI** (`create-app`) that scaffolds a complete full-stack mini app: NestJS API module, Angular lazy-loaded routes/pages, per-app PostgreSQL schema, AGENTS.md, and working test suite
2. **Shared entity layer** with Org, User, Space (required) and a new Project entity (optional generic container)
3. **Database isolation** via PostgreSQL schemas — each app gets its own schema, shared entities stay in `public`
4. **AI agent guardrails** via per-app AGENTS.md files and ESLint boundary rules that prevent cross-app imports
5. **Full test harness** with shared test utilities (mock auth, mock org/space context, test DB helpers) and working out-of-the-box tests for scaffolded code
6. **App-scoped entity CLI** (`AddAppEntity`) for creating new entities within a mini app, alongside the existing `AddEntity` for shared entities

## Why This Approach

**Convention-Based Monorepo** was chosen over Nx migration or micro-frontends because:

- **Lowest migration risk** — doesn't restructure existing code, adds alongside it
- **Fastest to implement** — directory conventions + CLI scaffolding, no new build tooling
- **Easiest for developers** — one repo, one build, one deploy, clear folder structure
- **AI-friendly** — simple conventions are easier for agents to follow than complex tooling
- **Single Angular build** keeps deployment simple; lazy loading prevents perf degradation
- **Single NestJS process** shares DB connections, auth guards, and service instances (DRY)

## Key Decisions

### 1. Architecture: Convention-Based Monorepo

Mini apps live in dedicated directories within the existing app structure:

```
apps/
  api/src/
    mini-apps/
      <app-name>/           # Each mini app's API module
        <app-name>.module.ts
        <app-name>.controller.ts
        <app-name>.service.ts
        entities/
        dto/
        AGENTS.md
    _core/                  # Shared services (existing)
    _platform/              # NEW: extracted shared services for apps
  web/src/app/
    mini-apps/
      <app-name>/           # Each mini app's Angular feature
        <app-name>.routes.ts
        pages/
        components/
        services/
        AGENTS.md
```

### 2. Frontend: Lazy-Loaded Routes in Single Angular App

Each mini app is a lazy-loaded route within the existing Angular SPA. The shared shell (header, sidebar, auth) wraps all apps. Apps get routes like `/apps/<app-name>/...`. Mini apps appear as tool cards on a dashboard grid page and within a project-level grid — not in the sidebar. Only truly shared/core features get sidebar entries (added manually).

### 3. Backend: NestJS Modules in Shared API

Each mini app is a NestJS module registered in the existing API. Shares auth guards, database connection, and core services. The module is self-contained with its own controllers, services, and entities.

### 4. Database: PostgreSQL Schemas

- Each mini app gets a dedicated PG schema (e.g., `CREATE SCHEMA todo;`)
- Shared entities (Org, User, Space, Project) remain in the `public` schema
- App entities use `@Entity({ schema: '<app-name>' })` in TypeORM
- TypeORM auto-sync handles schema creation in development
- Migrations for production target specific schemas

### 5. Tenant Scoping: Org + Space Required, Project Optional

- Every mini app entity MUST reference `organizationId` and is org-scoped
- `spaceId` is available for workspace-level scoping
- A new **Project** shared entity will be created as a generic container within a Space
  - Projects have: id, name, description, settings (JSONB), organizationId, spaceId
  - Apps optionally reference `projectId` for grouping their data
  - No prescribed meaning — each app defines what "project" means in its context

### 6. CLI: Interactive `create-app` Command

The CLI scaffolds a full-stack mini app via interactive prompts:

**Prompts:**
- App name (kebab-case, validated for uniqueness)
- Display name (for sidebar/UI)
- Description
- Include sample entity? (yes/no)

**Generated artifacts:**
- API: module, controller, service, sample entity with DTOs, test files
- Web: routes file, page components, service stubs, component test files
- Per-app AGENTS.md with boundary rules and app-specific conventions
- PG schema creation migration

### 7. App-Scoped Entity CLI: `AddAppEntity`

Extends the existing `AddEntity` pattern but scoped to a mini app:
- `npm run console:dev AddAppEntity <app-name> <EntityName>`
- Creates entity in the app's `entities/` directory with correct schema annotation
- Generates DTOs in the app's `dto/` directory
- Creates controller and service additions (or new files)
- Includes org/space scoping by default
- Generates test stubs

### 8. AI Agent Guardrails

**Per-app AGENTS.md** — each mini app gets an AGENTS.md that specifies:
- App boundaries (only modify files in your app's directories)
- Which shared services are available and how to import them
- Entity conventions (schema prefix, org/space scoping)
- Testing requirements

**ESLint boundary rules:**
- No importing from another mini app's directory (cross-app imports blocked)
- Must import shared services from `_platform/` or `_core/`, not from other apps
- Entity classes must use the correct schema annotation

**Root-level guidance:**
- Update existing AGENTS.md with multi-app architecture overview
- Document the `create-app` CLI and `AddAppEntity` commands
- List all shared services and their import paths

### 9. Shared Services Access

**Auto-injected (available to every mini app):**
- Auth context (current user, JWT payload)
- Organization context (current org, org settings)
- Space context (current space, space settings)
- Project context (if app opts in)
- User info and roles

**Available on-demand (import from `_platform/`):**
- AI service (Gemini, OpenAI, Anthropic)
- Notification service (email via SES)
- File storage (S3)
- API key management
- Encryption utilities

### 10. App Registry and Per-Org Enablement

**Manifest file** (`mini-apps.json` at repo root or `apps/` level):
- Lists all registered apps with: key, displayName, description, route, icon, defaultEnabled
- CLI updates this file when scaffolding a new app
- Dashboard and project grids read this manifest to render app cards
- Soft-disable: set `enabled: false` to hide an app without deleting code

**Per-org enablement:**
- Database table: `organization_apps` (organizationId, appKey, enabled, settings JSONB)
- Guard: `HasAppAccessGuard` checks if the current org has the requested app enabled
- Org admin UI: toggle apps on/off for their organization
- Default: apps use `defaultEnabled` from manifest unless org overrides

### 11. Testing Strategy: Full Harness

**Shared test utilities (`_platform/testing/`):**
- `createTestOrg()` — mock organization with configurable settings
- `createTestUser()` — mock user with JWT token
- `createTestSpace()` — mock space within org
- `createTestProject()` — mock project within space
- `setupTestDb()` / `teardownTestDb()` — per-app schema test DB lifecycle
- `mockAuthGuard()` — bypass auth for unit tests
- `createTestModule()` — NestJS testing module with shared deps pre-configured

**Per-app test expectations:**
- API: unit tests for services, integration tests for controller endpoints
- Web: component render tests, service tests
- All tests pass out of the box after scaffolding

**CI integration:**
- Run all tests on every commit (existing pattern)
- App-scoped test commands: `npm run test:app:<app-name>`
- Cross-app regression detection via shared entity tests

## Resolved Questions

1. **App registry** — Use a **manifest file** (`mini-apps.json`). Central JSON file listing all apps with name, display name, description, route, enabled status. CLI updates it on scaffold. Single source of truth for app registration, dashboard grid rendering, and per-org enablement.

2. **App-level permissions** — **Per-org app enablement**. Org admins can enable/disable specific mini apps for their organization. Requires an app-enablement table (org_id, app_key, enabled) and a guard that checks enablement before allowing access.

3. **Navigation** — **Dashboard tool grid + project grid**. Mini apps appear as cards on a dashboard page and within project pages. No auto-sidebar registration. Only truly shared/core features get sidebar entries, added manually by the developer.

4. **Shared UI components** — **No app-specific shared library**. Mini apps use PrimeNG components directly, following existing design token patterns. No premature abstraction — if common patterns emerge across multiple apps, they can be extracted later.

5. **App removal** — **Soft disable only**. CLI can disable an app in the manifest (hides from UI grids, skips route loading) but does not delete code or data. Developer manually removes directories and drops schema if needed.
