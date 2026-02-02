# Users Module

The Users module manages user accounts, profiles, and authentication within organizations. It provides a complete user lifecycle from creation to deactivation.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER MANAGEMENT                                 │
│                                                                              │
│  ┌────────────────┐                                                         │
│  │  Organization  │                                                         │
│  └───────┬────────┘                                                         │
│          │ has many                                                         │
│          ▼                                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                           USER                                      │    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │  │    Email     │  │   Profile    │  │     Role     │             │    │
│  │  │  (unique per │  │  (encrypted) │  │ (SuperAdmin, │             │    │
│  │  │     org)     │  │              │  │  Admin, etc) │             │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │  │ Auth Strategy│  │  Permissions │  │ Space Access │             │    │
│  │  │              │  │              │  │              │             │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## User Entity

```typescript
@Entity()
@Unique(["emailNormalized", "organization"])
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  email: string;

  @Column()
  emailNormalized: string;  // Lowercase for unique constraint

  @Column({ type: "enum", enum: UserRole, default: UserRole.User })
  role: UserRole;

  // Encrypted profile data
  @Column({ name: "_privateProfile", nullable: true })
  private _privateProfile: string;

  // Profile getter/setter handles encryption
  get profile(): UserProfile { ... }
  set profile(value: UserProfile) { ... }

  // Active JWT tokens for multi-session support
  @Column("text", { array: true, default: [] })
  authTokens: string[];

  @Column({ type: "enum", enum: UserActivationStatus, default: "pending" })
  activationStatus: UserActivationStatus;

  @Column({ default: false })
  deactivated: boolean;

  // Passwordless login code
  @Column({ type: "jsonb", nullable: true })
  singlePass: { hash: string; expires: Date } | null;

  // SAML challenge token
  @Column({ nullable: true })
  authChallenge: string;

  // Relationships
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  organization: Organization;

  @ManyToOne(() => AuthenticationStrategy, { nullable: true, onDelete: "CASCADE" })
  authenticationStrategy: AuthenticationStrategy;

  @OneToMany(() => Permission, (p) => p.user, { onDelete: "CASCADE" })
  permissions: Permission[];

  @OneToMany(() => SpaceUser, (su) => su.user, { onDelete: "CASCADE" })
  spaceUsers: SpaceUser[];
}
```

## User Roles

```typescript
enum UserRole {
  SuperAdmin = "SuperAdmin", // Full system access
  Admin = "Admin", // Organization management
  Manager = "Manager", // Team management
  User = "User", // Standard access
  Guest = "Guest", // Limited access
}
```

### Role Capabilities

| Role       | Org Settings | User Mgmt | Space Mgmt | Own Profile |
| ---------- | ------------ | --------- | ---------- | ----------- |
| SuperAdmin | ✅           | ✅        | ✅         | ✅          |
| Admin      | ✅           | ✅        | ✅         | ✅          |
| Manager    | ❌           | Limited   | Limited    | ✅          |
| User       | ❌           | ❌        | ❌         | ✅          |
| Guest      | ❌           | ❌        | ❌         | Limited     |

## User Profile

User profiles are encrypted at rest:

```typescript
interface UserProfile {
  firstName?: string;
  lastName?: string;
  avatar?: string;
  phone?: string;
  timezone?: string;
  locale?: string;
  metadata?: Record<string, any>;
}
```

### Profile Encryption

```typescript
// Profile getter decrypts automatically
get profile(): UserProfile {
  if (!this._privateProfile) return {};
  return JSON.parse(
    Crypt.decrypt(this._privateProfile, key, iv)
  );
}

// Profile setter encrypts automatically
set profile(value: UserProfile) {
  this._privateProfile = Crypt.encrypt(
    JSON.stringify(value),
    key,
    iv
  );
}
```

## API Endpoints

### User Management (Admin)

```typescript
// List users in organization
GET /admin/organization/:orgId/user
Authorization: Bearer <admin-jwt>

// Response
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "role": "User",
      "profile": { "firstName": "John", "lastName": "Doe" },
      "activationStatus": "activated"
    }
  ]
}
```

```typescript
// Create user
POST /admin/organization/:orgId/user
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "role": "User",
  "profile": {
    "firstName": "Jane",
    "lastName": "Smith"
  },
  "authenticationStrategyId": "strategy-uuid"
}
```

```typescript
// Update user
PUT /admin/organization/:orgId/user/:userId
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "role": "Admin",
  "profile": {
    "firstName": "Jane",
    "lastName": "Smith-Jones"
  }
}
```

