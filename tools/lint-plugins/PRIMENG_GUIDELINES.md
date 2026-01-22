# PrimeNG Guidelines for AI Agents

This document provides guidelines for AI agents when generating or modifying code that uses PrimeNG in this project.

## Critical Rules

### 1. Always Use Design Tokens

**NEVER hard-code colors.** Always use PrimeNG CSS variables.

```scss
// WRONG - Will trigger lint error
.my-component {
  color: #333333;
  background-color: white;
  border: 1px solid black;
}

// CORRECT
.my-component {
  color: var(--p-text-color);
  background-color: var(--p-surface-0);
  border: 1px solid var(--p-surface-border);
}
```

### 2. Use the `--p-` Prefix

All PrimeNG design tokens use the `--p-` prefix. If you see a variable without it, add the prefix.

```scss
// WRONG
color: var(--text-color);
background: var(--surface-section);

// CORRECT
color: var(--p-text-color);
background: var(--p-surface-section);
```

### 3. Import from Specific Modules

```typescript
// WRONG
import { Button } from "primeng";

// CORRECT
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
```

### 4. Use Current Component Names (v20+)

| OLD (Deprecated) | NEW (Current)  |
| ---------------- | -------------- |
| `Dropdown`       | `Select`       |
| `Calendar`       | `DatePicker`   |
| `InputSwitch`    | `ToggleSwitch` |
| `Sidebar`        | `Drawer`       |
| `OverlayPanel`   | `Popover`      |
| `TabView`        | `Tabs`         |

### 5. Valid Severity Values

For `Message` and `Toast` components:

```typescript
// Valid severity values:
"success" | "info" | "warn" | "error" | "secondary" | "contrast";

// Example
this.messageService.add({
  severity: "success", // NOT 'danger', NOT 'primary'
  summary: "Success",
  detail: "Operation completed",
});
```

### 6. Use PrimeIcons

```html
<!-- Use PrimeIcons for consistency -->
<i class="pi pi-check"></i>
<i class="pi pi-times"></i>
<i class="pi pi-user"></i>

<!-- NOT Font Awesome or Material Icons -->
```

## Color Token Quick Reference

### Primary Colors

```scss
var(--p-primary-50)   // Lightest
var(--p-primary-100)
var(--p-primary-200)
var(--p-primary-300)
var(--p-primary-400)
var(--p-primary-500)  // Main primary color
var(--p-primary-600)
var(--p-primary-700)
var(--p-primary-800)
var(--p-primary-900)
var(--p-primary-950)  // Darkest

var(--p-primary-color)           // Alias for main primary
var(--p-primary-contrast-color)  // Text on primary
```

### Surface Colors (Backgrounds & Borders)

```scss
var(--p-surface-0)      // Pure white/black
var(--p-surface-50)
var(--p-surface-100)    // Subtle backgrounds
var(--p-surface-200)
var(--p-surface-300)
var(--p-surface-400)    // Muted elements
var(--p-surface-500)
var(--p-surface-600)
var(--p-surface-700)
var(--p-surface-800)
var(--p-surface-900)
var(--p-surface-950)

// Semantic surface tokens
var(--p-surface-ground)   // Page background
var(--p-surface-section)  // Section background
var(--p-surface-card)     // Card background
var(--p-surface-overlay)  // Modal/overlay background
var(--p-surface-border)   // Border color
```

### Text Colors

```scss
var(--p-text-color)           // Primary text
var(--p-text-secondary-color) // Secondary text
var(--p-text-muted-color)     // Muted/disabled text
```

### Status Colors

```scss
// Success (Green)
var(--p-green-500)

// Error (Red)
var(--p-red-500)

// Warning (Orange)
var(--p-orange-500)

// Info (Blue)
var(--p-blue-500)
```

## Spacing Guidelines

Use rem units and stick to this scale:

```
0, 0.125rem, 0.25rem, 0.375rem, 0.5rem, 0.625rem, 0.75rem,
0.875rem, 1rem, 1.25rem, 1.5rem, 1.75rem, 2rem, 2.5rem, 3rem, 4rem
```

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

## Component Styling Guidelines

### Prefer Design Tokens Over Class Overrides

```scss
// AVOID - Direct class overrides
.p-button {
  background-color: blue;
  font-size: 14px;
}

// PREFER - CSS variable overrides in theme file
:root {
  --p-button-primary-background: var(--p-primary-500);
}

// OR - Use component's [dt] property
```

### Scoped Token Overrides

For component-specific customization, use Angular template:

```html
<p-button
  [dt]="{
    root: {
      background: 'var(--p-primary-600)',
      borderRadius: 'var(--p-rounded-border-radius)'
    }
  }"
>
  Custom Button
</p-button>
```

### Minimize ::ng-deep Usage

```scss
// AVOID when possible
::ng-deep .p-dialog {
  max-width: 600px;
}

// PREFER - CSS variables or [dt] property
// If ::ng-deep is necessary, use :host wrapper
:host ::ng-deep .p-dialog {
  max-width: 600px;
}
```

## Common Patterns

### Button Styling

```html
<!-- Primary action -->
<p-button label="Save" severity="primary" />

<!-- Secondary action -->
<p-button label="Cancel" severity="secondary" />

<!-- Danger action -->
<p-button label="Delete" severity="danger" />

<!-- Text button -->
<p-button label="Learn More" [text]="true" />

<!-- Outlined button -->
<p-button label="Edit" [outlined]="true" />
```

### Form Inputs

```html
<p-floatlabel>
  <input pInputText id="username" [(ngModel)]="username" />
  <label for="username">Username</label>
</p-floatlabel>

<p-select
  [options]="cities"
  [(ngModel)]="selectedCity"
  optionLabel="name"
  placeholder="Select a City"
/>

<p-datepicker [(ngModel)]="date" />
```

### Toast Messages

```typescript
// In component
constructor(private messageService: MessageService) {}

showSuccess() {
  this.messageService.add({
    severity: 'success',
    summary: 'Success',
    detail: 'Message Content'
  });
}
```

### Dialog

```html
<p-dialog
  header="Edit Profile"
  [(visible)]="visible"
  [modal]="true"
  [style]="{ width: '50vw' }"
>
  <!-- Dialog content -->
</p-dialog>
```

## Checklist Before Committing

- [ ] No hard-coded color values (hex, rgb, named colors)
- [ ] All CSS variables use `--p-` prefix
- [ ] Imports are from specific modules (`primeng/button` not `primeng`)
- [ ] Using current component names (Select not Dropdown)
- [ ] Valid severity values for messages
- [ ] Consistent use of PrimeIcons
- [ ] Spacing uses rem units from the scale
- [ ] No unnecessary ::ng-deep usage
