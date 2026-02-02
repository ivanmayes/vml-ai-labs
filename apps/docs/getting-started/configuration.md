# Configuration

The VML Open Boilerplate uses environment variables for configuration, keeping sensitive data out of the codebase. This guide covers all available configuration options.

## Environment Files

Both the API and Web applications use `.env` files for configuration:

```
apps/
├── api/
│   ├── .env           # Your local configuration (git-ignored)
│   └── .env.example   # Template with all options
└── web/
    ├── .env           # Your local configuration (git-ignored)
    └── .env.example   # Template with all options
```

{% hint style="warning" %}
Never commit `.env` files with real credentials. Only `.env.example` files should be in version control.
{% endhint %}

## API Configuration

### Database Settings

```env
# Database connection
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_DATABASE=vml_boilerplate

# Development settings
DB_SYNCHRONIZE=true    # Auto-sync schema (disable in production!)
DB_LOGGING=true        # Log SQL queries
DB_SSL=false           # Enable for production databases
```

| Variable         | Required | Description                                   |
| ---------------- | -------- | --------------------------------------------- |
| `DB_TYPE`        | Yes      | Database type (always `postgres`)             |
| `DB_HOST`        | Yes      | Database server hostname                      |
| `DB_PORT`        | Yes      | Database port (default: 5432)                 |
| `DB_USERNAME`    | Yes      | Database user                                 |
| `DB_PASSWORD`    | Yes      | Database password                             |
| `DB_DATABASE`    | Yes      | Database name                                 |
| `DB_SYNCHRONIZE` | No       | Auto-sync entities to schema (default: false) |
| `DB_LOGGING`     | No       | Enable query logging (default: false)         |
| `DB_SSL`         | No       | Enable SSL connection (default: false)        |

### Authentication Settings

```env
# JWT Configuration
JWT_SECRET=your-super-secret-key-at-least-32-characters
JWT_EXPIRES_IN=7d

# Private/Public Keys (for SAML)
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nYour key here\n-----END RSA PRIVATE KEY-----"
PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nYour key here\n-----END PUBLIC KEY-----"
```

| Variable         | Required | Description                               |
| ---------------- | -------- | ----------------------------------------- |
| `JWT_SECRET`     | Yes      | Secret key for JWT signing (min 32 chars) |
| `JWT_EXPIRES_IN` | No       | Token expiration (default: 7d)            |
| `PRIVATE_KEY`    | For SAML | RSA private key for SAML assertions       |
| `PUBLIC_KEY`     | For SAML | RSA public key for SAML verification      |

### Encryption Settings

```env
# Data encryption
PII_SIGNING_KEY=your-32-character-encryption-key
PII_SIGNING_OFFSET=your-16-char-iv
```

These keys are used for encrypting sensitive data at rest, such as:

- User profile information (names)
- API keys
- OAuth tokens

{% hint style="danger" %}
These keys are critical for data security. Store them securely and never rotate them without a migration plan, as existing encrypted data will become unreadable.
{% endhint %}

### Server Settings

```env
# Server configuration
PORT=8001
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200

# Rate limiting
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

| Variable         | Required | Description                               |
| ---------------- | -------- | ----------------------------------------- |
| `PORT`           | No       | API server port (default: 8001)           |
| `NODE_ENV`       | No       | Environment mode (development/production) |
| `CORS_ORIGIN`    | Yes      | Allowed CORS origin(s)                    |
| `THROTTLE_TTL`   | No       | Rate limit window in seconds              |
| `THROTTLE_LIMIT` | No       | Max requests per window                   |

### Email and Notification Settings

```env
# AWS SES
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
SES_FROM_EMAIL=noreply@yourdomain.com

# SendGrid (alternative)
SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Adobe AJO (alternative)
AJO_API_KEY=your_ajo_key
AJO_ENDPOINT=https://journey-ajo.adobe.io
```

### AI/LLM Provider Settings

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google Vertex AI
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GOOGLE_PROJECT_ID=your-project-id

# Azure OpenAI
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com

# AWS Bedrock
AWS_BEDROCK_REGION=us-east-1
```

