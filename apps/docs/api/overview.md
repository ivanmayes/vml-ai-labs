# API Overview

The VML Open Boilerplate API is built with NestJS, a progressive Node.js framework that provides a solid architectural foundation for building scalable server-side applications. This guide introduces the API structure, patterns, and conventions used throughout the codebase.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              REQUEST FLOW                                    │
│                                                                              │
│  HTTP Request                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────┐                                                            │
│  │ Middleware  │ → CORS, Logging, Body Parsing                              │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │   Guards    │ → Authentication, Authorization, Rate Limiting            │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │ Controller  │ → Route handling, DTO validation                           │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │  Service    │ → Business logic, data operations                          │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │ Repository  │ → Database operations via TypeORM                          │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │  Database   │ → PostgreSQL                                               │
│  └─────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Module Structure

Each feature is encapsulated in its own module following NestJS conventions:

```
module-name/
├── module-name.entity.ts       # TypeORM entity (database model)
├── module-name.service.ts      # Business logic
├── module-name.controller.ts   # REST endpoints
├── module-name.module.ts       # NestJS module definition
├── module-name.console.ts      # CLI commands (optional)
├── dtos/                       # Request/response DTOs
│   ├── create-*.dto.ts
│   └── update-*.dto.ts
├── guards/                     # Access control guards
└── models/                     # Interfaces and enums
```

## Core Modules

| Module                    | Purpose                    |
| ------------------------- | -------------------------- |
| `organization`            | Tenant management          |
| `user`                    | User accounts and profiles |
| `user/auth`               | JWT authentication         |
| `user/permission`         | Fine-grained permissions   |
| `authentication-strategy` | Auth method configuration  |
| `space`                   | Workspace management       |
| `space-user`              | Space membership           |
| `api-key`                 | Service authentication     |
| `notification`            | Email templates            |
| `sample`                  | Example/reference module   |

## Controllers

Controllers handle HTTP requests and define the API surface.

### Route Prefixes

```typescript
// Organization-scoped admin routes
@Controller("admin/organization/:orgId/users")

// Space-scoped routes
@Controller("space/:spaceId/resource")

// Public routes (no auth required)
@Controller("public")
```

### Common Patterns

```typescript
@Controller("admin/organization/:orgId/resource")
@UseGuards(AuthGuard(), HasOrganizationAccessGuard)
export class ResourceController {
  constructor(private resourceService: ResourceService) {}

  // List resources
  @Get()
  findAll(@Param("orgId") orgId: string) {
    return this.resourceService.findByOrganization(orgId);
  }

  // Create resource
  @Post()
  create(@Param("orgId") orgId: string, @Body() dto: CreateResourceDto) {
    return this.resourceService.create({ ...dto, organizationId: orgId });
  }

  // Get single resource
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.resourceService.findOne({ where: { id } });
  }

  // Update resource
  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateResourceDto) {
    return this.resourceService.update({ id, ...dto });
  }

  // Delete resource
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.resourceService.delete(id);
  }
}
```

### Request Context

Access authenticated user and request metadata:

```typescript
@Get("me")
getProfile(@Request() req) {
  const user = req.user;           // Authenticated user
  const orgId = user.organizationId;
  return this.userService.findOne({ where: { id: user.id } });
}
```

## Services

Services contain business logic and interact with the database.

### Repository Pattern

```typescript
@Injectable()
export class ResourceService {
  constructor(
    @InjectRepository(Resource)
    private repository: Repository<Resource>,
  ) {}

  async find(options?: FindManyOptions<Resource>): Promise<Resource[]> {
    return this.repository.find(options).catch(() => []);
  }

  async findOne(options: FindOneOptions<Resource>): Promise<Resource | null> {
    return this.repository.findOne(options).catch(() => null);
  }

  async create(data: Partial<Resource>): Promise<Resource> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async update(entity: Resource): Promise<Resource> {
    return this.repository.save(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
```

### Error Handling

Services catch errors to prevent unhandled exceptions:

```typescript
async findByOrganization(orgId: string): Promise<Resource[]> {
  return this.repository
    .find({
      where: { organizationId: orgId },
      order: { created: "DESC" },
    })
    .catch(() => []);  // Return empty array on error
}

async findOne(options: FindOneOptions): Promise<Resource | null> {
  return this.repository.findOne(options).catch(() => null);
}
```

## DTOs (Data Transfer Objects)

DTOs validate and transform request/response data.

### Request Validation

