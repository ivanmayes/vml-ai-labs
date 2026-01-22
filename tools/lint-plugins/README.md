# PrimeNG Lint Plugins

Custom linting plugins to enforce PrimeNG design system best practices and ensure consistent usage across the codebase. These plugins help AI agents and developers write code that properly leverages PrimeNG's theming system.

## Overview

This package contains two lint plugins:

1. **stylelint-primeng** - Enforces proper CSS/SCSS usage with PrimeNG design tokens
2. **eslint-plugin-primeng** - Enforces Angular/TypeScript best practices for PrimeNG components

## Installation

```bash
# Install Stylelint and ESLint if not already installed
npm install --save-dev stylelint eslint

# The plugins are local, so just reference them in your config
```

## Stylelint Plugin: `stylelint-primeng`

### Rules

#### `primeng/no-hardcoded-colors`

Disallows hard-coded colors (hex, rgb, named colors) in CSS. Use PrimeNG design tokens instead.

```scss
// Bad
.my-class {
  color: #333333;
  background: rgb(255, 0, 0);
  border-color: black;
}

// Good
.my-class {
  color: var(--p-text-color);
  background: var(--p-red-500);
  border-color: var(--p-surface-border);
}
```

**Options:**

- `allowTransparent` (boolean, default: `true`) - Allow the `transparent` keyword
- `allowCurrentColor` (boolean, default: `true`) - Allow `currentColor`
- `allowedPatterns` (array) - Regex patterns for allowed values

#### `primeng/use-design-tokens`

Ensures CSS variables use the PrimeNG `--p-` prefix for design tokens.

```scss
// Bad - missing prefix
.my-class {
  color: var(--text-color);
  background: var(--surface-section);
}

// Good
.my-class {
  color: var(--p-text-color);
  background: var(--p-surface-section);
}
```

#### `primeng/no-component-overrides`

Warns when directly overriding PrimeNG component classes instead of using design tokens.

```scss
// Bad - direct override with hard-coded values
.p-button {
  background-color: #007bff;
  border-radius: 8px;
}

// Good - uses CSS variables
.p-button {
  background-color: var(--p-primary-500);
  border-radius: var(--p-border-radius);
}

// Better - use component's [dt] property in Angular template
```

**Options:**

- `severity` (string, default: `'warning'`) - `'warning'` or `'error'`
- `allowedOverrides` (array) - Selectors to allow

#### `primeng/no-ng-deep`

Warns on usage of the deprecated `::ng-deep` selector.

```scss
// Warning - deprecated approach
::ng-deep .p-dialog {
  max-width: 600px;
}

// Better - use [dt] property or CSS variables
// Or use :host if you need to scope styles
```

#### `primeng/prefer-semantic-tokens`

Encourages using semantic tokens (like `--p-surface-*`) over primitive tokens (like `--p-gray-*`).

```scss
// Warning
.my-class {
  background: var(--p-gray-100);
}

// Better
.my-class {
  background: var(--p-surface-100);
}
```

#### `primeng/consistent-spacing`

Encourages consistent spacing values and rem units over px.

```scss
// Warning - px values
.my-class {
  padding: 16px;
  margin: 8px;
}

// Good - rem values from spacing scale
.my-class {
  padding: 1rem;
  margin: 0.5rem;
}
```

### Stylelint Configuration

```json
{
  "plugins": ["./tools/lint-plugins/stylelint-primeng"],
  "rules": {
    "primeng/no-hardcoded-colors": true,
    "primeng/use-design-tokens": true,
    "primeng/no-component-overrides": ["warning"],
    "primeng/no-ng-deep": ["warning"],
    "primeng/prefer-semantic-tokens": true,
    "primeng/consistent-spacing": true
  }
}
```

## ESLint Plugin: `eslint-plugin-primeng`

### Rules

#### `primeng/prefer-component-imports`

Enforces importing PrimeNG components from specific modules rather than barrel imports.

```typescript
// Bad
import { Button } from "primeng";

// Good
import { ButtonModule } from "primeng/button";
```

#### `primeng/valid-severity`

Ensures valid severity values are used with Message and Toast components.

```typescript
// Bad
this.messageService.add({
  severity: "danger", // Invalid!
  summary: "Error",
});

// Good
this.messageService.add({
  severity: "error", // Valid values: success, info, warn, error, secondary, contrast
  summary: "Error",
});
```

#### `primeng/no-deprecated-components`

Warns when using deprecated PrimeNG components and suggests replacements.

| Deprecated     | Replacement    | Version |
| -------------- | -------------- | ------- |
| `Dropdown`     | `Select`       | v20     |
| `Calendar`     | `DatePicker`   | v19     |
| `InputSwitch`  | `ToggleSwitch` | v19     |
| `Sidebar`      | `Drawer`       | v19     |
| `OverlayPanel` | `Popover`      | v19     |
| `TabView`      | `Tabs`         | v20     |

