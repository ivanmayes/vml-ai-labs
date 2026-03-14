# AGENTS.md - site-scraper (API)

## Scope
You are working in the `site-scraper` mini app backend.

## Directory Boundary
- ONLY modify files under `apps/api/src/mini-apps/site-scraper/`
- NEVER modify files in other mini apps' directories
- NEVER modify shared infrastructure (`_core/`, `_platform/`, `organization/`, `user/`, `space/`, `project/`)

## Import Rules
- Import shared services from `_platform/platform.module` (they are globally available)
- NEVER import from `_core/` directly
- NEVER import from other mini apps (`../other-app/...`)
- Use relative imports within this app (`./entities/...`, `./dtos/...`)

## Entity Rules
- All entities MUST use `@Entity({ schema: 'site_scraper' })`
- All entities MUST have `organizationId` FK to Organization
- Use explicit FK constraint names: `fk_ss_<table>_<column>`

## Controller Rules
- All controllers MUST use `@RequiresApp('site-scraper')` decorator
- All endpoints MUST be behind `@UseGuards(AuthGuard())`
- Route prefix: `apps/site-scraper`

## Available Shared Services (via PlatformModule)
- OrganizationService, UserService, SpaceService, ProjectService
- AiService, NotificationService, S3Service, CryptService
- PgBossService (job queue)
- Decorators: @CurrentOrg(), @CurrentUser(), @CurrentSpace()

## Testing
```bash
npm run test:app:site-scraper
```
