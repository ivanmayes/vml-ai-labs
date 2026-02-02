# Database Schema

The VML Open Boilerplate uses PostgreSQL with TypeORM as the ORM layer. This guide covers all entities, their relationships, and database design patterns.

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORGANIZATION                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  id (UUID PK)                                                        │   │
│  │  name, slug (unique), enabled, settings (JSONB)                      │   │
│  │  defaultAuthenticationStrategyId (FK)                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         │                    │                    │                         │
│         │ 1:N                │ 1:N                │ 1:N                     │
│         ▼                    ▼                    ▼                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐       │
│  │    USER     │     │    SPACE    │     │ AUTHENTICATION_STRATEGY │       │
│  │             │     │             │     │                         │       │
│  │ id (PK)     │     │ id (PK)     │     │ id (PK)                 │       │
│  │ email       │     │ name        │     │ name                    │       │
│  │ role        │     │ isPublic    │     │ type (Basic/Okta/SAML)  │       │
│  │ profile     │     │ settings    │     │ config (JSONB)          │       │
│  │ authTokens[]│     │             │     │                         │       │
│  └──────┬──────┘     └──────┬──────┘     └─────────────────────────┘       │
│         │                   │                                               │
│         │ 1:N               │ 1:N                                           │
│         ▼                   ▼                                               │
│  ┌─────────────┐     ┌─────────────┐                                       │
│  │ PERMISSION  │     │ SPACE_USER  │ ◄── Junction table                    │
│  │             │     │             │     (User ↔ Space with role)          │
│  │ id (PK)     │     │ id (PK)     │                                       │
│  │ userId (FK) │     │ spaceId (FK)│                                       │
│  │ type        │     │ userId (FK) │                                       │
│  └─────────────┘     │ role        │                                       │
│                      └─────────────┘                                       │
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐       │
│  │   API_KEY   │────▶│ API_KEY_LOG │     │     NOTIFICATION        │       │
│  │             │ 1:N │             │     │                         │       │
│  │ id (PK)     │     │ id (PK)     │     │ id (PK)                 │       │
│  │ key (enc)   │     │ apiKeyId(FK)│     │ slug, locale            │       │
│  │ orgId (FK)  │     │ endpoint    │     │ subject, templates      │       │
│  │ expires     │     │ meta        │     │ organizationId (FK,null)│       │
│  └─────────────┘     └─────────────┘     └─────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Entities

### Organization

The top-level tenant container. All data in the system belongs to exactly one organization.

```typescript
@Entity()
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string; // URL-friendly identifier (e.g., "acme-corp")

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: "jsonb", nullable: true })
  settings: OrganizationSettings;

  @Column({ nullable: true })
  redirectToSpace: boolean;

  // Default authentication strategy for new users
  @ManyToOne(() => AuthenticationStrategy, { nullable: true })
  defaultAuthenticationStrategy: AuthenticationStrategy;

  @Column({ nullable: true })
  defaultAuthenticationStrategyId: string;

  // Relationships
  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => AuthenticationStrategy, (strategy) => strategy.organization)
  authenticationStrategies: AuthenticationStrategy[];

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created: Date;
}
```

**Key characteristics:**

- `slug` is unique across all organizations and used in URLs
- `settings` stores arbitrary JSON configuration
- Cascades to users and auth strategies on delete
- `toPublic()` method filters sensitive fields

### User

Represents authenticated users within an organization.

```typescript
@Entity()
@Unique(["emailNormalized", "organization"])
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  email: string;

  @Column()
  emailNormalized: string; // Lowercase for unique constraint

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.User,
  })
  role: UserRole;

  // Encrypted profile data
  @Column({ name: "_privateProfile", nullable: true })
  private _privateProfile: string;

  // Multi-session support: array of active JWT tokens
  @Column("text", { array: true, default: [] })
  authTokens: string[];

  @Column({
    type: "enum",
    enum: UserActivationStatus,
    default: UserActivationStatus.Pending,
  })
  activationStatus: UserActivationStatus;

  @Column({ default: false })
  deactivated: boolean;

  // Passwordless login: temporary one-time code
  @Column({ type: "jsonb", nullable: true })
  singlePass: { hash: string; expires: Date } | null;

  // SAML challenge for SSO flows
  @Column({ nullable: true })
  authChallenge: string;

  // Relationships
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  organization: Organization;

  @Column()
  organizationId: string;

  @ManyToOne(() => AuthenticationStrategy, {
    nullable: true,
    onDelete: "CASCADE",
  })
  authenticationStrategy: AuthenticationStrategy;

  @OneToMany(() => Permission, (permission) => permission.user, {
    onDelete: "CASCADE",
  })
  permissions: Permission[];

  @OneToMany(() => SpaceUser, (spaceUser) => spaceUser.user, {
    onDelete: "CASCADE",
  })
  spaceUsers: SpaceUser[];
}
```

