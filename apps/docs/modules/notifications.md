# Notifications Module

The Notifications module provides a centralized system for sending emails and managing notification templates. It supports multiple email providers and template localization.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NOTIFICATION SYSTEM                                   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      NOTIFICATION SERVICE                           │    │
│  │                                                                     │    │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │    │
│  │  │   Template   │───>│   Compile    │───>│   Provider   │         │    │
│  │  │   Lookup     │    │  (Handlebars)│    │   Dispatch   │         │    │
│  │  └──────────────┘    └──────────────┘    └──────────────┘         │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                        EMAIL PROVIDERS                              │    │
│  │                                                                     │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │  AWS SES │    │ SendGrid │    │Adobe AJO │    │  SMTP    │    │    │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘    │    │
│  │                                                                     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Notification Entity

```typescript
@Entity()
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  slug: string; // Template identifier (e.g., "welcome-email")

  @Column({ default: "en-US" })
  locale: string;

  @Column()
  subject: string;

  @Column({ type: "text", nullable: true })
  templateHtml: string;

  @Column({ type: "text", nullable: true })
  templateText: string;

  // External template ID (for SendGrid, etc.)
  @Column({ nullable: true })
  templateRemoteId: string;

  // Null = system-wide template
  @ManyToOne(() => Organization, { nullable: true, onDelete: "CASCADE" })
  organization: Organization;

  @Column({ nullable: true })
  organizationId: string;

  // Trigger configuration
  @Column({ nullable: true })
  triggerType: string;

  @Column({ nullable: true })
  triggerValue: string;

  // Available merge tags documentation
  @Column({ type: "jsonb", nullable: true })
  mergeTagMap: Record<string, string>;
}
```

## Template System

### Template Structure

Templates use Handlebars syntax for variable substitution:

```html
<!-- templateHtml -->
<h1>Welcome, {{firstName}}!</h1>
<p>Thank you for joining {{organizationName}}.</p>
<p>Click <a href="{{loginUrl}}">here</a> to access your account.</p>
```

```text
<!-- templateText -->
Welcome, {{firstName}}!

Thank you for joining {{organizationName}}.

Access your account: {{loginUrl}}
```

### Merge Tags

Document available merge tags in the `mergeTagMap`:

```json
{
  "firstName": "User's first name",
  "lastName": "User's last name",
  "email": "User's email address",
  "organizationName": "Organization name",
  "loginUrl": "Login page URL",
  "verificationCode": "One-time login code"
}
```

### Template Hierarchy

Templates are resolved in order:

1. Organization-specific template (matching slug + locale + orgId)
2. Organization-specific template (matching slug + orgId, any locale)
3. System template (matching slug + locale, null orgId)
4. System template (matching slug, null orgId)

```typescript
async findTemplate(slug: string, locale: string, orgId?: string): Promise<Notification | null> {
  // Try org-specific with locale
  let template = await this.repository.findOne({
    where: { slug, locale, organizationId: orgId },
  });

  if (template) return template;

  // Try org-specific without locale
  template = await this.repository.findOne({
    where: { slug, organizationId: orgId },
  });

  if (template) return template;

  // Try system template with locale
  template = await this.repository.findOne({
    where: { slug, locale, organizationId: IsNull() },
  });

  if (template) return template;

  // Fallback to system template
  return this.repository.findOne({
    where: { slug, organizationId: IsNull() },
  });
}
```

## Notification Service

```typescript
@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private repository: Repository<Notification>,
    private emailProvider: EmailProviderService,
  ) {}

  async send(options: SendNotificationOptions): Promise<void> {
    const { slug, locale, organizationId, to, data } = options;

    // Find template
    const template = await this.findTemplate(slug, locale, organizationId);
    if (!template) {
      throw new Error(`Template not found: ${slug}`);
    }

    // Compile template
    const subject = this.compile(template.subject, data);
    const html = this.compile(template.templateHtml, data);
    const text = this.compile(template.templateText, data);

    // Send via provider
    await this.emailProvider.send({
      to,
      subject,
      html,
      text,
    });
  }

  private compile(template: string, data: Record<string, any>): string {
    const compiled = Handlebars.compile(template);
    return compiled(data);
  }
}
```

### Send Options

```typescript
interface SendNotificationOptions {
  slug: string; // Template slug
  to: string | string[]; // Recipient(s)
  locale?: string; // Locale (default: en-US)
  organizationId?: string; // For org-specific templates
  data: Record<string, any>; // Merge tag values
  from?: string; // Override from address
  replyTo?: string; // Reply-to address
  cc?: string[]; // CC recipients
  bcc?: string[]; // BCC recipients
  attachments?: Attachment[]; // File attachments
}
```

## Email Providers

### AWS SES

```typescript
@Injectable()
export class SESEmailProvider implements EmailProvider {
  private ses: SESClient;

  constructor() {
    this.ses = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async send(options: EmailOptions): Promise<void> {
    const command = new SendEmailCommand({
      Source: options.from || process.env.SES_FROM_EMAIL,
      Destination: {
        ToAddresses: Array.isArray(options.to) ? options.to : [options.to],
        CcAddresses: options.cc,
        BccAddresses: options.bcc,
      },
      Message: {
        Subject: { Data: options.subject },
        Body: {
          Html: { Data: options.html },
          Text: { Data: options.text },
        },
      },
    });

    await this.ses.send(command);
  }
}
```

