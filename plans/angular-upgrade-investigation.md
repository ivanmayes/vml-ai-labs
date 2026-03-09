# Plan: Angular Upgrade Investigation & Modernization

## Overview

Investigate and plan the upgrade path for the vml-ai-labs Angular application. The project is currently on Angular 20.2.4 and needs modernization to adopt current best practices including signal-based patterns, functional guards, and updated build tooling.

## Current State

| Component      | Current Version | Target              | Status       |
| -------------- | --------------- | ------------------- | ------------ |
| Angular Core   | 20.2.4          | Latest 20.x / 21.x  | Current      |
| RxJS           | ~6.6.0          | ^7.8.1              | **OUTDATED** |
| Build System   | browser builder | application builder | Legacy       |
| Bootstrap      | NgModule-based  | Standalone          | Legacy       |
| Route Guards   | Class-based     | Functional          | Deprecated   |
| Inputs/Outputs | Decorators      | Signals             | Deprecated   |
| Test Runner    | Karma + Jasmine | Vitest              | Legacy       |

## Problem Statement

While the project is on a recent Angular version (20.2.4), it uses several deprecated patterns that will become incompatible in future Angular versions:

1. **RxJS 6.6.0** - Angular 20 officially supports RxJS 7.x; version 6.x may have compatibility issues
2. **Legacy browser builder** - The new `application` builder with esbuild is faster and recommended
3. **Class-based route guards** - `CanActivate` interface is deprecated; functional guards are preferred
4. **Decorator-based inputs/outputs** - Signal-based `input()` and `output()` are the modern pattern
5. **Module-based bootstrap** - `bootstrapApplication()` with standalone components is standard
6. **Karma testing** - Being replaced by Vitest as Angular's recommended test runner

## Technical Approach

### Phase 1: Dependency Compatibility Assessment

**Duration**: 1-2 days

1. **Verify RxJS 7 compatibility** with critical dependencies:
   - `@datorama/akita` v7.1.1 (state management)
   - `@datorama/akita-ng-router-store` v7.0.0
   - `@wppopen/components-library` v2.15.0
   - `@wppopen/core` v9.0.0
   - `@okta/okta-auth-js` v6.8.1

2. **Audit codebase for RxJS deprecated patterns**:

   ```bash
   # Search for deprecated operators
   grep -r "toPromise()" apps/web/src/
   grep -r "combineLatest(" apps/web/src/
   ```

3. **Document current test coverage baseline**

### Phase 2: RxJS 7 Upgrade

**Duration**: 2-3 days

**Files to modify:**

- `apps/web/package.json` - Update RxJS version

**Code changes:**

- Replace `toPromise()` with `firstValueFrom()` or `lastValueFrom()`
- Update `combineLatest` to use array parameter syntax
- Update `of()` calls if using spread operator

```typescript
// Before
const result = await observable.toPromise();

// After
import { firstValueFrom } from "rxjs";
const result = await firstValueFrom(observable);
```

### Phase 3: Application Builder Migration

**Duration**: 1-2 days

**Files to modify:**

- `apps/web/angular.json`

```json
{
  "projects": {
    "vml-starter-angular": {
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.app.json",
            "assets": ["src/favicon.ico", "src/assets"],
            "styles": ["src/styles.scss"],
            "scripts": []
          }
        }
      }
    }
  }
}
```

**Validation:**

- Build completes successfully
- Dev server starts with hot reload
- Bundle sizes within budget

### Phase 4: Functional Guards Migration

**Duration**: 1 day

**Files to modify:**

- `apps/web/src/app/shared/guards/admin-role.guard.ts`
- `apps/web/src/app/shared/guards/space-admin.guard.ts`
- `apps/web/src/app/app-routing.module.ts`

```typescript
// Before (class-based)
@Injectable({ providedIn: "root" })
export class AdminRoleGuard implements CanActivate {
  constructor(
    private sessionQuery: SessionQuery,
    private router: Router,
  ) {}

  canActivate(): boolean {
    const user = this.sessionQuery.getValue().user;
    if (user?.role === UserRole.Admin || user?.role === UserRole.SuperAdmin) {
      return true;
    }
    this.router.navigate(["/home"]);
    return false;
  }
}

// After (functional)
export const adminRoleGuard: CanActivateFn = () => {
  const sessionQuery = inject(SessionQuery);
  const router = inject(Router);

  const user = sessionQuery.getValue().user;
  if (user?.role === UserRole.Admin || user?.role === UserRole.SuperAdmin) {
    return true;
  }
  return router.createUrlTree(["/home"]);
};
```

### Phase 5: Signal-Based Inputs/Outputs Migration

**Duration**: 3-5 days

**Files to modify:**

- `apps/web/src/app/shared/directives/drop-file.directive.ts`
- `apps/web/src/app/shared/directives/fill-height.directive.ts`
- `apps/web/src/app/shared/components/header/navigation-bar/navigation-bar.component.ts`
- `apps/web/src/app/pages/login/okta/okta.component.ts`
- `apps/web/src/app/pages/login/basic/basic.component.ts`
- `apps/web/src/app/pages/home/home.page.ts` (ViewChild)