**Key characteristics:**

- Email uniqueness is scoped to organization (same email can exist in different orgs)
- Profile data is encrypted at rest using AES-256
- Supports multiple active sessions via `authTokens` array
- `singlePass` enables passwordless email-code authentication
- `toPublic()` and `toAdmin()` methods for different serialization levels

### User Roles

```typescript
enum UserRole {
  SuperAdmin = "SuperAdmin", // Full system access
  Admin = "Admin", // Organization management
  Manager = "Manager", // Team management
  User = "User", // Standard access
  Guest = "Guest", // Limited access
}
```

### AuthenticationStrategy

Configures how users authenticate within an organization.

```typescript
@Entity()
export class AuthenticationStrategy {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({
    type: "enum",
    enum: AuthenticationStrategyType,
  })
  type: AuthenticationStrategyType;

  // Polymorphic configuration based on type
  @Column({ type: "jsonb" })
  config: BasicConfig | OktaConfig | SAMLConfig;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  organization: Organization;

  @Column()
  organizationId: string;
}
```

**Configuration types:**

```typescript
// Basic email/code authentication
interface BasicConfig {
  codeLength: number; // Default: 6
  codeLifetimeMinutes: number; // Default: 5
}

// Okta OAuth/OIDC integration
interface OktaConfig {
  clientId: string;
  domain: string;
  strategyType: "OpenID Connect" | "OAuth2" | "SAML";
  uiType: "redirect" | "widget";
}

// SAML 2.0 configuration
interface SAMLConfig {
  entryPoint: string;
  issuer: string;
  cert: string;
}
```

### Space

Workspaces within an organization for project/team separation.

```typescript
@Entity()
@Index(["organizationId"])
export class Space {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ type: "jsonb", nullable: true })
  settings: Record<string, any>;

  @Column({ default: true })
  isPublic: boolean; // Visible to all org members

  // WPP Open integration
  @Column({ type: "simple-array", nullable: true })
  approvedWPPOpenTenantIds: string[];

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  organization: Organization;

  @Column()
  organizationId: string;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created: Date;
}
```

**Key characteristics:**

- `isPublic` controls visibility to all organization members
- Private spaces require explicit membership via SpaceUser
- Indexed on `organizationId` for efficient queries

### SpaceUser

Junction table connecting users to spaces with role-based access.

```typescript
@Entity()
@Index(["spaceId", "userId"], { unique: true })
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Space roles:**

```typescript
enum SpaceRole {
  SpaceAdmin = "admin", // Full space control
  SpaceUser = "user", // View/edit access
}
```

### Permission

Fine-grained permissions for specific actions.

```typescript
@Entity()
export class Permission {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user: User;

  @Column()
  userId: string;

  @Column({
    type: "enum",
    enum: PermissionType,
  })
  type: PermissionType;
}
```

**Permission types:**

```typescript
enum PermissionType {
  PIIExport = "PIIExport",
  CampaignSelectWinner = "CampaignSelectWinner",
  CampaignResetPrizeListings = "CampaignResetPrizeListings",
  EntrantViewIdentifiers = "EntrantViewIdentifiers",
  EntrantViewFulfillment = "EntrantViewFulfillment",
  EntrantContact = "EntrantContact",
  EntrantBanIP = "EntrantBanIP",
  EntrantBanID = "EntrantBanID",
  EntryConfirm = "EntryConfirm",
}
```

### ApiKey

Service-to-service authentication tokens.

```typescript
@Entity()
export class ApiKey {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  // Encrypted with SHA256 + AES
  @Column({ unique: true })
  key: string;

  @ManyToOne(() => Organization)
  organization: Organization;

  @Column()
  organizationId: string;

  @Column({ default: false })
  revoked: boolean;