```typescript
// Warning
import { DropdownModule } from "primeng/dropdown";

// Good
import { SelectModule } from "primeng/select";
```

#### `primeng/no-inline-styles-for-tokens`

Warns against inline styles that should use design tokens.

```typescript
// Warning
@Component({
  template: `<div [style]="'color: #333333'">...</div>`
})

// Good - use CSS class with design tokens
@Component({
  template: `<div class="text-color">...</div>`,
  styles: [`.text-color { color: var(--p-text-color); }`]
})
```

#### `primeng/consistent-icon-usage`

Encourages consistent use of PrimeIcons.

```html
<!-- Warning (if Font Awesome not allowed) -->
<i class="fa fa-user"></i>

<!-- Good -->
<i class="pi pi-user"></i>
```

**Options:**

- `allowFontAwesome` (boolean, default: `false`)
- `allowMaterial` (boolean, default: `false`)

#### `primeng/require-message-service-provider`

Ensures MessageService is properly provided when using Toast/Message components.

### ESLint Configuration (Flat Config - ESLint 9+)

```javascript
import primengPlugin from "./tools/lint-plugins/eslint-primeng";

export default [
  {
    plugins: {
      primeng: primengPlugin,
    },
    rules: {
      "primeng/prefer-component-imports": "warn",
      "primeng/valid-severity": "error",
      "primeng/no-deprecated-components": "warn",
      "primeng/no-inline-styles-for-tokens": "warn",
      "primeng/consistent-icon-usage": "off",
    },
  },
];
```

### Preset Configurations

#### Recommended

```javascript
{
  'primeng/prefer-component-imports': 'warn',
  'primeng/valid-severity': 'error',
  'primeng/no-deprecated-components': 'warn',
  'primeng/no-inline-styles-for-tokens': 'warn',
  'primeng/consistent-icon-usage': 'off',
  'primeng/require-message-service-provider': 'warn',
}
```

#### Strict

```javascript
{
  'primeng/prefer-component-imports': 'error',
  'primeng/valid-severity': 'error',
  'primeng/no-deprecated-components': 'error',
  'primeng/no-inline-styles-for-tokens': 'error',
  'primeng/consistent-icon-usage': 'warn',
  'primeng/require-message-service-provider': 'error',
}
```

## PrimeNG Design Token Reference

### Color Tokens

| Category | Token Pattern                                            | Example           |
| -------- | -------------------------------------------------------- | ----------------- |
| Primary  | `--p-primary-{50-950}`                                   | `--p-primary-500` |
| Surface  | `--p-surface-{0-950,ground,section,card,overlay,border}` | `--p-surface-100` |
| Text     | `--p-text-{color,secondary-color,muted-color}`           | `--p-text-color`  |
| Status   | `--p-{green,red,orange,yellow,blue}-{50-900}`            | `--p-green-500`   |

### Spacing Scale (rem)

```
0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4
```

### Typography Tokens

| Token             | Description         |
| ----------------- | ------------------- |
| `--p-font-family` | Primary font family |
| `--p-font-size`   | Base font size      |

### Border Tokens

| Token                       | Description                |
| --------------------------- | -------------------------- |
| `--p-border-radius`         | Standard border radius     |
| `--p-rounded-border-radius` | Pill/rounded border radius |

## Best Practices for AI Agents

When generating PrimeNG code, AI agents should:

1. **Always use design tokens** - Never hard-code colors, use `var(--p-*)` tokens
2. **Import from specific modules** - Use `primeng/<component>` not `primeng`
3. **Prefer semantic tokens** - Use `--p-surface-*` over `--p-gray-*`
4. **Use rem for spacing** - Stick to the spacing scale for consistency
5. **Avoid ::ng-deep** - Use component's `[dt]` property for scoped customization
6. **Use PrimeIcons** - Consistent icon library across the application
7. **Check component deprecations** - Use current component names (Select, DatePicker, etc.)
8. **Provide MessageService** - When using Toast/Message components

## Running the Linters

```bash
# Run Stylelint
npx stylelint "apps/web/src/**/*.scss" --config .stylelintrc.json

# Run ESLint
npx eslint "apps/web/src/**/*.ts" --config eslint.config.mjs
```

## Integration with CI/CD

Add these checks to your CI pipeline to enforce PrimeNG best practices:

```yaml
# Example GitHub Actions
- name: Lint Styles
  run: npx stylelint "apps/web/src/**/*.scss"

- name: Lint TypeScript
  run: npx eslint "apps/web/src/**/*.ts"
```
