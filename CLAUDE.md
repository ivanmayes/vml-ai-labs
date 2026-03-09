# CLAUDE.md

## Project Overview
VML AI Labs - Multi-app umbrella platform built on NestJS (API) + Angular (Web).

## Architecture
- **NestJS 11** API with TypeORM + PostgreSQL
- **Angular 21+** with standalone components, signals, PrimeNG v20
- **Mini apps** in `apps/api/src/mini-apps/` and `apps/web/src/app/mini-apps/`
- **Shared services** via `_platform/platform.module.ts` (@Global module)

## Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Backend  | NestJS 11, TypeORM, PostgreSQL                |
| Frontend | Angular 21, PrimeNG 20, Tailwind CSS 4, SCSS  |
| Auth     | JWT + Passport.js                             |
| State    | Akita (web)                                   |
| Testing  | Jest (API), Karma (Web)                       |

## Key Commands
```bash
npm run start:dev          # Start API dev server
npm run web:dev            # Start Angular dev server
npm run console:dev CreateApp   # Scaffold new mini app
npm run console:dev AddEntity EntityName   # Add shared entity
npm run console:dev AddAppEntity <app> <Entity>   # Add entity to mini app
npm test                   # Run all tests
npm run lint               # ESLint + Stylelint
npm run validate           # Lint + TypeScript type check
npm run build              # Production build (API + Web)
npm run api:manifest       # Regenerate OpenAPI manifest
```

### Console Commands (run from `apps/api/`)

| Command | Purpose |
| --- | --- |
| `npm run console:dev CreateApp` | Scaffold a new mini app (API + Web) |
| `npm run console:dev AddAppEntity <app> <Entity>` | Add entity to a mini app |
| `npm run console:dev AddEntity <Entity>` | Add a shared entity |
| `npm run console:dev InstallOrganization` | First-time org + user setup |
| `npm run console:dev GetUserToken <user-id>` | Generate JWT for API testing |

## Conventions
- Use CLI markers (e.g., `// CLI_CONTROLLERS_IMPORT`) for code generation insertion points
- Mini apps are self-contained - never import across app boundaries
- Use `_platform/` services, not `_core/` directly from mini apps
- Entities in mini apps use PostgreSQL schema isolation: `@Entity({ schema: '<app-name>' })`
- Follow existing patterns when adding new code
- ALWAYS use PrimeNG components -- never raw HTML buttons, selects, or date inputs
- ALWAYS use `--p-` prefixed design tokens for colors -- no hardcoded hex/rgb values
- NEVER duplicate API types in the web app -- import from `@api/` path alias
- NEVER use `git commit --no-verify` without explicit user permission

## Important Files
- `apps/api/src/app.module.ts` - Main API module
- `apps/api/src/common.module.ts` - Shared services
- `apps/api/src/database.module.ts` - TypeORM config
- `apps/api/src/mini-apps/mini-apps.module.ts` - Mini app aggregator
- `apps/web/src/app/app.routes.ts` - Angular routes
- `apps/mini-apps.json` - App registry manifest
- `api-manifest.json` - OpenAPI spec (check before creating endpoints)

## File Structure

```
/
├── AGENTS.md                  # Detailed AI agent guidelines (READ THIS)
├── CLAUDE.md                  # This file (quick reference)
├── PRD_DEFAULTS.md            # Architectural defaults for new features
├── apps/
│   ├── api/
│   │   ├── AGENTS.md          # API-specific rules
│   │   └── src/
│   │       ├── mini-apps/     # Isolated mini applications (API)
│   │       └── _platform/     # Shared services & modules
│   └── web/
│       ├── AGENTS.md          # Web-specific rules
│       └── src/app/
│           ├── mini-apps/     # Isolated mini applications (Web)
│           └── _platform/     # Shared web utilities
├── api-manifest.json          # OpenAPI spec (check before creating endpoints)
└── package.json               # Root scripts (npm start, lint, test, etc.)
```

## Reference Documents

- **`AGENTS.md`** -- Full coding standards, PrimeNG rules, accessibility, API coordination
- **`PRD_DEFAULTS.md`** -- Architectural defaults (queues, AI, org scoping, admin pages)
- **`apps/api/AGENTS.md`** -- NestJS entity/DTO/controller/service patterns
- **`apps/web/AGENTS.md`** -- Angular component, styling, and type import rules
