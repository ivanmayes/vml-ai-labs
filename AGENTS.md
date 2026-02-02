# AI Agent Guidelines for VML Open Boilerplate

This document provides critical instructions for AI agents when generating or modifying code in this project. **Following these guidelines is mandatory** to ensure code passes linting and maintains consistency.

## Before You Start: Planning New Features

**When entering plan mode or starting a new feature/PRD, read [`PRD_DEFAULTS.md`](./PRD_DEFAULTS.md) first.**

That document contains architectural defaults for:

- Queue systems (pg_boss vs SQS)
- AI/LLM integration patterns
- Homepage boilerplate detection
- Organization scoping (default for all new services)
- Admin page structure
- Shared DTOs (import from `@api/*`, never duplicate)
- Third-party service patterns

These defaults save time and ensure consistency. Only deviate when the user explicitly requests it.

## Tech Stack

- **Frontend**: Angular 19+ with PrimeNG v20+ component library
- **Styling**: SCSS with PrimeNG design tokens, Tailwind CSS 4
- **Backend**: NestJS API
- **Linting**: ESLint (flat config), Stylelint with custom PrimeNG plugins

## Getting Started

### Starting the Application

**ALWAYS start the application from the root directory.** Both servers support hot reload - code changes are reflected immediately without manual restart.

```bash
# From ROOT directory - starts both API and Web with hot reload
npm start         # Recommended (alias for npm run dev)
npm run dev       # Same as above

# URLs:
# - API: http://localhost:8001
# - Web: http://localhost:4200
# - Swagger: http://localhost:8001/api (when SWAGGER_ENABLE=true)
```

**Do NOT cd into individual app directories to start servers.** The root scripts handle everything and provide consistent logging.

### First-Time Setup

1. **Create databases** (PostgreSQL required):

   ```bash
   createdb your_api_database_name
   ```

2. **Configure environment**:
   - Copy `.env.example` to `.env` in `apps/api/` and `apps/web/`
   - Set `DATABASE_URL` in API `.env`
   - Set `SWAGGER_ENABLE=true` for API documentation

3. **Install initial organization and user**:
   ```bash
   cd apps/api && npm run console:dev InstallOrganization
   ```
   Follow the prompts to create an organization, user, and authentication strategy.

### API Documentation (Swagger)

When `SWAGGER_ENABLE=true` in the API `.env`:

- **Swagger UI**: http://localhost:8001/api
- **OpenAPI JSON**: http://localhost:8001/api-json

### Getting a Bearer Token for API Testing

Use the console command to generate a token for any user:

```bash
# From apps/api directory
npm run console:dev GetUserToken <user-id>
```

This outputs a valid JWT token that you can use immediately.

#### Finding User IDs

```bash
# Connect to your database and query users
psql your_api_database_name -c "SELECT id, email, role FROM users;"
```

Or check the console output when you ran `InstallOrganization` - the user ID is printed there.

#### Using the Token

```bash
# Include in Authorization header for all API requests
curl -X GET http://localhost:8001/user/refresh \
  -H "Authorization: Bearer YOUR-JWT-TOKEN"

# Example: Get current user info
curl -X GET http://localhost:8001/user/refresh \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### Alternative: Via Web UI

1. Start the web app: `npm run dev:web`
2. Navigate to http://localhost:4200
3. Sign in with your email (requires email delivery configured)
4. Open browser DevTools → Network tab
5. Look for the `code-sign-in` response → copy the `token` value

### Validation Commands

```bash
# Run all linters and type checks
npm run validate

# Individual checks
npm run lint        # ESLint + Stylelint
npm run typecheck   # TypeScript compilation check
npm run test        # Run tests
```

## Critical Rules

### 0. NEVER Bypass Pre-Commit Hooks

**Never use `git commit --no-verify` or `-n` flag without explicit user permission.** The pre-commit hooks exist to enforce code quality, detect bugs, and prevent regressions.

```bash
# ❌ FORBIDDEN - Never do this without asking
git commit --no-verify -m "Quick fix"
git commit -n -m "Skip checks"

# ✅ CORRECT - Always let hooks run
git commit -m "Fix: resolve validation error"

