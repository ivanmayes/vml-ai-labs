# Organizations Module

Organizations are the top-level tenant containers in the VML Open Boilerplate. They provide complete data isolation between different tenants and enable multi-tenant SaaS deployments.

## Overview

Every piece of data in the system belongs to exactly one organization. This is enforced at both the database level (foreign keys) and application level (guards).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORGANIZATION                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  id: uuid                                                            │   │
│  │  name: "Acme Corporation"                                           │   │
│  │  slug: "acme-corp" (unique, URL-friendly)                           │   │
│  │  enabled: true                                                       │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│    ┌────────────────────────────┼────────────────────────────┐             │
│    │                            │                            │             │
│    ▼                            ▼                            ▼             │
│  ┌──────────┐             ┌──────────┐              ┌──────────────┐      │
│  │  Users   │             │  Spaces  │              │ Auth         │      │
│  │          │             │          │              │ Strategies   │      │
│  └──────────┘             └──────────┘              └──────────────┘      │
│                                                                             │
│  ┌──────────┐             ┌──────────┐              ┌──────────────┐      │
│  │ API Keys │             │Notificatn│              │  Settings    │      │
│  │          │             │ Templates│              │   (JSONB)    │      │
│  └──────────┘             └──────────┘              └──────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Organization Entity

```typescript
@Entity()
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string; // URL-friendly identifier

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: "jsonb", nullable: true })
  settings: OrganizationSettings;

  @Column({ nullable: true })
  redirectToSpace: boolean;

  // Default auth strategy for new users
  @ManyToOne(() => AuthenticationStrategy, { nullable: true })
  defaultAuthenticationStrategy: AuthenticationStrategy;

  @Column({ nullable: true })
  defaultAuthenticationStrategyId: string;

  // Relationships
  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Space, (space) => space.organization)
  spaces: Space[];

  @OneToMany(() => AuthenticationStrategy, (s) => s.organization)
  authenticationStrategies: AuthenticationStrategy[];

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created: Date;
}
```

## Organization Settings

Flexible JSONB configuration for organization-specific features:

```typescript
interface OrganizationSettings {
  features?: {
    enableSpaces?: boolean;
    maxUsers?: number;
    maxSpaces?: number;
    enableApiKeys?: boolean;
  };
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    faviconUrl?: string;
  };
  notifications?: {
    defaultFromEmail?: string;
    emailFooter?: string;
  };
  security?: {
    sessionTimeout?: number;
    requireMfa?: boolean;
    allowedDomains?: string[];
  };
  // Extend with custom settings as needed
  [key: string]: any;
}
```

## API Endpoints

### Public Endpoints

```typescript
// Get public organization info (no auth required)
GET /org/:slug/public

// Response
{
  "id": "uuid",
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "authenticationStrategies": [
    { "id": "uuid", "name": "Email Login", "type": "Basic" },
    { "id": "uuid", "name": "SSO", "type": "Okta" }
  ],
  "branding": {
    "logoUrl": "https://...",
    "primaryColor": "#007bff"
  }
}
```

### Admin Endpoints

```typescript
// Get full organization details
GET /admin/organization/:orgId
Authorization: Bearer <admin-jwt>

// Response
{
  "id": "uuid",
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "enabled": true,
  "settings": { ... },
  "defaultAuthenticationStrategyId": "uuid",
  "created": "2024-01-15T10:30:00Z"
}
```

```typescript
// Update organization
PUT /admin/organization/:orgId
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "name": "Acme Corporation Inc.",
  "settings": {
    "features": { "maxUsers": 100 },
    "branding": { "primaryColor": "#ff5722" }
  }
}
```

```typescript
// Get organization settings
GET /admin/organization/:orgId/settings
Authorization: Bearer <admin-jwt>

// Update settings only
PUT /admin/organization/:orgId/settings
Authorization: Bearer <superadmin-jwt>
Content-Type: application/json

{
  "features": { "enableSpaces": true },
  "security": { "requireMfa": true }
}
```

## Organization Service

```typescript
@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private repository: Repository<Organization>,
  ) {}

  // Find by slug (for login flows)
  async findBySlug(slug: string): Promise<Organization | null> {
    return this.repository.findOne({
      where: { slug },
      relations: ["authenticationStrategies", "defaultAuthenticationStrategy"],
    });
  }

  // Find by ID with relations
  async findOne(
    options: FindOneOptions<Organization>,
  ): Promise<Organization | null> {
    return this.repository.findOne(options).catch(() => null);
  }

  // Create new organization
  async create(data: Partial<Organization>): Promise<Organization> {
    // Normalize slug
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const org = this.repository.create({
      ...data,
      slug,
    });

    return this.repository.save(org);
  }

  // Update organization
  async update(org: Organization): Promise<Organization> {
    return this.repository.save(org);
  }

  // Enable/disable organization
  async setEnabled(orgId: string, enabled: boolean): Promise<Organization> {
    const org = await this.findOne({ where: { id: orgId } });
    org.enabled = enabled;
    return this.update(org);
  }

  // Update settings (merge with existing)
  async updateSettings(
    orgId: string,
    settings: Partial<OrganizationSettings>,
  ): Promise<Organization> {
    const org = await this.findOne({ where: { id: orgId } });
    org.settings = { ...org.settings, ...settings };
    return this.update(org);
  }
}
```

