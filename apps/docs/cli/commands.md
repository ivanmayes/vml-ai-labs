# CLI Commands

The VML Open Boilerplate includes a powerful command-line interface for administrative tasks, database operations, and development utilities.

## Running CLI Commands

```bash
# Development mode
cd apps/api
npm run console:dev <CommandName> [arguments]

# Production mode
npm run console:prod <CommandName> [arguments]
```

## Available Commands

### Organization Management

#### InstallOrganization

Creates a new organization (tenant).

```bash
npm run console:dev InstallOrganization
```

**Interactive prompts:**

1. Organization name (e.g., "Acme Corporation")
2. Slug (URL-friendly identifier, e.g., "acme-corp")

**Output:**

```
✓ Organization created successfully
  ID: 550e8400-e29b-41d4-a716-446655440000
  Name: Acme Corporation
  Slug: acme-corp
```

### Authentication Setup

#### InstallAuthStrategy

Configures an authentication strategy for an organization.

```bash
npm run console:dev InstallAuthStrategy
```

**Interactive prompts:**

1. Select organization
2. Strategy type: Basic, Okta, or SAML2.0
3. Strategy name
4. Type-specific configuration:
   - **Basic**: Code length, code lifetime
   - **Okta**: Client ID, domain, strategy type, UI type
   - **SAML**: Entry point, issuer, certificate

**Example output:**

```
✓ Authentication strategy created
  ID: a3b8d240-4f5e-6789-c012-345678901234
  Type: Basic
  Config: { codeLength: 6, codeLifetimeMinutes: 5 }
```

### User Management

#### InstallUser

Creates a new user in an organization.

```bash
npm run console:dev InstallUser
```

**Interactive prompts:**

1. Select organization
2. Select authentication strategy
3. Email address
4. First name
5. Last name
6. Role: SuperAdmin, Admin, Manager, User, or Guest

**Output:**

```
✓ User created successfully
  ID: b2c9e350-5d6f-7890-d123-456789012345
  Email: user@example.com
  Role: Admin
```

#### GetUserToken

Generates a JWT token for a user (development/testing).

```bash
npm run console:dev GetUserToken <user-id>
```

**Arguments:**

- `user-id`: The UUID of the user

**Output:**

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

Use this token in API requests:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8001/auth/me
```

### API Key Management

#### CreateApiKey

Creates a new API key for service authentication.

```bash
npm run console:dev CreateApiKey
```

**Interactive prompts:**

1. Select organization
2. Key name (for identification)
3. Expiration date (optional)

**Output:**

```
✓ API key created
  ID: c3d0f460-6e7g-8901-e234-567890123456
  Name: Integration Service
  Key: abc123...xyz789  (Store this securely - shown only once!)
```

### Database Operations

#### MigrateDatabase

Runs pending database migrations.

```bash
npm run console:dev MigrateDatabase
```

**Output:**

```
Running migrations...
✓ Migration 1704067200000-AddUserStatus completed
✓ Migration 1704153600000-AddSpaceSettings completed
✓ 2 migrations applied
```

#### SeedDatabase

Seeds the database with initial data.

```bash
npm run console:dev SeedDatabase
```

**What it creates:**

- Default notification templates
- System-wide settings
- Sample data (if configured)

### Utility Commands

#### EncryptValue

Encrypts a value using the configured encryption key.

```bash
npm run console:dev EncryptValue "sensitive-data"
```

**Output:**

```
Encrypted: a1b2c3d4e5f6...
```

#### DecryptValue

Decrypts an encrypted value.

```bash
npm run console:dev DecryptValue "a1b2c3d4e5f6..."
```

**Output:**

```
Decrypted: sensitive-data
```

#### HashPassword

Generates a bcrypt hash for a password.

```bash
npm run console:dev HashPassword "mypassword"
```

**Output:**

```
Hash: $2b$10$...
```

## Creating Custom Commands

### Command Structure

```typescript
// src/my-feature/my-feature.console.ts
import { Command, Console } from "nestjs-console";

@Console()
export class MyFeatureConsole {
  constructor(
    private myService: MyService,
    private consoleService: ConsoleService,
  ) {}

