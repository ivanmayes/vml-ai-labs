# SAML 2.0 Authentication

The VML Open Boilerplate supports SAML 2.0 for enterprise identity federation. This enables organizations to authenticate users through their existing SAML identity providers (IdP) like Azure AD, Okta, OneLogin, or any SAML 2.0 compliant system.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SAML 2.0 AUTHENTICATION FLOW                        │
│                                                                              │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐         ┌────────┐ │
│  │  Client  │         │ API (SP) │         │   IdP    │         │  User  │ │
│  └────┬─────┘         └────┬─────┘         └────┬─────┘         └───┬────┘ │
│       │                    │                    │                   │       │
│  1.   │  Login request     │                    │                   │       │
│       │───────────────────>│                    │                   │       │
│       │                    │                    │                   │       │
│  2.   │  SAML challenge    │                    │                   │       │
│       │<───────────────────│                    │                   │       │
│       │                    │                    │                   │       │
│  3.   │  Redirect to IdP   │                    │                   │       │
│       │  (AuthnRequest)    │                    │                   │       │
│       │─────────────────────────────────────────>                   │       │
│       │                    │                    │                   │       │
│  4.   │                    │                    │  Login prompt     │       │
│       │                    │                    │──────────────────>│       │
│       │                    │                    │                   │       │
│  5.   │                    │                    │  Credentials      │       │
│       │                    │                    │<──────────────────│       │
│       │                    │                    │                   │       │
│  6.   │  POST SAMLResponse │                    │                   │       │
│       │<─────────────────────────────────────────                   │       │
│       │                    │                    │                   │       │
│  7.   │  SAMLResponse +    │                    │                   │       │
│       │  challenge         │                    │                   │       │
│       │───────────────────>│                    │                   │       │
│       │                    │                    │                   │       │
│  8.   │  Validate & JWT    │                    │                   │       │
│       │<───────────────────│                    │                   │       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

| Term                        | Description                                         |
| --------------------------- | --------------------------------------------------- |
| **Service Provider (SP)**   | Your application - receives assertions from IdP     |
| **Identity Provider (IdP)** | External system that authenticates users            |
| **AuthnRequest**            | Request from SP to IdP to authenticate a user       |
| **SAMLResponse**            | IdP's response containing user identity assertions  |
| **Assertion**               | Signed statement about user identity and attributes |
| **Challenge**               | Encrypted token linking user to SAML session        |

## Configuration

### Authentication Strategy Setup

```typescript
POST /admin/organization/:orgId/authentication-strategy
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "name": "Corporate SSO",
  "type": "SAML2.0",
  "config": {
    "entryPoint": "https://idp.company.com/sso/saml",
    "issuer": "https://your-app.com/saml/metadata",
    "cert": "-----BEGIN CERTIFICATE-----\nMIIC...==\n-----END CERTIFICATE-----"
  }
}
```

**Configuration options:**

```typescript
interface SAMLConfig {
  entryPoint: string; // IdP SSO URL
  issuer: string; // SP Entity ID
  cert: string; // IdP signing certificate (PEM format)
  callbackUrl?: string; // Assertion Consumer Service URL
  signatureAlgorithm?: "sha256" | "sha512";
  digestAlgorithm?: "sha256" | "sha512";
}
```

### Environment Variables

```env
# SP signing keys
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"

PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"

# PII encryption for challenge tokens
PII_SIGNING_KEY=your-32-character-encryption-key
PII_SIGNING_OFFSET=your-16-char-iv
```

### IdP Configuration

Configure your Identity Provider with:

| Setting             | Value                                     |
| ------------------- | ----------------------------------------- |
| SP Entity ID        | `https://your-app.com/saml/metadata`      |
| ACS URL             | `https://your-app.com/auth/saml/callback` |
| Name ID Format      | `emailAddress`                            |
| Signature Algorithm | RSA-SHA256                                |
| Required Attributes | email, firstName, lastName                |

## Challenge Flow

The challenge system links the SAML session to a specific user and prevents replay attacks.

### Step 1: Generate Challenge