```typescript
import { IsString, IsEmail, IsOptional, MinLength } from "class-validator";

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsOptional()
  @IsString()
  role?: string;
}
```

### Validation Pipe

Global validation is enabled in `main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip unknown properties
    forbidNonWhitelisted: true, // Throw on unknown properties
    transform: true, // Auto-transform to DTO class
  }),
);
```

## Response Format

All responses use a consistent envelope:

```typescript
export class ResponseEnvelope<T> {
  status: ResponseStatus;
  message?: string;
  data?: T;

  constructor(status: ResponseStatus, message?: string, data?: T) {
    this.status = status;
    this.message = message;
    this.data = data;
  }
}

export enum ResponseStatus {
  Success = "success",
  Failure = "failure",
  Error = "error",
}
```

### Usage

```typescript
@Get(":id")
async findOne(@Param("id") id: string): Promise<ResponseEnvelope<Resource>> {
  const resource = await this.resourceService.findOne({ where: { id } });

  if (!resource) {
    return new ResponseEnvelope(ResponseStatus.Failure, "Resource not found");
  }

  return new ResponseEnvelope(ResponseStatus.Success, null, resource.toPublic());
}
```

## Entity Serialization

Entities implement serialization methods to control data exposure:

```typescript
@Entity()
export class User {
  // ... fields ...

  // Safe for external exposure
  toPublic(): Partial<User> {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      profile: this.profile,
    };
  }

  // Includes admin-only data
  toAdmin(): Partial<User> {
    return {
      ...this.toPublic(),
      permissions: this.permissions?.map((p) => p.toPublic()),
      activationStatus: this.activationStatus,
      created: this.created,
    };
  }

  // Minimal representation for lists
  toMinimal(): Partial<User> {
    return {
      id: this.id,
      email: this.email,
    };
  }
}
```

## API Endpoints

### Authentication

| Method | Endpoint       | Description       |
| ------ | -------------- | ----------------- |
| POST   | `/auth/login`  | Start login flow  |
| POST   | `/auth/verify` | Verify login code |
| POST   | `/auth/logout` | End session       |
| GET    | `/auth/me`     | Get current user  |

### Organizations

| Method | Endpoint                  | Description              |
| ------ | ------------------------- | ------------------------ |
| GET    | `/admin/organization/:id` | Get organization details |
| PUT    | `/admin/organization/:id` | Update organization      |
| GET    | `/org/:id/public`         | Public organization info |

### Users

| Method | Endpoint                               | Description  |
| ------ | -------------------------------------- | ------------ |
| GET    | `/admin/organization/:orgId/user`      | List users   |
| POST   | `/admin/organization/:orgId/user`      | Create user  |
| GET    | `/admin/organization/:orgId/user/:id`  | Get user     |
| PUT    | `/admin/organization/:orgId/user/:id`  | Update user  |
| POST   | `/admin/organization/:orgId/user/find` | Search users |

### Spaces

| Method | Endpoint                                | Description       |
| ------ | --------------------------------------- | ----------------- |
| GET    | `/admin/organization/:orgId/spaces`     | List spaces       |
| POST   | `/admin/organization/:orgId/spaces`     | Create space      |
| PUT    | `/admin/organization/:orgId/spaces/:id` | Update space      |
| DELETE | `/admin/organization/:orgId/spaces/:id` | Delete space      |
| GET    | `/space/:id`                            | Get space details |
| GET    | `/space/:id/public`                     | Public space info |

### API Keys

| Method | Endpoint                                 | Description    |
| ------ | ---------------------------------------- | -------------- |
| GET    | `/admin/organization/:orgId/api-key`     | List API keys  |
| POST   | `/admin/organization/:orgId/api-key`     | Create API key |
| DELETE | `/admin/organization/:orgId/api-key/:id` | Revoke API key |

## Error Codes

| HTTP Status | Meaning                   |
| ----------- | ------------------------- |
| 200         | Success                   |
| 201         | Created                   |
| 400         | Bad Request (validation)  |
| 401         | Unauthorized (no auth)    |
| 403         | Forbidden (no permission) |
| 404         | Not Found                 |
| 429         | Too Many Requests         |
| 500         | Internal Server Error     |

## Next Steps

- [Authentication](authentication/README.md) - Auth flows and strategies
- [Controllers](controllers.md) - Controller patterns in detail
- [Services](services.md) - Business logic patterns
- [Database](database.md) - TypeORM usage
- [Guards & Decorators](guards-decorators.md) - Security patterns
