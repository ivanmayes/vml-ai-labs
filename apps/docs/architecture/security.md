# Security Architecture

The VML Open Boilerplate implements defense-in-depth security with multiple layers of protection. This guide covers authentication, authorization, data protection, and security best practices.

## Security Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TRANSPORT LAYER                                     │
│  • HTTPS/TLS encryption                                                     │
│  • CORS validation                                                          │
│  • Rate limiting (50 requests / 5 minutes)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AUTHENTICATION LAYER                                   │
│  • JWT tokens (RS256 signed)                                                │
│  • API keys (encrypted, hashed)                                             │
│  • Okta OAuth/OIDC integration                                              │
│  • SAML 2.0 with challenge-response                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AUTHORIZATION LAYER                                    │
│  • Role-based access control (RBAC)                                         │
│  • Organization access guards                                               │
│  • Space access guards                                                      │
│  • Fine-grained permissions                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                          │
│  • Field-level encryption (AES-256)                                         │
│  • Secure password hashing (bcrypt)                                         │
│  • Tenant data isolation                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Authentication

### JWT Authentication

The primary authentication mechanism for web and mobile clients.

**Token Structure:**

```typescript
// JWT Payload
{
  sub: string; // User ID
  email: string; // User email
  role: UserRole; // User role
  organizationId: string; // Tenant ID
  iat: number; // Issued at
  exp: number; // Expiration (30 days default)
}
```

**JWT Strategy Implementation:**

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.PUBLIC_KEY,
      algorithms: ["RS256"],
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.authService.validateUser(payload);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
```

**Token Validation Flow:**

1. Extract Bearer token from `Authorization` header
2. Verify RS256 signature with public key
3. Check token expiration
4. Validate user exists and is not deactivated
5. Verify token is in user's `authTokens` array (multi-session support)
6. For Okta users: introspect token with Okta API

### Multi-Session Support

Users can have multiple active sessions:

```typescript
// User entity stores array of valid tokens
@Column("text", { array: true, default: [] })
authTokens: string[];

// Login adds new token to array
user.authTokens.push(newToken);

// Logout removes specific token
user.authTokens = user.authTokens.filter(t => t !== tokenToRemove);

// Logout all sessions clears array
user.authTokens = [];
```

### API Key Authentication

For service-to-service communication:

```typescript
@Injectable()
export class BearerStrategy extends PassportStrategy(Strategy) {
  constructor(
    private apiKeyService: ApiKeyService,
    private crypt: Crypt,
  ) {
    super();
  }

  async validate(token: string): Promise<boolean> {
    // Hash incoming token for comparison
    const hashedToken = this.crypt.hashSHA256(token);

    // Find valid, non-expired, non-revoked key
    const apiKey = await this.apiKeyService.findOne({
      where: {
        key: hashedToken,
        revoked: false,
      },
    });

    if (!apiKey || (apiKey.expires && apiKey.expires < new Date())) {
      throw new UnauthorizedException();
    }

    // Set organization scope for downstream guards
    req.apiKeyScopes = {
      organizationIds: [apiKey.organizationId],
    };

    return true;
  }
}
```

**API Key Security:**

- Keys are 128 bytes, cryptographically random
- Stored as SHA256 hash (original never stored)
- Support optional expiration dates
- Can be revoked without deletion
- All usage logged for audit

### Okta Integration

OAuth/OIDC authentication with real-time token validation:

```typescript
async validateUser(payload: JwtPayload): Promise<User> {
  const user = await this.userService.findOne({
    where: { id: payload.sub },
    relations: ["authenticationStrategy"],
  });

  // For Okta users, verify token is still valid
  if (user.authenticationStrategy?.type === "Okta") {
    const isValid = await this.introspectOktaToken(
      payload.accessToken,
      user.authenticationStrategy.config
    );
    if (!isValid) {
      throw new UnauthorizedException("Token revoked");
    }
  }

  return user;
}
```

### SAML 2.0 Challenge Flow

Secure challenge-response for SAML SSO:

```typescript
// Step 1: Generate encrypted challenge
async getUserSAMLChallenge(user: User): Promise<string> {
  const challenge = {
    userId: user.id,
    organizationId: user.organizationId,
    nonce: crypto.randomBytes(32).toString("hex"),
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
  };

  // Double encryption: user-level then org-level
  const innerEncrypted = this.crypt.encrypt(
    JSON.stringify(challenge),
    userKey,
    userIv
  );
  return this.crypt.encrypt(innerEncrypted, orgKey, orgIv);
}