### Okta Integration (Optional)

```env
# Okta OAuth
OKTA_DOMAIN=https://your-domain.okta.com
OKTA_CLIENT_ID=your_client_id
OKTA_CLIENT_SECRET=your_client_secret
```

## Web Configuration

### API Connection

The web application generates its configuration from environment variables at build time.

```env
# apps/web/.env
API_URL=http://localhost:8001
ORGANIZATION_ID=your-organization-uuid
PRODUCTION=false
LOCALE=en-US
```

| Variable          | Required | Description                     |
| ----------------- | -------- | ------------------------------- |
| `API_URL`         | Yes      | Backend API base URL            |
| `ORGANIZATION_ID` | Yes      | Default organization UUID       |
| `PRODUCTION`      | No       | Production mode flag            |
| `LOCALE`          | No       | Default locale (default: en-US) |

### Multi-Organization Configuration

For applications serving multiple organizations:

```env
# JSON configuration for multiple organizations
API_MAP='[
  {
    "name": "Development",
    "endpoint": "http://localhost:8001",
    "organizationId": "uuid-1",
    "production": false,
    "locale": "en-US"
  },
  {
    "name": "Production",
    "endpoint": "https://api.example.com",
    "organizationId": "uuid-2",
    "production": true,
    "locale": "en-US"
  }
]'
```

### WPP Open Integration

```env
WPP_OPEN_PARENT_ORIGIN=https://parent-app.wpp.com
WPP_OPEN_DEBUG=false
```

## Configuration Loading

### API: How It Works

The API loads configuration in `main.ts` and throughout the application:

```typescript
// Environment variables are available via process.env
const port = process.env.PORT || 8001;

// In services, use ConfigService (NestJS pattern)
@Injectable()
export class MyService {
  constructor(private configService: ConfigService) {}

  getApiKey() {
    return this.configService.get<string>("OPENAI_API_KEY");
  }
}
```

### Web: How It Works

The web app uses a build-time script to generate `environment.ts`:

```typescript
// src/environments/environment.ts (auto-generated)
export const environment = {
  production: false,
  apiUrl: "http://localhost:8001",
  organizationId: "your-uuid",
  locale: "en-US",
};
```

This is generated by running:

```bash
npm run config
# or automatically before build/serve
```

## Environment-Specific Settings

### Development

```env
NODE_ENV=development
DB_SYNCHRONIZE=true
DB_LOGGING=true
CORS_ORIGIN=http://localhost:4200
```

### Production

```env
NODE_ENV=production
DB_SYNCHRONIZE=false
DB_LOGGING=false
DB_SSL=true
CORS_ORIGIN=https://your-domain.com
```

## Validating Configuration

The API validates required configuration at startup. If critical variables are missing, the application will fail to start with a clear error message.

You can test your configuration:

```bash
# API
cd apps/api
npm run console:dev

# If configuration is valid, you'll see the CLI menu
# If invalid, you'll see error messages
```

## Secrets Management

For production deployments, consider using:

- **AWS Secrets Manager** - For AWS deployments
- **HashiCorp Vault** - For self-hosted secret management
- **Azure Key Vault** - For Azure deployments
- **Environment injection** - Via CI/CD pipelines

Example with AWS Secrets Manager:

```typescript
// Load secrets at runtime
import { SecretsManager } from "aws-sdk";

const secretsManager = new SecretsManager();
const secret = await secretsManager
  .getSecretValue({
    SecretId: "prod/vml-boilerplate",
  })
  .promise();

process.env.JWT_SECRET = JSON.parse(secret.SecretString).JWT_SECRET;
```

## Next Steps

- [First Steps](first-steps.md) - Start building your application
- [Authentication](../api/authentication/README.md) - Configure authentication strategies
