# JWT Authentication

JSON Web Tokens (JWT) are the primary authentication mechanism for web and mobile clients. The platform uses RS256-signed tokens with a 30-day expiration.

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            JWT AUTHENTICATION FLOW                           │
│                                                                              │
│  1. Login Request                                                           │
│     ┌──────────┐                     ┌──────────┐                          │
│     │  Client  │──── credentials ───>│   API    │                          │
│     └──────────┘                     └────┬─────┘                          │
│                                           │                                  │
│  2. Validate & Sign                       ▼                                  │
│                              ┌─────────────────────┐                        │
│                              │   JwtService.sign   │                        │
│                              │   (Private Key)     │                        │
│                              └──────────┬──────────┘                        │
│                                         │                                    │
│  3. Return Token                        ▼                                    │
│     ┌──────────┐                ┌──────────────┐                           │
│     │  Client  │<───── JWT ─────│   Response   │                           │
│     └────┬─────┘                └──────────────┘                           │
│          │                                                                   │
│  4. Store Token (localStorage/cookie)                                       │
│          │                                                                   │
│  5. Authenticated Requests                                                  │
│          │                      ┌──────────┐                                │
│          └─── Bearer <jwt> ────>│   API    │                                │
│                                 └────┬─────┘                                │
│                                      │                                       │
│  6. Validate Token                   ▼                                       │
│                         ┌─────────────────────────┐                         │
│                         │  JwtStrategy.validate   │                         │
│                         │  (Public Key)           │                         │
│                         └─────────────────────────┘                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```env
# Private key for signing tokens
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"

# Public key for verifying tokens
PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"

# Token expiration (default: 30 days)
JWT_EXPIRES_IN=30d
```

### Module Configuration

```typescript
// common.module.ts
import { JwtModule } from "@nestjs/jwt";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.PRIVATE_KEY,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN || "30d",
        algorithm: "RS256",
      },
    }),
  ],
})
export class CommonModule {}
```

## JWT Strategy

The Passport JWT strategy extracts and validates tokens:

```typescript
// user/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, ExtractJwt } from "passport-jwt";
import { AuthService } from "./auth.service";

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

## Token Payload

```typescript
interface JwtPayload {
  sub: string; // User ID
  email: string; // User email
  role: UserRole; // User role
  organizationId: string; // Tenant ID
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expiration (Unix timestamp)
}
```

Example decoded token:

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "role": "User",
  "organizationId": "a3b8d240-4f5e-6789-c012-345678901234",
  "iat": 1704067200,
  "exp": 1706659200
}
```

## Token Validation

The `AuthService.validateUser()` method performs comprehensive validation:

```typescript
// user/auth/auth.service.ts
async validateUser(payload: JwtPayload): Promise<User | null> {
  // 1. Find user by ID
  const user = await this.userService.findOne({
    where: { id: payload.sub },
    relations: ["authenticationStrategy", "permissions"],
  });

  if (!user) {
    return null;
  }

  // 2. Check if user is deactivated
  if (user.deactivated) {
    return null;
  }

  // 3. Verify token is in user's active tokens array
  const token = this.extractTokenFromPayload(payload);
  if (!user.authTokens.includes(token)) {
    return null;
  }

  // 4. For Okta users, verify token with Okta
  if (user.authenticationStrategy?.type === "Okta") {
    const isValid = await this.introspectOktaToken(payload);
    if (!isValid) {
      return null;
    }
  }

  return user;
}
```

## Multi-Session Support

Users can be logged in from multiple devices simultaneously:

```typescript
// User entity stores array of active tokens
@Column("text", { array: true, default: [] })
authTokens: string[];
```

### Adding a New Session

```typescript
async createSession(user: User): Promise<string> {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };

  const token = this.jwtService.sign(payload);

  // Add new token to user's array
  user.authTokens.push(token);
  await this.userService.save(user);

  return token;
}
```

### Revoking a Session

```typescript
// Remove specific token (logout single device)
async logout(user: User, token: string): Promise<void> {
  user.authTokens = user.authTokens.filter((t) => t !== token);
  await this.userService.save(user);
}

// Remove all tokens (logout everywhere)
async logoutAll(user: User): Promise<void> {
  user.authTokens = [];
  await this.userService.save(user);
}
```

### Token Cleanup

Expired tokens are periodically cleaned:

```typescript
async cleanExpiredTokens(user: User): Promise<void> {
  const validTokens = user.authTokens.filter((token) => {
    try {
      this.jwtService.verify(token, {
        secret: process.env.PUBLIC_KEY,
      });
      return true;
    } catch {
      return false;
    }
  });

  if (validTokens.length !== user.authTokens.length) {
    user.authTokens = validTokens;
    await this.userService.save(user);
  }
}
```

## Using JWT in Controllers

### Protecting Routes

```typescript
import { UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Controller("resource")
export class ResourceController {
  // Require authentication
  @UseGuards(AuthGuard())
  @Get()
  findAll(@Request() req) {
    const user = req.user; // Authenticated user
    return this.resourceService.findByOrganization(user.organizationId);
  }
}
```

### Accessing User Data

```typescript
@Get("profile")
@UseGuards(AuthGuard())
getProfile(@Request() req) {
  // req.user contains the full User entity
  return {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    profile: req.user.profile,
  };
}
```

### Custom Decorators

```typescript
// decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

// Usage in controller
@Get("profile")
@UseGuards(AuthGuard())
getProfile(@CurrentUser() user: User) {
  return user.toPublic();
}

@Get("my-org")
@UseGuards(AuthGuard())
getOrganization(@CurrentUser("organizationId") orgId: string) {
  return this.orgService.findOne({ where: { id: orgId } });
}
```

## Token Refresh

The platform doesn't use refresh tokens. Instead, it relies on:

1. **Long-lived access tokens** (30 days)
2. **Silent re-authentication** for Okta users
3. **Seamless re-login** for Basic auth users

For applications requiring shorter token lifetimes, implement refresh token logic:

```typescript
// Optional refresh token implementation
@Post("refresh")
async refresh(@Body("refreshToken") refreshToken: string) {
  const payload = this.jwtService.verify(refreshToken, {
    secret: process.env.REFRESH_TOKEN_SECRET,
  });

  const user = await this.userService.findOne({
    where: { id: payload.sub },
  });

  if (!user || user.deactivated) {
    throw new UnauthorizedException();
  }

  return {
    accessToken: this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    }),
  };
}
```

## Security Best Practices

### Token Storage (Client)

```typescript
// Recommended: HttpOnly cookie (set by server)
// Prevents XSS access to token

// Alternative: localStorage (less secure)
localStorage.setItem("accessToken", token);
```

### Token Transmission

```typescript
// Always use Authorization header
fetch("/api/resource", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### Key Rotation

When rotating keys:

1. Generate new key pair
2. Update environment variables
3. Old tokens remain valid until expiration
4. New tokens use new key

## Error Handling

| Error               | Cause                        | HTTP Status |
| ------------------- | ---------------------------- | ----------- |
| `Unauthorized`      | Missing or invalid token     | 401         |
| `Token expired`     | Token past expiration        | 401         |
| `Invalid signature` | Token tampered or wrong key  | 401         |
| `User deactivated`  | Account disabled             | 401         |
| `Token revoked`     | Token removed from user list | 401         |

## Next Steps

- [API Keys](api-keys.md) - Service authentication
- [Guards & Decorators](../guards-decorators.md) - Security patterns
- [Security Architecture](../../architecture/security.md) - Overall security
