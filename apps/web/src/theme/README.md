# Theme System - PrimeNG v20

This application uses PrimeNG v20's programmatic theming system with the Lara preset.

## Architecture

### Theme Configuration
The main theme configuration is done programmatically in `app.module.ts` using `providePrimeNG()`:

```typescript
providePrimeNG({
  theme: {
    preset: Lara,
    options: {
      prefix: 'p',
      darkModeSelector: '.p-dark',
      cssLayer: false
    }
  },
  ripple: true,
  inputVariant: 'outlined'
})
```

### File Structure

```
theme/
├── design-system/
│   ├── index.scss              # Main entry point with global styles
│   └── _primeng-theme.scss     # PrimeNG CSS variable overrides
├── utils.scss                  # Utility classes (padding, margin, flex, etc.)
└── variables.scss              # App-specific variables
```

## Customization

### CSS Variables
PrimeNG v20 exposes CSS variables that can be overridden. Common variables:

- **Colors**: `--p-primary-color`, `--p-primary-500`, `--p-green-500`, `--p-red-500`, etc.
- **Typography**: `--p-font-family`, `--p-font-size`
- **Spacing**: `--p-form-field-padding-x`, `--p-form-field-padding-y`
- **Border Radius**: `--p-border-radius`, `--p-rounded-border-radius`
- **Surfaces**: `--p-surface-ground`, `--p-surface-card`, `--p-surface-overlay`
- **Text**: `--p-text-color`, `--p-text-secondary-color`, `--p-text-muted-color`

### Dark Mode
Dark mode is enabled by adding the `.p-dark` class to the `<html>` element. The theme service handles this automatically.

All dark mode overrides should be placed in the `.p-dark` selector in `_primeng-theme.scss`.

### Component Customization
Component-specific styles can be added in `_primeng-theme.scss`. PrimeNG components use BEM-like CSS classes:

```scss
.p-button {
  font-weight: 500;
  transition: all 0.2s ease-in-out;
}

.p-dialog {
  .p-dialog-header {
    padding: 1.25rem 1.5rem;
  }
}
```

## Best Practices

1. **Use PrimeNG CSS Variables**: Always prefer PrimeNG's CSS variables over hardcoded values
2. **Avoid Deep Customization**: Keep customizations minimal to maintain upgrade compatibility
3. **Use Utility Classes**: Leverage `utils.scss` for common patterns instead of inline styles
4. **Component Variants**: Use PrimeNG's built-in variants (severity, size) before creating custom styles
5. **Responsive Design**: Use CSS Grid and Flexbox with PrimeNG's responsive utilities

## Available PrimeNG Utilities

PrimeNG provides several built-in utility classes:
- Flexbox: `.flex`, `.flex-column`, `.justify-content-center`, `.align-items-center`
- Spacing: `.p-0` to `.p-8`, `.m-0` to `.m-8` (padding/margin)
- Text: `.text-center`, `.text-left`, `.font-bold`, `.text-xl`
- Colors: `.text-primary`, `.bg-primary`, `.surface-ground`
- Display: `.block`, `.inline-block`, `.hidden`

See: https://primeng.org/utilities

## Migration Notes

This theme system was migrated from Angular Material. Legacy variable mappings are maintained in `variables.scss` for backward compatibility:

- `--color-primary` → `--p-primary-color`
- `--color-success` → `--p-green-500`
- `--color-warning` → `--p-orange-500`
- `--color-danger` → `--p-red-500`

## Resources

- [PrimeNG Theming Documentation](https://primeng.org/theming)
- [PrimeNG Theme Presets](https://primeng.org/themes)
- [PrimeNG CSS Variables](https://primeng.org/cssvariables)
