# Spaces Module

Spaces provide secondary scoping within an organization, enabling workspaces, projects, or team isolation without the overhead of separate organizations.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ORGANIZATION                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           SPACES                                     │   │
│  │                                                                      │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │   │
│  │  │   Project A  │    │   Project B  │    │  Client XYZ  │          │   │
│  │  │   (Public)   │    │  (Private)   │    │  (Private)   │          │   │
│  │  │              │    │              │    │              │          │   │
│  │  │  All org     │    │  Members     │    │  Members     │          │   │
│  │  │  members     │    │  only        │    │  only        │          │   │
│  │  │  can view    │    │              │    │              │          │   │
│  │  └──────────────┘    └──────────────┘    └──────────────┘          │   │
│  │                                                                      │   │
│  │  Space Members (SpaceUser):                                         │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                   │   │
│  │  │ SpaceAdmin │  │ SpaceUser  │  │ SpaceUser  │                   │   │
│  │  │ (manage)   │  │ (access)   │  │ (access)   │                   │   │
│  │  └────────────┘  └────────────┘  └────────────┘                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Use Cases

| Use Case                | Description                                  |
| ----------------------- | -------------------------------------------- |
| **Project Workspaces**  | Separate projects with different team access |
| **Client Isolation**    | Keep client data/work separate               |
| **Team Separation**     | Marketing, Engineering, Sales spaces         |
| **Environment Scoping** | Dev, Staging, Production spaces              |
| **Feature Rollout**     | Beta features in specific spaces             |

## Space Entity

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
  isPublic: boolean;

  // WPP Open integration
  @Column({ type: "simple-array", nullable: true })
  approvedWPPOpenTenantIds: string[];

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  organization: Organization;

  @Column()
  organizationId: string;

  @OneToMany(() => SpaceUser, (su) => su.space)
  spaceUsers: SpaceUser[];

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created: Date;
}
```

## Space Visibility

### Public Spaces

- All organization members can view
- No membership required for read access
- Still requires organization membership

```typescript
// Public space - all org members can access
const space = await spaceService.create({
  name: "Company Announcements",
  isPublic: true,
  organizationId: org.id,
});
```

### Private Spaces

- Only space members can access
- Requires explicit SpaceUser entry
- Used for sensitive projects/clients

```typescript
// Private space - members only
const space = await spaceService.create({
  name: "Client XYZ Project",
  isPublic: false,
  organizationId: org.id,
});

// Add a member
await spaceUserService.create({
  spaceId: space.id,
  userId: user.id,
  role: SpaceRole.SpaceUser,
});
```

## SpaceUser Entity

Junction table connecting users to spaces with roles:

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

  @Column({ type: "enum", enum: SpaceRole, default: SpaceRole.SpaceUser })
  role: SpaceRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

## Space Roles

```typescript
enum SpaceRole {
  SpaceAdmin = "admin", // Full space control
  SpaceUser = "user", // Access and contribute
}
```

### Role Capabilities

| Action             | SpaceAdmin | SpaceUser | Org Admin |
| ------------------ | ---------- | --------- | --------- |
| View space         | ✅         | ✅        | ✅        |
| Edit space content | ✅         | ✅        | ✅        |
| Manage settings    | ✅         | ❌        | ✅        |
| Add/remove members | ✅         | ❌        | ✅        |
| Delete space       | ❌         | ❌        | ✅        |

## API Endpoints

### Admin Endpoints

```typescript
// List all spaces in organization
GET /admin/organization/:orgId/spaces
Authorization: Bearer <admin-jwt>

// Response
[
  {
    "id": "uuid",
    "name": "Project Alpha",
    "isPublic": false,
    "created": "2024-01-15T10:30:00Z"
  }
]
```

```typescript
// Create space
POST /admin/organization/:orgId/spaces
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "name": "New Project",
  "isPublic": false,
  "settings": {
    "description": "A new project space"
  }
}
```

```typescript
// Update space
PUT /admin/organization/:orgId/spaces/:spaceId
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "name": "Renamed Project",
  "isPublic": true
}
```

```typescript
// Delete space
DELETE /admin/organization/:orgId/spaces/:spaceId
Authorization: Bearer <admin-jwt>
```

### Space Member Endpoints

```typescript
// List space members
GET /space/:spaceId/members
Authorization: Bearer <jwt>

// Add member
POST /space/:spaceId/members
Authorization: Bearer <space-admin-jwt>
Content-Type: application/json

{
  "userId": "user-uuid",
  "role": "user"
}

// Update member role
PUT /space/:spaceId/members/:userId
Authorization: Bearer <space-admin-jwt>
Content-Type: application/json

{
  "role": "admin"
}

// Remove member
DELETE /space/:spaceId/members/:userId
Authorization: Bearer <space-admin-jwt>
```

### User Endpoints

```typescript
// Get space details (requires access)
GET /space/:spaceId
Authorization: Bearer <jwt>

