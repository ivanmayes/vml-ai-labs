# Research: Multi-App Platform Architecture in NestJS + Angular Monorepos

**Date:** 2026-03-07
**Scope:** Best practices research for the plan at `docs/plans/2026-03-07-feat-multi-app-platform-architecture-plan.md`
**Sources:** NestJS official docs, TypeORM docs, Angular v20 docs, community articles, open-source implementations

---

## Table of Contents

1. [NestJS Multi-Module Architecture and Dynamic Module Patterns](#1-nestjs-multi-module-architecture)
2. [TypeORM Multi-Schema PostgreSQL Best Practices](#2-typeorm-multi-schema-postgresql)
3. [Angular Standalone Lazy Loading Patterns](#3-angular-standalone-lazy-loading)
4. [CLI Code Generation Best Practices](#4-cli-code-generation)
5. [PostgreSQL Schema Isolation Patterns](#5-postgresql-schema-isolation)
6. [Monorepo Module Boundary Enforcement](#6-monorepo-module-boundary-enforcement)
7. [Cross-Cutting Recommendations for the Plan](#7-cross-cutting-recommendations)

---

## 1. NestJS Multi-Module Architecture

### 1.1 Module Aggregation Pattern (MiniAppsModule)

**Verdict: The plan's `MiniAppsModule` aggregator approach is well-aligned with NestJS best practices.**

The official NestJS documentation establishes that modules are the fundamental organizational unit, and an aggregator module that re-imports feature modules is a standard pattern. The plan's approach of having `AppModule -> MiniAppsModule -> [TodoModule, InvoicesModule, ...]` follows the same structure that NestJS uses internally with its own feature modules.

**Recommended implementation:**

```typescript
// apps/api/src/mini-apps/mini-apps.module.ts
import { Module } from '@nestjs/common';

// MINIAPP_MODULES_IMPORT
import { TodoModule } from './todo/todo.module';

@Module({
  imports: [
    // MINIAPP_MODULES_REF
    TodoModule,
  ],
})
export class MiniAppsModule {}
```

```typescript
// apps/api/src/app.module.ts (updated imports section)
imports: [
  HttpModule,
  ThrottlerModule.forRoot([...]),
  CommonModule,
  ConsoleModule,
  MiniAppsModule, // <-- Add this single import
],
```

**Key principle from NestJS docs:** "Avoid defining a provider in one module that actually belongs to another -- it creates unnecessary coupling and breaks encapsulation. Instead, import the module that exports the provider you need." This validates the plan's decision to have each mini-app as a self-contained module with its own controllers AND services, rather than splitting them across AppModule and CommonModule like the existing CLI does.

### 1.2 Dynamic Module Patterns: forRoot / forFeature

NestJS provides two key patterns for configurable modules:

- **`forRoot()`** -- Used once at the application root to set up global configuration (e.g., `TypeOrmModule.forRoot()`)
- **`forFeature()`** -- Used in feature modules to register module-specific resources (e.g., `TypeOrmModule.forFeature([TodoItem])`)

**Recommendation for mini-app modules:** Each mini-app module should use `TypeOrmModule.forFeature()` to register its own entities. This is the correct NestJS pattern and keeps entity registration local to each app:

```typescript
// apps/api/src/mini-apps/todo/todo.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformModule } from '../../_platform/platform.module';
import { TodoItem } from './entities/todo-item.entity';
import { TodoController } from './todo.controller';
import { TodoService } from './todo.service';

@Module({
  imports: [
    PlatformModule,
    TypeOrmModule.forFeature([TodoItem]),
  ],
  controllers: [TodoController],
  providers: [TodoService],
})
export class TodoModule {}
```

**Why NOT use ConfigurableModuleBuilder here:** The `ConfigurableModuleBuilder` (introduced in NestJS v9) is designed for modules that need runtime configuration options (e.g., API keys, connection strings). Mini-app modules do not need dynamic configuration -- they are statically defined feature modules. Using `ConfigurableModuleBuilder` would add unnecessary complexity.

### 1.3 PlatformModule as a Shared Module

The NestJS modular monolith pattern recommends a "shared module" that bundles commonly used providers and exports them. The plan's `PlatformModule` follows this pattern exactly.

**Recommended implementation:**

```typescript
// apps/api/src/_platform/platform.module.ts
import { Module } from '@nestjs/common';

import { OrganizationService } from '../organization/organization.service';
import { UserService } from '../user/user.service';
import { SpaceService } from '../space/space.service';
import { NotificationService } from '../notification/notification.service';
// ... other shared services

@Module({
  imports: [
    // Import the modules that own these services
    // so they are properly resolved
  ],
  providers: [
    // Only include services that mini-apps should consume
  ],
  exports: [
    OrganizationService,
    UserService,
    SpaceService,
    NotificationService,
    // ... curated list of shared services
  ],
})
export class PlatformModule {}
```

**Important caveat:** Because the existing `CommonModule` already provides and exports all core services, `PlatformModule` should either:
1. Import `CommonModule` and re-export a curated subset, OR
2. Import the individual service modules directly

Option 1 is simpler for now. Option 2 becomes preferable if you later decompose `CommonModule` into smaller modules.

### 1.4 Module Communication Pattern

NestJS community best practices for modular monoliths recommend treating each module as an independent mini-application. Two communication patterns:

1. **Direct import (synchronous)** -- Import the module that exports the service you need. This is fine for read operations and simple queries.
2. **Event-based (asynchronous)** -- Use `@nestjs/event-emitter` for cross-module notifications where you want loose coupling.

**Recommendation for mini-apps:** Direct import via `PlatformModule` is the right default. Mini-apps consume shared services (read org data, send notifications) -- they don't need event-based decoupling. Reserve events for future cases where mini-apps need to react to each other's actions.

---

## 2. TypeORM Multi-Schema PostgreSQL

### 2.1 Entity Schema Annotation

**Verdict: The plan's approach of using `@Entity({ schema: '<app-name>' })` is directly supported by TypeORM and is the correct pattern.**

From TypeORM official documentation:

```typescript
// Entities can specify their schema in the @Entity decorator
@Entity({ schema: 'secondSchema' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;
}
```

The `schema` option is supported for PostgreSQL and MSSQL. When specified, TypeORM generates DDL with schema-qualified table names (e.g., `todo.todo_items` instead of `public.todo_items`).

### 2.2 Cross-Schema Foreign Keys

**This is a critical area. TypeORM supports cross-schema relations but with important caveats.**

TypeORM documentation confirms that you can query across schemas within a single DataSource. For cross-schema foreign keys to work correctly:

1. **Shared entities MUST specify `schema: 'public'`** -- This is what the plan proposes, and it is the correct approach. Without this, TypeORM may try to create the shared tables in the mini-app's schema.

2. **Use `@ManyToOne` / `@JoinColumn` as normal** -- TypeORM will generate the correct cross-schema FK:

```typescript
// Shared entity (in public schema)
@Entity({ name: 'organizations', schema: 'public' })
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;
}

// Mini-app entity (in app-specific schema)
@Entity({ name: 'todo_items', schema: 'todo' })
export class TodoItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  title: string;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
```

3. **Non-breaking change for existing entities** -- Adding `schema: 'public'` to entities that are already in the public schema produces identical DDL. This is safe to apply immediately.

### 2.3 Schema Creation Bootstrap (Critical)

**TypeORM's `synchronize: true` does NOT create PostgreSQL schemas -- it only creates tables within existing schemas.** This is a well-documented limitation.

The plan correctly identifies the need for a bootstrap hook. Here is the recommended implementation based on community best practices:

```typescript
// apps/api/src/_platform/database/schema-bootstrap.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SchemaBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SchemaBootstrapService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const manifestPath = path.resolve(__dirname, '../../../../mini-apps.json');

    if (!fs.existsSync(manifestPath)) {
      this.logger.warn('mini-apps.json not found, skipping schema bootstrap');
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    for (const app of manifest.apps) {
      const schemaName = app.key.replace(/-/g, '_'); // PG schemas use underscores
      try {
        // Parameterized queries cannot be used for schema names (DDL),
        // so validate the name strictly before using it
        if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
          this.logger.error(`Invalid schema name: ${schemaName}`);
          continue;
        }
        await this.dataSource.query(
          `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
        );
        this.logger.log(`Schema "${schemaName}" ensured`);
      } catch (error) {
        this.logger.error(
          `Failed to create schema "${schemaName}": ${error.message}`,
        );
        throw error; // Fail fast -- app cannot run without schemas
      }
    }
  }
}
```

**Module import ordering is critical.** The `SchemaBootstrapService` must run BEFORE TypeORM synchronizes tables. In NestJS, `OnModuleInit` hooks run in the order modules are imported. Therefore:

```typescript
// DatabaseModule should import SchemaBootstrapService
// AND DatabaseModule must be imported BEFORE any module that uses TypeOrmModule.forFeature()
```

**Recommended ordering in `CommonModule` imports:**

```typescript
imports: [
  DatabaseModule,     // 1. Connects to DB + runs schema bootstrap
  // ... other modules that use TypeOrmModule.forFeature()
]
```

### 2.4 Schema Naming Convention

**Recommendation: Use underscores instead of hyphens for schema names.**

PostgreSQL schema names with hyphens require quoting everywhere (`"my-app".table_name`). Convert kebab-case app keys to snake_case for schema names:

| App Key | Schema Name |
|---------|-------------|
| `todo` | `todo` |
| `invoice-tracker` | `invoice_tracker` |
| `ai-assistant` | `ai_assistant` |

### 2.5 Migration Strategy for Multi-Schema

For production environments where `synchronize: false`, migrations need special handling:

**Option A: Single migration directory (recommended for < 10 apps)**
- All migrations in one directory
- Each migration specifies schema-qualified table names
- Use TypeORM's `migration:generate` which respects the `schema` option on entities

**Option B: Per-app migration directories (recommended for 10+ apps)**
- Separate DataSource configuration per app for migration generation
- Each app has its own migrations directory: `migrations/<app-name>/`
- Requires multiple migration runs at startup

```typescript
// For Option A, TypeORM migration generation handles schemas automatically:
// Running: npx typeorm migration:generate -d data-source.ts src/migrations/AddTodoItems
// Generates:
export class AddTodoItems1234567890 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "todo"."todo_items" (...)`,
    );
  }
}
```

### 2.6 Connection Pool Management

**Important: Do NOT create separate DataSource instances per mini-app schema.**

Unlike per-tenant multi-tenancy (where each tenant gets its own connection), the plan's use case (per-app schema isolation within a single tenant context) should use a single DataSource with a single connection pool. All mini-app entities are in the same database, just different schemas. TypeORM handles this correctly with the `schema` option on `@Entity`.

This is a key architectural distinction from per-tenant multitenancy articles -- those create separate DataSources per tenant, which is unnecessary and harmful for per-app schema isolation.

---

## 3. Angular Standalone Lazy Loading

### 3.1 Current State and Migration Path

The codebase is already bootstrapped with standalone `bootstrapApplication()` in `main.ts` (commit `9e87eab`), using `provideRouter(routes)`. However, the routes in `app.routes.ts` still use the `loadChildren` + NgModule pattern:

```typescript
// Current pattern (legacy)
{
  path: 'home',
  loadChildren: () =>
    import('./pages/home/home.module').then((m) => m.HomePageModule),
},
```

For mini-apps, the plan should use the modern standalone pattern.

### 3.2 Recommended Pattern for Mini-App Routes

**Angular v20+ best practice: Use `loadChildren` with route arrays (not NgModules) for feature areas with multiple routes, and `loadComponent` for single-route features.**

```typescript
// apps/web/src/app/app.routes.ts
export const routes: Routes = [
  // ... existing routes ...

  // Mini-apps namespace
  {
    path: 'apps',
    children: [
      // MINIAPP_ROUTES
      {
        path: 'todo',
        loadChildren: () =>
          import('./mini-apps/todo/todo.routes').then((m) => m.routes),
      },
    ],
  },

  // Wildcards (must remain last)
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home', pathMatch: 'full' },
];
```

```typescript
// apps/web/src/app/mini-apps/todo/todo.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/todo-list/todo-list.component'),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/todo-detail/todo-detail.component'),
  },
];
```

**Key practices from Angular official docs:**
- Components with `default` exports can use the shorter import syntax without `.then()`
- `loadChildren` returns a route array (not an NgModule) in the standalone world
- The Router executes load functions within the injection context, enabling `inject()` calls in the loader

### 3.3 Route Guard for App Access

Angular supports `canActivate`, `canMatch`, and the functional guard pattern. For mini-app access control:

```typescript
// apps/web/src/app/shared/guards/app-access.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { OrganizationAppService } from '../services/organization-app.service';

export function appAccessGuard(appKey: string): CanActivateFn {
  return () => {
    const appService = inject(OrganizationAppService);
    const router = inject(Router);

    // Check if app is enabled for current org
    if (appService.isAppEnabled(appKey)) {
      return true;
    }

    return router.createUrlTree(['/home']);
  };
}
```

```typescript
// Usage in routes
{
  path: 'todo',
  canActivate: [appAccessGuard('todo')],
  loadChildren: () =>
    import('./mini-apps/todo/todo.routes').then((m) => m.routes),
},
```

**Important nuance from Angular docs:** Use `canMatch` instead of `canActivate` if you want to prevent the lazy chunk from even being downloaded when the app is disabled. `canActivate` downloads the chunk first, then blocks navigation. `canMatch` prevents downloading entirely:

```typescript
{
  path: 'todo',
  canMatch: [appAccessGuard('todo')],
  loadChildren: () =>
    import('./mini-apps/todo/todo.routes').then((m) => m.routes),
},
```

### 3.4 Standalone Component Conventions for Mini-Apps

From Angular v20 best practices:
- Do NOT set `standalone: true` in decorators (it is the default in Angular 19+)
- Use signals for state management
- Use `NgOptimizedImage` for static images
- Use host bindings in the `@Component` decorator's `host` object, not `@HostBinding`

```typescript
// apps/web/src/app/mini-apps/todo/pages/todo-list/todo-list.component.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';

import { TodoService } from '../../services/todo.service';

@Component({
  selector: 'app-todo-list',
  imports: [CommonModule, TableModule, ButtonModule],
  templateUrl: './todo-list.component.html',
})
export default class TodoListComponent {
  private readonly todoService = inject(TodoService);

  readonly todos = signal<TodoItem[]>([]);
  readonly loading = signal(true);
}
```

Note the `export default class` -- this enables the shorter dynamic import syntax without `.then()`.

### 3.5 Wildcard Route Placement

**Critical detail for the plan:** The wildcard routes `{ path: '', redirectTo: 'home' }` and `{ path: '**', redirectTo: 'home' }` MUST remain as the last entries in the routes array. The CLI marker for mini-app routes must be placed BEFORE the wildcards:

```typescript
export const routes: Routes = [
  // ... existing routes ...
  {
    path: 'apps',
    children: [
      // MINIAPP_ROUTES
    ],
  },
  // Wildcards MUST be last
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home', pathMatch: 'full' },
];
```

---

## 4. CLI Code Generation Best Practices

### 4.1 Evaluation of Approaches

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **Custom NestJS console command** (current pattern) | Familiar pattern, no dependencies, runs within app context | No templating engine, string replacement only | **Recommended** (with improvements) |
| **Nx Generators** | Powerful, tree-based AST manipulation, dry-run support | Requires Nx migration, heavy dependency | Not recommended until 10+ apps |
| **@nestjs/schematics** | Official NestJS support, Angular-style schematics | Limited customization, opinionated structure | Not a good fit for mini-app pattern |
| **simple-scaffold (npm)** | Handlebars templating, directory structure preservation | External dependency, no app-context awareness | Consider as enhancement |

### 4.2 Recommended: Enhanced Console Command Pattern

The existing `AddEntity` command in `cli.console.ts` demonstrates the pattern. For `CreateApp`, enhance it with:

**A. Template variable system with Handlebars-style tokens:**

```typescript
// Template replacement map
const replacements = {
  APP_NAME_UPPER: 'Todo',           // PascalCase
  APP_NAME_LOWER: 'todo',           // camelCase
  APP_NAME_SLUG: 'todo',            // kebab-case
  APP_NAME_SCHEMA: 'todo',          // snake_case (for PG schema)
  APP_DISPLAY_NAME: 'Todo Manager', // Human-readable
  APP_DESCRIPTION: 'Manage tasks',  // Description
  APP_ICON: 'pi pi-check-square',   // PrimeIcons class
};
```

**B. Marker-based insertion (proven pattern in codebase):**

The existing codebase uses `// CLI_CONTROLLERS_IMPORT`, `// CLI_CONTROLLERS_REF`, etc. The plan extends this with `// MINIAPP_MODULES_IMPORT`, `// MINIAPP_MODULES_REF`, `// MINIAPP_ROUTES`. This is a proven, reliable approach.

**C. Validation before file creation:**

```typescript
async validateAppName(name: string): Promise<string[]> {
  const errors: string[] = [];

  // Check format
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    errors.push('App name must be kebab-case, starting with a letter');
  }

  // Check length
  if (name.length > 30) {
    errors.push('App name must be 30 characters or fewer');
  }

  // Check reserved names
  const reserved = [
    'public', 'pg_catalog', 'information_schema',
    'home', 'login', 'admin', 'organization', 'space',
    'user', 'sso', 'api', 'app', 'apps', 'core',
    'platform', 'shared', 'common', 'database',
    'console', 'notification', 'sample', 'ai',
  ];
  if (reserved.includes(name)) {
    errors.push(`"${name}" is a reserved name`);
  }

  // Check filesystem
  if (fs.existsSync(path.resolve(miniAppsDir, name))) {
    errors.push(`Directory already exists for "${name}"`);
  }

  // Check manifest
  const manifest = readManifest();
  if (manifest.apps.some(a => a.key === name)) {
    errors.push(`"${name}" already registered in mini-apps.json`);
  }

  return errors;
}
```

**D. Rollback on failure:**

```typescript
const createdPaths: string[] = [];
const modifiedFiles: Map<string, string> = new Map(); // path -> original content

try {
  // Before modifying any file, save its original content
  modifiedFiles.set(modulePath, fs.readFileSync(modulePath, 'utf8'));
  modifiedFiles.set(routesPath, fs.readFileSync(routesPath, 'utf8'));

  // Create directories and files...
  createdPaths.push(apiDir);
  fs.mkdirSync(apiDir, { recursive: true });
  // ... write files ...

  // Modify existing files (markers)...
} catch (error) {
  console.log(Utils.formatMessage('Rolling back...', ErrorLevel.Warn));

  // Restore modified files
  for (const [filePath, original] of modifiedFiles) {
    fs.writeFileSync(filePath, original, 'utf8');
  }

  // Delete created directories
  for (const dir of createdPaths.reverse()) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  throw error;
}
```

### 4.3 Slug Generation Fix

The plan correctly identifies the bug at `cli.console.ts:34-37`. The current regex `/(^.*)([A-Z])/` only captures the LAST uppercase letter. For multi-word PascalCase names:

```typescript
// Current (broken):
'TodoItem'.replace(/(^.*)([A-Z])/, '$1-$2').toLowerCase()
// Result: "todoite-m" (wrong!)

// Fixed:
function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// 'TodoItem' -> 'todo-item'
// 'APIKey'   -> 'api-key'
// 'HTMLParser' -> 'html-parser'
```

For pluralization, use a proper inflection library or a lookup table for irregular forms:

```typescript
function pluralize(word: string): string {
  const irregulars: Record<string, string> = {
    entry: 'entries',
    category: 'categories',
    status: 'statuses',
    index: 'indices',
  };

  const lower = word.toLowerCase();
  if (irregulars[lower]) return irregulars[lower];
  if (lower.endsWith('y') && !/[aeiou]y$/i.test(lower)) {
    return lower.slice(0, -1) + 'ies';
  }
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('z') ||
      lower.endsWith('ch') || lower.endsWith('sh')) {
    return lower + 'es';
  }
  return lower + 's';
}
```

---

## 5. PostgreSQL Schema Isolation Patterns

### 5.1 Schema-Per-App vs. Schema-Per-Tenant

**Important distinction:** The plan uses schemas for per-app isolation (not per-tenant). This is a fundamentally different use case from the multi-tenant articles commonly found online.

| Aspect | Per-Tenant Schema | Per-App Schema (this plan) |
|--------|-------------------|---------------------------|
| Number of schemas | Potentially thousands | Typically < 20 |
| Schema creation | Dynamic (on tenant signup) | Static (on app scaffold) |
| Connection management | Separate DataSource per tenant | Single shared DataSource |
| Migration complexity | Apply to all tenant schemas | Apply once per app schema |
| Scalability concern | Yes (PG degrades at ~10k schemas) | No (~20 schemas is trivial) |
| search_path switching | Needed per request | Not needed |

**Conclusion:** The per-app schema approach is dramatically simpler than per-tenant. Most of the complexity warnings in multi-tenant articles (connection pooling, search_path switching, per-tenant DataSources) do NOT apply here.

### 5.2 Cross-Schema Foreign Keys in PostgreSQL

PostgreSQL natively supports cross-schema foreign keys. No special configuration needed:

```sql
-- This works out of the box
CREATE TABLE todo.todo_items (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL
);
```

**Key requirements:**
1. The referenced table (`public.organizations`) must exist before the referencing table is created
2. The user connecting to the database must have `USAGE` privilege on both schemas
3. TypeORM handles this correctly when entities have the right `schema` annotation

### 5.3 Security: Schema-Level Permissions (Future Enhancement)

For production hardening (listed as "future consideration" in the plan), PostgreSQL supports fine-grained schema permissions:

```sql
-- Create a role for mini-app database access
CREATE ROLE miniapp_role;

-- Grant usage on all app schemas
GRANT USAGE ON SCHEMA todo TO miniapp_role;
GRANT USAGE ON SCHEMA invoice_tracker TO miniapp_role;

-- Grant table-level permissions within each schema
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA todo TO miniapp_role;

-- Prevent cross-app table access (defense in depth)
-- Each app role can only access its own schema + public
```

This is a "nice to have" for now. The ESLint rules + AGENTS.md guardrails provide sufficient boundary enforcement during development.

### 5.4 search_path Considerations

**Recommendation: Do NOT modify `search_path` for per-app schema isolation.**

Many multi-tenant articles suggest setting `search_path` per request (e.g., `SET search_path TO tenant_1, public`). This is needed for per-tenant isolation where the same table structure is replicated across schemas. For per-app isolation, each entity has a unique table name and an explicit schema annotation. The default `search_path = "$user", public` is sufficient.

### 5.5 Schema Bootstrap Timing

The order of operations during application startup:

```
1. NestJS creates the IoC container
2. DatabaseModule initializes -> TypeOrmModule.forRoot() creates the DataSource
3. SchemaBootstrapService.onModuleInit() runs
   -> Reads mini-apps.json
   -> Executes CREATE SCHEMA IF NOT EXISTS for each app
4. TypeORM synchronize runs (if enabled)
   -> Creates/updates tables in the correct schemas
5. MiniAppsModule initializes -> each mini-app module's TypeOrmModule.forFeature() registers repositories
```

**Critical: The SchemaBootstrapService MUST be a provider in `DatabaseModule` (or a module imported before MiniAppsModule) to ensure schemas exist before table creation.**

**Alternative approach using TypeORM subscriber:**

```typescript
import { DataSource } from 'typeorm';

// In DatabaseModule's TypeOrmModule.forRoot() config:
TypeOrmModule.forRoot({
  // ... existing config ...
  migrationsRun: false,
  synchronize: false,
}),

// Then manually bootstrap schemas and sync:
// In a dedicated bootstrap service:
async onModuleInit() {
  await this.createSchemas();
  if (process.env.DATABASE_SYNCHRONIZE === 'true') {
    await this.dataSource.synchronize();
  }
}
```

This gives you explicit control over the synchronize timing. However, this approach requires setting `synchronize: false` in the TypeORM config and calling it manually, which diverges from the current codebase pattern. The simpler approach (SchemaBootstrapService with `OnModuleInit` running before sync) is preferred if module import ordering can be guaranteed.

---

## 6. Monorepo Module Boundary Enforcement

### 6.1 Three-Layer Defense Strategy

The plan proposes three layers of enforcement. Research validates all three and provides specific implementation guidance:

#### Layer 1: ESLint `no-restricted-imports` (Immediate, Zero Dependencies)

This is the simplest and most effective approach for the current codebase. The existing ESLint config already uses `eslint-plugin-import`, so no new dependencies are needed.

```javascript
// apps/api/eslint.config.mjs - Add this config block
{
  files: ['**/mini-apps/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/mini-apps/*/'],
          message: 'Cross-app imports are forbidden. Use _platform/ for shared services.',
        },
        {
          group: ['**/_core/*'],
          message: 'Mini-apps must not import from _core/ directly. Use _platform/ instead.',
        },
      ],
    }],
  },
},
```

**Important: The `no-restricted-imports` rule only checks static imports, not dynamic `import()` calls.** This is acceptable because mini-app backend code should not use dynamic imports.

**Refinement with negation patterns:** If a mini-app needs to import from its own directory (which is under `mini-apps/`), use negation:

```javascript
// Per-app override to allow self-imports
// This would need to be generated per app, OR use a more sophisticated approach
{
  files: ['**/mini-apps/todo/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          // Restrict imports from OTHER mini-apps (not from todo itself)
          regex: 'mini-apps/(?!todo/)\\w',
          message: 'Cannot import from other mini-apps.',
        },
      ],
    }],
  },
},
```

**Practical recommendation:** Since the `group` pattern matching uses gitignore-style globs, and we need to allow imports within the same app but block cross-app imports, the cleanest approach is:

```javascript
{
  files: ['**/mini-apps/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          // Block direct _core/ imports
          group: ['**/_core/**'],
          message: 'Use _platform/ for shared services, not _core/ directly.',
        },
      ],
    }],
    // For cross-app restrictions, use import/no-restricted-paths
    'import/no-restricted-paths': ['error', {
      zones: [
        {
          target: './src/mini-apps/todo',
          from: './src/mini-apps/!(todo)',
          message: 'Cannot import from other mini-apps.',
        },
        // CLI generates one zone per app
      ],
    }],
  },
},
```

The `import/no-restricted-paths` rule from `eslint-plugin-import` (already installed in the project) is specifically designed for this pattern and supports negation in path matching.

#### Layer 2: eslint-plugin-boundaries (Enhanced, Optional)

For more sophisticated boundary enforcement, `eslint-plugin-boundaries` provides a declarative configuration:

```javascript
// npm install eslint-plugin-boundaries --save-dev

import boundaries from 'eslint-plugin-boundaries';

// In eslint.config.mjs:
{
  plugins: { boundaries },
  settings: {
    'boundaries/elements': [
      { type: 'core', pattern: 'src/_core/*' },
      { type: 'platform', pattern: 'src/_platform/*' },
      { type: 'shared', pattern: 'src/(organization|user|space|notification)/*' },
      { type: 'mini-app', pattern: 'src/mini-apps/*', capture: ['app'] },
    ],
  },
  rules: {
    'boundaries/element-types': [2, {
      default: 'disallow',
      rules: [
        // Mini-apps can import from platform and shared
        { from: 'mini-app', allow: ['platform', 'shared'] },
        // Platform can import from core and shared
        { from: 'platform', allow: ['core', 'shared'] },
        // Shared modules can import from core
        { from: 'shared', allow: ['core'] },
        // Core has no restrictions (it's the lowest layer)
        { from: 'core', allow: ['core'] },
      ],
    }],
  },
},
```

**Trade-off:** `eslint-plugin-boundaries` adds a dependency but provides clearer, more maintainable boundary rules. Recommended when app count exceeds 5.

#### Layer 3: AGENTS.md Guardrails (AI Agents)

The per-app `AGENTS.md` files are an additional layer specifically for AI code assistants. They complement but do not replace ESLint rules.

### 6.2 Pre-Commit Hook for Schema Annotation

Add a custom lint check (or use a simple script) to verify entity conventions:

```bash
#!/bin/bash
# .husky/pre-commit or as a lint-staged script

# Check that all entities in mini-apps/ have a schema annotation
for file in $(git diff --cached --name-only --diff-filter=ACM | grep 'mini-apps/.*/entities/.*\.entity\.ts$'); do
  if ! grep -q "schema:" "$file"; then
    echo "ERROR: $file is missing schema annotation in @Entity decorator"
    exit 1
  fi
done

# Check that all controllers in mini-apps/ have @RequiresApp decorator
for file in $(git diff --cached --name-only --diff-filter=ACM | grep 'mini-apps/.*/.*\.controller\.ts$'); do
  if ! grep -q "@RequiresApp" "$file"; then
    echo "ERROR: $file is missing @RequiresApp decorator"
    exit 1
  fi
done
```

### 6.3 Angular-Side Boundary Enforcement

Apply similar rules to the Angular ESLint config:

```javascript
// apps/web/eslint.config.mjs
{
  files: ['**/mini-apps/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/_core/**'],
          message: 'Mini-apps must use shared services, not _core/ directly.',
        },
      ],
    }],
  },
},
```

---

## 7. Cross-Cutting Recommendations for the Plan

### 7.1 Recommendations Summary

| Plan Decision | Research Verdict | Notes |
|---------------|-----------------|-------|
| Convention-based monorepo with `mini-apps/` | **Validated** | Standard NestJS modular monolith pattern |
| PostgreSQL schemas for per-app isolation | **Validated** | Much simpler than per-tenant; use single DataSource |
| `MiniAppsModule` aggregator | **Validated** | Standard NestJS module composition pattern |
| Angular lazy-loaded routes under `/apps/` | **Validated** | Use `loadChildren` with route arrays, not NgModules |
| CLI scaffolding via console command | **Validated** | Extend existing pattern; add rollback + validation |
| Per-app `AGENTS.md` | **Validated** | Supplement with ESLint rules for machine enforcement |
| `mini-apps.json` manifest | **Validated** | Good single source of truth pattern |

### 7.2 Specific Improvements Recommended

**A. Use `canMatch` instead of `canActivate` for app access guards (Angular)**

The plan specifies `canActivate`, but `canMatch` is better because it prevents the lazy chunk from being downloaded at all when the app is disabled. This saves bandwidth and avoids downloading code the user cannot access.

**B. Convert kebab-case to snake_case for PostgreSQL schema names**

The plan uses the app key directly as the schema name. PostgreSQL schema names with hyphens require quoting everywhere. Convert `invoice-tracker` to `invoice_tracker` for the schema name while keeping the kebab-case key for routes and directories.

**C. Add `import/no-restricted-paths` for cross-app boundary enforcement**

The `no-restricted-imports` rule alone cannot distinguish "import from my own mini-app directory" vs "import from another mini-app directory." Use `import/no-restricted-paths` (already available via `eslint-plugin-import`) for path-based restrictions that support negation.

**D. Make SchemaBootstrapService a provider in DatabaseModule, not PlatformModule**

The plan places it in `_platform/database/`. However, it should be a provider of `DatabaseModule` itself (or a sub-module imported by DatabaseModule) to ensure it runs before `TypeOrmModule.forRoot()` synchronizes. Alternatively, disable TypeORM's auto-synchronize and call `dataSource.synchronize()` manually after schema creation.

**E. Use `export default class` for Angular mini-app components**

This enables the shorter lazy-loading import syntax:
```typescript
// With default export:
loadComponent: () => import('./pages/todo-list/todo-list.component')
// Without default export (more verbose):
loadComponent: () => import('./pages/todo-list/todo-list.component').then(m => m.TodoListComponent)
```

**F. Template file format: Use `.partial.ts` extension instead of `.partial`**

Renaming template files to `.partial.ts` provides IDE syntax highlighting and basic TypeScript checking even in template files. The CLI can still do string replacement, but developers editing templates get better tooling.

### 7.3 Architecture Diagram

```
                    +-------------------+
                    |    AppModule      |
                    | (controllers,     |
                    |  throttler, etc.) |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
    +---------v---------+     +-------------v-----------+
    |   CommonModule    |     |    MiniAppsModule       |
    | (auth, services,  |     | (aggregator)            |
    |  DB, AI, etc.)    |     +---+-------+--------+----+
    +---------+---------+         |       |        |
              |             +----v--+ +--v---+ +--v--------+
              |             | Todo  | |Invoce| | ... more  |
              |             |Module | |Module| | modules   |
              |             +---+---+ +--+---+ +-----------+
              |                 |        |
    +---------v---------+      |        |
    |  PlatformModule   |<-----+--------+  (each mini-app imports PlatformModule)
    | (curated exports  |
    |  for mini-apps)   |
    +-------------------+
```

### 7.4 Risk Mitigations from Research

1. **TypeORM `synchronize` + schema ordering risk**: Mitigated by SchemaBootstrapService running in `OnModuleInit` before sync. Validate with an integration test that creates a fresh database, bootstraps schemas, and verifies tables are created in the correct schemas.

2. **Cross-schema FK verification**: Create an integration test in Phase 1.3 that:
   - Creates a test schema
   - Creates a table in that schema with an FK to `public.organizations`
   - Inserts a row and verifies the FK constraint works
   - Drops the test schema

3. **Angular AOT + lazy loading**: The plan correctly uses static `import()` expressions (generated by CLI), not dynamic manifest-based routing. AOT compilation requires static analyzability of imports, so this is the right approach.

4. **ESLint rule false positives**: Test the boundary rules against the existing codebase before enabling them. The existing `_core/` imports from organization/user/space modules would need to be excluded from the mini-app-specific rules.

---

## Sources

### Official Documentation
- [NestJS Modules](https://docs.nestjs.com/modules)
- [NestJS Dynamic Modules](https://docs.nestjs.com/fundamentals/dynamic-modules)
- [TypeORM Multiple Data Sources and Schemas](https://github.com/typeorm/typeorm/blob/master/docs/docs/data-source/3-multiple-data-sources.md)
- [TypeORM Entity Decorator Reference](https://github.com/typeorm/typeorm/blob/master/docs/docs/help/3-decorator-reference.md)
- [Angular v20 Lazy-Loaded Routes](https://angular.dev/best-practices/performance/lazy-loaded-routes)
- [Angular v20 Best Practices](https://v20.angular.dev/assets/context/airules)
- [Angular Router Route API](https://v20.angular.dev/api/router/Route)

### Community Articles and Guides
- [Schema-Based Multitenancy in NestJS with TypeORM - Luca Scalzotto](https://www.scalzotto.nl/posts/nestjs-typeorm-schema-multitenancy/)
- [Schema-Based Multitenancy with NestJS, TypeORM and PostgreSQL - Thomas Vanderstraeten](https://thomasvds.com/schema-based-multitenancy-with-nest-js-type-orm-and-postgres-sql/)
- [NestJS and TypeORM: Schema-Level Multi-Tenancy - DEV Community](https://dev.to/logeek/nestjs-and-typeorm-efficient-schema-level-multi-tenancy-with-auto-generated-migrations-a-dx-approach-jla)
- [Building Scalable SaaS: Multi-Tenant Architecture with PostgreSQL & TypeORM](https://blogs.pranitpatil.com/building-scalable-saas-multi-tenant-architecture-with-postgresql-and-typeorm-design-and-implementation)
- [Designing Your Postgres Database for Multi-tenancy - Crunchy Data](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)
- [Routing and Lazy Loading with Standalone Components - Angular Architects](https://www.angulararchitects.io/en/blog/routing-and-lazy-loading-with-standalone-components/)
- [NestJS and Modular Architecture: Principles and Best Practices](https://levelup.gitconnected.com/nest-js-and-modular-architecture-principles-and-best-practices-806c2cb008d5)
- [Lazy Load Standalone Components in Angular](https://medium.com/@sehban.alam/lazy-load-standalone-components-in-angular-using-loadcomponent-202-663bf789e1d8)

### Boundary Enforcement Tools
- [eslint-plugin-boundaries - GitHub](https://github.com/javierbrea/eslint-plugin-boundaries)
- [ESLint no-restricted-imports Rule](https://eslint.org/docs/latest/rules/no-restricted-imports)
- [eslint-plugin-import no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md)
- [Nx Enforce Module Boundaries](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries)
- [Three Ways to Enforce Module Boundaries in an Nx Monorepo](https://www.stefanos-lignos.dev/posts/nx-module-boundaries)

### CLI and Code Generation
- [NestJS CLI Resource Generators - Trilon](https://trilon.io/blog/introducing-cli-generators-crud-api-in-1-minute)
- [ConfigurableModuleBuilder - LogRocket](https://blog.logrocket.com/use-configurable-module-builders-nest-js-v9/)
- [simple-scaffold - npm](https://www.npmjs.com/package/simple-scaffold)
- [Nx NestJS Plugin and Generators](https://nx.dev/docs/technologies/node/nest/generators)

### Multi-Tenant PostgreSQL
- [Multi-Tenancy Strategies for PostgreSQL - DEV Community](https://dev.to/lbelkind/strategies-for-using-postgresql-as-a-database-for-multi-tenant-services-4abd)
- [PostgreSQL Multi-Tenancy Guide - HackerNoon](https://hackernoon.com/your-guide-to-schema-based-multi-tenant-systems-and-postgresql-implementation-gm433589)
- [Multi-tenancy on PostgreSQL: An Introduction - OpenSourceDB](https://opensource-db.com/multi-tenancy-on-postgres/)