```typescript
// auth.service.ts
async getUserSAMLChallenge(user: User): Promise<string> {
  const challengeData = {
    userId: user.id,
    organizationId: user.organizationId,
    nonce: crypto.randomBytes(32).toString("hex"),
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
  };

  // Double encryption for security
  const innerEncrypted = this.crypt.encrypt(
    JSON.stringify(challengeData),
    this.getUserKey(user),
    this.getUserIv(user)
  );

  const outerEncrypted = this.crypt.encrypt(
    innerEncrypted,
    process.env.PII_SIGNING_KEY,
    process.env.PII_SIGNING_OFFSET
  );

  // Store challenge hash on user for verification
  user.authChallenge = crypto
    .createHash("sha256")
    .update(outerEncrypted)
    .digest("hex");
  await this.userService.save(user);

  return outerEncrypted;
}
```

### Step 2: Initiate SAML Login

```typescript
// Client initiates login
POST /auth/login
Content-Type: application/json

{
  "email": "user@company.com",
  "organizationSlug": "acme-corp"
}

// API response with challenge and redirect
{
  "challenge": "encrypted-challenge-string",
  "redirectUrl": "https://idp.company.com/sso/saml?SAMLRequest=base64encodedrequest"
}
```

### Step 3: Handle SAML Response

```typescript
// auth.controller.ts
@Post("saml/callback")
async handleSAMLCallback(
  @Body() body: { SAMLResponse: string; challenge: string }
): Promise<LoginResult> {
  // Parse and validate SAML response
  const assertion = await this.parseSAMLResponse(body.SAMLResponse);

  // Validate challenge
  const user = await this.authService.getUserFromSAMLChallenge(body.challenge);

  if (!user) {
    throw new UnauthorizedException("Invalid or expired challenge");
  }

  // Verify email matches
  if (user.email.toLowerCase() !== assertion.email.toLowerCase()) {
    throw new UnauthorizedException("Email mismatch");
  }

  // Clear challenge (one-time use)
  user.authChallenge = null;
  await this.userService.save(user);

  // Generate JWT
  const token = await this.authService.createToken(user);

  return { accessToken: token, user: user.toPublic() };
}
```

### Step 4: Validate Challenge

```typescript
// auth.service.ts
async getUserFromSAMLChallenge(challenge: string): Promise<User | null> {
  // Decrypt outer layer
  const innerEncrypted = this.crypt.decrypt(
    challenge,
    process.env.PII_SIGNING_KEY,
    process.env.PII_SIGNING_OFFSET
  );

  // Parse to get user ID for inner key
  const tempData = JSON.parse(
    this.crypt.decrypt(innerEncrypted, tempKey, tempIv)
  );

  const user = await this.userService.findOne({
    where: { id: tempData.userId },
    relations: ["authenticationStrategy"],
  });

  if (!user) return null;

  // Verify challenge hash matches stored value
  const expectedHash = crypto
    .createHash("sha256")
    .update(challenge)
    .digest("hex");

  if (user.authChallenge !== expectedHash) {
    return null;
  }

  // Decrypt inner layer with user-specific key
  const decrypted = this.crypt.decrypt(
    innerEncrypted,
    this.getUserKey(user),
    this.getUserIv(user)
  );

  const data = JSON.parse(decrypted);

  // Verify not expired
  if (Date.now() > data.expires) {
    return null;
  }

  // Verify auth strategy is SAML
  if (user.authenticationStrategy?.type !== "SAML2.0") {
    return null;
  }

  return user;
}
```

## SAML Response Parsing