### SendGrid

```typescript
@Injectable()
export class SendGridEmailProvider implements EmailProvider {
  constructor() {
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
  }

  async send(options: EmailOptions): Promise<void> {
    await sendgrid.send({
      to: options.to,
      from: options.from || process.env.SENDGRID_FROM_EMAIL,
      subject: options.subject,
      text: options.text,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
    });
  }

  // Use SendGrid dynamic template
  async sendWithTemplate(
    templateId: string,
    to: string,
    data: Record<string, any>,
  ): Promise<void> {
    await sendgrid.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      templateId,
      dynamicTemplateData: data,
    });
  }
}
```

### Adobe AJO

```typescript
@Injectable()
export class AJOEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<void> {
    const response = await fetch(`${process.env.AJO_ENDPOINT}/email/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AJO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: options.to,
        subject: options.subject,
        htmlContent: options.html,
        textContent: options.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`AJO send failed: ${response.statusText}`);
    }
  }
}
```

## API Endpoints

### Template Management

```typescript
// List templates
GET /admin/organization/:orgId/notification
Authorization: Bearer <admin-jwt>

// Response
[
  {
    "id": "uuid",
    "slug": "welcome-email",
    "locale": "en-US",
    "subject": "Welcome to {{organizationName}}"
  }
]
```

```typescript
// Create template
POST /admin/organization/:orgId/notification
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "slug": "password-reset",
  "locale": "en-US",
  "subject": "Reset Your Password",
  "templateHtml": "<h1>Password Reset</h1><p>Click <a href=\"{{resetUrl}}\">here</a> to reset.</p>",
  "templateText": "Password Reset\n\nClick here to reset: {{resetUrl}}",
  "mergeTagMap": {
    "resetUrl": "Password reset URL"
  }
}
```

```typescript
// Update template
PUT /admin/organization/:orgId/notification/:id
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "subject": "Updated Subject",
  "templateHtml": "..."
}
```

```typescript
// Delete template
DELETE /admin/organization/:orgId/notification/:id
Authorization: Bearer <admin-jwt>
```

### Send Notification

```typescript
// Send notification (internal/admin use)
POST /admin/organization/:orgId/notification/send
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "slug": "welcome-email",
  "to": "user@example.com",
  "data": {
    "firstName": "John",
    "organizationName": "Acme Corp",
    "loginUrl": "https://app.example.com/login"
  }
}
```

## Common Templates

### Login Code

```typescript
// Slug: "login-code"
{
  subject: "Your Login Code: {{code}}",
  templateHtml: `
    <h1>Your Login Code</h1>
    <p>Use this code to log in:</p>
    <h2 style="font-size: 32px; letter-spacing: 8px;">{{code}}</h2>
    <p>This code expires in {{expiresIn}} minutes.</p>
  `,
  mergeTagMap: {
    code: "6-digit login code",
    expiresIn: "Code expiration time in minutes"
  }
}
```

### Welcome Email

```typescript
// Slug: "welcome-email"
{
  subject: "Welcome to {{organizationName}}!",
  templateHtml: `
    <h1>Welcome, {{firstName}}!</h1>
    <p>Your account has been created for {{organizationName}}.</p>
    <p><a href="{{loginUrl}}">Click here to get started</a></p>
  `,
  mergeTagMap: {
    firstName: "User's first name",
    organizationName: "Organization name",
    loginUrl: "Login URL"
  }
}
```

### Password Reset

```typescript
// Slug: "password-reset"
{
  subject: "Reset Your Password",
  templateHtml: `
    <h1>Password Reset Request</h1>
    <p>Click the link below to reset your password:</p>
    <p><a href="{{resetUrl}}">Reset Password</a></p>
    <p>This link expires in 1 hour.</p>
    <p>If you didn't request this, ignore this email.</p>
  `,
  mergeTagMap: {
    resetUrl: "Password reset URL"
  }
}
```

## Environment Configuration

```env
# AWS SES
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
SES_FROM_EMAIL=noreply@yourdomain.com

# SendGrid
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Adobe AJO
AJO_API_KEY=your_ajo_key
AJO_ENDPOINT=https://journey-ajo.adobe.io

# Default provider
EMAIL_PROVIDER=ses  # ses | sendgrid | ajo
```

## Best Practices

1. **Always have text version**: Provide both HTML and plain text
2. **Use merge tags**: Never hardcode dynamic content
3. **Locale fallback**: Always have a default locale template
4. **Test templates**: Preview before deploying to production
5. **Rate limiting**: Implement rate limits for bulk sends
6. **Bounce handling**: Set up bounce/complaint handlers for SES

## Next Steps

- [AWS Integration](../integrations/aws.md) - SES setup
- [Configuration](../getting-started/configuration.md) - Email settings
- [Users](users.md) - User-triggered notifications
