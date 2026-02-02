# System Overview

The VML Open Boilerplate is designed as a modular, enterprise-grade platform that can scale from small applications to large multi-tenant SaaS products. This overview explains the high-level architecture and key design decisions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Angular    │  │   Mobile    │  │   Third     │  │    CLI      │    │
│  │  Web App    │  │    Apps     │  │   Party     │  │   Tools     │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          │ JWT Auth       │ JWT Auth       │ API Key        │ JWT Auth
          │                │                │                │
┌─────────▼────────────────▼────────────────▼────────────────▼───────────┐
│                         API GATEWAY                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  • CORS Validation                                                │  │
│  │  • Rate Limiting (Throttler)                                      │  │
│  │  • Request/Response Logging                                       │  │
│  │  • SSL/TLS Termination                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────┬──────────────────────────────┘
                                          │
┌─────────────────────────────────────────▼──────────────────────────────┐
│                          NESTJS API                                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    AUTHENTICATION LAYER                          │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │  JWT    │  │  API    │  │  Okta   │  │  SAML   │            │   │
│  │  │Strategy │  │  Key    │  │ OAuth   │  │  2.0    │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      BUSINESS LOGIC                               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │   User   │ │   Org    │ │  Space   │ │  Notif   │           │   │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │           │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    INTEGRATIONS                                   │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │  AWS    │  │  AI/LLM │  │ Adobe   │  │SendGrid │            │   │
│  │  │Services │  │Providers│  │  AJO    │  │         │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────┬──────────────────────────────┘
                                          │
┌─────────────────────────────────────────▼──────────────────────────────┐
│                          DATA LAYER                                      │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐   │
│  │      TypeORM         │  │           PostgreSQL                  │   │
│  │  • Entities          │  │  • Users, Organizations, Spaces      │   │
│  │  • Repositories      │  │  • Auth Strategies, Permissions      │   │
│  │  • Migrations        │  │  • API Keys, Notifications           │   │
│  └──────────────────────┘  └──────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

## Core Design Principles

### 1. Multi-Tenancy First

Every piece of data belongs to an organization. This is enforced at the database level through foreign keys and at the application level through guards and scoping.

```typescript
// Every entity that needs organization scoping
@Entity()
export class MyEntity {
  @ManyToOne(() => Organization)
  organization: Organization;

  @Column()
  organizationId: string;
}
```

### 2. Security by Default

- All endpoints require authentication unless explicitly marked as public
- Sensitive data is encrypted at rest
- API keys are hashed before storage
- CORS validation prevents cross-origin attacks
- Rate limiting prevents abuse

### 3. Modular Architecture

