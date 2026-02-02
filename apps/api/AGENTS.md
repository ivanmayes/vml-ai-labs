# NestJS API Rules

This document contains context-specific rules for AI agents working in the NestJS API application.

## Quick Start

**ALWAYS start from the ROOT directory.** Both API and Web servers hot reload automatically.

```bash
# From ROOT directory - REQUIRED
npm start             # Starts both API and Web with hot reload
npm run dev           # Same as above

# Validation (from root)
npm run lint          # Run all linters
npm run validate      # Run linters + type checks
```

**Do NOT cd into apps/api to start the server.** Use root commands.

**Swagger UI** (when `SWAGGER_ENABLE=true`): http://localhost:8001/api

**Generate a test token**:

```bash
cd apps/api && npm run console:dev GetUserToken <user-id>
```

## Quick Reference

| Aspect        | Rule                       |
| ------------- | -------------------------- |
| ORM           | TypeORM with PostgreSQL    |
| Validation    | class-validator decorators |
| Documentation | Swagger/OpenAPI decorators |
| Auth          | JWT with Passport.js       |
| Primary Keys  | UUID                       |

## Entity Creation

### Use proper TypeORM decorators

```typescript
// ✅ Correct
import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';

@Entity('items')
export class Item {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ type: 'varchar', length: 255 })
	@Index()
	name: string;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	@ManyToOne(() => Organization, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'organization_id' })
	organization: Organization;

	@Column({ name: 'organization_id' })
	organizationId: string;

	@CreateDateColumn({ name: 'created_at' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt: Date;
}
```

### Entity naming conventions

- Entity class: PascalCase singular (`User`, `Organization`)
- Table name: snake_case plural (`users`, `organizations`)
- Column name in DB: snake_case (`created_at`, `organization_id`)
- Property name in code: camelCase (`createdAt`, `organizationId`)

## DTO Pattern

### Always use DTOs for request/response

```typescript
// ✅ Correct - DTO with validation
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ description: 'Item name', example: 'My Item' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Item description' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ❌ Wrong - Using entity directly
@Post()
async create(@Body() item: Item) { ... }
```

### Swagger documentation is required

```typescript
// ✅ All endpoints need Swagger decorators
@ApiOperation({ summary: 'Create a new item' })
@ApiResponse({ status: 201, description: 'Item created', type: Item })
@ApiResponse({ status: 400, description: 'Validation failed' })
@Post()
create(@Body() dto: CreateItemDto) { ... }

// ❌ Missing Swagger documentation
@Post()
create(@Body() dto: CreateItemDto) { ... }
```

## Controller Pattern

### Proper structure

```typescript
@ApiTags('items')
@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
	constructor(private readonly itemsService: ItemsService) {}

	@Get()
	@ApiOperation({ summary: 'List all items' })
	findAll(@Request() req): Promise<Item[]> {
		return this.itemsService.findByOrganization(req.user.organizationId);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get item by ID' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Item> {
		return this.itemsService.findOne(id);
	}

	@Post()
	@ApiOperation({ summary: 'Create item' })
	@ApiBody({ type: CreateItemDto })
	create(@Body() dto: CreateItemDto, @Request() req): Promise<Item> {
		return this.itemsService.create(dto, req.user);
	}
}
```

## Service Layer

### Single responsibility principle

```typescript
// ✅ Correct - Focused service
@Injectable()
export class ItemsService {
	constructor(
		@InjectRepository(Item)
		private readonly itemRepo: Repository<Item>,
	) {}

	async findOne(id: string): Promise<Item> {
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) {
			throw new NotFoundException(`Item ${id} not found`);
		}
		return item;
	}

	async create(dto: CreateItemDto, user: User): Promise<Item> {
		const item = this.itemRepo.create({
			...dto,
			organizationId: user.organizationId,
		});
		return this.itemRepo.save(item);
	}
}
```

### Use repository pattern

```typescript
// ✅ Correct - Repository injection
@InjectRepository(Item)
private readonly itemRepo: Repository<Item>

// ❌ Wrong - Direct EntityManager
private readonly em: EntityManager
```

## Security Rules

### Never log sensitive data

```typescript
// ✅ Correct
this.logger.log(`User ${user.id} logged in`);

// ❌ Wrong - Logging sensitive info
this.logger.log(`User logged in with password ${password}`);
this.logger.log(`API key used: ${apiKey}`);
```

### Always scope queries to organization

```typescript
// ✅ Correct - Organization scoped
async findAll(organizationId: string): Promise<Item[]> {
  return this.itemRepo.find({ where: { organizationId } });
}

// ❌ Wrong - No organization scope (data leak)
async findAll(): Promise<Item[]> {
  return this.itemRepo.find();
}
```

## Database Migrations

### Always use migrations for schema changes

```bash
# Generate migration from entity changes
npm run typeorm migration:generate -- -n AddItemsTable

# Run migrations
npm run typeorm migration:run
```

### Never use synchronize in production

```typescript
// ✅ Correct - development only
synchronize: process.env.NODE_ENV === 'development';

// ❌ Wrong - always sync
synchronize: true;
```

## Error Handling

### Use NestJS built-in exceptions

```typescript
// ✅ Correct
throw new NotFoundException(`Item ${id} not found`);
throw new BadRequestException('Invalid input');
throw new ForbiddenException('Access denied');
throw new UnauthorizedException('Invalid credentials');

// ❌ Wrong - Generic errors
throw new Error('Item not found');
throw new HttpException('Bad', 400);
```

## Before Creating a New Endpoint

1. **Check if endpoint already exists**: `grep -r "path-you-want" apps/api/src`
2. **Check the API manifest**: Look in `api-manifest.json` at the repo root
3. **Follow REST conventions**: GET (read), POST (create), PUT (update), DELETE (remove)
4. **Create DTOs** in `[module]/dtos/` folder with proper validation decorators
5. **Add Swagger decorators**: `@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@ApiTags`
6. **After creating**: Run `npm run api:manifest` to update the manifest

### Endpoint Naming Conventions

```typescript
// ✅ Correct - RESTful conventions
@Get()           // List resources
@Get(':id')      // Get single resource
@Post()          // Create resource
@Put(':id')      // Update resource
@Delete(':id')   // Delete resource

// ❌ Wrong - Action-based URLs
@Post('create-item')
@Get('fetch-all-items')
```

### Required Swagger Documentation

```typescript
@ApiTags('items')
@Controller('items')
export class ItemsController {
	@Get(':id')
	@ApiOperation({ summary: 'Get item by ID' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Item found', type: Item })
	@ApiResponse({ status: 404, description: 'Item not found' })
	findOne(@Param('id', ParseUUIDPipe) id: string) {
		// ...
	}
}
```

## Pre-Commit Checklist

**NEVER use `--no-verify` to bypass hooks without explicit user permission.** Fix issues instead.

Before committing changes to this app:

- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] All endpoints have Swagger documentation
- [ ] All DTOs have validation decorators
- [ ] No sensitive data logged
- [ ] Queries are organization-scoped
- [ ] New entities have proper indexes
- [ ] API manifest updated (`npm run api:manifest`)
