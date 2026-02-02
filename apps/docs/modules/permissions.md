# Permissions Module

The Permissions module provides fine-grained access control beyond role-based access. It enables granting specific capabilities to users for particular actions or resources.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PERMISSION HIERARCHY                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                          RBAC (Roles)                               │    │
│  │  SuperAdmin > Admin > Manager > User > Guest                       │    │
│  │  (Broad access levels)                                             │    │
│  └───────────────────────────────┬────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    Fine-Grained Permissions                         │    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │  │  PIIExport   │  │ EntrantBan   │  │ CampaignWin  │             │    │
│  │  │              │  │              │  │              │             │    │
│  │  │  Can export  │  │  Can ban     │  │  Can select  │             │    │
│  │  │  user PII    │  │  entrants    │  │  winners     │             │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                     │    │
│  │  (Specific capabilities assigned to individual users)              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## When to Use Permissions

| Use Case                  | Role-Based | Permission-Based |
| ------------------------- | ---------- | ---------------- |
| Admin can manage users    | ✅         | ❌               |
| User can export PII       | ❌         | ✅               |
| Manager can access spaces | ✅         | ❌               |
| User can select winners   | ❌         | ✅               |
| Admin can view all data   | ✅         | ❌               |
| User can ban entrants     | ❌         | ✅               |

## Permission Entity

```typescript
@Entity()
export class Permission {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user: User;

  @Column()
  userId: string;

  @Column({ type: "enum", enum: PermissionType })
  type: PermissionType;

  // Optional: scope permission to specific resource
  @Column({ nullable: true })
  resourceId: string;

  @Column({ nullable: true })
  resourceType: string;
}
```

## Permission Types

```typescript
enum PermissionType {
  // PII and data access
  PIIExport = "PIIExport",

  // Campaign management
  CampaignSelectWinner = "CampaignSelectWinner",
  CampaignResetPrizeListings = "CampaignResetPrizeListings",

  // Entrant management
  EntrantViewIdentifiers = "EntrantViewIdentifiers",
  EntrantViewFulfillment = "EntrantViewFulfillment",
  EntrantContact = "EntrantContact",
  EntrantBanIP = "EntrantBanIP",
  EntrantBanID = "EntrantBanID",

  // Entry management
  EntryConfirm = "EntryConfirm",
}
```

### Permission Descriptions

| Permission                   | Description                          |
| ---------------------------- | ------------------------------------ |
| `PIIExport`                  | Export user personal data            |
| `CampaignSelectWinner`       | Select winners in campaigns          |
| `CampaignResetPrizeListings` | Reset prize listings                 |
| `EntrantViewIdentifiers`     | View entrant identifying information |
| `EntrantViewFulfillment`     | View fulfillment details             |
| `EntrantContact`             | Contact entrants directly            |
| `EntrantBanIP`               | Ban entrants by IP address           |
| `EntrantBanID`               | Ban entrants by user ID              |
| `EntryConfirm`               | Confirm entries manually             |

## API Endpoints

### Managing User Permissions

```typescript
// Get user's permissions
GET /admin/organization/:orgId/user/:userId/permissions
Authorization: Bearer <admin-jwt>

// Response
[
  { "id": "uuid", "type": "PIIExport" },
  { "id": "uuid", "type": "EntrantBanIP" }
]
```

```typescript
// Grant permission
POST /admin/organization/:orgId/user/:userId/permissions
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "type": "CampaignSelectWinner"
}
```

```typescript
// Revoke permission
DELETE /admin/organization/:orgId/user/:userId/permissions/:permissionId
Authorization: Bearer <admin-jwt>
```

```typescript
// Bulk update permissions
PUT /admin/organization/:orgId/user/:userId/permissions
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "permissions": [
    "PIIExport",
    "EntrantBanIP",
    "EntrantBanID"
  ]
}
```

## Permission Service

```typescript
@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private repository: Repository<Permission>,
  ) {}

  async findByUser(userId: string): Promise<Permission[]> {
    return this.repository.find({
      where: { userId },
    });
  }

  async hasPermission(userId: string, type: PermissionType): Promise<boolean> {
    const count = await this.repository.count({
      where: { userId, type },
    });
    return count > 0;
  }

  async grant(userId: string, type: PermissionType): Promise<Permission> {
    // Check if already exists
    const existing = await this.repository.findOne({
      where: { userId, type },
    });

    if (existing) {
      return existing;
    }

    const permission = this.repository.create({ userId, type });
    return this.repository.save(permission);
  }

  async revoke(userId: string, type: PermissionType): Promise<void> {
    await this.repository.delete({ userId, type });
  }

  async setPermissions(
    userId: string,
    types: PermissionType[],
  ): Promise<Permission[]> {
    // Remove all existing permissions
    await this.repository.delete({ userId });

    // Create new permissions
    const permissions = types.map((type) =>
      this.repository.create({ userId, type }),
    );

    return this.repository.save(permissions);
  }
}
```

