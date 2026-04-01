# AGENTS.md - wpp-open-agent-updater (Web)

## Scope
You are working in the `wpp-open-agent-updater` mini app frontend.

## Directory Boundary
- ONLY modify files under `apps/web/src/app/mini-apps/wpp-open-agent-updater/`
- NEVER modify files in other mini apps' directories
- NEVER modify shared pages (`pages/home/`, `pages/login/`, etc.)

## Import Rules
- Import shared services and guards from `../../shared/`
- Use PrimeNG components directly
- NEVER import from other mini apps (`../other-app/...`)
- Use relative imports within this app (`./components/...`, `./services/...`)

## Component Rules
- Use standalone components with signal-based inputs/outputs
- Prefix selectors with `app-wpp-open-agent-updater-` (e.g., `app-wpp-open-agent-updater-list`)
- Use PrimeNG design tokens (--p-* CSS variables)
- Follow Tailwind CSS 4 conventions

## Route Structure
All routes are under `/apps/wpp-open-agent-updater/`:
- `/apps/wpp-open-agent-updater/` - Main page (task list)
- `/apps/wpp-open-agent-updater/:id` - Task detail / run history

## Testing
Run component tests with the Angular test runner.

### Browser Testing (WPP Open)
This app MUST be tested inside the WPP Open iframe — it requires WPP Open credentials (access token, project context) that are only available when loaded within the platform.

- **Test URL:** `https://vml.os.wpp.com/application/f9904428-8360-4406-9dbe-9bdb5f4434a1/vml-boilerplate-tester_0a1c024e-9c21-165c-819c-e22388120157`
- **Do NOT test at `localhost:4255` directly** — the app will lack WPP Open auth context and API calls will fail.
- **Chrome automation:** The app loads inside a cross-origin iframe, so `read_page` cannot see its contents. Use positional clicks (`computer` tool with coordinate-based clicks) to interact with the app inside the iframe.
