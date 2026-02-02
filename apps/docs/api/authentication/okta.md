# Okta Integration

The VML Open Boilerplate supports Okta for enterprise single sign-on (SSO) using OAuth 2.0 and OpenID Connect protocols. This enables organizations to authenticate users through their existing Okta identity provider.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            OKTA AUTHENTICATION FLOW                          │
│                                                                              │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐         ┌────────┐ │
│  │  Client  │         │   API    │         │   Okta   │         │  User  │ │
│  └────┬─────┘         └────┬─────┘         └────┬─────┘         └───┬────┘ │
│       │                    │                    │                   │       │
│  1.   │  Login request     │                    │                   │       │
│       │───────────────────>│                    │                   │       │
│       │                    │                    │                   │       │
│  2.   │  Redirect URL      │                    │                   │       │
│       │<───────────────────│                    │                   │       │
│       │                    │                    │                   │       │
│  3.   │  Redirect to Okta  │                    │                   │       │
│       │─────────────────────────────────────────>                   │       │
│       │                    │                    │                   │       │
│  4.   │                    │                    │  Login prompt     │       │
│       │                    │                    │──────────────────>│       │
│       │                    │                    │                   │       │
│  5.   │                    │                    │  Credentials      │       │
│       │                    │                    │<──────────────────│       │
│       │                    │                    │                   │       │
│  6.   │  Callback + code   │                    │                   │       │
│       │<─────────────────────────────────────────                   │       │
│       │                    │                    │                   │       │
│  7.   │  Exchange code     │                    │                   │       │
│       │───────────────────>│                    │                   │       │
│       │                    │                    │                   │       │
│  8.   │                    │  Token exchange    │                   │       │
│       │                    │───────────────────>│                   │       │
│       │                    │                    │                   │       │
│  9.   │                    │  Access + ID token │                   │       │
│       │                    │<───────────────────│                   │       │
│       │                    │                    │                   │       │
│ 10.   │  JWT token         │                    │                   │       │
│       │<───────────────────│                    │                   │       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Configuration

### Okta Application Setup

1. Log in to your Okta Admin Console
2. Navigate to **Applications** → **Create App Integration**
3. Select **OIDC - OpenID Connect**
4. Choose **Web Application**
5. Configure the following:

| Setting              | Value                                     |
| -------------------- | ----------------------------------------- |
| App integration name | VML Open Boilerplate                      |
| Grant type           | Authorization Code                        |
| Sign-in redirect URI | `https://your-app.com/auth/okta/callback` |
| Sign-out redirect    | `https://your-app.com/logout`             |
| Controlled access    | Limit to assigned users/groups            |

### Environment Variables

```env
# Okta credentials
OKTA_DOMAIN=https://your-domain.okta.com
OKTA_CLIENT_ID=0oa1bcdef2ghijk3lmn4
OKTA_CLIENT_SECRET=your-client-secret

# Callback URL
OKTA_CALLBACK_URL=https://your-app.com/auth/okta/callback
```

### Authentication Strategy Configuration

Create an Okta strategy for your organization:

```typescript
POST /admin/organization/:orgId/authentication-strategy
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "name": "Okta SSO",
  "type": "Okta",
  "config": {
    "clientId": "0oa1bcdef2ghijk3lmn4",
    "domain": "your-domain.okta.com",
    "strategyType": "OpenID Connect",
    "uiType": "redirect"
  }
}
```

**Configuration options:**

```typescript
interface OktaConfig {
  clientId: string;
  domain: string;
  strategyType: "OpenID Connect" | "OAuth2" | "SAML";
  uiType: "redirect" | "widget";
}
```

| Option         | Description                                       |
| -------------- | ------------------------------------------------- |
| `clientId`     | Okta application client ID                        |
| `domain`       | Okta organization domain                          |
| `strategyType` | Authentication protocol                           |
| `uiType`       | `redirect` for Okta-hosted, `widget` for embedded |

## Authentication Flow

### Step 1: Initiate Login

```typescript
// Client requests login
POST /auth/login
Content-Type: application/json

{
  "email": "user@company.com",
  "organizationSlug": "acme-corp"
}

// API returns Okta redirect URL
{
  "redirectUrl": "https://acme.okta.com/oauth2/v1/authorize?client_id=...&redirect_uri=...&response_type=code&scope=openid+profile+email&state=..."
}
```

### Step 2: User Authenticates with Okta

The user is redirected to Okta where they:

1. Enter their Okta credentials
2. Complete MFA if required
3. Consent to the application (first time only)

### Step 3: Handle Callback

```typescript
// Okta redirects to callback with authorization code
GET /auth/okta/callback?code=abc123&state=xyz789

// API exchanges code for tokens
POST https://acme.okta.com/oauth2/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=abc123
&redirect_uri=https://your-app.com/auth/okta/callback
&client_id=0oa1bcdef2ghijk3lmn4
&client_secret=your-secret
```

### Step 4: Token Exchange

```typescript
// Okta returns tokens
{
  "access_token": "eyJraWQiOi...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "id_token": "eyJhbGciOi..."
}

// API creates local JWT and returns to client
{
  "accessToken": "local-jwt-token",
  "user": {
    "id": "user-uuid",
    "email": "user@company.com",
    "role": "User",
    "profile": { ... }
  }
}
```

## Token Introspection

For Okta users, tokens are validated against Okta on each request:

