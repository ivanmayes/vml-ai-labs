// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import angular from "angular-eslint";
import primengPlugin from "../../tools/lint-plugins/eslint-primeng/index.js";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", ".angular/**"],
  },
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
      sonarjs,
      security,
      import: importPlugin,
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
      // Ban creating DTO interfaces/types in web - must import from @api/*
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration[id.name=/Dto$/]",
          message:
            "Do not create DTO interfaces in web. Import from @api/* instead. See AGENTS.md for guidance.",
        },
        {
          selector: "TSTypeAliasDeclaration[id.name=/Dto$/]",
          message:
            "Do not create DTO types in web. Import from @api/* instead. See AGENTS.md for guidance.",
        },
      ],

      // SonarJS - Code quality and bug detection
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/no-duplicate-string": ["warn", { threshold: 4 }],
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/prefer-single-boolean-return": "warn",
      "sonarjs/no-redundant-jump": "warn",

      // Security rules
      "security/detect-object-injection": "off", // Too many false positives in Angular
      "security/detect-non-literal-regexp": "warn",
      "security/detect-unsafe-regex": "error",
      "security/detect-eval-with-expression": "error",

      // Import rules
      "import/no-unresolved": "off", // TypeScript handles this
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
        },
      ],
      "import/no-duplicates": "error",
      "import/no-cycle": "warn",
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  },
  {
    files: ["**/*.spec.ts", "**/*.test.ts"],
    rules: {
      // Relax rules for test files
      "@typescript-eslint/no-explicit-any": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/cognitive-complexity": "off",
    },
  }
);
