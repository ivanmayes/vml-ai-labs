# AI Agent Guidelines for VML Open Boilerplate

This document provides critical instructions for AI agents when generating or modifying code in this project. **Following these guidelines is mandatory** to ensure code passes linting and maintains consistency.

## Tech Stack

- **Frontend**: Angular 19+ with PrimeNG v20+ component library
- **Styling**: SCSS with PrimeNG design tokens, Tailwind CSS 4
- **Backend**: NestJS API
- **Linting**: ESLint (flat config), Stylelint with custom PrimeNG plugins

## Critical Rules

### 1. ALWAYS Use PrimeNG Components

**Never create custom UI components when PrimeNG provides an equivalent.** This project uses PrimeNG as the primary component library.

```html
<!-- WRONG - Custom button implementation -->
<button class="my-custom-btn" (click)="save()">Save</button>

<!-- CORRECT - Use PrimeNG -->
<p-button label="Save" (onClick)="save()" />
```

Common PrimeNG components to use:

- `p-button` - All buttons
- `p-table` - Data tables
- `p-dialog` - Modals/dialogs
- `p-select` - Dropdowns (NOT `p-dropdown`, that's deprecated)
- `p-datepicker` - Date selection (NOT `p-calendar`, that's deprecated)
- `p-toast` - Notifications
- `p-inputtext` - Text inputs (via `pInputText` directive)
- `p-badge` - Status badges
- `p-toolbar` - Action bars
- `p-menu` - Menus and navigation

### 2. Design Tokens with `--p-` Prefix

**All PrimeNG design tokens use the `--p-` prefix.** Never use unprefixed variables.

```scss
// WRONG - Missing prefix (will trigger lint error)
color: var(--text-color);
background: var(--surface-ground);
border-color: var(--surface-border);

// CORRECT - Always use --p- prefix
color: var(--p-text-color);
background: var(--p-surface-ground);
border-color: var(--p-surface-border);
```

### 3. No Hardcoded Colors

**Never hardcode colors.** Always use design tokens.

```scss
// WRONG - Hardcoded colors (lint errors)
.my-class {
  color: #333333;
  background-color: white;
  border: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

// CORRECT - Design tokens
.my-class {
  color: var(--p-text-color);
  background-color: var(--p-surface-0);
  border: 1px solid var(--p-surface-border);
  box-shadow: var(--p-overlay-shadow); // Or component-specific shadow token
}
```

### 4. Accessibility Requirements

**All interactive elements must be accessible.**

#### Use Semantic Buttons

```html
<!-- WRONG - Clickable div/anchor without href -->
<div class="clickable" (click)="doSomething()">Click me</div>
<a (click)="doSomething()">Click me</a>

<!-- CORRECT - Use button element -->
<button type="button" class="p-link" (click)="doSomething()">Click me</button>

<!-- Or use PrimeNG button -->
<p-button label="Click me" (onClick)="doSomething()" />
```

#### Icon-Only Buttons Need aria-label

```html
<!-- WRONG - No accessible name -->
<button pButton icon="pi pi-trash" (click)="delete()"></button>
<p-button icon="pi pi-pencil" (onClick)="edit()" />

<!-- CORRECT - Provide aria-label -->
<button
  pButton
  icon="pi pi-trash"
  (click)="delete()"
  aria-label="Delete item"
></button>
<p-button icon="pi pi-pencil" (onClick)="edit()" [ariaLabel]="'Edit item'" />
```

#### Images Need Alt Text

```html
<!-- WRONG -->
<img src="logo.svg" />

<!-- CORRECT -->
<img src="logo.svg" alt="Company Logo" />
```

### 5. PrimeNG Component Naming (v20+)

Use current component names, not deprecated ones:

| Deprecated                | Current                       |
| ------------------------- | ----------------------------- |
| `Dropdown` / `p-dropdown` | `Select` / `p-select`         |
| `Calendar` / `p-calendar` | `DatePicker` / `p-datepicker` |
| `InputSwitch`             | `ToggleSwitch`                |
| `Sidebar`                 | `Drawer`                      |
| `OverlayPanel`            | `Popover`                     |
| `TabView`                 | `Tabs`                        |

### 6. Module Imports

Import from specific PrimeNG modules:

```typescript
// WRONG - Generic import
import { Button } from "primeng";

// CORRECT - Specific module imports
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { DialogModule } from "primeng/dialog";
import { SelectModule } from "primeng/select";
```

### 7. Spacing Uses rem Units

Use rem units from the spacing scale, not px:

```scss
// WRONG - px values
padding: 16px;
margin: 8px;
gap: 12px;

// CORRECT - rem values
padding: 1rem;
margin: 0.5rem;
gap: 0.75rem;
```

**Spacing scale**: `0, 0.125rem, 0.25rem, 0.375rem, 0.5rem, 0.625rem, 0.75rem, 0.875rem, 1rem, 1.25rem, 1.5rem, 1.75rem, 2rem, 2.5rem, 3rem, 4rem`

### 8. Avoid ::ng-deep When Possible

```scss
// AVOID - Direct ::ng-deep
::ng-deep .p-dialog {
  max-width: 600px;
}

// BETTER - Use :host wrapper if necessary
:host ::ng-deep .p-dialog {
  max-width: 600px;
}

// BEST - Use PrimeNG's [dt] property or CSS variables
```

### 9. Use PrimeIcons

```html
<!-- CORRECT - PrimeIcons -->
<i class="pi pi-check"></i>
<i class="pi pi-times"></i>
<i class="pi pi-user"></i>
<i class="pi pi-pencil"></i>
<i class="pi pi-trash"></i>

<!-- WRONG - Other icon libraries -->
<i class="fa fa-check"></i>
<mat-icon>check</mat-icon>
```

### 10. Angular Best Practices

#### No Empty Lifecycle Methods

```typescript
// WRONG - Empty lifecycle hooks
export class MyComponent implements OnInit {
  ngOnInit(): void {
    // Empty - remove this
  }
}

// CORRECT - Only implement if needed
export class MyComponent {
  // No OnInit if not used
}
```

#### Use Proper TypeScript Types

```typescript
// WRONG - Generic Function type
function process(callback: Function) {}

// CORRECT - Typed function signature
function process(callback: (item: string) => void) {}
```

#### Directive Selector Prefix

```typescript
// WRONG
@Directive({ selector: '[fillHeight]' })

// CORRECT - Use 'app' prefix
@Directive({ selector: '[appFillHeight]' })
```

## Quick Reference: Design Tokens

### Colors

```scss
// Primary
var(--p-primary-color)
var(--p-primary-contrast-color)
var(--p-primary-50) through var(--p-primary-950)

// Surface (backgrounds)
var(--p-surface-ground)    // Page background
var(--p-surface-section)   // Section background
var(--p-surface-card)      // Card background
var(--p-surface-border)    // Borders
var(--p-surface-0) through var(--p-surface-950)

// Text
var(--p-text-color)           // Primary text
var(--p-text-color-secondary) // Secondary text
var(--p-text-muted-color)     // Muted text

// Status
var(--p-green-500)  // Success
var(--p-red-500)    // Error/Danger
var(--p-orange-500) // Warning
var(--p-blue-500)   // Info
```

### Message Severity Values

```typescript
// Valid values for MessageService and Toast
"success" | "info" | "warn" | "error" | "secondary" | "contrast";

// NOT 'danger', NOT 'primary'
```

## Running Linters

Before committing, ensure code passes linting:

```bash
# From apps/web directory
npx eslint .
npx stylelint "**/*.{css,scss}"

# Should show 0 errors (warnings are acceptable)
```

## Checklist Before Generating Code

- [ ] Using PrimeNG components instead of custom implementations
- [ ] All CSS variables use `--p-` prefix
- [ ] No hardcoded colors (hex, rgb, named colors)
- [ ] Interactive elements have proper accessibility (aria-label, semantic HTML)
- [ ] Imports from specific PrimeNG modules
- [ ] Using current component names (not deprecated)
- [ ] Spacing uses rem units
- [ ] Using PrimeIcons for icons
- [ ] No empty lifecycle methods
- [ ] Proper TypeScript types (no generic `Function`)

## Additional Resources

- See `tools/lint-plugins/PRIMENG_GUIDELINES.md` for detailed styling guidelines
- PrimeNG Documentation: https://primeng.org/
- PrimeIcons: https://primeng.org/icons
