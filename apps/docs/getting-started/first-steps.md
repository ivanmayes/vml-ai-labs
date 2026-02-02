# First Steps

Now that you have the VML Open Boilerplate installed and configured, let's walk through the essential first steps to start building your application.

## Understanding the Hierarchy

Before building, understand the multi-tenant structure:

```
Organization (Tenant)
├── Authentication Strategy (how users log in)
├── Users (people with accounts)
├── Spaces (workspaces/projects)
│   └── Space Users (members with space-specific roles)
└── Settings (organization-level configuration)
```

## Step 1: Set Up Your First Organization

If you haven't already, use the CLI to create your first organization:

```bash
cd apps/api
npm run console:dev InstallOrganization
```

You'll be prompted for:

1. **Organization name** - e.g., "Acme Corp"
2. **Slug** - URL-friendly identifier, e.g., "acme-corp"

After creation, note the **Organization ID** (UUID) - you'll need it for web configuration.

## Step 2: Configure Authentication

### Option A: Basic Email/Code Authentication

This is the simplest option for development:

```bash
npm run console:dev InstallAuthStrategy
```

Select:

1. Your organization
2. Strategy type: **Basic**
3. Code length: **6** (default)
4. Code lifetime: **5** minutes (default)

### Option B: Okta OAuth

For Okta integration, you'll need to configure your `.env`:

```env
OKTA_DOMAIN=https://your-domain.okta.com
OKTA_CLIENT_ID=your_client_id
OKTA_CLIENT_SECRET=your_client_secret
```

Then run the CLI and select **Okta** as the strategy type.

## Step 3: Create Your First User

```bash
npm run console:dev InstallUser
```

Follow the prompts to:

1. Select your organization
2. Select authentication strategy
3. Enter email address
4. Enter first and last name
5. Select role: **SuperAdmin** (for your admin account)

## Step 4: Generate an Auth Token (Development)

For testing the API directly:

```bash
npm run console:dev GetUserToken <user-id>
```

This outputs a JWT token you can use for API requests:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8001/admin/organization/<org-id>/user
```

## Step 5: Configure the Web Application

Update your web environment with the organization ID:

```env
# apps/web/.env
API_URL=http://localhost:8001
ORGANIZATION_ID=<your-organization-uuid>
```

Regenerate the environment file:

```bash
cd apps/web
npm run config
```

## Step 6: Start the Applications

In separate terminals:

```bash
# Terminal 1 - API
npm run start:api

# Terminal 2 - Web
npm run start:web
```

Open http://localhost:4200 and log in with your user's email.

## Creating Your First Space

Spaces are workspaces within your organization. Create one via the API:

```bash
curl -X POST http://localhost:8001/admin/organization/<org-id>/space \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Space",
    "isPublic": false
  }'
```

Or use the web interface once logged in as an admin.

## Adding a New Feature

Let's walk through adding a simple new feature to understand the development workflow.

### Example: Adding a "Projects" Module

#### 1. Create the API Module

```bash
# Create the folder structure
mkdir -p apps/api/src/project/dtos
```

#### 2. Create the Entity

```typescript
// apps/api/src/project/project.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from "typeorm";
import { Space } from "../space/space.entity";

@Entity()
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => Space, { onDelete: "CASCADE" })
  space: Space;

  @Column()
  spaceId: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

#### 3. Create the Service

```typescript
// apps/api/src/project/project.service.ts
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Project } from "./project.entity";

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  async findBySpace(spaceId: string): Promise<Project[]> {
    return this.projectRepository.find({ where: { spaceId } });
  }

  async create(data: Partial<Project>): Promise<Project> {
    const project = this.projectRepository.create(data);
    return this.projectRepository.save(project);
  }
}
```

#### 4. Create the Controller

```typescript
// apps/api/src/project/project.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../user/auth/jwt-auth.guard";
import { ProjectService } from "./project.service";

@Controller("space/:spaceId/project")
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private projectService: ProjectService) {}

  @Get()
  findAll(@Param("spaceId") spaceId: string) {
    return this.projectService.findBySpace(spaceId);
  }

  @Post()
  create(@Param("spaceId") spaceId: string, @Body() data: { name: string }) {
    return this.projectService.create({ ...data, spaceId });
  }
}
```

#### 5. Create the Module

```typescript
// apps/api/src/project/project.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Project } from "./project.entity";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  providers: [ProjectService],
  controllers: [ProjectController],
  exports: [ProjectService],
})
export class ProjectModule {}
```

#### 6. Register in App Module

```typescript
// apps/api/src/app.module.ts
import { ProjectModule } from "./project/project.module";

@Module({
  imports: [
    // ... existing imports
    ProjectModule,
  ],
})
export class AppModule {}
```

#### 7. Test Your New Endpoint

```bash
# Create a project
curl -X POST http://localhost:8001/space/<space-id>/project \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My First Project"}'

# List projects
curl http://localhost:8001/space/<space-id>/project \
  -H "Authorization: Bearer <token>"
```

## Development Workflow Tips

### Hot Reload

Both API and web applications support hot reload:

- API: Changes trigger automatic restart
- Web: Changes trigger browser refresh

### Database Migrations

With `DB_SYNCHRONIZE=true`, schema changes are automatic in development. For production, use TypeORM migrations:

```bash
cd apps/api
npx typeorm migration:generate -n AddProjectsTable
npx typeorm migration:run
```

### Testing

```bash
# API tests
cd apps/api
npm test

# Web tests
cd apps/web
npm test
```

### Linting

```bash
# From root
npm run lint
```

## Common Development Tasks

| Task                | Command                                    |
| ------------------- | ------------------------------------------ |
| Start API           | `npm run start:api`                        |
| Start Web           | `npm run start:web`                        |
| Run API tests       | `cd apps/api && npm test`                  |
| Run Web tests       | `cd apps/web && npm test`                  |
| Generate user token | `npm run console:dev GetUserToken <id>`    |
| Database migrations | `cd apps/api && npx typeorm migration:run` |
| Lint code           | `npm run lint`                             |

## Next Steps

- [API Overview](../api/overview.md) - Deep dive into the API architecture
- [Authentication](../api/authentication/README.md) - Understand auth flows
- [Web Overview](../web/overview.md) - Learn about the Angular frontend
