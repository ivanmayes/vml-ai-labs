# AGENTS.md - wpp-open-agent-updater (API)

## Scope
You are working in the `wpp-open-agent-updater` mini app backend.

## Directory Boundary
- ONLY modify files under `apps/api/src/mini-apps/wpp-open-agent-updater/`
- NEVER modify files in other mini apps' directories
- NEVER modify shared infrastructure (`_core/`, `_platform/`, `organization/`, `user/`, `space/`, `project/`)

## Import Rules
- Import shared services from `_platform/platform.module` (they are globally available)
- NEVER import from `_core/` directly
- NEVER import from other mini apps (`../other-app/...`)
- Use relative imports within this app (`./entities/...`, `./dto/...`)

## Entity Rules
- All entities MUST use `@Entity({ schema: 'wpp_open_agent_updater' })`
- All entities MUST have `organizationId` FK to Organization
- Use explicit FK constraint names: `FK_wpp_open_agent_updater_<table>_<column>`

## Controller Rules
- All controllers MUST use `@RequiresApp('wpp-open-agent-updater')` decorator
- All endpoints MUST be behind `@UseGuards(AuthGuard())`
- Route prefix: `apps/wpp-open-agent-updater`

## Available Shared Services (via PlatformModule)
- OrganizationService, UserService, SpaceService, ProjectService
- AiService, NotificationService, S3Service, CryptService
- ConverterFactory (document conversion)
- Decorators: @CurrentOrg(), @CurrentUser(), @CurrentSpace()

## Testing
```bash
npm run test:app:wpp-open-agent-updater
```

## Adding Entities
```bash
npm run console:dev AddAppEntity wpp-open-agent-updater <EntityName>
```
