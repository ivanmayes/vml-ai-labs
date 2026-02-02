# Project Structure

The VML Open Boilerplate is organized as a monorepo with clearly separated concerns. Understanding this structure is essential for navigating and contributing to the codebase.

## Root Directory Overview

```
vml-open-boilerplate/
├── apps/
│   ├── api/          # NestJS backend application
│   ├── web/          # Angular frontend application
│   └── docs/         # Documentation (GitBook format)
├── plans/            # Feature planning documents
├── .husky/           # Git hooks configuration
├── package.json      # Root workspace configuration
└── tsconfig.base.json # Shared TypeScript configuration
```

## API Application (`apps/api/`)

The NestJS backend follows a modular architecture where each feature is encapsulated in its own module.

```
apps/api/
├── src/
│   ├── _core/                    # Shared utilities and services
│   │   ├── crypt.ts              # Encryption utilities
│   │   ├── decorators/           # Custom decorators
│   │   ├── fraud-prevention/     # Security utilities
│   │   ├── guards/               # Shared guards
│   │   ├── models/               # Shared interfaces and enums
│   │   ├── third-party/          # External service integrations
│   │   │   ├── ai/               # LLM providers
│   │   │   ├── aws/              # AWS services
│   │   │   └── ...
│   │   └── utils/                # Helper functions
│   │
│   ├── api-key/                  # API key authentication module
│   │   ├── api-key.entity.ts     # Database entity
│   │   ├── api-key.service.ts    # Business logic
│   │   ├── api-key.controller.ts # REST endpoints
│   │   ├── api-key.console.ts    # CLI commands
│   │   └── auth/                 # Bearer strategy
│   │
│   ├── authentication-strategy/  # Multi-auth configuration
│   ├── notification/             # Email and notifications
│   ├── organization/             # Organization management
│   ├── sample/                   # Example module template
│   ├── space/                    # Workspace management
│   ├── space-user/               # Space membership
│   ├── user/                     # User management
│   │   ├── user.entity.ts
│   │   ├── user.service.ts
│   │   ├── user.controller.ts
│   │   ├── user-auth.controller.ts  # Auth endpoints
│   │   ├── auth/                    # JWT strategy
│   │   └── permission/              # Fine-grained permissions
│   │
│   ├── app.module.ts             # Root module
│   ├── common.module.ts          # Shared module
│   ├── database.module.ts        # TypeORM configuration
│   ├── main.ts                   # Application entry point
│   └── console.ts                # CLI entry point
│
├── test/                         # E2E tests
├── .env.example                  # Environment template
└── package.json                  # API dependencies
```

### Module Anatomy

Each feature module follows a consistent pattern:

```
module-name/
├── module-name.entity.ts       # TypeORM entity (database model)
├── module-name.service.ts      # Business logic layer
├── module-name.controller.ts   # REST API endpoints
├── module-name.module.ts       # NestJS module definition
├── module-name.console.ts      # CLI commands (optional)
├── dtos/                       # Request/response DTOs
│   ├── create-*.dto.ts
│   └── update-*.dto.ts
├── guards/                     # Access control guards (optional)
└── models/                     # Additional interfaces (optional)
```

## Web Application (`apps/web/`)

The Angular frontend follows a feature-based organization with shared components and centralized state management.

