# API Key Authentication

API keys provide service-to-service authentication for automated systems, integrations, and third-party applications that need to access the API without user interaction.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API KEY AUTHENTICATION                              │
│                                                                              │
│  ┌─────────────────┐                     ┌─────────────────────────────┐   │
│  │   Client App    │                     │           API               │   │
│  │   (Service)     │                     │                             │   │
│  └────────┬────────┘                     └──────────────┬──────────────┘   │
│           │                                             │                   │
│           │  Authorization: Bearer <api-key>            │                   │
│           │─────────────────────────────────────────────>                   │
│           │                                             │                   │
│           │                              ┌──────────────▼──────────────┐   │
│           │                              │     Bearer Strategy         │   │
│           │                              │                             │   │
│           │                              │  1. Hash incoming key       │   │
│           │                              │  2. Find in database        │   │
│           │                              │  3. Check not revoked       │   │
│           │                              │  4. Check not expired       │   │
│           │                              │  5. Set org scopes          │   │
│           │                              └──────────────┬──────────────┘   │
│           │                                             │                   │
│           │  200 OK + data                              │                   │
│           │<────────────────────────────────────────────┤                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Characteristics

| Property      | Value                          |
| ------------- | ------------------------------ |
| Length        | 128 bytes (256 hex characters) |
| Storage       | SHA256 hashed                  |
| Scope         | Organization-level             |
| Expiration    | Optional                       |
| Revocation    | Supported                      |
| Audit logging | All requests logged            |

## Creating API Keys

### Via CLI

```bash
cd apps/api
npm run console:dev CreateApiKey
```

Follow the prompts:

1. Select organization
2. Enter key name (for identification)
3. Set expiration (optional)

### Via API

```typescript
POST /admin/organization/:orgId/api-key
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "name": "Integration Service",
  "expires": "2025-12-31T23:59:59Z"  // Optional
}
```

Response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Integration Service",
  "key": "abc123...xyz789", // Only returned once!
  "organizationId": "org-uuid",
  "created": "2024-01-15T10:30:00Z",
  "expires": "2025-12-31T23:59:59Z"
}
```

{% hint style="warning" %}
**Important**: The raw API key is only returned once at creation. Store it securely immediately. It cannot be retrieved later.
{% endhint %}

## Key Storage

### How Keys Are Stored

```typescript
// When creating a key
const rawKey = crypto.randomBytes(128).toString("hex"); // 256 characters
const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");

