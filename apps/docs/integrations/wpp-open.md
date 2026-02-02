# WPP Open Integration

The VML Open Boilerplate includes built-in support for WPP Open, enabling seamless integration with the WPP Open ecosystem for authentication, theming, and cross-application communication.

## Overview

WPP Open is a platform that enables applications to be embedded within the WPP Open portal, providing:

- Single Sign-On (SSO) with WPP Open accounts
- Consistent theming across applications
- Cross-application navigation
- Tenant-based access control

## Configuration

### Environment Variables

```env
# Web application (.env)
WPP_OPEN_PARENT_ORIGIN=https://portal.wppopen.com
WPP_OPEN_DEBUG=false
```

### Space Configuration

Spaces can be configured to allow access from specific WPP Open tenants:

```typescript
// Space entity includes WPP Open tenant approval
@Column({ type: "simple-array", nullable: true })
approvedWPPOpenTenantIds: string[];
```

## WPP Open Service

### Service Implementation

```typescript
// _core/services/wpp-open/wpp-open.service.ts
@Injectable({ providedIn: "root" })
export class WppOpenService {
  private parentOrigin = environment.wppOpenParentOrigin;
  private isEmbedded = false;
  private tenantId: string | null = null;

  constructor(
    private sessionService: SessionService,
    private themeService: ThemeService,
  ) {
    this.initialize();
  }

  private initialize() {
    // Check if running in iframe
    this.isEmbedded = window.self !== window.top;

    if (this.isEmbedded) {
      this.setupMessageListener();
      this.requestInitialization();
    }
  }

  private setupMessageListener() {
    window.addEventListener("message", (event) => {
      if (event.origin !== this.parentOrigin) return;

      this.handleMessage(event.data);
    });
  }

  private handleMessage(message: WppOpenMessage) {
    switch (message.type) {
      case "INIT":
        this.handleInit(message.payload);
        break;
      case "THEME_CHANGE":
        this.handleThemeChange(message.payload);
        break;
      case "NAVIGATE":
        this.handleNavigation(message.payload);
        break;
      case "LOGOUT":
        this.handleLogout();
        break;
    }
  }

  private handleInit(payload: InitPayload) {
    this.tenantId = payload.tenantId;

    // Apply initial theme
    if (payload.theme) {
      this.themeService.applyWppOpenTheme(payload.theme);
    }

    // Handle SSO token if provided
    if (payload.accessToken) {
      this.sessionService.loginWithWppOpen(payload.accessToken);
    }

    // Notify parent that initialization is complete
    this.sendMessage({ type: "INIT_COMPLETE" });
  }

  private handleThemeChange(theme: WppOpenTheme) {
    this.themeService.applyWppOpenTheme(theme);
  }

  private handleNavigation(payload: NavigationPayload) {
    // Handle navigation request from parent
    window.location.href = payload.url;
  }

  private handleLogout() {
    this.sessionService.logout();
  }

  // Public API
  get isWppOpenEmbedded(): boolean {
    return this.isEmbedded;
  }

  get currentTenantId(): string | null {
    return this.tenantId;
  }

  sendMessage(message: WppOpenOutboundMessage) {
    if (!this.isEmbedded) return;

    window.parent.postMessage(message, this.parentOrigin);
  }

  requestNavigation(url: string) {
    this.sendMessage({
      type: "NAVIGATE_REQUEST",
      payload: { url },
    });
  }

  notifyReady() {
    this.sendMessage({ type: "APP_READY" });
  }

  notifyError(error: string) {
    this.sendMessage({
      type: "APP_ERROR",
      payload: { error },
    });
  }
}
```

### Message Types

```typescript
// Inbound messages (from WPP Open portal)
interface WppOpenMessage {
  type: "INIT" | "THEME_CHANGE" | "NAVIGATE" | "LOGOUT";
  payload?: any;
}

interface InitPayload {
  tenantId: string;
  userId?: string;
  accessToken?: string;
  theme?: WppOpenTheme;
}

interface WppOpenTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  darkMode: boolean;
}

// Outbound messages (to WPP Open portal)
interface WppOpenOutboundMessage {
  type: "INIT_COMPLETE" | "APP_READY" | "APP_ERROR" | "NAVIGATE_REQUEST";
  payload?: any;
}
```

## Theme Integration

### Theme Service

```typescript
// shared/services/theme.service.ts
@Injectable({ providedIn: "root" })
export class ThemeService {
  applyWppOpenTheme(theme: WppOpenTheme) {
    const root = document.documentElement;

    // Apply CSS variables
    root.style.setProperty("--primary-color", theme.primaryColor);
    root.style.setProperty("--secondary-color", theme.secondaryColor);
    root.style.setProperty("--font-family", theme.fontFamily);

    // Toggle dark mode
    document.body.classList.toggle("dark-theme", theme.darkMode);

    // Update PrimeNG theme
    this.updatePrimeNGTheme(theme);
  }

  private updatePrimeNGTheme(theme: WppOpenTheme) {
    // Update PrimeNG CSS variables
    const root = document.documentElement;
    root.style.setProperty("--primary-500", theme.primaryColor);
    root.style.setProperty("--primary-color", theme.primaryColor);
  }
}
```

### SCSS Integration