// Get user's spaces
GET /my/spaces
Authorization: Bearer <jwt>
```

## Space Service

```typescript
@Injectable()
export class SpaceService {
  constructor(
    @InjectRepository(Space)
    private repository: Repository<Space>,
  ) {}

  async findByOrganization(orgId: string): Promise<Space[]> {
    return this.repository.find({
      where: { organizationId: orgId },
      order: { name: "ASC" },
    });
  }

  async findOne(options: FindOneOptions<Space>): Promise<Space | null> {
    return this.repository.findOne(options).catch(() => null);
  }

  async create(data: Partial<Space>): Promise<Space> {
    const space = this.repository.create(data);
    return this.repository.save(space);
  }

  async update(space: Space): Promise<Space> {
    return this.repository.save(space);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  // Get spaces user can access
  async findAccessibleSpaces(userId: string, orgId: string): Promise<Space[]> {
    return this.repository
      .createQueryBuilder("space")
      .leftJoin("space.spaceUsers", "su")
      .where("space.organizationId = :orgId", { orgId })
      .andWhere("(space.isPublic = true OR su.userId = :userId)", { userId })
      .getMany();
  }
}
```

## SpaceUser Service

```typescript
@Injectable()
export class SpaceUserService {
  constructor(
    @InjectRepository(SpaceUser)
    private repository: Repository<SpaceUser>,
  ) {}

  async hasSpaceAccess(userId: string, spaceId: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { userId, spaceId },
    });
    return count > 0;
  }

  async isUserSpaceAdmin(userId: string, spaceId: string): Promise<boolean> {
    const membership = await this.repository.findOne({
      where: { userId, spaceId, role: SpaceRole.SpaceAdmin },
    });
    return !!membership;
  }

  async addMember(
    spaceId: string,
    userId: string,
    role: SpaceRole,
  ): Promise<SpaceUser> {
    const spaceUser = this.repository.create({
      spaceId,
      userId,
      role,
    });
    return this.repository.save(spaceUser);
  }

  async removeMember(spaceId: string, userId: string): Promise<void> {
    await this.repository.delete({ spaceId, userId });
  }

  async updateRole(
    spaceId: string,
    userId: string,
    role: SpaceRole,
  ): Promise<SpaceUser> {
    const membership = await this.repository.findOne({
      where: { spaceId, userId },
    });
    membership.role = role;
    return this.repository.save(membership);
  }
}
```

## Space Access Guard

```typescript
@Injectable()
export class SpaceAccessGuard implements CanActivate {
  constructor(
    private spaceService: SpaceService,
    private spaceUserService: SpaceUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const spaceId = request.params.spaceId;

    // Org admins can access all spaces
    if ([UserRole.SuperAdmin, UserRole.Admin].includes(user.role)) {
      return true;
    }

    const space = await this.spaceService.findOne({
      where: { id: spaceId },
    });

    if (!space) {
      return false;
    }

    // Must be in same organization
    if (space.organizationId !== user.organizationId) {
      return false;
    }

    // Public spaces accessible to all org members
    if (space.isPublic) {
      return true;
    }

    // Check membership for private spaces
    return this.spaceUserService.hasSpaceAccess(user.id, spaceId);
  }
}
```

## Space Admin Guard

```typescript
@Injectable()
export class SpaceAdminGuard implements CanActivate {
  constructor(private spaceUserService: SpaceUserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const spaceId = request.params.spaceId;

    // Org admins can manage all spaces
    if ([UserRole.SuperAdmin, UserRole.Admin].includes(user.role)) {
      return true;
    }

    // Check if user is space admin
    return this.spaceUserService.isUserSpaceAdmin(user.id, spaceId);
  }
}
```

## Entity Serialization

```typescript
class Space {
  toPublic(): Partial<Space> {
    return {
      id: this.id,
      name: this.name,
      isPublic: this.isPublic,
      settings: this.settings,
    };
  }

  toMinimal(): Partial<Space> {
    return {
      id: this.id,
      name: this.name,
    };
  }
}

class SpaceUser {
  toPublic(): Partial<SpaceUser> {
    return {
      id: this.id,
      userId: this.userId,
      role: this.role,
      user: this.user?.toMinimal(),
    };
  }
}
```

## Best Practices

1. **Default to Private**: Start spaces as private, open up as needed
2. **Minimal Membership**: Only add users who need access
3. **Use Settings**: Store space-specific config in settings JSONB
4. **Cascade Awareness**: Deleting a space removes all SpaceUser entries
5. **Audit Access**: Log space access changes for compliance

## Next Steps

- [Organizations](organizations.md) - Parent tenant structure
- [Users](users.md) - User management
- [Permissions](permissions.md) - Fine-grained access control
