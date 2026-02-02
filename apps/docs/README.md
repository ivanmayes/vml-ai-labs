# VML Open Boilerplate

Welcome to the VML Open Boilerplate documentation. This is a comprehensive enterprise-grade multi-tenant SaaS platform built with NestJS (API) and Angular (Web), designed to accelerate the development of secure, scalable applications.

## What is VML Open Boilerplate?

VML Open Boilerplate is a production-ready monorepo that provides everything you need to build modern web applications with:

- **Multi-tenant Architecture** - Organizations, Spaces, and Users with hierarchical permissions
- **Flexible Authentication** - JWT, API Keys, Okta OAuth, and SAML 2.0 support
- **Enterprise Security** - Encrypted data at rest, role-based access control, and fraud prevention
- **AI/LLM Integration** - Ready-to-use connectors for OpenAI, Anthropic, Google, Azure, and AWS Bedrock
- **Notification System** - Multi-channel notifications via AWS SES, SendGrid, and Adobe AJO
- **Modern Frontend** - Angular 19+ with PrimeNG components and Akita state management

## Quick Start

```bash
# Clone the repository
git clone https://github.com/VMLYR/vml-open-boilerplate.git
cd vml-open-boilerplate

# Install dependencies
npm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start the development servers
npm run start:api
npm run start:web
```

## Documentation Overview

### Getting Started

- [Installation Guide](getting-started/installation.md) - Set up your development environment
- [Project Structure](getting-started/project-structure.md) - Understand how the codebase is organized
- [Configuration](getting-started/configuration.md) - Configure environment variables and settings

### Architecture

- [System Overview](architecture/overview.md) - High-level architecture and design decisions
- [Multi-tenancy](architecture/multi-tenancy.md) - How organizations, spaces, and users work together
- [Database Schema](architecture/database-schema.md) - Entity relationships and data models

### API Development

- [API Overview](api/overview.md) - Introduction to the NestJS backend
- [Authentication](api/authentication/README.md) - JWT, API keys, OAuth, and SAML
- [Controllers & Routes](api/controllers.md) - REST endpoint patterns
- [Services & Business Logic](api/services.md) - Service layer architecture
- [Database & Entities](api/database.md) - TypeORM entities and migrations

### Web Development

- [Web Overview](web/overview.md) - Introduction to the Angular frontend
- [State Management](web/state-management.md) - Akita stores and services
- [Components](web/components.md) - Shared components and patterns
- [Routing & Guards](web/routing.md) - Navigation and access control

### Integrations

- [AI/LLM Providers](integrations/ai-llm.md) - OpenAI, Anthropic, Google, and more
- [AWS Services](integrations/aws.md) - SES, SQS, Lambda, Cognito
- [Notification Providers](integrations/notifications.md) - Email and messaging

### CLI Reference

- [Console Commands](cli/commands.md) - Administrative CLI tools

## Key Concepts

Before diving in, familiarize yourself with these core concepts:

| Concept                     | Description                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------- |
| **Organization**            | The top-level tenant container. All users and resources belong to an organization. |
| **Space**                   | A workspace within an organization. Provides secondary scoping for resources.      |
| **User**                    | An individual account with roles and permissions. Can belong to multiple spaces.   |
| **Authentication Strategy** | The method used to verify user identity (Basic, Okta, SAML).                       |
| **API Key**                 | Service-to-service authentication token with organization scope.                   |

## Technology Stack

| Layer            | Technology                      |
| ---------------- | ------------------------------- |
| API Framework    | NestJS 10+                      |
| Web Framework    | Angular 19+                     |
| Database         | PostgreSQL with TypeORM         |
| UI Components    | PrimeNG                         |
| State Management | Akita                           |
| Authentication   | Passport.js, JWT                |
| Testing          | Jest (API), Karma/Jasmine (Web) |

## Contributing

See our [Contributing Guide](contributing.md) for information on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
