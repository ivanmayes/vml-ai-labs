# Multi-tenancy Model

The VML Open Boilerplate implements a sophisticated multi-tenancy model that allows a single deployment to serve multiple organizations while maintaining complete data isolation. This guide explains how the tenant hierarchy works and how to work with it effectively.

## Tenant Hierarchy

The platform uses a three-level hierarchy:

```
Organization (Tenant)
│
├── Users
│   ├── SuperAdmin (full org access)
│   ├── Admin (manage users, settings)
│   └── User (basic access)
│
├── Spaces (Workspaces)
│   ├── SpaceUser (SpaceAdmin role)
│   ├── SpaceUser (SpaceEditor role)
│   └── SpaceUser (SpaceUser role)
│
├── Authentication Strategies
│   ├── Basic (email/code)
│   ├── Okta (OAuth)
│   └── SAML
│
├── API Keys
│   └── (Organization-scoped service tokens)
│
└── Settings
    └── (Organization-level configuration)
```

## Organizations

Organizations are the top-level tenant containers. Every piece of data in the system belongs to exactly one organization.

### Organization Entity

```typescript
@Entity()
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string; // URL-friendly identifier

  @Column({ type: "jsonb", nullable: true })
  settings: OrganizationSettings;

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true })
  defaultAuthenticationStrategyId: string;

  // Relationships
  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Space, (space) => space.organization)
  spaces: Space[];

  @OneToMany(() => AuthenticationStrategy, (strategy) => strategy.organization)
  authenticationStrategies: AuthenticationStrategy[];
}
```

### Organization Settings

Organizations can store custom configuration:

```typescript
interface OrganizationSettings {
  // Custom settings stored as JSONB
  features?: {
    enableSpaces?: boolean;
    maxUsers?: number;
  };
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
  // Add your own settings as needed
}
```

### Working with Organizations

**Create an organization:**

```typescript
const org = await organizationService.save({
  name: "Acme Corporation",
  slug: "acme-corp",
  settings: { features: { enableSpaces: true } },
});
```

**Find by slug (for login flows):**

```typescript
const org = await organizationService.findOne({
  where: { slug: "acme-corp" },
});
```

**Access in controllers:**

```typescript
@Get('settings')
async getSettings(@Param('orgId') orgId: string) {
  const org = await this.organizationService.findOne({
    where: { id: orgId },
  });
  return org.settings;
}
```

## Spaces

Spaces provide secondary scoping within an organization. They're useful for:

- Project workspaces
- Team separation
- Client isolation
- Access control boundaries

### Space Entity

```typescript
@Entity()
export class Space {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ type: "jsonb", nullable: true })
  settings: Record<string, any>;

  @Column({ default: false })
  isPublic: boolean;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  organization: Organization;

  @Column()
  organizationId: string;

  @OneToMany(() => SpaceUser, (spaceUser) => spaceUser.space)
  spaceUsers: SpaceUser[];

  // WPP Open integration
  @Column({ type: "simple-array", nullable: true })
  wppOpenApprovedTenantIds: string[];
}
```

### Space Visibility

Spaces can be public or private:

- **Private spaces**: Only space members can access
- **Public spaces**: All organization members can view (but not necessarily edit)

### Space Users

The SpaceUser entity connects users to spaces with specific roles:

```typescript
@Entity()
export class SpaceUser {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Space, { onDelete: "CASCADE" })
  space: Space;

  @Column()
  spaceId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user: User;

  @Column()
  userId: string;

  @Column({
    type: "enum",
    enum: SpaceRole,
    default: SpaceRole.SpaceUser,
  })
  role: SpaceRole;
}
```

### Space Roles

```typescript
enum SpaceRole {
  SpaceAdmin = "SpaceAdmin", // Full space control
  SpaceEditor = "SpaceEditor", // Edit content
  SpaceUser = "SpaceUser", // View only
}
```

## Users and Roles

### Organization Roles

Users have an organization-level role that defines their overall access:

```typescript
enum UserRole {
  SuperAdmin = "SuperAdmin", // Full system access
  Admin = "Admin", // Manage users and settings
  User = "User", // Basic access
}
```

### Role Hierarchy

```
SuperAdmin
├── Can do everything Admin can
├── Can manage other admins
├── Can delete the organization
└── Can access all spaces

Admin
├── Can manage users
├── Can manage spaces
├── Can manage settings
└── Cannot delete org or manage other admins

User
├── Can access assigned spaces
├── Can update own profile
└── Cannot manage other users
```