Each feature is encapsulated in its own NestJS module:

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([MyEntity])],
  providers: [MyService],
  controllers: [MyController],
  exports: [MyService], // Only export what others need
})
export class MyModule {}
```

### 4. Separation of Concerns

The codebase follows clear layer separation:

| Layer       | Responsibility                    | Files               |
| ----------- | --------------------------------- | ------------------- |
| Controllers | HTTP request handling, validation | `*.controller.ts`   |
| Services    | Business logic, data operations   | `*.service.ts`      |
| Entities    | Database schema, relationships    | `*.entity.ts`       |
| DTOs        | Request/response validation       | `dtos/*.dto.ts`     |
| Guards      | Access control                    | `guards/*.guard.ts` |

## Request Flow

Here's how a typical authenticated request flows through the system:

```
1. Client Request
   └─> HTTP POST /admin/organization/:orgId/user
       Headers: { Authorization: Bearer <jwt> }

2. NestJS Middleware
   └─> CORS validation
   └─> Request logging

3. Authentication Guard
   └─> JwtAuthGuard validates token
   └─> Extracts user from token payload
   └─> Attaches user to request object

4. Route Handler
   └─> UserController.create()
   └─> Validates DTO with class-validator

5. Business Logic
   └─> UserService.save()
   └─> Encrypts sensitive data
   └─> Validates organization access

6. Database
   └─> TypeORM repository.save()
   └─> PostgreSQL INSERT

7. Response
   └─> ResponseEnvelope wraps result
   └─> JSON serialization
   └─> HTTP 201 Created
```

## Key Subsystems

### Authentication System

The platform supports multiple authentication strategies that can be configured per organization:

- **JWT (JSON Web Tokens)** - Primary authentication for web and mobile apps
- **API Keys** - Service-to-service authentication
- **Okta OAuth** - Enterprise SSO integration
- **SAML 2.0** - Enterprise identity federation

See [Authentication Documentation](../api/authentication/README.md) for details.

### Authorization System

Authorization is handled at multiple levels:

1. **Role-Based Access Control (RBAC)**
   - SuperAdmin, Admin, User roles at organization level
   - SpaceAdmin, SpaceEditor, SpaceUser at space level

2. **Permission-Based Access Control**
   - Fine-grained permissions for specific actions
   - Stored in the Permission entity

3. **Resource Scoping**
   - Guards verify organization/space membership
   - Entities are automatically scoped by organization

### Notification System

Centralized notification handling with support for:

- Multiple providers (AWS SES, SendGrid, Adobe AJO)
- Template management with Handlebars
- Merge tag substitution
- Multi-locale support

### Data Encryption

Sensitive data is encrypted using AES-256:

```typescript
// Encryption happens automatically for marked fields
@Column({
  transformer: {
    to: (value) => Crypt.encrypt(value, key, iv),
    from: (value) => Crypt.decrypt(value, key, iv),
  },
})
sensitiveField: string;
```

## Frontend Architecture

The Angular frontend follows a unidirectional data flow pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                    ANGULAR APPLICATION                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                     COMPONENTS                          │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐               │ │
│  │  │  Pages  │  │ Shared  │  │ Dialogs │               │ │
│  │  └────┬────┘  └────┬────┘  └────┬────┘               │ │
│  └───────┼────────────┼────────────┼────────────────────┘ │
│          │            │            │                       │
│          ▼            ▼            ▼                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │               STATE MANAGEMENT (AKITA)                  │ │
│  │  ┌─────────────┐  ┌─────────────┐                     │ │
│  │  │Global Store │  │Session Store│                     │ │
│  │  │  • Header   │  │  • User     │                     │ │
│  │  │  • Settings │  │  • Token    │                     │ │
│  │  └──────┬──────┘  └──────┬──────┘                     │ │
│  └─────────┼────────────────┼────────────────────────────┘ │
│            │                │                              │
│            ▼                ▼                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                     SERVICES                            │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │  HTTP Client + Request Interceptor               │  │ │
│  │  │  (Automatic JWT attachment)                      │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Technology Choices

### Why NestJS?

- **TypeScript-first** - Type safety across the stack
- **Modular architecture** - Encourages clean separation
- **Dependency injection** - Easy testing and composition
- **Decorator-based** - Familiar to Angular developers
- **Passport integration** - Flexible authentication strategies

### Why Angular?

- **Enterprise-ready** - Built for large applications
- **TypeScript native** - Consistent with API
- **PrimeNG integration** - Rich component library
- **RxJS** - Powerful reactive patterns
- **Strong tooling** - CLI, testing, builds

### Why PostgreSQL?

- **JSONB support** - Flexible schema for settings
- **UUID primary keys** - Secure, distributed-friendly
- **Strong consistency** - ACID transactions
- **Mature ecosystem** - Reliable tooling

### Why Akita?

- **Simple API** - Less boilerplate than NgRx
- **Entity stores** - Built-in CRUD patterns
- **Dev tools** - Time-travel debugging
- **Persistence** - Easy localStorage sync

## Scalability Considerations

The architecture supports horizontal scaling:

1. **Stateless API** - JWT tokens eliminate server-side sessions
2. **Database pooling** - TypeORM connection pool management
3. **CDN-ready frontend** - Static assets can be globally distributed
4. **Queue integration** - AWS SQS for async processing
5. **Microservices-ready** - Modules can be extracted as needed

## Next Steps

- [Multi-tenancy Model](multi-tenancy.md) - Deep dive into tenant isolation
- [Database Schema](database-schema.md) - Entity relationships
- [Security Model](security.md) - Security architecture details