// Step 2: Validate challenge after SAML response
async getUserFromSAMLChallenge(challenge: string): Promise<User> {
  // Decrypt and validate
  const decrypted = this.crypt.decrypt(challenge, orgKey, orgIv);
  const inner = this.crypt.decrypt(decrypted, userKey, userIv);
  const data = JSON.parse(inner);

  // Verify not expired
  if (Date.now() > data.expires) {
    throw new UnauthorizedException("Challenge expired");
  }

  // Verify user has SAML auth strategy
  const user = await this.userService.findOne({ where: { id: data.userId } });
  if (user.authenticationStrategy?.type !== "SAML2.0") {
    throw new UnauthorizedException();
  }

  return user;
}
```

### Passwordless Authentication

Email-code based login:

```typescript
// Step 1: Generate one-time code
async generateSinglePass(user: User, config: BasicConfig): Promise<string> {
  const code = crypto.randomBytes(config.codeLength / 2).toString("hex");
  const hash = await bcrypt.hash(code, 10);

  user.singlePass = {
    hash,
    expires: new Date(Date.now() + config.codeLifetimeMinutes * 60 * 1000),
  };

  await this.userService.save(user);
  return code; // Send via email
}

// Step 2: Verify code
async verifySinglePass(user: User, code: string): Promise<boolean> {
  if (!user.singlePass) return false;
  if (new Date() > user.singlePass.expires) return false;

  const valid = await bcrypt.compare(code, user.singlePass.hash);
  if (valid) {
    user.singlePass = null; // One-time use
    await this.userService.save(user);
  }

  return valid;
}
```

## Authorization

### Role Hierarchy

```
SuperAdmin
    │
    ├── Full system access
    ├── Can manage other admins
    ├── Can delete organizations
    └── Implicit access to all spaces
         │
         ▼
      Admin
         │
         ├── Organization management
         ├── User management
         ├── Space management
         └── Cannot manage SuperAdmins
              │
              ▼
          Manager
              │
              ├── Team management
              ├── Limited admin functions
              └── Space-specific permissions
                   │
                   ▼
               User
                   │
                   ├── Standard access
                   ├── Access to assigned spaces
                   └── Own profile management
                        │
                        ▼
                    Guest
                        │
                        └── Read-only access
```

### Roles Guard

Enforces role-based access at the controller level:

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<UserRole[]>(
      "roles",
      context.getHandler()
    );

    if (!requiredRoles) {
      return true; // No role requirement
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return requiredRoles.includes(user.role);
  }
}

// Usage in controller
@Get("admin-only")
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@UseGuards(AuthGuard(), RolesGuard)
adminEndpoint() {
  // Only Admin and SuperAdmin can access
}
```

### Organization Access Guard

Enforces tenant isolation:

```typescript
@Injectable()
export class HasOrganizationAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orgId = request.params.orgId;

    // SuperAdmin has access to all organizations
    if (user.role === UserRole.SuperAdmin) {
      return true;
    }

    // User must belong to the requested organization
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

### Space Access Guard

Controls access to spaces within an organization:

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

    // SuperAdmin/Admin have access to all spaces
    if ([UserRole.SuperAdmin, UserRole.Admin].includes(user.role)) {
      return true;
    }

    // Check space exists
    const space = await this.spaceService.findOne({ where: { id: spaceId } });
    if (!space) {
      return false;
    }

    // Public spaces are accessible to all org members
    if (space.isPublic && user.organizationId === space.organizationId) {
      return true;
    }

    // Check user is a member of the space
    return this.spaceUserService.hasSpaceAccess(user.id, spaceId);
  }
}
```