```typescript
import { parseStringPromise } from "xml2js";
import * as crypto from "crypto";

async parseSAMLResponse(base64Response: string): Promise<SAMLAssertion> {
  // Decode and parse XML
  const xml = Buffer.from(base64Response, "base64").toString("utf8");
  const parsed = await parseStringPromise(xml);

  // Extract assertion
  const response = parsed["saml2p:Response"];
  const assertion = response["saml2:Assertion"][0];

  // Verify signature
  const isValid = await this.verifySignature(xml, this.idpCertificate);
  if (!isValid) {
    throw new UnauthorizedException("Invalid SAML signature");
  }

  // Extract attributes
  const attributes = assertion["saml2:AttributeStatement"][0]["saml2:Attribute"];
  const email = this.getAttribute(attributes, "email");
  const firstName = this.getAttribute(attributes, "firstName");
  const lastName = this.getAttribute(attributes, "lastName");

  return { email, firstName, lastName };
}

private async verifySignature(xml: string, cert: string): Promise<boolean> {
  const SignedXml = require("xml-crypto").SignedXml;
  const select = require("xml-crypto").xpath;
  const dom = require("xmldom").DOMParser;

  const doc = new dom().parseFromString(xml);
  const signature = select(
    doc,
    "//*//*[local-name(.)='Signature' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']"
  )[0];

  const sig = new SignedXml();
  sig.keyInfoProvider = {
    getKeyInfo: () => `<X509Data></X509Data>`,
    getKey: () => cert,
  };

  sig.loadSignature(signature);
  return sig.checkSignature(xml);
}
```

## SP Metadata

Generate metadata for IdP configuration:

```typescript
@Get("saml/metadata")
getMetadata(): string {
  return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="https://your-app.com/saml/metadata">
  <md:SPSSODescriptor
      AuthnRequestsSigned="true"
      WantAssertionsSigned="true"
      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${process.env.PUBLIC_KEY_CERT}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="https://your-app.com/auth/saml/callback"
        index="0"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}
```

## User Provisioning

### Just-in-Time Provisioning

```typescript
async handleSAMLLogin(assertion: SAMLAssertion, orgId: string): Promise<User> {
  let user = await this.userService.findOne({
    where: {
      email: assertion.email,
      organizationId: orgId,
    },
  });

  if (!user) {
    // Create new user from SAML assertion
    user = await this.userService.create({
      email: assertion.email,
      organizationId: orgId,
      profile: {
        firstName: assertion.firstName,
        lastName: assertion.lastName,
      },
      authenticationStrategyId: strategyId,
      role: UserRole.User,
      activationStatus: UserActivationStatus.Activated,
    });
  }

  return user;
}
```

### Attribute Mapping

Map SAML attributes to user profile:

```typescript
const attributeMapping = {
  email: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "email",
    "mail",
  ],
  firstName: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    "firstName",
    "givenName",
  ],
  lastName: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    "lastName",
    "sn",
  ],
};

function getAttribute(attributes: any[], name: string): string | null {
  const keys = attributeMapping[name] || [name];

  for (const attr of attributes) {
    const attrName = attr.$.Name;
    if (keys.includes(attrName)) {
      return attr["saml2:AttributeValue"][0]._;
    }
  }

  return null;
}
```

## Security Considerations

### Signature Verification

Always verify SAML response signatures:

```typescript
// Verify both response and assertion signatures
const responseSignatureValid = await this.verifySignature(
  xml,
  "Response",
  this.idpCertificate,
);

const assertionSignatureValid = await this.verifySignature(
  xml,
  "Assertion",
  this.idpCertificate,
);

if (!responseSignatureValid || !assertionSignatureValid) {
  throw new UnauthorizedException("Invalid SAML signature");
}
```

### Replay Prevention

The challenge system prevents replay attacks:

1. Challenge expires after 5 minutes
2. Challenge is single-use (cleared after verification)
3. Challenge hash stored on user prevents tampering
4. Double encryption with user-specific keys

### Certificate Management

```typescript
// Store IdP certificate securely
const idpCertificate = process.env.SAML_IDP_CERT;

// Validate certificate before use
if (!idpCertificate.includes("BEGIN CERTIFICATE")) {
  throw new Error("Invalid IdP certificate format");
}
```

## Error Handling

| Error                    | Cause                           | Solution               |
| ------------------------ | ------------------------------- | ---------------------- |
| `Invalid SAML signature` | Response tampered or wrong cert | Verify IdP certificate |
| `Challenge expired`      | User took too long              | Restart login flow     |
| `Email mismatch`         | Different user responded        | Verify user assignment |
| `Invalid challenge`      | Challenge tampered              | Restart login flow     |
| `User not found`         | Pre-provisioning required       | Create user first      |

## Next Steps

- [Okta Integration](okta.md) - OAuth/OIDC alternative
- [JWT Authentication](jwt.md) - Local token management
- [Security Architecture](../../architecture/security.md) - Overall security
