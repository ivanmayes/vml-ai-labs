// ESLint Flat Config Example for PrimeNG Plugin
// For use with ESLint 9.x+

import primengPlugin from './index.js';

export default [
  {
    plugins: {
      primeng: primengPlugin,
    },
    rules: {
      // Recommended configuration
      'primeng/prefer-component-imports': 'warn',
      'primeng/valid-severity': 'error',
      'primeng/no-deprecated-components': 'warn',
      'primeng/no-inline-styles-for-tokens': 'warn',
      'primeng/consistent-icon-usage': ['warn', {
        allowFontAwesome: false,
        allowMaterial: false,
      }],
      'primeng/require-message-service-provider': 'warn',
    },
  },
  // For TypeScript files
  {
    files: ['**/*.ts'],
    rules: {
      'primeng/valid-severity': 'error',
      'primeng/no-deprecated-components': 'warn',
    },
  },
];