### Space Admin Guard

For space management operations:

```typescript
@Injectable()
export class SpaceAdminGuard implements CanActivate {
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

### Fine-Grained Permissions

For specific action control:

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirements = this.reflector.get<PermissionRequirement[]>(
      "permissionRequirements",
      context.getHandler()
    );

    if (!requirements) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // SuperAdmin bypasses permission checks
    if (user.role === UserRole.SuperAdmin) {
      return true;
    }

    // Check all required permissions
    return requirements.every((req) =>
      user.permissions.some(
        (p) => p.type === req.type && (!req.campaignId || p.campaignId === req.campaignId)
      )
    );
  }
}

// Usage
@Post("export-pii")
@RequirePermissions([{ type: PermissionType.PIIExport }])
@UseGuards(AuthGuard(), PermissionsGuard)
exportPII() {
  // Requires PIIExport permission
}
```

### Guard Chaining

Guards execute in order; all must pass:

```typescript
@Controller("admin/organization/:orgId/space/:spaceId")
@UseGuards(
  AuthGuard(), // 1. Validate JWT/API key
  RolesGuard, // 2. Check user role
  HasOrganizationAccessGuard, // 3. Verify org access
  SpaceAdminGuard, // 4. Verify space admin
)
export class SpaceAdminController {
  // All four guards must pass
}
```

## Data Protection

### Encryption at Rest

Sensitive fields use AES-256 encryption:

```typescript
// Encryption utility
export class Crypt {
  private readonly algorithm = "aes-256-cbc";

  encrypt(text: string, key: string, iv: string): string {
    const cipher = crypto.createCipheriv(
      this.algorithm,
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex"),
    );
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
  }

  decrypt(encrypted: string, key: string, iv: string): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex"),
    );
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }
}
```

**Encrypted fields:**

- User profile (name, personal data)
- API keys (hashed with SHA256)
- OAuth tokens
- SAML challenges

### Password Security

Passwords are hashed with bcrypt:

```typescript
// Hash password
const hash = await bcrypt.hash(password, 10);

// Verify password
const valid = await bcrypt.compare(password, hash);
```

### Tenant Data Isolation

All queries are scoped by organization:

```typescript
// Service pattern
async findByOrganization(organizationId: string): Promise<Resource[]> {
  return this.repository.find({
    where: { organizationId },
  });
}

// Never expose unscoped queries publicly
// private findAll() { return this.repository.find(); }
```

## Rate Limiting

Global rate limiting with proxy support:

```typescript
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected getTracker(req: Request): string {
    // Support for proxied requests
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    }
    return req.socket.remoteAddress;
  }
}

// Applied globally
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
```

**Default limits:**

- 50 requests per 5 minutes per IP
- Configurable via `THROTTLE_TTL` and `THROTTLE_LIMIT`

## CORS Configuration

Controlled cross-origin access:

```typescript
// main.ts
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(","),
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: true,
});
```

## Security Best Practices

### Environment Variables

```env
# Strong secrets
JWT_SECRET=<random-64-chars>
PII_SIGNING_KEY=<random-32-chars>
PII_SIGNING_OFFSET=<random-16-chars>

# Secure configuration
DB_SSL=true
NODE_ENV=production
```

### Response Sanitization

Entities implement `toPublic()` to strip sensitive data:

```typescript
class User {
  toPublic(): Partial<User> {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      // Excludes: authTokens, singlePass, authChallenge, _privateProfile
    };
  }
}
```

### Audit Logging

API key usage is logged:

```typescript
// API key log entry
{
  apiKeyId: string,
  endpoint: "/api/resource",
  meta: {
    method: "POST",
    ip: "192.168.1.1",
    userAgent: "...",
  },
  created: Date,
}
```

### Security Headers

Recommended production headers (configure in reverse proxy):

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
```

## Next Steps

- [Authentication Documentation](../api/authentication/README.md) - Detailed auth flows
- [Guards and Decorators](../api/guards-decorators.md) - Custom security patterns
- [Multi-tenancy](multi-tenancy.md) - Tenant isolation details