## Data Isolation

### Database Level

Every entity that needs organization scoping includes an `organizationId`:

```typescript
@Entity()
export class MyResource {
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  organization: Organization;

  @Column()
  organizationId: string;
}
```

The `CASCADE` delete ensures that when an organization is deleted, all related data is removed.

### Application Level

Guards enforce organization access:

```typescript
@Injectable()
export class HasOrganizationAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orgId = request.params.orgId;

    // User must belong to the requested organization
    return user.organizationId === orgId;
  }
}
```

### Query Scoping

Services should always scope queries by organization:

```typescript
@Injectable()
export class ResourceService {
  async findByOrganization(organizationId: string) {
    return this.repository.find({
      where: { organizationId },
    });
  }

  // BAD: Never expose unscoped queries
  // async findAll() { return this.repository.find(); }
}
```

## Multi-tenant Patterns

### Pattern 1: Controller with Organization Context

```typescript
@Controller("admin/organization/:orgId/resource")
@UseGuards(JwtAuthGuard, HasOrganizationAccessGuard)
export class ResourceController {
  @Get()
  findAll(@Param("orgId") orgId: string) {
    return this.resourceService.findByOrganization(orgId);
  }

  @Post()
  create(@Param("orgId") orgId: string, @Body() dto: CreateResourceDto) {
    return this.resourceService.create({ ...dto, organizationId: orgId });
  }
}
```

### Pattern 2: Accessing User's Organization

```typescript
@Controller("my/resource")
@UseGuards(JwtAuthGuard)
export class MyResourceController {
  @Get()
  findMine(@Request() req) {
    // User's organization from JWT
    const orgId = req.user.organizationId;
    return this.resourceService.findByOrganization(orgId);
  }
}
```

### Pattern 3: Space-Scoped Resources

```typescript
@Controller("space/:spaceId/resource")
@UseGuards(JwtAuthGuard, SpaceAccessGuard)
export class SpaceResourceController {
  @Get()
  findBySpace(@Param("spaceId") spaceId: string) {
    return this.resourceService.findBySpace(spaceId);
  }
}
```

## Cross-Tenant Considerations

### Never Mix Tenant Data

```typescript
// BAD: Mixing organizations
await this.repository.find({
  where: [{ organizationId: org1 }, { organizationId: org2 }],
});

// GOOD: Single organization scope
await this.repository.find({
  where: { organizationId: currentOrgId },
});
```

### System-Wide Resources

Some resources (like notification templates) can be shared:

```typescript
@Entity()
export class Notification {
  // Nullable organization = system-wide template
  @ManyToOne(() => Organization, { nullable: true })
  organization: Organization;

  @Column({ nullable: true })
  organizationId: string | null;
}

// Query with fallback to system templates
async findTemplate(slug: string, orgId: string) {
  // First try org-specific
  let template = await this.find({ slug, organizationId: orgId });

  // Fallback to system-wide
  if (!template) {
    template = await this.find({ slug, organizationId: null });
  }

  return template;
}
```

## Testing Multi-tenancy

Always test with multiple organizations:

```typescript
describe("ResourceController", () => {
  let org1, org2, user1, user2;

  beforeAll(async () => {
    org1 = await createOrganization("Org 1");
    org2 = await createOrganization("Org 2");
    user1 = await createUser(org1);
    user2 = await createUser(org2);
  });

  it("should not allow cross-org access", async () => {
    const resource = await createResource(org1);

    // User from org2 should not access org1's resource
    const response = await request(app)
      .get(`/admin/organization/${org1.id}/resource/${resource.id}`)
      .set("Authorization", `Bearer ${user2.token}`);

    expect(response.status).toBe(403);
  });
});
```

## Best Practices

1. **Always include organizationId** in entities that need tenant scoping
2. **Use guards** to enforce access at the controller level
3. **Scope all queries** by organization in services
4. **Test cross-tenant access** in your test suite
5. **Use CASCADE deletes** to clean up related data
6. **Validate organization access** before any data mutation
7. **Log organization context** for debugging and audit

## Next Steps

- [Database Schema](database-schema.md) - Entity relationships
- [Security Model](security.md) - Access control details
- [User Management](../modules/users.md) - User roles and permissions
