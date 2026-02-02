# VML Open Boilerplate

A production-ready, enterprise-grade application stack featuring NestJS, Angular, and PostgreSQL with multi-tenant architecture, pluggable AI providers, and comprehensive authentication systems.

| Project Meta   |                                                         |
| -------------- | ------------------------------------------------------- |
| Built With     | NestJS ^11.x, Angular ^19.x, PrimeNG ^20.x, PostgreSQL  |
| Architecture   | Multi-tenant, Organization-scoped, Modular              |
| AI Integration | OpenAI, Anthropic, Google Gemini, Azure, AWS Bedrock    |
| Authentication | Basic (Code), OAuth/OIDC (Okta), SAML 2.0, WPP Open SSO |

## Table of Contents

- [Introduction](#introduction)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [AI Framework](#ai-framework)
- [Authentication System](#authentication-system)
- [Multi-Tenant Architecture](#multi-tenant-architecture)
- [Notification System](#notification-system)
- [Theming & Design System](#theming--design-system)
- [Third-Party Integrations](#third-party-integrations)
- [Console Commands](#console-commands)
- [API Documentation](#api-documentation)
- [Security Features](#security-features)
- [Deployment](#deployment)

---

## Introduction

VML Open Boilerplate provides a complete foundation for building enterprise SaaS applications. It solves common challenges in multi-tenant application development:

- **Organization Isolation**: All data and resources are scoped to organizations by default
- **Flexible Authentication**: Support for multiple authentication strategies per organization
- **Unified AI Integration**: Single interface for 5+ LLM providers with automatic failover
- **Collaborative Workspaces**: Spaces with role-based access control within organizations
- **Enterprise SSO**: Native support for SAML 2.0, OAuth/OIDC, and custom SSO providers

The architecture follows proven patterns from production systems serving millions of users, with careful attention to security, scalability, and developer experience.

---

## Key Features

### Core Platform

- **Multi-Tenant by Design**: Organization → Space → User hierarchy with complete isolation
- **Role-Based Access Control**: Hierarchical roles (SuperAdmin, Admin, Manager, User, Guest)
- **Fine-Grained Permissions**: Entity-level permission system with custom permission types
- **API Key Management**: Encrypted keys with usage tracking and revocation

### AI & Machine Learning

- **Multi-Provider AI Framework**: Unified interface for OpenAI, Anthropic, Google, Azure, AWS Bedrock
- **Modality Support**: Text, Image, Vision, Audio, Embeddings, Function Calling
- **Cost Tracking**: Automatic cost estimation per request with configurable alerts
- **Streaming Support**: Real-time streaming responses for all supported providers

### Authentication

- **Multiple Strategies**: Basic (code-based), Okta (OAuth2/OIDC), SAML 2.0
- **Per-Organization Config**: Each organization can use different auth strategies
- **WPP Open SSO**: Native integration with WPP Open workspace authentication
- **Token Management**: JWT-based with automatic cleanup and revocation

### Developer Experience

- **Swagger/OpenAPI**: Auto-generated API documentation with live testing
- **Console Commands**: CLI tools for setup, user management, and code scaffolding
- **Hot Reload**: Both API and Web support instant code reloading
- **Type Safety**: Shared DTOs between API and Web via TypeScript path aliases

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           VML Open Boilerplate                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │   Angular 19     │    │    NestJS 11     │    │  PostgreSQL   │ │
│  │   + PrimeNG 20   │◄──►│    REST API      │◄──►│   Database    │ │
│  │   + Tailwind 4   │    │    + TypeORM     │    │               │ │
│  └──────────────────┘    └──────────────────┘    └───────────────┘ │
│           │                       │                                  │
│           │              ┌────────┴────────┐                        │
│           │              │                 │                        │
│           ▼              ▼                 ▼                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Theme System │  │ AI Framework │  │ Third-Party  │              │
│  │  WPP Open    │  │  5 Providers │  │ Integrations │              │
│  │  Dark/Light  │  │  6 Modalities│  │ AWS, Adobe.. │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Organization-Scoped by Default**: Every resource belongs to an organization. This ensures complete data isolation between tenants without complex query logic.

2. **Strategy Pattern for Extensibility**: Authentication, notifications, and AI providers all use the strategy pattern, allowing new implementations without modifying existing code.

3. **Shared Type System**: DTOs defined in the API are imported directly by the web app via TypeScript path aliases (`@api/*`), ensuring type safety across the stack.

4. **Progressive Enhancement**: Features like AI integration, SSO, and advanced notifications are optional. The core platform works without them.

5. **Environment-Driven Configuration**: All third-party integrations configure themselves from environment variables with sensible defaults.

---

## Getting Started

### Prerequisites

- Node.js 24+ (use nvm: `nvm install 24 && nvm use 24`)
- PostgreSQL 14+
- npm 10+

### Quick Start

```bash
# Clone and install
git clone <repository-url>
cd vml-open-boilerplate
npm install

# Create databases
createdb your_api_database_name

# Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit .env files with your database URL and settings

# Start development servers (hot reload enabled)
npm start

# URLs:
# - API: http://localhost:8001
# - Web: http://localhost:4200
# - Swagger: http://localhost:8001/api (when SWAGGER_ENABLE=true)
```

### Initial Setup

After starting the API, run the organization installer:

```bash
cd apps/api && npm run console:dev InstallOrganization
```

This interactive command:

1. Creates your first organization
2. Sets up an authentication strategy (Basic, Okta, or SAML)
3. Creates an admin user
4. Generates necessary configuration

### Environment Configuration

#### API (`apps/api/.env`)

```bash
# Core
LOCALHOST=true
DEBUG=true
SWAGGER_ENABLE=true
ORIGINS=localhost

# Database
DATABASE_URL=postgres://postgres:@localhost:5432/your_api_database_name
DATABASE_SYNCHRONIZE=true  # Set to false in production

# AI Providers (all optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
AZURE_OPENAI_API_KEY=...
AWS_BEDROCK_REGION=us-east-1

# AI Defaults
AI_DEFAULT_TEXT_PROVIDER=openai  # openai, anthropic, google, azure, bedrock
AI_LOGGING_ENABLED=true
AI_COST_TRACKING_ENABLED=true

# AWS Services
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SES_REGION=us-east-1

# Signing Keys (generate unique keys for production)
PII_SIGNING_KEY=<base64-key>
PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

#### Web (`apps/web/.env`)

```bash
LOCALHOST=true
PRODUCTION=false
API_SETTINGS={"localhost":[{"name":"Local","endpoint":"http://localhost:8001","organizationId":"YOUR-ORG-ID","production":false,"locale":"en-US"}]}
```

---

## AI Framework

The AI framework provides a unified interface for multiple LLM providers, abstracting away provider-specific APIs while maintaining access to advanced features.

### Supported Providers

| Provider     | Text | Streaming | Vision | Images | Audio | Embeddings | Functions |
| ------------ | ---- | --------- | ------ | ------ | ----- | ---------- | --------- |
| OpenAI       | ✅   | ✅        | ✅     | ✅     | ✅    | ✅         | ✅        |
| Anthropic    | ✅   | ✅        | ✅     | ❌     | ❌    | ❌         | ✅        |
| Google       | ✅   | ✅        | ✅     | ❌     | ❌    | ✅         | ✅        |
| Azure OpenAI | ✅   | ✅        | ✅     | ✅     | ✅    | ✅         | ✅        |
| AWS Bedrock  | ✅   | ✅        | ✅     | ✅     | ❌    | ✅         | ✅        |

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      AIService                          │
│  (Unified facade - selects provider per modality)       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ OpenAI  │ │Anthropic│ │ Google  │ │ Bedrock │      │
│  │ Client  │ │ Client  │ │ Client  │ │ Client  │      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘      │
│       │           │           │           │            │
│       ▼           ▼           ▼           ▼            │
│  ┌──────────────────────────────────────────────┐      │
│  │          Provider-Specific SDKs              │      │
│  │  (openai, @anthropic-ai/sdk, @google/genai)  │      │
│  └──────────────────────────────────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Usage Examples

```typescript
import { AIService } from "./ai/ai.service";
import { AIProvider, AIModel } from "./_core/third-party/ai";

// Text generation with automatic provider selection
const response = await aiService.generateText({
  messages: [{ role: "user", content: "Explain quantum computing" }],
});

// Specify provider and model explicitly
const response = await aiService.generateText({
  provider: AIProvider.Anthropic,
  model: AIModel.Claude35Sonnet,
  messages: [{ role: "user", content: "Write a haiku" }],
  maxTokens: 100,
});

// Streaming responses
for await (const chunk of aiService.generateTextStream(request)) {
  process.stdout.write(chunk.content);
}

// Image generation
const image = await aiService.generateImage({
  prompt: "A sunset over mountains",
  size: "1024x1024",
  quality: "hd",
});

// Vision analysis
const analysis = await aiService.analyzeImage({
  images: [{ base64: imageData, mimeType: "image/png" }],
  prompt: "Describe what you see",
});

// Embeddings for semantic search
const embeddings = await aiService.generateEmbedding({
  input: ["Document text to embed"],
  model: AIModel.TextEmbedding3Small,
});
```

### Cost Tracking

The framework automatically tracks costs per request:

```typescript
// Cost is included in every response
const response = await aiService.generateText(request);
console.log(`Request cost: $${response.usage.estimatedCost}`);

// Configure cost alerts
AI_COST_ALERT_THRESHOLD=100  # Alert when daily costs exceed $100
```

### Provider Fallback Chain

Configure automatic fallback when primary providers fail:

```bash
AI_DEFAULT_TEXT_PROVIDER=anthropic
AI_FALLBACK_TEXT_PROVIDER=openai
```

---

## Authentication System

The authentication system supports multiple strategies, configurable per organization.

### Strategy Types

#### 1. Basic (Code-Based)

Passwordless authentication using one-time codes sent via email.

```
User enters email → Code sent → User enters code → JWT issued
```

Configuration:

- Code length (default: 6 digits)
- Code lifetime (default: 10 minutes)
- Rate limiting per email

#### 2. Okta (OAuth 2.0 / OIDC)

Enterprise SSO via Okta with automatic user provisioning.

```
User redirected → Okta login → Token validated → JWT issued
```

Configuration per organization:

```typescript
{
  type: 'okta',
  config: {
    oktaDomain: 'your-org.okta.com',
    clientId: 'xxx',
    uiType: 'redirect' | 'widget'
  }
}
```

#### 3. SAML 2.0

Enterprise identity federation for large organizations.

Features:

- SP-initiated SSO
- Challenge/response with nonce
- Automatic user provisioning
- Attribute mapping

#### 4. WPP Open SSO

Native integration with WPP Open workspaces for seamless authentication.

```
WPP Open token → Validated → Workspace hierarchy checked → JWT issued
```

Features:

- Automatic user creation
- Workspace-to-Space mapping
- Tenant ID scoping
- Redirect to appropriate Space

### Token Management

- JWTs with configurable expiration
- Token array per user (supports multiple sessions)
- Automatic stale token cleanup
- Revocation on sign-out

### User Roles

```
SuperAdmin → Full system access
    │
Admin → Organization-wide access
    │
Manager → Can manage users within spaces
    │
User → Standard access
    │
Guest → Limited read-only access
```

---

## Multi-Tenant Architecture

### Hierarchy

```
Organization
├── Authentication Strategies (1:many)
├── Spaces (1:many)
│   ├── Space Users (users with space-specific roles)
│   └── Space Settings (JSON configuration)
└── Users (1:many)
    ├── Permissions (fine-grained access)
    └── User Spaces (many:many with roles)
```

### Organization Scoping

All API endpoints are organization-scoped by default:

```typescript
// Controllers
@Controller('organization/:orgId/projects')
export class ProjectController {
  @UseGuards(AuthGuard(), HasOrganizationAccessGuard)
  @Get()
  findAll(@Param('orgId') orgId: string) {
    return this.projectService.findByOrg(orgId);
  }
}

// Services
async findByOrg(orgId: string): Promise<Project[]> {
  return this.repo.find({ where: { organizationId: orgId } });
}
```

### Spaces

Spaces provide collaborative isolation within an organization:

- **Public Spaces**: Visible to all org members
- **Private Spaces**: Invite-only access
- **Space Roles**: Admin (manage space), User (standard access)
- **WPP Open Integration**: Map external workspace IDs to spaces

### Guards

| Guard                        | Purpose                        |
| ---------------------------- | ------------------------------ |
| `AuthGuard()`                | Validates JWT token            |
| `RolesGuard`                 | Checks user role meets minimum |
| `PermissionsGuard`           | Checks specific permissions    |
| `HasOrganizationAccessGuard` | Validates org membership       |
| `SpaceAccessGuard`           | Validates space access         |
| `SpaceAdminGuard`            | Requires space admin role      |

---

## Notification System

A multi-provider notification system supporting email delivery with template management.

### Providers

1. **AWS SES** - Default email provider
2. **SendGrid** - Dynamic templates with merge tags
3. **Adobe Journey Optimizer** - Enterprise marketing automation

### Template System

Templates are file-based with Handlebars syntax:

```
apps/api/src/notification/templates/
├── welcome/
│   ├── template.html
│   ├── template.txt
│   └── translations/
│       └── en-US.json
└── login-code/
    ├── template.html
    └── template.txt
```

### Usage

```typescript
await notificationService.sendTemplate(
  "login-code", // Template name
  organizationId, // Org-specific customization
  { to: "user@email.com" },
  { SINGLE_PASS: "123456" }, // Merge tags
  null,
  null,
  null,
  "Organization Name",
);
```

### Features

- HTML + plain text variants
- Per-organization template overrides
- Locale-based translations
- Merge tag mapping per provider
- BCC and CC support
- Delivery tracking

---

## Theming & Design System

The application uses PrimeNG v20 with a custom WPP Open-inspired design system.

### Architecture

```typescript
// Programmatic theme configuration in app.module.ts
providePrimeNG({
  theme: {
    preset: Lara,
    options: {
      prefix: "p",
      darkModeSelector: ".p-dark",
      cssLayer: false,
    },
  },
  ripple: true,
  inputVariant: "outlined",
});
```

### Color Palette

The primary palette uses WPP Open purple:

```scss
--p-primary-50: #f5f0fa; // Lightest
--p-primary-500: #5e00b5; // Primary brand color
--p-primary-950: #1a0033; // Darkest
```

### Theme Service

Reactive theme management with system preference detection:

```typescript
@Injectable()
export class ThemeService {
  private currentTheme = signal<"light" | "dark" | "auto">("auto");

  // Automatically tracks system preference changes
  // Persists user preference to localStorage
  // Updates theme-color meta tag for mobile
}
```

### Dark Mode

Toggle dark mode with a single class:

```typescript
// Apply dark mode
document.documentElement.classList.add("p-dark");

// Or use the service
themeService.setTheme("dark");
```

### CSS Variables

Override any PrimeNG variable in `_primeng-theme.scss`:

```scss
:root {
  // Colors
  --p-primary-color: #5e00b5;
  --p-surface-ground: #fafafa;

  // Typography
  --p-font-family: "Inter", sans-serif;

  // Spacing
  --p-form-field-padding-x: 0.875rem;

  // Shadows
  --p-overlay-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
```

---

## Third-Party Integrations

All integrations live in `apps/api/src/_core/third-party/`:

### AWS Services

| Service | File             | Purpose                            |
| ------- | ---------------- | ---------------------------------- |
| S3      | `aws.s3.ts`      | File storage with automatic naming |
| SES     | `aws.ses.ts`     | Email delivery                     |
| SQS     | `aws.sqs.ts`     | Message queuing                    |
| Lambda  | `aws.lambda.ts`  | Serverless function invocation     |
| Cognito | `aws.cognito.ts` | User authentication                |

### WPP Open

Integration with WPP Open workspace platform:

```typescript
// Validate a WPP Open token
const result = await WPPOpen.validateToken(token);

// Get workspace hierarchy
const hierarchy = await WPPOpen.getWorkspaceAncestor(
  token,
  workspaceId,
  scopeId,
);
```

### Strapi CMS

Headless CMS integration for content management:

```typescript
// Query Strapi collections
const pages = await strapi.getCollection("pages", {
  filters: { slug: "home" },
  populate: "*",
});
```

### Adobe Journey Optimizer

Enterprise marketing automation:

```typescript
// Send marketing email
await ajo.sendEmail({
  templateId: "campaign-123",
  recipient: "user@email.com",
  variables: { firstName: "John" },
});
```

---

## Console Commands

CLI commands for common operations:

```bash
# From apps/api directory
npm run console:dev <command>
```

### Available Commands

| Command                  | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `InstallOrganization`    | Interactive setup of org, user, and auth           |
| `GetUserToken <userId>`  | Generate JWT for API testing                       |
| `AddEntity <EntityName>` | Scaffold new entity with controller, service, DTOs |

### Entity Scaffolding

The `AddEntity` command generates:

```
apps/api/src/<entity>/
├── <entity>.entity.ts        # TypeORM entity
├── <entity>.controller.ts    # REST controller
├── <entity>.service.ts       # Business logic
├── <entity>.module.ts        # NestJS module
└── dtos/
    ├── <entity>.dto.ts       # Response DTO
    ├── <entity>-create.dto.ts
    └── <entity>-update.dto.ts
```

And automatically updates:

- `app.module.ts` - Registers the module
- `common.module.ts` - Adds service to common exports
- `database.module.ts` - Registers entity

---

## API Documentation

When `SWAGGER_ENABLE=true`:

- **Swagger UI**: http://localhost:8001/api
- **OpenAPI JSON**: http://localhost:8001/api-json

### Getting a Bearer Token

For API testing, generate a token:

```bash
# Via console command
npm run console:dev GetUserToken <user-id>

# Via test endpoint (requires ENABLE_TEST_AUTH=true)
curl http://localhost:8001/user/dev/test-tokens
```

### Using the Token

```bash
curl -X GET http://localhost:8001/user/refresh \
  -H "Authorization: Bearer YOUR-JWT-TOKEN"
```

---

## Security Features

### Fraud Prevention

Located in `apps/api/src/_core/fraud-prevention/`:

- **Email Normalization**: Standardizes email addresses before storage
- **Form Validation**: Field-level validators for common inputs
- **Crypto Utilities**: Encryption/decryption for sensitive data

### API Keys

Secure API key management with:

- Encrypted storage (128-byte random keys)
- Organization scoping
- Expiration support
- Automatic usage logging
- Request metadata capture

### Input Validation

All DTOs use class-validator decorators:

```typescript
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  firstName: string;
}
```

---

## Deployment

### GitHub Actions

Sample workflows in `.github/workflows-disabled/`:

1. Rename to `.github/workflows/`
2. Update `YOUR-APP-NAME` in workflow files
3. Configure secrets in GitHub repository

### Environment Variables

Production checklist:

- [ ] `DATABASE_SYNCHRONIZE=false`
- [ ] Generate unique signing keys
- [ ] Configure real AWS credentials
- [ ] Set appropriate `ORIGINS`
- [ ] Enable HTTPS

### Database Migrations

For production, use TypeORM migrations:

```bash
# Generate migration
npm run typeorm migration:generate -- -n MigrationName

# Run migrations
npm run typeorm migration:run
```

---

## Related Documentation

- [AGENTS.md](./AGENTS.md) - AI agent guidelines and coding conventions
- [PRD_DEFAULTS.md](./PRD_DEFAULTS.md) - Architectural defaults for new features
- [Theme README](./apps/web/src/theme/README.md) - Detailed theming documentation

---

## License

Proprietary - VML/WPP
