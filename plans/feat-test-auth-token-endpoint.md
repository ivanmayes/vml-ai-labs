# feat: Add Test Authentication Token Endpoint for API Testing

**Created**: 2025-01-24
**Type**: Enhancement
**Complexity**: Low

---

## Overview

Add a simple development-only endpoint that generates bearer tokens for test users, making API testing easier for developers and AI agents.

## Problem Statement

Getting auth tokens for API testing currently requires running CLI commands or going through the login flow. A simple HTTP endpoint would streamline this.

## Proposed Solution

Add `GET /dev/test-tokens` to the existing `UserAuthController` with:

- Environment variable gating (`ENABLE_TEST_AUTH=true` + `LOCALHOST=true`)
- Comma-delimited `TEST_USERS` env var for user emails
- Uses existing JWT signing and authTokens persistence patterns

---

## Implementation

### Single File Change: `apps/api/src/user/user-auth.controller.ts`

Add this method to the existing `UserAuthController`:

```typescript
@Get('dev/test-tokens')
public async getTestTokens(): Promise<ResponseEnvelope> {
  // Security gate - explicit env var check
  if (process.env.ENABLE_TEST_AUTH !== 'true' || process.env.LOCALHOST !== 'true') {
    throw new NotFoundException();
  }

  const testUsersEnv = process.env.TEST_USERS || '';
  if (!testUsersEnv.trim()) {
    return new ResponseEnvelope(ResponseStatus.Failure, 'TEST_USERS environment variable is not configured');
  }

  // Parse and normalize emails (same pattern as existing code)
  const emails = testUsersEnv
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  const uniqueEmails = [...new Set(emails)];

  // Batch lookup users
  const users = await this.userService.findByEmails(uniqueEmails);

  if (users.length === 0) {
    return new ResponseEnvelope(ResponseStatus.Failure, 'No users found for provided emails');
  }

  // Generate tokens using existing pattern from GetUserToken CLI
  const tokens = [];
  for (const user of users) {
    const token = this.jwtService.sign({
      id: user.id,
      email: user.email,
      emailNormalized: user.emailNormalized,
      organizationId: user.organizationId
    });

    // Add to authTokens array (existing pattern for revocation support)
    user.authTokens = user.authTokens || [];
    user.authTokens.push(token);

    tokens.push({
      email: user.email,
      userId: user.id,
      token
    });
  }

  // Batch save all users with new tokens
  await this.userService.saveMany(users);

  return new ResponseEnvelope(ResponseStatus.Success, `Generated ${tokens.length} tokens`, { tokens });
}
```

### Add Helper to UserService: `apps/api/src/user/user.service.ts`

```typescript
public async findByEmails(emails: string[]): Promise<User[]> {
  if (!emails.length) return [];
  return this.userRepository.find({
    where: { emailNormalized: In(emails) }
  });
}

public async saveMany(users: User[]): Promise<void> {
  await this.userRepository.save(users);
}
```

### Environment Variables: `apps/api/.env.example`

```bash
## Test Authentication (DEVELOPMENT ONLY)
## Set to 'true' to enable GET /dev/test-tokens endpoint
#ENABLE_TEST_AUTH=true
## Comma-delimited list of user emails to generate tokens for
#TEST_USERS=admin@test.local,user@test.local
```

### AGENTS.md Update

Add after "Running Linters" section:

````markdown
## API Testing

### Test Token Endpoint

Get bearer tokens for API testing without manual login.

#### Setup

Add to `apps/api/.env`:

```bash
ENABLE_TEST_AUTH=true
TEST_USERS=admin@test.local,user@test.local
```
````

Users must exist in database (create via `npm run console:dev InstallUser`).

#### Usage

```bash
# Get tokens
curl http://localhost:3000/user-auth/dev/test-tokens

# Use in requests
TOKEN=$(curl -s http://localhost:3000/user-auth/dev/test-tokens | jq -r '.data.tokens[0].token')
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/endpoint
```

#### Troubleshooting

| Issue              | Solution                                                   |
| ------------------ | ---------------------------------------------------------- |
| 404 response       | Set `ENABLE_TEST_AUTH=true` and `LOCALHOST=true` in `.env` |
| No tokens returned | Check `TEST_USERS` is set and users exist in database      |

```

---

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/user/user-auth.controller.ts` | Add `getTestTokens()` method (~40 lines) |
| `apps/api/src/user/user.service.ts` | Add `findByEmails()` and `saveMany()` helpers (~10 lines) |
| `apps/api/.env.example` | Add `ENABLE_TEST_AUTH` and `TEST_USERS` comments |
| `AGENTS.md` | Add "API Testing" section |

**Total new code: ~50 lines**

---

## Acceptance Criteria

- [ ] `GET /user-auth/dev/test-tokens` returns tokens when env vars are set
- [ ] Returns 404 when `ENABLE_TEST_AUTH` or `LOCALHOST` is not `true`
- [ ] Uses existing JWT signing pattern (same claims as normal login)
- [ ] Tokens added to `user.authTokens` array (existing revocation support)
- [ ] AGENTS.md documents the endpoint for AI agents

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Add to existing `UserAuthController` | Simpler than creating new module/controller |
| Use `ENABLE_TEST_AUTH` + `LOCALHOST` | Explicit opt-in, team-familiar pattern |
| Keep `authTokens` persistence | Maintains consistency with existing auth system |
| Batch save users | Avoids N+1 database writes |
| Throw `NotFoundException` when disabled | Endpoint "doesn't exist" in production |
| No separate guard | Inline check is clearer for single endpoint |

---

## What We're NOT Doing (Based on Review Feedback)

- ❌ Separate `DevModule` with `register()` pattern - over-engineering
- ❌ Separate `DevOnlyGuard` class - unnecessary for single endpoint
- ❌ Swagger decorators - dev endpoint shouldn't appear in API docs
- ❌ Complex error aggregation - simple failure message is sufficient
- ❌ Custom response format - use existing `ResponseEnvelope`

---

## References

- Existing token pattern: `apps/api/src/user/user.console.ts:55-66` (GetUserToken CLI)
- Existing env check pattern: `apps/api/src/main.ts:69` (SWAGGER_ENABLE)
- ResponseEnvelope: `apps/api/src/_core/models/index.ts`
```