const apiKey = this.repository.create({
  name: dto.name,
  key: hashedKey, // Only hash is stored
  organizationId: orgId,
  expires: dto.expires,
});
```

### Database Schema

```typescript
@Entity()
export class ApiKey {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  key: string; // SHA256 hash

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

## Bearer Strategy

The Passport Bearer strategy validates API keys:

```typescript
// api-key/auth/bearer.strategy.ts
@Injectable()
export class BearerStrategy extends PassportStrategy(Strategy) {
  constructor(private apiKeyService: ApiKeyService) {
    super();
  }

  async validate(token: string): Promise<boolean> {
    // Hash the incoming token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find the API key
    const apiKey = await this.apiKeyService.findOne({
      where: { key: hashedToken },
    });

    // Validate key exists
    if (!apiKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    // Check if revoked
    if (apiKey.revoked) {
      throw new UnauthorizedException("API key revoked");
    }

    // Check expiration
    if (apiKey.expires && apiKey.expires < new Date()) {
      throw new UnauthorizedException("API key expired");
    }

    // Set organization scope on request
    const req = this.getRequest();
    req.apiKeyScopes = {
      organizationIds: [apiKey.organizationId],
    };

    // Log the API key usage
    await this.logUsage(apiKey, req);

    return true;
  }

  private async logUsage(apiKey: ApiKey, req: Request): Promise<void> {
    await this.apiKeyLogService.create({
      apiKeyId: apiKey.id,
      endpoint: req.path,
      meta: {
        method: req.method,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });
  }
}
```

## Using API Keys

### In Requests

```bash
# Using curl
curl -X GET https://api.example.com/admin/organization/org-uuid/resource \
  -H "Authorization: Bearer abc123...xyz789"
```

```typescript
// Using fetch
const response = await fetch(
  "https://api.example.com/admin/organization/org-uuid/resource",
  {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  },
);
```

### Organization Scoping

API keys are scoped to a single organization:

```typescript
@Injectable()
export class HasOrganizationAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const orgId = request.params.orgId;

    // Check if API key has access to this organization
    if (request.apiKeyScopes?.organizationIds?.includes(orgId)) {
      return true;
    }

    return false;
  }
}
```

## Managing API Keys

### List Keys

```typescript
GET /admin/organization/:orgId/api-key
Authorization: Bearer <admin-jwt>

// Response
[
  {
    "id": "key-uuid-1",
    "name": "Integration Service",
    "created": "2024-01-15T10:30:00Z",
    "expires": null,
    "revoked": false
  },
  {
    "id": "key-uuid-2",
    "name": "Mobile App",
    "created": "2024-02-01T14:00:00Z",
    "expires": "2025-02-01T14:00:00Z",
    "revoked": false
  }
]
```

### Revoke a Key

```typescript
DELETE /admin/organization/:orgId/api-key/:keyId
Authorization: Bearer <admin-jwt>

// Response
{
  "status": "success",
  "message": "API key revoked"
}
```

Revoked keys remain in the database for audit purposes but are immediately invalidated.

## Audit Logging

Every API key request is logged:

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
  meta: {
    method: string;
    ip: string;
    userAgent: string;
    statusCode?: number;
  };

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  created: Date;
}
```

### Viewing Logs

```typescript
GET /admin/organization/:orgId/api-key/:keyId/logs
Authorization: Bearer <admin-jwt>

// Response
[
  {
    "id": "log-uuid",
    "endpoint": "/admin/organization/org-uuid/user",
    "meta": {
      "method": "GET",
      "ip": "192.168.1.100",
      "userAgent": "Integration/1.0"
    },
    "created": "2024-01-15T11:00:00Z"
  }
]
```

## Security Best Practices

### Key Storage

```bash
# Store in environment variables
export API_KEY="abc123...xyz789"

# Or use a secrets manager
aws secretsmanager get-secret-value --secret-id prod/api-key
```

### Key Rotation

1. Create a new API key
2. Update your application to use the new key
3. Verify the new key works
4. Revoke the old key

```typescript
// Automated rotation example
async rotateApiKey(oldKeyId: string): Promise<ApiKey> {
  // Create new key
  const newKey = await this.createApiKey({
    name: `Rotated ${new Date().toISOString()}`,
  });

  // Revoke old key after grace period
  setTimeout(async () => {
    await this.revokeApiKey(oldKeyId);
  }, 24 * 60 * 60 * 1000); // 24 hours

  return newKey;
}
```

### Scope Limitation

API keys have organization scope but not user context:

- ✅ Can access organization resources
- ✅ Can perform organization-level operations
- ❌ Cannot access user-specific endpoints
- ❌ Cannot perform actions requiring user identity

### Network Security

- Use HTTPS only
- Implement IP allowlisting if possible
- Use short expiration times for sensitive operations

## Error Handling

| Error                 | Cause                 | HTTP Status |
| --------------------- | --------------------- | ----------- |
| `Invalid API key`     | Key not found         | 401         |
| `API key revoked`     | Key has been revoked  | 401         |
| `API key expired`     | Past expiration date  | 401         |
| `Organization access` | Key doesn't match org | 403         |

## Next Steps

- [JWT Authentication](jwt.md) - User authentication
- [Guards & Decorators](../guards-decorators.md) - Access control
- [Security Architecture](../../architecture/security.md) - Overall security
