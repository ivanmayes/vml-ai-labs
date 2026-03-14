# AGENTS.md - site-scraper (Web)

## Scope
You are working in the `site-scraper` mini app frontend.

## Directory Boundary
- ONLY modify files under `apps/web/src/app/mini-apps/site-scraper/`
- NEVER modify files in other mini apps' directories
- NEVER modify shared pages (`pages/home/`, `pages/login/`, etc.)

## Import Rules
- Import shared services and guards from `../../shared/`
- Use PrimeNG components directly
- NEVER import from other mini apps (`../other-app/...`)
- Use relative imports within this app (`./components/...`, `./services/...`)

## Component Rules
- Use standalone components with signal-based inputs/outputs
- Prefix selectors with `app-site-scraper-` (e.g., `app-site-scraper-home`)
- Use PrimeNG design tokens (--p-* CSS variables)
- Follow Tailwind CSS 4 conventions

## Route Structure
All routes are under `/apps/site-scraper/`:
- `/apps/site-scraper/` - Main page (job list + create)
- `/apps/site-scraper/:id` - Job detail / page gallery

## Testing
Run component tests with the Angular test runner.