```typescript
// Before
@Input() paddingBottom = 0;
@Output() filesDropped = new EventEmitter<File[]>();
@ViewChild('section') sectionRef!: ElementRef;

// After
readonly paddingBottom = input<number>(0);
readonly filesDropped = output<File[]>();
readonly sectionRef = viewChild<ElementRef>('section');
```

### Phase 6: Standalone Bootstrap Migration (Optional)

**Duration**: 1 week

This is a larger undertaking that involves:

1. Converting `main.ts` to use `bootstrapApplication()`
2. Migrating providers from `AppModule`
3. Converting lazy-loaded routes to standalone route configs

**Recommendation**: Defer this to a separate initiative unless Angular 21 requires it.

### Phase 7: Test Runner Migration (Vitest)

**Duration**: 3-5 days

**Files to modify:**

- `apps/web/angular.json` - Change test builder
- `apps/web/karma.conf.js` - Remove
- `apps/web/src/test.ts` - Remove
- All `*.spec.ts` files - Update syntax

```bash
# Install Vitest
npm install vitest jsdom --save-dev

# Run migration schematic
ng generate @schematics/angular:refactor-jasmine-vitest
```

**Syntax changes:**

```typescript
// Before (Jasmine)
spyOn(service, "method").and.returnValue(of(result));

// After (Vitest)
vi.spyOn(service, "method").mockReturnValue(of(result));
```

## Acceptance Criteria

### Functional Requirements

- [ ] Application builds successfully with updated dependencies
- [ ] All existing tests pass after migration
- [ ] Authentication flows work (Basic, Okta, SAML, WPP Open)
- [ ] Route guards protect admin routes correctly
- [ ] State management (Akita) functions properly
- [ ] PrimeNG UI components render correctly

### Non-Functional Requirements

- [ ] Build time ≤5 minutes for production build
- [ ] Bundle size within budgets (1MB warning, 5MB error)
- [ ] Dev server HMR completes in ≤2 seconds
- [ ] Test coverage remains at baseline or higher

### Quality Gates

- [ ] All CI checks pass
- [ ] No deprecated pattern warnings in console
- [ ] No TypeScript strict mode violations
- [ ] Successful deployment to staging environment

## Dependencies & Prerequisites

### Internal Dependencies

- Stable standalone component architecture (completed in previous PR)
- Current test suite passing

### External Dependencies

- RxJS 7 compatibility with Akita (needs verification)
- PrimeNG 20.x standalone component support
- WPP Open library compatibility

## Risk Analysis & Mitigation

| Risk                      | Probability | Impact   | Mitigation                                   |
| ------------------------- | ----------- | -------- | -------------------------------------------- |
| RxJS 7 breaks Akita       | Medium      | Critical | Test in isolation first; have rollback plan  |
| WPP Open timing issues    | Low         | Critical | Add integration tests for embedded mode      |
| Build config errors       | High        | High     | Follow migration guide; test incrementally   |
| Test migration incomplete | Medium      | Medium   | Allocate buffer time; keep Karma temporarily |

## Success Metrics

- Build time improvement: Target 30% faster with esbuild
- Bundle size: No regression, potential 5-10% reduction
- Test execution: Faster with Vitest
- Developer experience: Modern patterns, better tooling

## References & Research

### Internal References

- Current Angular config: `apps/web/angular.json`
- Route guards: `apps/web/src/app/shared/guards/`
- State management: `apps/web/src/app/state/`
- Component patterns: `apps/web/AGENTS.md`

### External References

- [Angular Update Guide](https://angular.dev/update-guide)
- [Angular Version Compatibility](https://angular.dev/reference/versions)
- [Migrating to Vitest](https://angular.dev/guide/testing/migrating-to-vitest)
- [RxJS 7 Migration Guide](https://rxjs.dev/deprecations)
- [PrimeNG v20 Documentation](https://primeng.org/)

### Related Work

- Previous PR: Standalone components migration (9e87eab)

---

## MVP Implementation Order

### Week 1: Foundation

1. **RxJS 7 upgrade** - Critical compatibility fix
2. **Functional guards** - Quick win, removes deprecated warnings

### Week 2: Build System

3. **Application builder migration** - Faster builds, modern tooling
4. **Signal inputs/outputs** - Modernize component patterns

### Week 3-4: Testing (Optional)

5. **Vitest migration** - Can be deferred if time-constrained

### Future

6. **Standalone bootstrap** - Major change, defer unless required

---

## ERD: No database changes required

## File Structure Changes

```
apps/web/
├── src/
│   ├── main.ts                    # No change (standalone migration deferred)
│   ├── polyfills.ts               # May be removed with application builder
│   └── app/
│       └── shared/
│           └── guards/
│               ├── admin-role.guard.ts    # Convert to functional
│               └── space-admin.guard.ts   # Convert to functional
├── angular.json                   # Update builder configuration
├── package.json                   # Update RxJS version
├── karma.conf.js                  # Remove (after Vitest migration)
└── vitest.config.ts               # Add (with Vitest migration)
```
