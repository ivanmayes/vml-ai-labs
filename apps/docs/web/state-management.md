# State Management

The VML Open Boilerplate uses Akita for state management, providing a simple and powerful way to manage application state with reactive patterns.

## Why Akita?

| Feature           | Akita | NgRx | Plain Services |
| ----------------- | ----- | ---- | -------------- |
| Boilerplate       | Low   | High | None           |
| DevTools          | ✅    | ✅   | ❌             |
| Entity Management | ✅    | ✅   | ❌             |
| Learning Curve    | Low   | High | Low            |
| Type Safety       | ✅    | ✅   | Varies         |

## Store Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AKITA STORES                                       │
│                                                                              │
│  ┌────────────────────────────────┐    ┌────────────────────────────────┐  │
│  │         GLOBAL STORE           │    │        SESSION STORE           │  │
│  │                                │    │                                │  │
│  │  ┌──────────────────────────┐ │    │  ┌──────────────────────────┐ │  │
│  │  │         State            │ │    │  │         State            │ │  │
│  │  │  • header                │ │    │  │  • user                  │ │  │
│  │  │  • settings              │ │    │  │  • token                 │ │  │
│  │  │  • theme                 │ │    │  │  • organization          │ │  │
│  │  │  • loading               │ │    │  │  • permissions           │ │  │
│  │  └──────────────────────────┘ │    │  └──────────────────────────┘ │  │
│  │                                │    │                                │  │
│  │  ┌──────────────────────────┐ │    │  ┌──────────────────────────┐ │  │
│  │  │         Query            │ │    │  │         Query            │ │  │
│  │  │  • header$               │ │    │  │  • user$                 │ │  │
│  │  │  • isLoading$            │ │    │  │  • isLoggedIn$           │ │  │
│  │  │  • theme$                │ │    │  │  • hasPermission()       │ │  │
│  │  └──────────────────────────┘ │    │  └──────────────────────────┘ │  │
│  │                                │    │                                │  │
│  │  ┌──────────────────────────┐ │    │  ┌──────────────────────────┐ │  │
│  │  │        Service           │ │    │  │        Service           │ │  │
│  │  │  • setHeader()           │ │    │  │  • login()               │ │  │
│  │  │  • setLoading()          │ │    │  │  • logout()              │ │  │
│  │  │  • setTheme()            │ │    │  │  • updateUser()          │ │  │
│  │  └──────────────────────────┘ │    │  └──────────────────────────┘ │  │
│  │                                │    │                                │  │
│  └────────────────────────────────┘    └────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Store Pattern

Each store consists of three parts:

1. **Store** - Holds the state
2. **Query** - Reads state (selectors)
3. **Service** - Updates state (actions)

## Global Store

### State Definition

```typescript
// state/global/global.store.ts
import { Store, StoreConfig } from "@datorama/akita";

export interface GlobalState {
  header: {
    title: string;
    subtitle?: string;
    showBack?: boolean;
  };
  loading: boolean;
  theme: "light" | "dark";
  settings: Record<string, any>;
}

export function createInitialState(): GlobalState {
  return {
    header: { title: "VML Open" },
    loading: false,
    theme: "light",
    settings: {},
  };
}

@StoreConfig({ name: "global" })
export class GlobalStore extends Store<GlobalState> {
  constructor() {
    super(createInitialState());
  }
}
```

### Query

```typescript
// state/global/global.query.ts
import { Query } from "@datorama/akita";
import { GlobalStore, GlobalState } from "./global.store";

@Injectable({ providedIn: "root" })
export class GlobalQuery extends Query<GlobalState> {
  header$ = this.select("header");
  loading$ = this.select("loading");
  theme$ = this.select("theme");
  settings$ = this.select("settings");

  constructor(protected store: GlobalStore) {
    super(store);
  }

  get isLoading(): boolean {
    return this.getValue().loading;
  }

  get currentTheme(): string {
    return this.getValue().theme;
  }
}
```

### Service

```typescript
// state/global/global.service.ts
import { Injectable } from "@angular/core";
import { GlobalStore } from "./global.store";

@Injectable({ providedIn: "root" })
export class GlobalService {
  constructor(private store: GlobalStore) {}

  setHeader(header: { title: string; subtitle?: string; showBack?: boolean }) {
    this.store.update({ header });
  }

  setLoading(loading: boolean) {
    this.store.update({ loading });
  }

  setTheme(theme: "light" | "dark") {
    this.store.update({ theme });
    document.body.classList.toggle("dark-theme", theme === "dark");
  }

  updateSettings(settings: Record<string, any>) {
    this.store.update((state) => ({
      settings: { ...state.settings, ...settings },
    }));
  }
}
```

## Session Store

### State Definition

```typescript
// state/session/session.store.ts
import { Store, StoreConfig } from "@datorama/akita";

export interface SessionState {
  user: User | null;
  token: string | null;
  organization: Organization | null;
  permissions: string[];
}

export function createInitialState(): SessionState {
  return {
    user: null,
    token: null,
    organization: null,
    permissions: [],
  };
}

@StoreConfig({
  name: "session",
  resettable: true, // Enable reset on logout
})
export class SessionStore extends Store<SessionState> {
  constructor() {
    super(createInitialState());
  }
}
```

### Query

