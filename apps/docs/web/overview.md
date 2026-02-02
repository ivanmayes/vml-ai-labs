# Web Application Overview

The VML Open Boilerplate web application is built with Angular, providing a modern, responsive frontend that integrates seamlessly with the NestJS API.

## Technology Stack

| Technology  | Purpose                    |
| ----------- | -------------------------- |
| Angular 19+ | Application framework      |
| PrimeNG     | UI component library       |
| Akita       | State management           |
| RxJS        | Reactive programming       |
| SCSS        | Styling with CSS variables |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ANGULAR APPLICATION                                 │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                         COMPONENTS                                  │    │
│  │                                                                     │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │  Pages   │    │  Shared  │    │ Dialogs  │    │  Layout  │    │    │
│  │  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    │    │
│  └───────┼───────────────┼───────────────┼───────────────┼──────────┘    │
│          │               │               │               │                │
│          └───────────────┴───────────────┴───────────────┘                │
│                                    │                                       │
│                                    ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    STATE MANAGEMENT (AKITA)                         │    │
│  │                                                                     │    │
│  │  ┌───────────────────┐        ┌───────────────────┐               │    │
│  │  │   Global Store    │        │   Session Store   │               │    │
│  │  │   • Settings      │        │   • User          │               │    │
│  │  │   • Header        │        │   • Token         │               │    │
│  │  │   • Theme         │        │   • Organization  │               │    │
│  │  └─────────┬─────────┘        └─────────┬─────────┘               │    │
│  └────────────┼──────────────────────────────┼───────────────────────┘    │
│               │                              │                             │
│               └──────────────────────────────┘                             │
│                              │                                             │
│                              ▼                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                         SERVICES                                    │    │
│  │                                                                     │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │    │
│  │  │   API    │    │   Auth   │    │   User   │    │  Space   │    │    │
│  │  │ Service  │    │ Service  │    │ Service  │    │ Service  │    │    │
│  │  └────┬─────┘    └──────────┘    └──────────┘    └──────────┘    │    │
│  └───────┼────────────────────────────────────────────────────────────┘    │
│          │                                                                 │
│          ▼                                                                 │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    HTTP INTERCEPTOR                                 │    │
│  │          (Automatic JWT attachment, error handling)                 │    │
│  └───────────────────────────────┬────────────────────────────────────┘    │
│                                  │                                         │
│                                  ▼                                         │
│                           NestJS API                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
apps/web/src/
├── app/
│   ├── _core/                    # Core services and utilities
│   │   ├── interceptors/         # HTTP interceptors
│   │   ├── services/             # Core services
│   │   └── utils/                # Helper functions
│   │
│   ├── pages/                    # Feature pages
│   │   ├── home/                 # Dashboard
│   │   ├── login/                # Authentication
│   │   │   ├── basic/            # Email/code login
│   │   │   └── okta/             # OAuth login
│   │   ├── organization-admin/   # Org admin pages
│   │   └── space/                # Space content
│   │
│   ├── shared/                   # Shared resources
│   │   ├── components/           # Reusable components
│   │   ├── directives/           # Custom directives
│   │   ├── guards/               # Route guards
│   │   ├── models/               # TypeScript interfaces
│   │   ├── pipes/                # Custom pipes
│   │   └── services/             # Shared services
│   │
│   ├── state/                    # Akita state management
│   │   ├── global/               # App-wide state
│   │   └── session/              # User session state
│   │
│   ├── app.component.ts          # Root component
│   └── app.routes.ts             # Route definitions
│
├── environments/                 # Environment configs
├── theme/                        # Design system
└── assets/                       # Static files
```

## Key Concepts

### Standalone Components

The application uses Angular standalone components:

```typescript
@Component({
  selector: "app-user-list",
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule],
  template: `
    <p-table [value]="users">
      <ng-template pTemplate="body" let-user>
        <tr>
          <td>{{ user.email }}</td>
          <td>{{ user.role }}</td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class UserListComponent {
  users = input<User[]>([]);
}
```

### Signals

Modern Angular signals for reactive state:

```typescript
@Component({
  selector: "app-counter",
  standalone: true,
  template: `
    <p>Count: {{ count() }}</p>
    <button (click)="increment()">+</button>
  `,
})
export class CounterComponent {
  count = signal(0);

  increment() {
    this.count.update((n) => n + 1);
  }
}
```

### HTTP Interceptor

Automatic JWT attachment and error handling:

```typescript
@Injectable()
export class RequestInterceptor implements HttpInterceptor {
  constructor(private sessionQuery: SessionQuery) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    const token = this.sessionQuery.token;

    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Handle unauthorized
          this.sessionService.logout();
        }
        return throwError(() => error);
      }),
    );
  }
}
```

## Environment Configuration

### Development

```typescript
// environments/environment.ts
export const environment = {
  production: false,
  apiUrl: "http://localhost:8001",
  organizationId: "your-org-uuid",
  locale: "en-US",
};
```

### Production

```typescript
// environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: "https://api.example.com",
  organizationId: "prod-org-uuid",
  locale: "en-US",
};
```

### Configuration Script

Generate environment from `.env`:

```bash
npm run config
```

This reads `.env` and generates `environment.ts`.

## Routing

### Route Configuration

```typescript
// app.routes.ts
export const routes: Routes = [
  {
    path: "",
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: "", redirectTo: "home", pathMatch: "full" },
      { path: "home", loadComponent: () => import("./pages/home/home.page") },
      {
        path: "admin",
        loadChildren: () => import("./pages/organization-admin/admin.routes"),
        canActivate: [AdminGuard],
      },
    ],
  },
  {
    path: "login",
    loadComponent: () => import("./pages/login/login.page"),
  },
];
```

### Route Guards

```typescript
@Injectable({ providedIn: "root" })
export class AuthGuard implements CanActivate {
  constructor(
    private sessionQuery: SessionQuery,
    private router: Router,
  ) {}

  canActivate(): boolean {
    if (this.sessionQuery.isLoggedIn) {
      return true;
    }
    this.router.navigate(["/login"]);
    return false;
  }
}
```

## API Services

### Base API Service

```typescript
@Injectable({ providedIn: "root" })
export class ApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}${endpoint}`);
  }

  post<T>(endpoint: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}${endpoint}`, body);
  }

  put<T>(endpoint: string, body: any): Observable<T> {
    return this.http.put<T>(`${this.apiUrl}${endpoint}`, body);
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.apiUrl}${endpoint}`);
  }
}
```

### Feature Service Example

```typescript
@Injectable({ providedIn: "root" })
export class UserService {
  private readonly orgId = environment.organizationId;

  constructor(private api: ApiService) {}

  getUsers(): Observable<User[]> {
    return this.api.get(`/admin/organization/${this.orgId}/user`);
  }

  createUser(user: CreateUserDto): Observable<User> {
    return this.api.post(`/admin/organization/${this.orgId}/user`, user);
  }

  updateUser(id: string, user: UpdateUserDto): Observable<User> {
    return this.api.put(`/admin/organization/${this.orgId}/user/${id}`, user);
  }
}
```

## Development Commands

| Command             | Description          |
| ------------------- | -------------------- |
| `npm run start:web` | Start dev server     |
| `npm run build:web` | Production build     |
| `npm run test:web`  | Run unit tests       |
| `npm run lint:web`  | Run linter           |
| `npm run config`    | Generate environment |

## Next Steps

- [State Management](state-management.md) - Akita stores
- [Components](components.md) - UI component patterns
- [Theming](theming.md) - PrimeNG customization
- [Services](services.md) - API integration