  @Column({ type: "timestamptz", nullable: true })
  expires: Date | null;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created: Date;
}
```

**Key characteristics:**

- Keys are 128 bytes, encrypted before storage
- Supports optional expiration
- Can be revoked without deletion
- Logged via ApiKeyLog for audit

### ApiKeyLog

Audit trail for API key usage.

```typescript
@Entity()
export class ApiKeyLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => ApiKey)
  apiKey: ApiKey;

  @Column()
  apiKeyId: string;

  @Column()
  endpoint: string;

  @Column({ type: "jsonb", nullable: true })
  meta: Record<string, any>;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created: Date;
}
```

### Notification

Email templates with localization support.

```typescript
@Entity()
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  slug: string; // Template identifier (e.g., "welcome-email")

  @Column({ default: "en-US" })
  locale: string;

  @Column()
  subject: string;

  @Column({ type: "text", nullable: true })
  templateHtml: string;

  @Column({ type: "text", nullable: true })
  templateText: string;

  @Column({ nullable: true })
  templateRemoteId: string; // External template ID (SendGrid, etc.)

  // Nullable = system-wide template
  @ManyToOne(() => Organization, { nullable: true, onDelete: "CASCADE" })
  organization: Organization;

  @Column({ nullable: true })
  organizationId: string;

  @Column({ nullable: true })
  triggerType: string;

  @Column({ nullable: true })
  triggerValue: string;

  @Column({ type: "jsonb", nullable: true })
  mergeTagMap: Record<string, string>;
}
```

**Key characteristics:**

- `organizationId = null` means system-wide template
- Supports multiple locales per slug
- Templates use Handlebars syntax
- `mergeTagMap` defines available substitution variables

## Database Patterns

### Cascading Deletes

All child entities use `onDelete: "CASCADE"` to ensure data cleanup:

```typescript
@ManyToOne(() => Organization, { onDelete: "CASCADE" })
organization: Organization;
```

When an organization is deleted:

- All users are deleted
- All spaces are deleted
- All auth strategies are deleted
- All API keys are deleted
- All notifications are deleted

### UUID Primary Keys

All entities use UUIDs for distributed-friendly identifiers:

```typescript
@PrimaryGeneratedColumn("uuid")
id: string;
```

### JSONB for Flexible Schema

Settings and configuration use PostgreSQL JSONB:

```typescript
@Column({ type: "jsonb", nullable: true })
settings: Record<string, any>;
```

Benefits:

- Schema flexibility without migrations
- PostgreSQL indexing on JSON paths
- Native JSON operators in queries

### Encrypted Fields

Sensitive data uses column transformers for automatic encryption:

```typescript
@Column({
  transformer: {
    to: (value) => Crypt.encrypt(value, key, iv),
    from: (value) => Crypt.decrypt(value, key, iv),
  },
})
sensitiveField: string;
```

### Timestamp Columns

All temporal data uses PostgreSQL timestamptz:

```typescript
@Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
created: Date;

@CreateDateColumn()
createdAt: Date;

@UpdateDateColumn()
updatedAt: Date;
```

## Indexes

### Explicit Indexes

```typescript
// Space: fast queries by organization
@Index(["organizationId"])

// SpaceUser: prevent duplicate memberships
@Index(["spaceId", "userId"], { unique: true })
```

### Implicit Indexes

TypeORM creates indexes automatically for:

- Primary keys (`id`)
- Foreign keys (`organizationId`, `userId`, etc.)
- Unique columns (`slug`, `key`, etc.)

## Migrations

### Development Mode

With `DB_SYNCHRONIZE=true`, TypeORM automatically syncs schema changes:

```env
DB_SYNCHRONIZE=true  # Only for development!
```

### Production Mode

Generate and run migrations manually:

```bash
# Generate migration from entity changes
npx typeorm migration:generate -n DescriptiveName

# Run pending migrations
npx typeorm migration:run

# Revert last migration
npx typeorm migration:revert
```

## Query Patterns

### Organization-Scoped Queries

Always filter by organization for tenant isolation:

```typescript
// CORRECT
const users = await this.userRepository.find({
  where: { organizationId: currentOrgId },
});

// WRONG - exposes cross-tenant data
const users = await this.userRepository.find();
```

### Eager Loading

Load relationships when needed:

```typescript
const user = await this.userRepository.findOne({
  where: { id },
  relations: ["permissions", "spaceUsers", "spaceUsers.space"],
});
```

### Pagination

Use skip/take for large datasets:

```typescript
const users = await this.userRepository.find({
  where: { organizationId },
  skip: (page - 1) * pageSize,
  take: pageSize,
  order: { created: "DESC" },
});
```

## Next Steps

- [Security Model](security.md) - Access control implementation
- [API Overview](../api/overview.md) - How entities are exposed via REST
- [Multi-tenancy](multi-tenancy.md) - Tenant isolation patterns
