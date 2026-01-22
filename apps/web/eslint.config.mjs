// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import angular from "angular-eslint";
import primengPlugin from "../../tools/lint-plugins/eslint-primeng/index.js";

export default tseslint.config(
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    plugins: {
      primeng: primengPlugin,
    },
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
      // Allow "Page" suffix for page-level components
      "@angular-eslint/component-class-suffix": [
        "error",
        {
          suffixes: ["Component", "Page"],
        },
      ],
      // PrimeNG rules
      "primeng/prefer-component-imports": "warn",
      "primeng/valid-severity": "error",
      "primeng/no-deprecated-components": "warn",
      "primeng/no-inline-styles-for-tokens": "warn",
      "primeng/consistent-icon-usage": "off",
      "primeng/require-message-service-provider": "warn",
      // Relax some TypeScript rules for Angular
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  }
);