```
apps/web/
├── src/
│   ├── app/
│   │   ├── _core/                    # Core services and utilities
│   │   │   ├── interceptors/         # HTTP interceptors
│   │   │   ├── services/             # Core services
│   │   │   └── utils/                # Helper functions
│   │   │
│   │   ├── pages/                    # Feature pages
│   │   │   ├── home/                 # Dashboard
│   │   │   ├── login/                # Authentication pages
│   │   │   │   ├── basic/            # Email/code login
│   │   │   │   └── okta/             # OAuth login
│   │   │   ├── organization-admin/   # Org admin pages
│   │   │   │   ├── settings/
│   │   │   │   ├── users/
│   │   │   │   └── spaces/
│   │   │   ├── space-admin/          # Space admin pages
│   │   │   └── space/                # Space content pages
│   │   │
│   │   ├── shared/                   # Shared resources
│   │   │   ├── components/           # Reusable components
│   │   │   │   ├── header/
│   │   │   │   ├── sidebar/
│   │   │   │   └── dialogs/
│   │   │   ├── directives/           # Custom directives
│   │   │   ├── guards/               # Route guards
│   │   │   ├── models/               # TypeScript interfaces
│   │   │   ├── pipes/                # Custom pipes
│   │   │   └── services/             # Shared services
│   │   │
│   │   ├── state/                    # Akita state management
│   │   │   ├── global/               # Global app state
│   │   │   │   ├── global.store.ts
│   │   │   │   ├── global.query.ts
│   │   │   │   └── global.service.ts
│   │   │   └── session/              # User session state
│   │   │       ├── session.store.ts
│   │   │       ├── session.query.ts
│   │   │       └── session.service.ts
│   │   │
│   │   ├── app.component.ts          # Root component
│   │   ├── app.module.ts             # Root module
│   │   └── app-routing.module.ts     # Route definitions
│   │
│   ├── environments/                 # Environment configs
│   ├── theme/                        # Design system
│   │   └── design-system/
│   │       └── _primeng-theme.scss
│   │
│   ├── assets/                       # Static files
│   ├── styles.scss                   # Global styles
│   └── main.ts                       # Application entry
│
├── angular.json                      # Angular CLI config
├── tsconfig.json                     # TypeScript config
└── package.json                      # Web dependencies
```

### Page Module Structure

Each page follows a consistent module pattern:

```
page-name/
├── page-name.page.ts           # Page component
├── page-name.page.html         # Template (if separate)
├── page-name.page.scss         # Styles
├── page-name.page.spec.ts      # Unit tests
├── page-name.module.ts         # Feature module
├── page-name-routing.module.ts # Route definitions (optional)
└── components/                 # Page-specific components
    └── sub-component/
```

## Key Patterns

### Import Aliases

The project uses TypeScript path aliases for cleaner imports:

```typescript
// In API (apps/api)
import { Crypt } from "@api/_core/crypt";
import { User } from "@api/user/user.entity";

// In Web (apps/web)
import { SessionService } from "@app/state/session/session.service";
import { HeaderComponent } from "@shared/components/header/header.component";
```

### Shared Code

Code shared between features lives in specific locations:

| Location                   | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `api/src/_core/`           | API utilities, decorators, third-party integrations |
| `api/src/common.module.ts` | Shared providers across all API modules             |
| `web/src/app/shared/`      | Reusable UI components, pipes, directives           |
| `web/src/app/state/`       | Centralized state management                        |

### Configuration Files

| File                                 | Purpose                    |
| ------------------------------------ | -------------------------- |
| `tsconfig.base.json`                 | Shared TypeScript settings |
| `.eslintrc.js` / `eslint.config.mjs` | Linting rules              |
| `.prettierrc`                        | Code formatting            |
| `.husky/pre-commit`                  | Git hooks                  |

## Where to Add New Features

### New API Module

1. Create a new folder in `apps/api/src/`
2. Follow the module anatomy pattern
3. Import the module in `app.module.ts`

### New Web Page

1. Create a new folder in `apps/web/src/app/pages/`
2. Follow the page module structure
3. Add routes in `app-routing.module.ts` or create a routing module

### New Shared Component

1. Create in `apps/web/src/app/shared/components/`
2. Export from `shared.module.ts`

### New Third-Party Integration

1. Create in `apps/api/src/_core/third-party/`
2. Follow the existing integration patterns (e.g., AWS structure)

## Next Steps

- [Configuration](configuration.md) - Environment variables and settings
- [First Steps](first-steps.md) - Build your first feature