# If hooks fail, fix the issues rather than bypassing
```

If pre-commit hooks are failing:

1. **Read the error message** - understand what check failed
2. **Fix the underlying issue** - don't bypass the check
3. **Ask the user** if you're unsure how to resolve the failure
4. **Only bypass with explicit permission** - and document why in the commit message

### 1. ALWAYS Use PrimeNG Components

**Never create custom UI components when PrimeNG provides an equivalent.** This project uses PrimeNG as the primary component library.

```html
<!-- WRONG - Custom button implementation -->
<button class="my-custom-btn" (click)="save()">Save</button>

<!-- CORRECT - Use PrimeNG -->
<p-button label="Save" (onClick)="save()" />
```

Common PrimeNG components to use:

- `p-button` - All buttons
- `p-table` - Data tables
- `p-dialog` - Modals/dialogs
- `p-select` - Dropdowns (NOT `p-dropdown`, that's deprecated)
- `p-datepicker` - Date selection (NOT `p-calendar`, that's deprecated)
- `p-toast` - Notifications
- `p-inputtext` - Text inputs (via `pInputText` directive)
- `p-badge` - Status badges
- `p-toolbar` - Action bars
- `p-menu` - Menus and navigation

### 2. Design Tokens with `--p-` Prefix

**All PrimeNG design tokens use the `--p-` prefix.** Never use unprefixed variables.

```scss
// WRONG - Missing prefix (will trigger lint error)
color: var(--text-color);
background: var(--surface-ground);
border-color: var(--surface-border);