```typescript
// auth.service.ts
async validateUser(payload: JwtPayload): Promise<User | null> {
  const user = await this.userService.findOne({
    where: { id: payload.sub },
    relations: ["authenticationStrategy"],
  });

  // For Okta users, verify token is still valid
  if (user.authenticationStrategy?.type === "Okta") {
    const isValid = await this.introspectOktaToken(
      payload.oktaAccessToken,
      user.authenticationStrategy.config as OktaConfig
    );

    if (!isValid) {
      return null; // Token revoked in Okta
    }
  }

  return user;
}

private async introspectOktaToken(
  token: string,
  config: OktaConfig
): Promise<boolean> {
  const response = await fetch(
    `https://${config.domain}/oauth2/v1/introspect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${config.clientId}:${process.env.OKTA_CLIENT_SECRET}`)}`,
      },
      body: `token=${token}&token_type_hint=access_token`,
    }
  );

  const data = await response.json();
  return data.active === true;
}
```

## User Provisioning

### Just-in-Time (JIT) Provisioning

Users can be automatically created on first login:

```typescript
async handleOktaCallback(code: string, orgId: string): Promise<LoginResult> {
  // Exchange code for tokens
  const tokens = await this.exchangeCodeForTokens(code);

  // Get user info from Okta
  const userInfo = await this.getOktaUserInfo(tokens.access_token);

  // Find or create user
  let user = await this.userService.findOne({
    where: {
      email: userInfo.email,
      organizationId: orgId,
    },
  });

  if (!user) {
    // JIT provisioning - create new user
    user = await this.userService.create({
      email: userInfo.email,
      organizationId: orgId,
      profile: {
        firstName: userInfo.given_name,
        lastName: userInfo.family_name,
      },
      authenticationStrategyId: strategyId,
      role: UserRole.User,
      activationStatus: UserActivationStatus.Activated,
    });
  }

  // Generate local JWT
  const jwt = await this.createToken(user, tokens.access_token);

  return { accessToken: jwt, user: user.toPublic() };
}
```

### Pre-provisioned Users

For organizations requiring pre-registration:

```typescript
// Disable JIT provisioning
if (!user) {
  throw new UnauthorizedException(
    "User not registered. Contact your administrator.",
  );
}
```

## Okta Sign-In Widget

For embedded authentication UI:

```typescript
// Frontend implementation
import OktaSignIn from "@okta/okta-signin-widget";

const widget = new OktaSignIn({
  baseUrl: "https://acme.okta.com",
  clientId: "0oa1bcdef2ghijk3lmn4",
  redirectUri: "https://your-app.com/auth/okta/callback",
  authParams: {
    issuer: "https://acme.okta.com/oauth2/default",
    scopes: ["openid", "profile", "email"],
  },
});

widget.renderEl(
  { el: "#okta-login-container" },
  (res) => {
    if (res.status === "SUCCESS") {
      // Handle successful login
      this.handleOktaLogin(res.tokens);
    }
  },
  (err) => {
    console.error("Okta login error:", err);
  },
);
```

## Group Mapping

Map Okta groups to application roles:

```typescript
async mapOktaGroupsToRole(oktaGroups: string[]): Promise<UserRole> {
  // Example mapping
  if (oktaGroups.includes("Admins")) {
    return UserRole.Admin;
  }
  if (oktaGroups.includes("Managers")) {
    return UserRole.Manager;
  }
  return UserRole.User;
}

// Fetch user's groups from Okta
async getOktaUserGroups(userId: string): Promise<string[]> {
  const response = await fetch(
    `https://${domain}/api/v1/users/${userId}/groups`,
    {
      headers: {
        Authorization: `SSWS ${process.env.OKTA_API_TOKEN}`,
      },
    }
  );

  const groups = await response.json();
  return groups.map((g) => g.profile.name);
}
```

## Logout

### Single Logout

```typescript
async logout(user: User, token: string): Promise<{ redirectUrl?: string }> {
  // Remove local session
  user.authTokens = user.authTokens.filter((t) => t !== token);
  await this.userService.save(user);

  // For Okta users, return Okta logout URL
  if (user.authenticationStrategy?.type === "Okta") {
    const config = user.authenticationStrategy.config as OktaConfig;
    return {
      redirectUrl: `https://${config.domain}/oauth2/v1/logout?id_token_hint=${token}&post_logout_redirect_uri=${encodeURIComponent(process.env.APP_URL)}`,
    };
  }

  return {};
}
```

## Error Handling

| Error                  | Cause                         | Solution             |
| ---------------------- | ----------------------------- | -------------------- |
| `Invalid client_id`    | Wrong Okta client ID          | Check OKTA_CLIENT_ID |
| `Invalid redirect_uri` | Callback URL mismatch         | Add URL to Okta app  |
| `Token expired`        | Okta token no longer valid    | Re-authenticate      |
| `User not assigned`    | User not assigned to Okta app | Assign user in Okta  |

## Security Considerations

1. **Client Secret**: Store securely, never expose to frontend
2. **State Parameter**: Use cryptographic nonce to prevent CSRF
3. **Token Storage**: Store Okta tokens server-side only
4. **Scope Limitation**: Request minimum required scopes
5. **Token Introspection**: Enable for real-time revocation checking

## Next Steps

- [SAML 2.0](saml.md) - Alternative enterprise authentication
- [JWT Authentication](jwt.md) - Local token management
- [Security Architecture](../../architecture/security.md) - Overall security