## Organization Controller

```typescript
@Controller()
export class OrganizationController {
  constructor(private orgService: OrganizationService) {}

  // Public endpoint - no auth required
  @Get("org/:slug/public")
  async getPublic(@Param("slug") slug: string): Promise<ResponseEnvelope> {
    const org = await this.orgService.findBySlug(slug);

    if (!org || !org.enabled) {
      return new ResponseEnvelope(
        ResponseStatus.Failure,
        "Organization not found",
      );
    }

    return new ResponseEnvelope(ResponseStatus.Success, null, org.toPublic());
  }

  // Admin endpoint
  @Get("admin/organization/:orgId")
  @UseGuards(AuthGuard(), HasOrganizationAccessGuard)
  async get(@Param("orgId") orgId: string): Promise<ResponseEnvelope> {
    const org = await this.orgService.findOne({
      where: { id: orgId },
      relations: ["authenticationStrategies"],
    });

    return new ResponseEnvelope(ResponseStatus.Success, null, org);
  }

  // Update organization
  @Put("admin/organization/:orgId")
  @UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  async update(
    @Param("orgId") orgId: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<ResponseEnvelope> {
    const org = await this.orgService.findOne({ where: { id: orgId } });
    Object.assign(org, dto);
    const updated = await this.orgService.update(org);

    return new ResponseEnvelope(
      ResponseStatus.Success,
      "Organization updated",
      updated,
    );
  }

  // Update settings (SuperAdmin only)
  @Put("admin/organization/:orgId/settings")
  @UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
  @Roles(UserRole.SuperAdmin)
  async updateSettings(
    @Param("orgId") orgId: string,
    @Body() settings: OrganizationSettings,
  ): Promise<ResponseEnvelope> {
    const org = await this.orgService.updateSettings(orgId, settings);
    return new ResponseEnvelope(
      ResponseStatus.Success,
      "Settings updated",
      org,
    );
  }
}
```

## CLI Commands

### Create Organization

```bash
npm run console:dev InstallOrganization
```

Interactive prompts:

1. Enter organization name
2. Enter slug (URL-friendly identifier)

The command creates an organization and outputs its ID for use in web configuration.

## Entity Serialization

```typescript
class Organization {
  // Public info for login pages
  toPublic(
    includeFields?: string[],
    excludeFields?: string[],
  ): Partial<Organization> {
    const base = {
      id: this.id,
      name: this.name,
      slug: this.slug,
      branding: this.settings?.branding,
      authenticationStrategies: this.authenticationStrategies?.map((s) =>
        s.toPublic(),
      ),
    };

    // Apply include/exclude filters
    return this.filterFields(base, includeFields, excludeFields);
  }

  // Full details for admins
  toAdmin(): Organization {
    return {
      ...this,
      authenticationStrategies: this.authenticationStrategies?.map((s) =>
        s.toPublic(),
      ),
    };
  }
}
```

## Organization Access Guard

Ensures users can only access their own organization:

```typescript
@Injectable()
export class HasOrganizationAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orgId = request.params.orgId;

    // SuperAdmin can access all organizations
    if (user.role === UserRole.SuperAdmin) {
      return true;
    }

    // User must belong to the organization
    if (user.organizationId === orgId) {
      return true;
    }

    // API key must have scope for this organization
    if (request.apiKeyScopes?.organizationIds?.includes(orgId)) {
      return true;
    }

    return false;
  }
}
```

## Multi-Organization Patterns

### Subdomain-Based Routing

```typescript
// Extract organization from subdomain
const getOrgFromSubdomain = (req: Request): string => {
  const host = req.headers.host;
  const subdomain = host.split(".")[0];
  return subdomain;
};

// Middleware to set organization context
app.use(async (req, res, next) => {
  const slug = getOrgFromSubdomain(req);
  const org = await orgService.findBySlug(slug);
  req.organization = org;
  next();
});
```

### Path-Based Routing

```typescript
// Organization in URL path
// /org/acme-corp/dashboard
// /org/widget-inc/users

@Controller("org/:slug")
export class OrgScopedController {
  @Get("dashboard")
  dashboard(@Param("slug") slug: string) {
    // Use slug to find organization
  }
}
```

## Best Practices

1. **Slug Validation**: Normalize slugs to lowercase with hyphens only
2. **Settings Schema**: Document expected settings structure
3. **Cascade Deletes**: Organization deletion removes all related data
4. **Feature Flags**: Use settings.features for org-specific capabilities
5. **Branding**: Store branding in settings for white-label deployments

## Next Steps

- [Multi-tenancy](../architecture/multi-tenancy.md) - Data isolation patterns
- [Users](users.md) - User management within organizations
- [Spaces](spaces.md) - Workspaces within organizations