## Permission Guard

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirements = this.reflector.get<PermissionRequirement[]>(
      "permissionRequirements",
      context.getHandler(),
    );

    if (!requirements || requirements.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // SuperAdmin bypasses all permission checks
    if (user.role === UserRole.SuperAdmin) {
      return true;
    }

    // Check each required permission
    const userPermissionTypes = user.permissions?.map((p) => p.type) || [];

    return requirements.every((req) => {
      if (req.resourceId) {
        // Scoped permission check
        return user.permissions?.some(
          (p) => p.type === req.type && p.resourceId === req.resourceId,
        );
      }
      return userPermissionTypes.includes(req.type);
    });
  }
}
```

## RequirePermissions Decorator

```typescript
import { SetMetadata } from "@nestjs/common";

export interface PermissionRequirement {
  type: PermissionType;
  resourceId?: string;
}

export const RequirePermissions = (requirements: PermissionRequirement[]) =>
  SetMetadata("permissionRequirements", requirements);
```

## Usage in Controllers

### Basic Permission Check

```typescript
@Controller("entrant")
@UseGuards(AuthGuard(), PermissionsGuard)
export class EntrantController {
  @Post(":id/ban")
  @RequirePermissions([{ type: PermissionType.EntrantBanID }])
  async banEntrant(@Param("id") id: string) {
    return this.entrantService.ban(id);
  }

  @Get(":id/pii")
  @RequirePermissions([{ type: PermissionType.EntrantViewIdentifiers }])
  async getEntrantPII(@Param("id") id: string) {
    return this.entrantService.getPII(id);
  }
}
```

### Multiple Permissions Required

```typescript
@Post("export")
@RequirePermissions([
  { type: PermissionType.PIIExport },
  { type: PermissionType.EntrantViewIdentifiers },
])
async exportEntrantData() {
  // Requires both permissions
  return this.exportService.exportAll();
}
```

### Resource-Scoped Permissions

```typescript
@Post("campaign/:campaignId/select-winner")
@RequirePermissions([{ type: PermissionType.CampaignSelectWinner }])
async selectWinner(
  @Param("campaignId") campaignId: string,
  @Request() req
) {
  // Additional runtime check for campaign-specific permission
  const hasScopedPermission = req.user.permissions.some(
    (p) =>
      p.type === PermissionType.CampaignSelectWinner &&
      p.resourceId === campaignId
  );

  if (!hasScopedPermission && req.user.role !== UserRole.SuperAdmin) {
    throw new ForbiddenException("No permission for this campaign");
  }

  return this.campaignService.selectWinner(campaignId);
}
```

## Permission + Role Combinations

```typescript
@Controller("admin/organization/:orgId/campaign")
@UseGuards(
  AuthGuard(),
  RolesGuard,
  HasOrganizationAccessGuard,
  PermissionsGuard,
)
export class CampaignAdminController {
  // Requires Admin role AND specific permission
  @Post(":id/reset-prizes")
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @RequirePermissions([{ type: PermissionType.CampaignResetPrizeListings }])
  async resetPrizes(@Param("id") id: string) {
    // Only admins with this specific permission can reset
    return this.campaignService.resetPrizes(id);
  }
}
```

## Checking Permissions in Services

```typescript
@Injectable()
export class ExportService {
  constructor(private permissionService: PermissionService) {}

  async exportUserData(
    userId: string,
    requestingUserId: string,
  ): Promise<Buffer> {
    // Check permission before proceeding
    const canExport = await this.permissionService.hasPermission(
      requestingUserId,
      PermissionType.PIIExport,
    );

    if (!canExport) {
      throw new ForbiddenException("PIIExport permission required");
    }

    return this.generateExport(userId);
  }
}
```

## Best Practices

1. **SuperAdmin Bypass**: SuperAdmin always has all permissions
2. **Least Privilege**: Grant only necessary permissions
3. **Audit Trail**: Log permission grants/revokes
4. **Regular Review**: Periodically audit user permissions
5. **Combine with Roles**: Use roles for broad access, permissions for specifics
6. **Resource Scoping**: Use resourceId for granular control

## Adding New Permission Types

1. Add to the `PermissionType` enum
2. Document the permission purpose
3. Apply `@RequirePermissions` decorator where needed
4. Update admin UI to show new permission option

```typescript
// Step 1: Add to enum
enum PermissionType {
  // ... existing
  NewFeatureAccess = "NewFeatureAccess",
}

// Step 2: Use in controller
@Get("new-feature")
@RequirePermissions([{ type: PermissionType.NewFeatureAccess }])
async newFeature() {
  // Protected by permission
}
```

## Next Steps

- [Users](users.md) - User management
- [Security Architecture](../architecture/security.md) - Overall security model
- [Guards & Decorators](../api/guards-decorators.md) - Guard patterns