```typescript
// Search users with pagination
POST /admin/organization/:orgId/user/find
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "query": "john",
  "role": "User",
  "page": 1,
  "pageSize": 20
}
```

### User Self-Service

```typescript
// Get own profile
GET /auth/me
Authorization: Bearer <jwt>

// Update own profile
PUT /auth/me
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "profile": {
    "firstName": "John",
    "lastName": "Updated"
  }
}
```

## User Service

```typescript
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // Find users by organization
  async findByOrganization(orgId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { organizationId: orgId },
      relations: ["permissions", "authenticationStrategy"],
      order: { email: "ASC" },
    });
  }

  // Find single user with relations
  async findOne(options: FindOneOptions<User>): Promise<User | null> {
    return this.userRepository.findOne(options).catch(() => null);
  }

  // Create new user
  async create(data: Partial<User>): Promise<User> {
    const user = this.userRepository.create({
      ...data,
      emailNormalized: data.email.toLowerCase(),
    });
    return this.userRepository.save(user);
  }

  // Update user
  async update(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  // Ban/unban user
  async setDeactivated(userId: string, deactivated: boolean): Promise<User> {
    const user = await this.findOne({ where: { id: userId } });
    user.deactivated = deactivated;
    if (deactivated) {
      user.authTokens = []; // Revoke all sessions
    }
    return this.update(user);
  }

  // Promote user role
  async promoteUser(userId: string, newRole: UserRole): Promise<User> {
    const user = await this.findOne({ where: { id: userId } });
    user.role = newRole;
    return this.update(user);
  }
}
```

## User Controller

```typescript
@Controller("admin/organization/:orgId/user")
@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
@Roles(UserRole.Admin, UserRole.SuperAdmin)
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  async findAll(@Param("orgId") orgId: string): Promise<User[]> {
    const users = await this.userService.findByOrganization(orgId);
    return users.map((u) => u.toAdmin());
  }

  @Post()
  async create(
    @Param("orgId") orgId: string,
    @Body() dto: CreateUserDto,
  ): Promise<User> {
    const user = await this.userService.create({
      ...dto,
      organizationId: orgId,
    });
    return user.toAdmin();
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    const user = await this.userService.findOne({ where: { id } });
    Object.assign(user, dto);
    const updated = await this.userService.update(user);
    return updated.toAdmin();
  }

  @Post(":id/ban")
  async ban(@Param("id") id: string): Promise<User> {
    return this.userService.setDeactivated(id, true);
  }

  @Post(":id/unban")
  async unban(@Param("id") id: string): Promise<User> {
    return this.userService.setDeactivated(id, false);
  }

  @Post(":id/promote")
  async promote(
    @Param("id") id: string,
    @Body() dto: PromoteUserDto,
  ): Promise<User> {
    return this.userService.promoteUser(id, dto.role);
  }
}
```

## Activation Status

```typescript
enum UserActivationStatus {
  Pending = "pending", // Awaiting first login
  Activated = "activated", // Has logged in
}
```

Users start as `pending` and become `activated` after their first successful login.

## CLI Commands

### Create User

```bash
npm run console:dev InstallUser
```

Interactive prompts:

1. Select organization
2. Select authentication strategy
3. Enter email
4. Enter first name
5. Enter last name
6. Select role

### Get User Token

```bash
npm run console:dev GetUserToken <user-id>
```

Outputs a valid JWT for testing.

## Entity Serialization

```typescript
class User {
  // Safe for external/public exposure
  toPublic(): Partial<User> {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      profile: this.profile,
    };
  }

  // Includes admin-level details
  toAdmin(): Partial<User> {
    return {
      ...this.toPublic(),
      permissions: this.permissions?.map((p) => p.toPublic()),
      activationStatus: this.activationStatus,
      deactivated: this.deactivated,
      authenticationStrategyId: this.authenticationStrategyId,
    };
  }

  // Minimal for lists/dropdowns
  toMinimal(): Partial<User> {
    return {
      id: this.id,
      email: this.email,
    };
  }
}
```

## Best Practices

1. **Email Uniqueness**: Emails are unique per organization, not globally
2. **Profile Encryption**: Always use the profile getter/setter
3. **Role Changes**: Log role promotions for audit
4. **Deactivation**: Prefer deactivation over deletion for data integrity
5. **Token Management**: Clear tokens when banning users

## Next Steps

- [Permissions](permissions.md) - Fine-grained access control
- [Organizations](organizations.md) - Tenant management
- [Spaces](spaces.md) - Workspace membership
