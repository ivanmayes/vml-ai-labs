# Installation

This guide walks you through setting up the VML Open Boilerplate development environment from scratch.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

| Requirement | Version          | Purpose            |
| ----------- | ---------------- | ------------------ |
| Node.js     | 20.19+ or 22.12+ | JavaScript runtime |
| npm         | 10+              | Package manager    |
| PostgreSQL  | 14+              | Database           |
| Git         | 2.x              | Version control    |

### Optional Tools

- **nvm** - Node Version Manager for managing multiple Node.js versions
- **Docker** - For containerized PostgreSQL (alternative to local installation)
- **VS Code** - Recommended IDE with extensions

## Step 1: Clone the Repository

```bash
git clone https://github.com/VMLYR/vml-open-boilerplate.git
cd vml-open-boilerplate
```

## Step 2: Install Dependencies

The project uses npm workspaces to manage the monorepo. Install all dependencies from the root:

```bash
npm install
```

This installs dependencies for:

- Root project (shared tooling)
- `apps/api` - NestJS backend
- `apps/web` - Angular frontend
- `apps/docs` - Documentation

## Step 3: Set Up PostgreSQL

### Option A: Local PostgreSQL

1. Install PostgreSQL using your system's package manager:

   ```bash
   # macOS with Homebrew
   brew install postgresql@14
   brew services start postgresql@14

   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   sudo systemctl start postgresql
   ```

2. Create a database and user:

   ```bash
   # Connect to PostgreSQL
   psql postgres

   # Create database and user
   CREATE DATABASE vml_boilerplate;
   CREATE USER vml_user WITH ENCRYPTED PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE vml_boilerplate TO vml_user;
   \q
   ```

### Option B: Docker PostgreSQL

```bash
docker run --name vml-postgres \
  -e POSTGRES_DB=vml_boilerplate \
  -e POSTGRES_USER=vml_user \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -d postgres:14
```

## Step 4: Configure Environment Variables

### API Configuration

Copy the example environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` with your settings:

```env
# Database
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=vml_user
DB_PASSWORD=your_password
DB_DATABASE=vml_boilerplate
DB_SYNCHRONIZE=true

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d

# Encryption Keys
PII_SIGNING_KEY=your-32-character-encryption-key
PII_SIGNING_OFFSET=your-16-char-offset

# Server
PORT=8001
NODE_ENV=development
```

### Web Configuration

Copy the example environment file:

```bash
cp apps/web/.env.example apps/web/.env
```

Edit `apps/web/.env`:

```env
API_URL=http://localhost:8001
ORGANIZATION_ID=your-organization-uuid
```

## Step 5: Initialize the Database

Run the CLI to set up the initial organization and admin user:

```bash
# Navigate to the API directory
cd apps/api

# Install an organization
npm run console:dev InstallOrganization

# Follow the prompts to create:
# 1. Organization name and slug
# 2. Authentication strategy
# 3. Admin user
```

This interactive process will:

1. Create your first organization
2. Set up an authentication strategy (Basic email/code is recommended for development)
3. Create an admin user

## Step 6: Start Development Servers

Open two terminal windows:

**Terminal 1 - API Server:**

```bash
npm run start:api
# API runs at http://localhost:8001
```

**Terminal 2 - Web Server:**

```bash
npm run start:web
# Web app runs at http://localhost:4200
```

## Step 7: Verify Installation

1. **Check API Health:**

   ```bash
   curl http://localhost:8001/health
   # Should return: {"status":"ok"}
   ```

2. **Access Web Application:**
   Open http://localhost:4200 in your browser

3. **View API Documentation:**
   Open http://localhost:8001/api for Swagger documentation

## Troubleshooting

### Common Issues

#### Database Connection Failed

- Verify PostgreSQL is running: `pg_isready`
- Check credentials in `.env` file
- Ensure database exists: `psql -l`

#### Port Already in Use

```bash
# Find process using port 8001
lsof -i :8001
# Kill it if needed
kill -9 <PID>
```

#### Node Version Mismatch

```bash
# Install correct version with nvm
nvm install 20.19
nvm use 20.19
```

#### Module Not Found Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules apps/*/node_modules
npm install
```

## Next Steps

- [Project Structure](project-structure.md) - Learn how the codebase is organized
- [Configuration](configuration.md) - Detailed configuration options
- [First Steps](first-steps.md) - Build your first feature