// CORRECT - Always use --p- prefix
color: var(--p-text-color);
background: var(--p-surface-ground);
border-color: var(--p-surface-border);
```

### 3. No Hardcoded Colors

**Never hardcode colors.** Always use design tokens.

```scss
// WRONG - Hardcoded colors (lint errors)
.my-class {
  color: #333333;
  background-color: white;
  border: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

// CORRECT - Design tokens
.my-class {
  color: var(--p-text-color);
  background-color: var(--p-surface-0);
  border: 1px solid var(--p-surface-border);
  box-shadow: var(--p-overlay-shadow); // Or component-specific shadow token
}
```

### 4. Accessibility Requirements

**All interactive elements must be accessible.**

#### Use Semantic Buttons

```html
<!-- WRONG - Clickable div/anchor without href -->
<div class="clickable" (click)="doSomething()">Click me</div>
<a (click)="doSomething()">Click me</a>

<!-- CORRECT - Use button element -->
<button type="button" class="p-link" (click)="doSomething()">Click me</button>

<!-- Or use PrimeNG button -->
<p-button label="Click me" (onClick)="doSomething()" />
```

#### Icon-Only Buttons Need aria-label

```html
<!-- WRONG - No accessible name -->
<button pButton icon="pi pi-trash" (click)="delete()"></button>
<p-button icon="pi pi-pencil" (onClick)="edit()" />

<!-- CORRECT - Provide aria-label -->
<button
  pButton
  icon="pi pi-trash"
  (click)="delete()"
  aria-label="Delete item"
></button>
<p-button icon="pi pi-pencil" (onClick)="edit()" [ariaLabel]="'Edit item'" />
```

#### Images Need Alt Text

```html
<!-- WRONG -->
<img src="logo.svg" />

<!-- CORRECT -->
<img src="logo.svg" alt="Company Logo" />
```

### 5. PrimeNG Component Naming (v20+)

Use current component names, not deprecated ones:

| Deprecated                | Current                       |
| ------------------------- | ----------------------------- |
| `Dropdown` / `p-dropdown` | `Select` / `p-select`         |
| `Calendar` / `p-calendar` | `DatePicker` / `p-datepicker` |
| `InputSwitch`             | `ToggleSwitch`                |
| `Sidebar`                 | `Drawer`                      |
| `OverlayPanel`            | `Popover`                     |
| `TabView`                 | `Tabs`                        |

### 6. Module Imports

Import from specific PrimeNG modules:

```typescript
// WRONG - Generic import
import { Button } from "primeng";

// CORRECT - Specific module imports
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { DialogModule } from "primeng/dialog";
import { SelectModule } from "primeng/select";
```

### 7. Spacing Uses rem Units

Use rem units from the spacing scale, not px:

```scss
// WRONG - px values
padding: 16px;
margin: 8px;
gap: 12px;

// CORRECT - rem values
padding: 1rem;
margin: 0.5rem;
gap: 0.75rem;
```

**Spacing scale**: `0, 0.125rem, 0.25rem, 0.375rem, 0.5rem, 0.625rem, 0.75rem, 0.875rem, 1rem, 1.25rem, 1.5rem, 1.75rem, 2rem, 2.5rem, 3rem, 4rem`

### 8. Avoid ::ng-deep When Possible

```scss
// AVOID - Direct ::ng-deep
::ng-deep .p-dialog {
  max-width: 600px;
}

// BETTER - Use :host wrapper if necessary
:host ::ng-deep .p-dialog {
  max-width: 600px;
}

// BEST - Use PrimeNG's [dt] property or CSS variables
```

### 9. Use PrimeIcons

```html
<!-- CORRECT - PrimeIcons -->
<i class="pi pi-check"></i>
<i class="pi pi-times"></i>
<i class="pi pi-user"></i>
<i class="pi pi-pencil"></i>
<i class="pi pi-trash"></i>

<!-- WRONG - Other icon libraries -->
<i class="fa fa-check"></i>
<mat-icon>check</mat-icon>
```

### 10. Angular Best Practices

#### No Empty Lifecycle Methods

```typescript
// WRONG - Empty lifecycle hooks
export class MyComponent implements OnInit {
  ngOnInit(): void {
    // Empty - remove this
  }
}

// CORRECT - Only implement if needed
export class MyComponent {
  // No OnInit if not used
}
```

#### Use Proper TypeScript Types

```typescript
// WRONG - Generic Function type
function process(callback: Function) {}

// CORRECT - Typed function signature
function process(callback: (item: string) => void) {}
```

#### Directive Selector Prefix

```typescript
// WRONG
@Directive({ selector: '[fillHeight]' })

// CORRECT - Use 'app' prefix
@Directive({ selector: '[appFillHeight]' })
```

## Quick Reference: Design Tokens

### Colors

```scss
// Primary
var(--p-primary-color)
var(--p-primary-contrast-color)
var(--p-primary-50) through var(--p-primary-950)

// Surface (backgrounds)
var(--p-surface-ground)    // Page background
var(--p-surface-section)   // Section background
var(--p-surface-card)      // Card background
var(--p-surface-border)    // Borders
var(--p-surface-0) through var(--p-surface-950)

// Text
var(--p-text-color)           // Primary text
var(--p-text-color-secondary) // Secondary text
var(--p-text-muted-color)     // Muted text

// Status
var(--p-green-500)  // Success
var(--p-red-500)    // Error/Danger
var(--p-orange-500) // Warning
var(--p-blue-500)   // Info
```

### Message Severity Values

```typescript
// Valid values for MessageService and Toast
"success" | "info" | "warn" | "error" | "secondary" | "contrast";

// NOT 'danger', NOT 'primary'
```

## Running Linters

Before committing, ensure code passes linting:

```bash
# From apps/web directory
npx eslint .
npx stylelint "**/*.{css,scss}"

# Should show 0 errors (warnings are acceptable)
```

## API Testing

### Test Token Endpoint

Get bearer tokens for API testing without manual login. **Always use this endpoint when testing authenticated API endpoints.**

#### Setup

Add to `apps/api/.env`:

```bash
ENABLE_TEST_AUTH=true
TEST_USERS=admin@test.local,user@test.local
```

Users must exist in database (create via `npm run console:dev InstallUser`).

#### Usage

```bash
# Get tokens for all configured test users
curl http://localhost:3000/user-auth/dev/test-tokens

# Use token in authenticated requests
TOKEN=$(curl -s http://localhost:3000/user-auth/dev/test-tokens | jq -r '.data.tokens[0].token')
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/endpoint
```

#### Response Format

```json
{
  "status": "success",
  "message": "Generated 2 tokens",
  "data": {
    "tokens": [
      { "email": "admin@test.local", "userId": "uuid", "token": "eyJ..." },
      { "email": "user@test.local", "userId": "uuid", "token": "eyJ..." }
    ]
  }
}
```

#### Troubleshooting

| Issue              | Solution                                                   |
| ------------------ | ---------------------------------------------------------- |
| 404 response       | Set `ENABLE_TEST_AUTH=true` and `LOCALHOST=true` in `.env` |
| No tokens returned | Check `TEST_USERS` is set and users exist in database      |

## Checklist Before Generating Code

- [ ] Using PrimeNG components instead of custom implementations
- [ ] All CSS variables use `--p-` prefix
- [ ] No hardcoded colors (hex, rgb, named colors)
- [ ] Interactive elements have proper accessibility (aria-label, semantic HTML)
- [ ] Imports from specific PrimeNG modules
- [ ] Using current component names (not deprecated)
- [ ] Spacing uses rem units
- [ ] Using PrimeIcons for icons
- [ ] No empty lifecycle methods
- [ ] Proper TypeScript types (no generic `Function`)

## Ultimate Bug Scanner (UBS)

This project uses [Ultimate Bug Scanner (UBS)](https://github.com/Dicklesworthstone/ultimate_bug_scanner) for static analysis. UBS detects 1000+ bug patterns in JavaScript/TypeScript including null pointer issues, security vulnerabilities, missing async/await, and resource lifecycle problems.

### Installation

```bash
npm run setup:ubs
```

This installs UBS via Homebrew on macOS or via the official installer on other platforms.

### Pre-Commit Behavior

UBS runs automatically during `git commit` as part of the Husky pre-commit hook:

1. **lint-staged** runs first (ESLint, Stylelint, Prettier)
2. **UBS** scans staged files with `--profile=loose`
3. **Tests** run if UBS passes

If UBS is not installed, the hook will warn but continue. To bypass UBS temporarily:

```bash
git commit --no-verify
```

### Manual Commands

```bash
# Scan entire codebase
npm run ubs

# Scan staged files only
npm run ubs:staged

# Strict mode (includes TODOs, debug statements)
npm run ubs:strict

# Scan specific apps
npm run ubs:api
npm run ubs:web
```

### Troubleshooting

- **UBS not found**: Run `npm run setup:ubs` to install
- **False positives**: Use `--profile=loose` (default) to skip minor issues
- **Bypass for single commit**: Use `git commit --no-verify`

## API/Web Coordination Rules

### CRITICAL: Never Duplicate Types

When working on the frontend, **NEVER** create new interfaces/types that duplicate API DTOs.

```typescript
// ❌ WRONG - Duplicated DTO in web
// apps/web/src/app/shared/models/space.model.ts
export interface CreateSpaceDto {
  name: string;
  isPublic?: boolean;
}

// ✅ CORRECT - Import from API
import type { SpaceCreateDto } from "@api/space/dtos";
import type { Space } from "@api/space/space.entity";
import { SpaceRole } from "@api/space-user/space-role.enum";
```

### Before Creating Any API Endpoint

1. **Check `api-manifest.json`** (OpenAPI spec) - look in `paths` for existing routes
2. **Search controllers**: `grep -r "@Get\|@Post\|@Put\|@Delete" apps/api/src`
3. **Check Swagger UI** at http://localhost:8001/api (if running with `SWAGGER_ENABLE=true`)

### Before Consuming Any API Endpoint

1. **Verify the endpoint exists** in `api-manifest.json` under `paths`
2. **Check `components.schemas`** for the DTO/response type name
3. **Import the type** from `apps/api/src/[module]/dtos/` using the `@api/` alias
4. **Never use `Observable<any>`** - always type responses

### Endpoint Discovery Workflow

```bash
# 1. Regenerate the API manifest (if needed)
npm run api:manifest

# 2. Search for existing endpoints
grep -r "your-endpoint-path" api-manifest.json

# 3. Find the DTO/schema name
jq '.paths["/your-path"].post.requestBody.content["application/json"].schema' api-manifest.json

# 4. Import the type in your web service
import type { YourDto } from '@api/module/dtos';
```

### Type Import Reference

| Web Need              | Import From                      |
| --------------------- | -------------------------------- |
| DTOs (Create, Update) | `@api/[module]/dtos`             |
| Entities              | `@api/[module]/[module].entity`  |
| Enums                 | `@api/[module]/[enum-name].enum` |

## Additional Resources

- See `tools/lint-plugins/PRIMENG_GUIDELINES.md` for detailed styling guidelines
- PrimeNG Documentation: https://primeng.org/
- PrimeIcons: https://primeng.org/icons
