# Angular Web Application Rules

This document contains context-specific rules for AI agents working in the Angular web application.

## Quick Start

**ALWAYS start from the ROOT directory.** Both API and Web servers hot reload automatically.

```bash
# From ROOT directory - REQUIRED
npm start             # Starts both API and Web with hot reload
npm run dev           # Same as above

# Validation (from root)
npm run lint          # Run all linters
npm run validate      # Run linters + type checks
```

**Do NOT cd into apps/web to start the server.** Use root commands.

**Web app**: http://localhost:4200 (requires API running)

## Quick Reference

| Aspect          | Rule                           |
| --------------- | ------------------------------ |
| Components      | Standalone only (Angular 20+)  |
| UI Library      | PrimeNG exclusively            |
| Selector Prefix | `app-`                         |
| Colors          | Design tokens only (`--p-*`)   |
| Spacing         | rem units (0.5rem, 1rem, etc.) |
| State           | Akita for shared state         |

## Component Creation

### ALWAYS use standalone components

```typescript
// ✅ Correct - Standalone component
@Component({
	selector: "app-my-feature",
	standalone: true,
	imports: [CommonModule, Button, Card],
	template: `...`,
})
export class MyFeatureComponent {}

// ❌ Wrong - Module-based component
@Component({
	selector: "app-my-feature",
	template: `...`,
})
export class MyFeatureComponent {}
// with separate @NgModule
```

### Use signal-based inputs and outputs (Angular 17+)

```typescript
// ✅ Correct - Signal-based
readonly title = input<string>('');
readonly items = input.required<Item[]>();
readonly itemSelected = output<Item>();

// ❌ Wrong - Decorator-based
@Input() title: string = '';
@Output() itemSelected = new EventEmitter<Item>();
```

## PrimeNG Component Usage

### ALWAYS use PrimeNG for UI elements

```html
<!-- ✅ Correct -->
<p-button label="Save" icon="pi pi-check" (onClick)="save()" />
<p-select [options]="options" [(ngModel)]="selected" />
<p-datePicker [(ngModel)]="date" />

<!-- ❌ Wrong - Native HTML -->
<button>Save</button>
<select>
	<option>...</option>
</select>
<input type="date" />
```

### Import from specific modules

```typescript
// ✅ Correct - Module-specific imports
import { Button } from "primeng/button";
import { Card } from "primeng/card";
import { Select } from "primeng/select";

// ❌ Wrong - Barrel import
import { Button, Card } from "primeng";
```

### Use current component names

| ❌ Deprecated | ✅ Current   |
| ------------- | ------------ |
| Dropdown      | Select       |
| Calendar      | DatePicker   |
| InputSwitch   | ToggleSwitch |
| Chips         | InputChips   |
| MultiSelect   | MultiSelect  |
| OverlayPanel  | Popover      |
| Sidebar       | Drawer       |

## Styling Rules

### ALL colors must use design tokens

```scss
// ✅ Correct - Design tokens
.my-component {
	color: var(--p-text-color);
	background: var(--p-surface-ground);
	border-color: var(--p-primary-500);
}

// ❌ Wrong - Hardcoded colors
.my-component {
	color: #333333;
	background: white;
	border-color: rgb(103, 58, 183);
}
```

### Use semantic tokens over primitives

```scss
// ✅ Preferred - Semantic tokens
background: var(--p-surface-card);
color: var(--p-text-color);

// 🟡 Acceptable - Primitive tokens
background: var(--p-slate-100);
color: var(--p-slate-900);

// ❌ Wrong - Hardcoded
background: #f8f9fa;
```

### Use rem for spacing

```scss
// ✅ Correct
padding: 1rem;
margin-bottom: 0.5rem;
gap: 1.5rem;

// ❌ Wrong
padding: 16px;
margin-bottom: 8px;
gap: 24px;
```

### Avoid ::ng-deep

```scss
// ✅ Correct - Use CSS custom properties or Pass Through API
:host {
	--p-button-padding-x: 1.5rem;
}

// ❌ Avoid - Breaks encapsulation
::ng-deep .p-button {
	padding: 0 1.5rem;
}
```

## Message Severity Values

When using `MessageService` or `p-toast`:

```typescript
// ✅ Valid severities
this.messageService.add({ severity: "success", summary: "..." });
this.messageService.add({ severity: "info", summary: "..." });
this.messageService.add({ severity: "warn", summary: "..." });
this.messageService.add({ severity: "error", summary: "..." });
this.messageService.add({ severity: "secondary", summary: "..." });
this.messageService.add({ severity: "contrast", summary: "..." });

// ❌ Invalid severities
this.messageService.add({ severity: "danger", summary: "..." }); // Use 'error'
this.messageService.add({ severity: "primary", summary: "..." }); // Not valid
```

## Icons

Always use PrimeIcons:

```html
<!-- ✅ Correct -->
<i class="pi pi-check"></i>
<p-button icon="pi pi-save" />

<!-- ❌ Wrong -->
<i class="fa fa-check"></i>
<span class="material-icons">check</span>
```

## Accessibility Requirements

```html
<!-- Icon-only buttons MUST have aria-label -->
<p-button icon="pi pi-trash" aria-label="Delete item" />

<!-- Images MUST have alt text -->
<img [src]="imageUrl" alt="User profile picture" />

<!-- Forms need proper labels -->
<label for="email">Email</label>
<input pInputText id="email" />
```

## API Type Imports

**NEVER duplicate API types.** Always import from the API using the `@api/` path alias.

```typescript
// ✅ CORRECT - Import from API
import type { SpaceCreateDto } from "@api/space/dtos";
import type { Space } from "@api/space/space.entity";
import { SpaceRole } from "@api/space-user/space-role.enum";

// ❌ WRONG - Local duplicate
interface CreateSpaceDto {
	name: string;
}
export interface Space {
	id: string;
	name: string;
}
```

### Type Import Reference

| Need                  | Import From                      |
| --------------------- | -------------------------------- |
| DTOs (Create, Update) | `@api/[module]/dtos`             |
| Entities              | `@api/[module]/[module].entity`  |
| Enums                 | `@api/[module]/[enum-name].enum` |

### Before Making API Calls

1. **Check `api-manifest.json`** at repo root for available endpoints
2. **Verify the endpoint exists** under `paths` before writing service code
3. **Import the response type** from the API, never create local interfaces
4. **Use typed responses**, never `Observable<any>`

```typescript
// ✅ CORRECT - Typed response
import type { Space } from '@api/space/space.entity';

getSpaces(): Observable<Space[]> {
  return this.http.get<Space[]>('/api/spaces');
}

// ❌ WRONG - Untyped response
getSpaces(): Observable<any> {
  return this.http.get('/api/spaces');
}
```

## Pre-Commit Checklist

**NEVER use `--no-verify` to bypass hooks without explicit user permission.** Fix issues instead.

Before committing changes to this app:

- [ ] `npm run lint` passes (run from apps/web)
- [ ] `npm run build` succeeds
- [ ] No `any` types (use `unknown` if type is truly unknown)
- [ ] All PrimeNG imports are module-specific
- [ ] All colors use design tokens
- [ ] All buttons/inputs use PrimeNG components
- [ ] Icon-only buttons have `aria-label`
- [ ] **No duplicate DTOs** - all types imported from `@api/*`