```scss
// theme/wpp-open/_variables.scss
:root {
  // Default values - overridden by WPP Open
  --wpp-primary-color: #0066cc;
  --wpp-secondary-color: #ff9900;
  --wpp-font-family: "WPP Sans", sans-serif;
}

// Apply WPP Open theming
.wpp-open-embedded {
  font-family: var(--wpp-font-family);

  .p-button {
    background-color: var(--wpp-primary-color);
  }

  .p-menubar {
    background-color: var(--wpp-secondary-color);
  }
}
```

## Authentication

### SSO Integration

```typescript
// session/session.service.ts
@Injectable({ providedIn: "root" })
export class SessionService {
  constructor(private api: ApiService) {}

  async loginWithWppOpen(wppOpenToken: string): Promise<void> {
    // Exchange WPP Open token for local JWT
    const response = await this.api
      .post<LoginResponse>("/auth/wpp-open", {
        token: wppOpenToken,
      })
      .toPromise();

    // Store local session
    this.login(response.accessToken, response.user);
  }
}
```

### API Endpoint

```typescript
// user-auth.controller.ts
@Controller("auth")
export class UserAuthController {
  @Post("wpp-open")
  async loginWithWppOpen(@Body() dto: WppOpenLoginDto): Promise<LoginResponse> {
    // Validate WPP Open token
    const wppOpenUser = await this.wppOpenService.validateToken(dto.token);

    // Find or create local user
    let user = await this.userService.findByWppOpenId(wppOpenUser.id);

    if (!user) {
      // JIT provisioning
      user = await this.userService.createFromWppOpen(wppOpenUser);
    }

    // Generate local JWT
    const token = await this.authService.createToken(user);

    return { accessToken: token, user: user.toPublic() };
  }
}
```

## Space Access Control

### Tenant Validation

```typescript
// space/guards/wpp-open-access.guard.ts
@Injectable()
export class WppOpenAccessGuard implements CanActivate {
  constructor(
    private spaceService: SpaceService,
    private wppOpenService: WppOpenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const spaceId = request.params.spaceId;
    const tenantId = this.wppOpenService.currentTenantId;

    if (!tenantId) {
      // Not in WPP Open context
      return true;
    }

    const space = await this.spaceService.findOne({
      where: { id: spaceId },
    });

    if (!space) {
      return false;
    }

    // Check if tenant is approved for this space
    return space.approvedWPPOpenTenantIds?.includes(tenantId) ?? false;
  }
}
```

### Managing Approved Tenants

```typescript
// Update space to add WPP Open tenant
PUT /admin/organization/:orgId/spaces/:spaceId
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "approvedWPPOpenTenantIds": ["tenant-1", "tenant-2"]
}
```

## Embedded Mode Detection

### Component Example

```typescript
@Component({
  selector: "app-layout",
  template: `
    <ng-container *ngIf="!isEmbedded">
      <app-header></app-header>
      <app-sidebar></app-sidebar>
    </ng-container>

    <main [class.embedded]="isEmbedded">
      <router-outlet></router-outlet>
    </main>

    <ng-container *ngIf="!isEmbedded">
      <app-footer></app-footer>
    </ng-container>
  `,
})
export class LayoutComponent {
  isEmbedded = inject(WppOpenService).isWppOpenEmbedded;
}
```

### Styling for Embedded Mode

```scss
// Reduce chrome when embedded
.embedded {
  // Hide duplicate navigation
  app-header,
  app-sidebar,
  app-footer {
    display: none;
  }

  // Full-width content
  main {
    margin: 0;
    padding: 0;
  }
}
```

## Navigation

### Requesting External Navigation

```typescript
// Navigate within WPP Open portal
this.wppOpenService.requestNavigation("/other-app/dashboard");
```

### Handling Navigation Requests

```typescript
// In WppOpenService
private handleNavigation(payload: NavigationPayload) {
  if (payload.internal) {
    // Internal app navigation
    this.router.navigate([payload.url]);
  } else {
    // External navigation (handled by portal)
    this.sendMessage({
      type: "NAVIGATE_REQUEST",
      payload: { url: payload.url },
    });
  }
}
```

## Debugging

Enable debug mode for development:

```env
WPP_OPEN_DEBUG=true
```

This logs all postMessage communication:

```typescript
private sendMessage(message: WppOpenOutboundMessage) {
  if (environment.wppOpenDebug) {
    console.log("[WPP Open] Sending:", message);
  }
  window.parent.postMessage(message, this.parentOrigin);
}

private handleMessage(message: WppOpenMessage) {
  if (environment.wppOpenDebug) {
    console.log("[WPP Open] Received:", message);
  }
  // ...
}
```

## Security Considerations

1. **Origin Validation**: Always validate message origins
2. **Token Validation**: Verify WPP Open tokens server-side
3. **Tenant Isolation**: Enforce tenant access controls
4. **HTTPS Only**: Require HTTPS for embedded contexts
5. **CSP Headers**: Configure Content-Security-Policy for frame-ancestors

## Next Steps

- [Theming](../web/theming.md) - PrimeNG theme customization
- [Authentication](../api/authentication/README.md) - SSO integration
- [Spaces](../modules/spaces.md) - Space access control