```typescript
// state/session/session.query.ts
import { Query } from "@datorama/akita";
import { SessionStore, SessionState } from "./session.store";

@Injectable({ providedIn: "root" })
export class SessionQuery extends Query<SessionState> {
  user$ = this.select("user");
  token$ = this.select("token");
  organization$ = this.select("organization");
  permissions$ = this.select("permissions");

  isLoggedIn$ = this.select((state) => !!state.token);

  constructor(protected store: SessionStore) {
    super(store);
  }

  get user(): User | null {
    return this.getValue().user;
  }

  get token(): string | null {
    return this.getValue().token;
  }

  get isLoggedIn(): boolean {
    return !!this.getValue().token;
  }

  hasPermission(permission: string): boolean {
    return this.getValue().permissions.includes(permission);
  }

  hasRole(role: string): boolean {
    return this.getValue().user?.role === role;
  }

  isAdmin(): boolean {
    const role = this.getValue().user?.role;
    return role === "SuperAdmin" || role === "Admin";
  }
}
```

### Service

```typescript
// state/session/session.service.ts
import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { SessionStore } from "./session.store";
import { ApiService } from "../../_core/services/api.service";

@Injectable({ providedIn: "root" })
export class SessionService {
  constructor(
    private store: SessionStore,
    private api: ApiService,
    private router: Router,
  ) {}

  login(token: string, user: User) {
    // Store in localStorage for persistence
    localStorage.setItem("token", token);

    // Update store
    this.store.update({
      token,
      user,
      permissions: user.permissions?.map((p) => p.type) || [],
    });
  }

  logout() {
    // Clear localStorage
    localStorage.removeItem("token");

    // Reset store to initial state
    this.store.reset();

    // Navigate to login
    this.router.navigate(["/login"]);
  }

  async loadSession(): Promise<boolean> {
    const token = localStorage.getItem("token");

    if (!token) {
      return false;
    }

    try {
      // Validate token with API
      const user = await this.api.get<User>("/auth/me").toPromise();

      this.store.update({
        token,
        user,
        permissions: user.permissions?.map((p) => p.type) || [],
      });

      return true;
    } catch {
      // Token invalid, clear session
      this.logout();
      return false;
    }
  }

  updateUser(user: Partial<User>) {
    this.store.update((state) => ({
      user: state.user ? { ...state.user, ...user } : null,
    }));
  }

  setOrganization(organization: Organization) {
    this.store.update({ organization });
  }
}
```

## Using Stores in Components

### Reading State

```typescript
@Component({
  selector: "app-header",
  standalone: true,
  imports: [CommonModule, AsyncPipe],
  template: `
    <header>
      <h1>{{ (header$ | async)?.title }}</h1>
      <p *ngIf="(header$ | async)?.subtitle">
        {{ (header$ | async)?.subtitle }}
      </p>
    </header>
  `,
})
export class HeaderComponent {
  header$ = inject(GlobalQuery).header$;
}
```

### Updating State

```typescript
@Component({
  selector: "app-page",
  standalone: true,
  template: `...`,
})
export class PageComponent implements OnInit {
  private globalService = inject(GlobalService);

  ngOnInit() {
    this.globalService.setHeader({
      title: "Dashboard",
      subtitle: "Welcome back",
    });
  }
}
```

### Conditional Rendering

```typescript
@Component({
  selector: "app-admin-menu",
  standalone: true,
  imports: [CommonModule, AsyncPipe],
  template: `
    <nav *ngIf="isAdmin$ | async">
      <a routerLink="/admin/users">Users</a>
      <a routerLink="/admin/settings">Settings</a>
    </nav>
  `,
})
export class AdminMenuComponent {
  isAdmin$ = inject(SessionQuery).select((state) =>
    ["SuperAdmin", "Admin"].includes(state.user?.role || ""),
  );
}
```

## Persistence

### Local Storage

```typescript
// Persist specific state to localStorage
import { persistState } from "@datorama/akita";

const storage = persistState({
  include: ["session.token"], // Only persist token
  key: "vml-state",
});
```

### Session Storage

```typescript
const storage = persistState({
  include: ["global.theme"],
  key: "vml-preferences",
  storage: sessionStorage,
});
```

## DevTools

Enable Akita DevTools in development:

```typescript
// main.ts
import { akitaDevtools } from "@datorama/akita";

if (!environment.production) {
  akitaDevtools();
}
```

Access via browser Redux DevTools extension.

## Entity Stores

For collections of entities (users, spaces, etc.):

```typescript
// state/users/users.store.ts
import { EntityStore, EntityState, StoreConfig } from "@datorama/akita";

export interface UsersState extends EntityState<User, string> {
  loading: boolean;
}

@StoreConfig({ name: "users" })
export class UsersStore extends EntityStore<UsersState> {
  constructor() {
    super({ loading: false });
  }
}
```

```typescript
// state/users/users.query.ts
import { QueryEntity } from "@datorama/akita";

@Injectable({ providedIn: "root" })
export class UsersQuery extends QueryEntity<UsersState> {
  loading$ = this.select("loading");

  constructor(protected store: UsersStore) {
    super(store);
  }
}
```

```typescript
// state/users/users.service.ts
@Injectable({ providedIn: "root" })
export class UsersService {
  constructor(
    private store: UsersStore,
    private api: ApiService,
  ) {}

  async loadUsers() {
    this.store.update({ loading: true });

    const users = await this.api.get<User[]>("/users").toPromise();
    this.store.set(users);

    this.store.update({ loading: false });
  }

  addUser(user: User) {
    this.store.add(user);
  }

  updateUser(id: string, user: Partial<User>) {
    this.store.update(id, user);
  }

  removeUser(id: string) {
    this.store.remove(id);
  }
}
```

## Best Practices

1. **One store per domain**: Session, Global, Users, etc.
2. **Use queries for reading**: Never access store directly
3. **Use services for writing**: Encapsulate update logic
4. **Async pipe**: Prefer async pipe over manual subscriptions
5. **Persist selectively**: Only persist what's needed

## Next Steps

- [Services](services.md) - API integration
- [Components](components.md) - UI patterns
- [Overview](overview.md) - Application architecture