  @Command({
    command: "MyCommand",
    description: "Does something useful",
  })
  async myCommand(): Promise<void> {
    // Interactive prompts
    const name = await this.consoleService.ask("Enter name:");

    const options = await this.consoleService.select("Select option:", [
      { name: "Option A", value: "a" },
      { name: "Option B", value: "b" },
    ]);

    // Perform action
    const result = await this.myService.doSomething(name, options);

    // Output result
    this.consoleService.success("Operation completed");
    this.consoleService.info(`Result: ${result.id}`);
  }
}
```

### Register the Command

```typescript
// src/common.module.ts
@Module({
  providers: [
    // ... other providers
    MyFeatureConsole,
  ],
})
export class CommonModule {}
```

### Console Service Utilities

```typescript
// Ask for text input
const name = await this.consoleService.ask("Enter name:");

// Ask with default value
const email = await this.consoleService.ask(
  "Enter email:",
  "default@example.com",
);

// Password input (hidden)
const password = await this.consoleService.password("Enter password:");

// Yes/no confirmation
const confirm = await this.consoleService.confirm("Are you sure?");

// Select from list
const choice = await this.consoleService.select("Select option:", [
  { name: "Option A", value: "a" },
  { name: "Option B", value: "b" },
]);

// Multi-select
const choices = await this.consoleService.multiSelect("Select options:", [
  { name: "Option A", value: "a" },
  { name: "Option B", value: "b" },
]);

// Output methods
this.consoleService.success("Success message");
this.consoleService.error("Error message");
this.consoleService.warn("Warning message");
this.consoleService.info("Info message");
this.consoleService.log("Plain message");
```

### Command with Arguments

```typescript
@Command({
  command: "ProcessUser <userId>",
  description: "Process a specific user",
})
async processUser(userId: string): Promise<void> {
  const user = await this.userService.findOne({ where: { id: userId } });

  if (!user) {
    this.consoleService.error("User not found");
    return;
  }

  // Process user...
}
```

### Command with Options

```typescript
@Command({
  command: "ExportData",
  description: "Export data to file",
  options: [
    {
      flags: "-f, --format <format>",
      description: "Output format (json, csv)",
      defaultValue: "json",
    },
    {
      flags: "-o, --output <path>",
      description: "Output file path",
    },
  ],
})
async exportData(options: { format: string; output?: string }): Promise<void> {
  const data = await this.dataService.getAll();

  if (options.format === "csv") {
    // Export as CSV
  } else {
    // Export as JSON
  }
}
```

## Environment-Specific Execution

### Development

```bash
# Uses .env file, enables debug logging
npm run console:dev CommandName
```

### Production

```bash
# Uses production environment
npm run console:prod CommandName
```

### With Environment Variables

```bash
# Override specific variables
DB_HOST=production-db npm run console:prod MigrateDatabase
```

## Common Workflows

### Initial Setup

```bash
# 1. Create organization
npm run console:dev InstallOrganization

# 2. Set up authentication
npm run console:dev InstallAuthStrategy

# 3. Create admin user
npm run console:dev InstallUser

# 4. Get token for testing
npm run console:dev GetUserToken <user-id>
```

### Database Reset (Development)

```bash
# Drop and recreate database
npm run console:dev DropDatabase
npm run console:dev MigrateDatabase
npm run console:dev SeedDatabase
```

### Create API Integration

```bash
# 1. Create API key for service
npm run console:dev CreateApiKey

# 2. Test the key
curl -H "Authorization: Bearer <api-key>" http://localhost:8001/health
```

## Troubleshooting

### Command Not Found

Ensure the command class is:

1. Decorated with `@Console()`
2. Exported from its module
3. Registered in `common.module.ts`

### Database Connection Error

Check your `.env` file:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your_user
DB_PASSWORD=your_password
DB_DATABASE=your_database
```

### Permission Denied

Some commands require specific user roles. Check the command implementation for role requirements.

## Next Steps

- [Database Setup](database-setup.md) - Initial database configuration
- [Configuration](../getting-started/configuration.md) - Environment variables
- [API Overview](../api/overview.md) - API endpoints
