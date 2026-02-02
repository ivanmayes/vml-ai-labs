# Authentication Overview

The VML Open Boilerplate supports multiple authentication strategies that can be configured per organization. This flexibility allows enterprises to use their existing identity providers while smaller deployments can use the built-in email/code system.

## Authentication Strategies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AUTHENTICATION STRATEGIES                           │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │     Basic       │  │      Okta       │  │    SAML 2.0     │             │
│  │  (Email/Code)   │  │  (OAuth/OIDC)   │  │                 │             │
│  │                 │  │                 │  │                 │             │
│  │  • Passwordless │  │  • SSO          │  │  • Enterprise   │             │
│  │  • 6-digit code │  │  • MFA support  │  │  • Federation   │             │
│  │  • Email verify │  │  • Token sync   │  │  • Challenge    │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │    JWT Token        │                                  │
│                    │  (RS256 signed)     │                                  │
│                    │                     │                                  │
│                    │  30-day expiration  │                                  │
│                    │  Multi-session OK   │                                  │
│                    └─────────────────────┘                                  │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │    API Keys     │  ← Service-to-service authentication                  │
│  │                 │                                                        │
│  │  • 128-byte key │                                                        │
│  │  • SHA256 hash  │                                                        │
│  │  • Org-scoped   │                                                        │
│  └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Strategy Selection

Each organization configures one or more authentication strategies:

```typescript
// Organization can have multiple strategies
const org = await organizationService.findOne({
  where: { id: orgId },
  relations: ["authenticationStrategies", "defaultAuthenticationStrategy"],
});

// Users are assigned a specific strategy
const user = await userService.findOne({
  where: { email, organizationId: org.id },
  relations: ["authenticationStrategy"],
});
```

## Authentication Flow

### 1. Strategy Discovery

```
Client                           API
  │                               │
  │  GET /org/:slug/public        │
  │──────────────────────────────>│
  │                               │
  │  { authStrategies: [...] }    │
  │<──────────────────────────────│
  │                               │
```

### 2. Login Initiation

```
Client                           API
  │                               │
  │  POST /auth/login             │
  │  { email, strategyId }        │
  │──────────────────────────────>│
  │                               │
  │  Basic: Sends code via email  │
  │  Okta: Returns redirect URL   │
  │  SAML: Returns challenge      │
  │<──────────────────────────────│
  │                               │
```

### 3. Verification

```
Client                           API
  │                               │
  │  POST /auth/verify            │
  │  { email, code } or           │
  │  { token } or                 │
  │  { challenge, samlResponse }  │
  │──────────────────────────────>│
  │                               │
  │  { accessToken, user }        │
  │<──────────────────────────────│
  │                               │
```

### 4. Authenticated Requests

```
Client                           API
  │                               │
  │  GET /api/resource            │
  │  Authorization: Bearer <jwt>  │
  │──────────────────────────────>│
  │                               │
  │  { data: [...] }              │
  │<──────────────────────────────│
  │                               │
```

## Token Management

### JWT Structure

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

### Token Configuration

```typescript
// common.module.ts
JwtModule.register({
  secret: process.env.PRIVATE_KEY,
  signOptions: {
    expiresIn: "30d",
    algorithm: "RS256",
  },
});
```

### Multi-Session Support

Users can have multiple active sessions across devices:

```typescript
// Each login adds a new token to the user's array
user.authTokens.push(newToken);
await userService.save(user);

// Token validation checks if token is in the array
const isValid = user.authTokens.includes(incomingToken);
```

### Session Management

```typescript
// Logout single session
user.authTokens = user.authTokens.filter((t) => t !== currentToken);

// Logout all sessions
user.authTokens = [];

// Clean expired tokens
user.authTokens = user.authTokens.filter((t) => !isExpired(t));
```

## API Endpoints

### Login Flow

```typescript
// Start login
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "organizationSlug": "acme-corp"
}

// Response varies by strategy type
// Basic: { message: "Code sent to email" }
// Okta: { redirectUrl: "https://..." }
// SAML: { challenge: "encrypted-challenge" }
```

### Verify Login

```typescript
// Basic verification
POST /auth/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "organizationSlug": "acme-corp"
}

// Response
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "User",
    "profile": { ... }
  }
}
```

### Get Current User

```typescript
// Get authenticated user
GET /auth/me
Authorization: Bearer <jwt>

// Response
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "User",
  "organizationId": "org-uuid",
  "profile": { ... }
}
```

### Logout

```typescript
// Logout current session
POST /auth/logout
Authorization: Bearer <jwt>

// Response
{
  "status": "success"
}
```

## Security Considerations

### Token Security

- **RS256 Algorithm**: Public/private key signing
- **30-day Expiration**: Balances security and convenience
- **Server-side Validation**: Tokens validated against stored list
- **Revocation Support**: Individual tokens can be invalidated

### Rate Limiting

Login attempts are rate-limited to prevent brute force:

```typescript
@UseGuards(ThrottlerGuard)
@Throttle(5, 60) // 5 attempts per minute
@Post("login")
login(@Body() dto: LoginDto) {
  // ...
}
```

### Secure Transmission

- HTTPS required for all authentication endpoints
- Tokens never logged or exposed in URLs
- Sensitive data encrypted in transit

## Error Handling

| Error Code | Meaning                          |
| ---------- | -------------------------------- |
| 401        | Invalid or expired token         |
| 403        | Valid token, insufficient access |
| 429        | Rate limit exceeded              |

```typescript
// Common error responses
{
  "statusCode": 401,
  "message": "Unauthorized"
}

{
  "statusCode": 401,
  "message": "Token expired"
}

{
  "statusCode": 401,
  "message": "Invalid code"
}
```

## Next Steps

- [JWT Authentication](jwt.md) - JWT implementation details
- [API Keys](api-keys.md) - Service authentication
- [Okta Integration](okta.md) - OAuth/OIDC setup
- [SAML 2.0](saml.md) - Enterprise federation
