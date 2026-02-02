# PRD Defaults: Architectural Recommendations for New Projects

This document provides **default architectural decisions** for AI agents during initial project setup and PRD planning on top of this boilerplate. For ongoing code conventions and style guidelines, see [AGENTS.md](./AGENTS.md).

---

## 1. Queue Systems

### Default: pg_boss (PostgreSQL-native)

Use [pg_boss](https://github.com/timgit/pg-boss) for job queues when building on this boilerplate:

- No additional infrastructure required (uses existing PostgreSQL)
- Reliable job scheduling with retries, delays, and priorities
- Ideal for: email sending, background processing, scheduled tasks

### Fallback: AWS SQS

If the project requires AWS-native queuing or higher throughput:

- Integration exists at `apps/api/src/_core/third-party/aws/aws.sqs.ts`
- Use when: multi-region, AWS-native architecture, or 10k+ messages/second

### Advanced: AWS Lambda + SQS

For event-driven processing at scale:

- Lambda integration at `apps/api/src/_core/third-party/aws/aws.lambda.ts`
- **Ask the user** before implementing this pattern—it adds operational complexity

**When to deviate**: User explicitly requests Redis-based queues (BullMQ), or project has existing queue infrastructure to integrate with.

---

## 2. AI/LLM Integration

### Default: Google Gemini

When adding AI capabilities, default to Google Gemini models unless user specifies otherwise.

### Recommended Structure

Create a model-agnostic service layer:

```
apps/api/src/_core/third-party/ai/
├── index.ts           # Re-exports
├── ai.service.ts      # Abstract interface/base class
├── models/
│   └── index.ts       # Shared types (ChatMessage, CompletionOptions, etc.)
├── gemini.client.ts   # Gemini implementation
├── openai.client.ts   # OpenAI implementation (if needed)
└── anthropic.client.ts # Claude implementation (if needed)
```

### Interface Pattern

```typescript
export interface AIService {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
}
```

**When to deviate**: User has existing OpenAI/Anthropic contracts, specific model requirements (e.g., Claude for code generation, GPT-4 for specific tasks), or cost constraints.

---

## 3. Homepage Detection

### Check for Boilerplate Landing Page

Before implementing user-facing features, check if the homepage still shows boilerplate content.

**File to check**: `apps/web/src/app/pages/home/home.page.html`

**Boilerplate indicators**:

- "Welcome to Your Boilerplate"
- "Quick Setup Guide"
- Setup cards (Configure API, Customize Theme, Add Your First Page, Deploy)
- Features grid with generic items

**Action**: If boilerplate content detected, recommend replacing with application-specific landing page before or during feature implementation.

```typescript
// Detection logic for agents
const boilerplateIndicators = [
  "Welcome to Your Boilerplate",
  "Quick Setup Guide",
  "setup-card",
  "Configure Your API",
  "Add Your First Page",
];
```

**When to deviate**: User explicitly wants to keep the boilerplate page for reference, or the project is a library/SDK without a user-facing landing.

---

## 4. Organization Scoping

### Default: Organization-Scoped Services

**All new API services should be organization-scoped by default.**

### Pattern

Controllers should be nested under organization routes:

```typescript
// Correct: Organization-scoped
@Controller("organization/:orgId/projects")
export class ProjectController {}

// Avoid: Global routes (unless explicitly requested)
@Controller("projects")
export class ProjectController {}
```

### Service Pattern

```typescript
@Injectable()
export class ProjectService {
  async findAll(orgId: string): Promise<Project[]> {
    return this.projectRepo.find({ where: { organizationId: orgId } });
  }

  async create(orgId: string, dto: CreateProjectDto): Promise<Project> {
    return this.projectRepo.save({ ...dto, organizationId: orgId });
  }
}
```

### Existing Guards

- Use `HasOrganizationAccessGuard` from `apps/api/src/organization/guards/`
- Reference existing patterns in `apps/api/src/space/` for sub-resource scoping

**When to deviate**: User explicitly requests global/system-level resources (e.g., shared templates, system configuration), or the resource truly has no organization context.

---

## 5. Shared DTOs and Models

### Default: Import from API, Never Duplicate

**Do NOT create DTOs or model interfaces on the web side.** Always import them from the API using the `@api` path alias.

### Why

- Single source of truth for data shapes
- TypeScript compiler catches API/frontend mismatches
- No drift between what API returns and what frontend expects

### Pattern

```typescript
// ✅ Correct: Import from API
import { UserDto, CreateUserDto } from "@api/user/dtos";
import { SpaceRole } from "@api/space/models";

// ❌ Wrong: Duplicating types on web side
interface UserDto {
  id: string;
  email: string;
  // ... duplicated definition
}
```

### Path Alias Configuration

The `@api` alias is configured in `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@api/*": ["../api/src/*"]
    }
  }
}
```

### What to Import

| From API            | Example Path            |
| ------------------- | ----------------------- |
| DTOs                | `@api/user/dtos`        |
| Entities (as types) | `@api/user/user.entity` |
| Enums               | `@api/space/models`     |
| Shared constants    | `@api/_core/models`     |

### Web-Only Models

The only models that should live in `apps/web/` are:

- **UI state models** (e.g., form state, dialog state)
- **Component-specific interfaces** (e.g., table column configs)
- **Akita store models** (session state, global state)

```typescript
// These belong in apps/web/src/app/shared/models/
interface TableConfig {
  columns: Column[];
  paginator: boolean;
}

// These belong in apps/web/src/app/state/
interface SessionState {
  user: UserDto | null; // UserDto imported from @api
  isAuthenticated: boolean;
}
```

**When to deviate**: The type is purely UI-specific with no API equivalent, or you need to extend an API type with frontend-only properties (use `interface ExtendedUser extends UserDto { uiState: ... }`).

---

## 6. Admin Pages

### Location

Admin functionality lives at `/organization/admin`:

```
apps/web/src/app/pages/organization-admin/
├── organization-admin.page.ts      # Container with tab navigation
├── users/                          # User management tab
├── spaces/                         # Spaces management tab
└── settings/                       # Organization settings tab
```

### Adding New Admin Features

1. **Create as a new tab/sub-route** under `organization-admin/`
2. **Register in** `organization-admin-routing.module.ts`
3. **Add tab** to the tab navigation in `organization-admin.page.html`

### Guard

Uses `AdminRoleGuard` from `apps/web/src/app/shared/guards/admin-role.guard.ts`:

```typescript
// In routing module
{
  path: 'new-feature',
  loadChildren: () => import('./new-feature/new-feature.module').then(m => m.NewFeatureModule),
  canActivate: [AdminRoleGuard]
}
```

**When to deviate**: Feature is space-admin scoped (use `/space/:spaceId/admin`), or feature requires super-admin/system-level access.

---

## 7. Third-Party Service Pattern

### Location

All third-party integrations live in `apps/api/src/_core/third-party/`:

```
apps/api/src/_core/third-party/
├── aws/                    # AWS services (S3, SQS, Lambda, SES, Cognito)
│   ├── index.ts
│   ├── aws.s3.ts
│   ├── aws.sqs.ts
│   ├── aws.lambda.ts
│   ├── aws.ses.ts
│   └── aws.cognito.ts
├── adobe/                  # Adobe services
│   ├── index.ts
│   └── adobe.ajo.ts
├── sendgrid.ts            # Simple single-file integration
├── strapi/                # CMS integration
│   ├── index.ts
│   ├── utils.ts
│   └── models/index.ts
└── wpp-open/              # WPP Open integration
    ├── index.ts
    └── models/index.ts
```

### Structure for New Services

**Simple service** (single API, few methods):

```
apps/api/src/_core/third-party/
└── newservice.ts
```

**Complex service** (multiple endpoints, types):

```
apps/api/src/_core/third-party/newservice/
├── index.ts           # Main service class, re-exports
├── models/
│   └── index.ts       # Types and interfaces
└── utils.ts           # Helper functions (if needed)
```

### Implementation Pattern

```typescript
// apps/api/src/_core/third-party/newservice/index.ts
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NewServiceConfig, NewServiceResponse } from "./models";

@Injectable()
export class NewService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get("NEWSERVICE_API_KEY");
    this.baseUrl = this.configService.get(
      "NEWSERVICE_BASE_URL",
      "https://api.newservice.com",
    );
  }

  async doSomething(input: string): Promise<NewServiceResponse> {
    // Implementation
  }
}
```

**When to deviate**: Service is project-specific (not reusable across VML projects), or integration is trivial enough to inline in the consuming service.

---

## Quick Reference

| Decision    | Default                         | When to Ask                              |
| ----------- | ------------------------------- | ---------------------------------------- |
| Job Queue   | pg_boss                         | Redis needed, AWS-native arch            |
| AI Provider | Gemini                          | Specific model needs, existing contracts |
| API Scoping | Organization-scoped             | Global resources needed                  |
| DTOs/Models | Import from `@api/*`            | UI-only types, extended interfaces       |
| Admin UI    | Tab under `/organization/admin` | Space-level or system-level admin        |
| Third-party | `_core/third-party/[name]/`     | Project-specific integration             |
| Homepage    | Replace boilerplate             | User wants to keep it                    |

---

## Related Documentation

- [AGENTS.md](./AGENTS.md) - Code style, naming conventions, component patterns
- [apps/api/AGENTS.md](./apps/api/AGENTS.md) - API-specific guidelines
- [apps/web/AGENTS.md](./apps/web/AGENTS.md) - Angular/PrimeNG-specific guidelines
