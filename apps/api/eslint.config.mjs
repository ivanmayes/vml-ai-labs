// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import nestjsTyped from '@darraghor/eslint-plugin-nestjs-typed';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
	{
		ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
	},
	{
		files: ['**/*.ts'],
		extends: [
			eslint.configs.recommended,
			...tseslint.configs.recommended,
			...tseslint.configs.stylistic,
		],
		plugins: {
			sonarjs,
			security,
			'@darraghor/nestjs-typed': nestjsTyped.plugin,
			import: importPlugin,
		},
		rules: {
			// TypeScript rules (migrated from tslint.json)
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-empty-interface': 'error',
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',

			// General quality rules (migrated from tslint.json)
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-debugger': 'error',
			'no-eval': 'error',
			'no-var': 'error',
			'prefer-const': 'error',
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			radix: 'error',
			'no-fallthrough': 'error',
			'no-bitwise': 'warn',

			// NestJS-specific rules (rules requiring type info are disabled for performance)
			'@darraghor/nestjs-typed/api-method-should-specify-api-response': 'warn',
			'@darraghor/nestjs-typed/controllers-should-supply-api-tags': 'warn',
			'@darraghor/nestjs-typed/param-decorator-name-matches-route-param': 'warn',
			'@darraghor/nestjs-typed/no-duplicate-decorators': 'error',

			// SonarJS - Code quality and bug detection
			'sonarjs/cognitive-complexity': ['warn', 15],
			'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
			'sonarjs/no-identical-functions': 'warn',
			'sonarjs/no-collapsible-if': 'warn',
			'sonarjs/prefer-single-boolean-return': 'warn',
			'sonarjs/no-redundant-jump': 'warn',

			// Security rules
			'security/detect-object-injection': 'off', // Too many false positives
			'security/detect-non-literal-regexp': 'warn',
			'security/detect-unsafe-regex': 'error',
			'security/detect-buffer-noassert': 'error',
			'security/detect-eval-with-expression': 'error',
			'security/detect-no-csrf-before-method-override': 'error',
			'security/detect-possible-timing-attacks': 'warn',

			// Import rules
			'import/no-unresolved': 'off', // TypeScript handles this
			'import/order': [
				'warn',
				{
					groups: [
						'builtin',
						'external',
						'internal',
						'parent',
						'sibling',
						'index',
					],
					'newlines-between': 'always',
				},
			],
			'import/no-duplicates': 'error',
			'import/no-cycle': 'warn',
		},
	},
	{
		files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
		rules: {
			// Relax rules for test files
			'@typescript-eslint/no-explicit-any': 'off',
			'sonarjs/no-duplicate-string': 'off',
			'sonarjs/cognitive-complexity': 'off',
			'security/detect-object-injection': 'off',
		},
	},
	{
		// Workaround for @darraghor/nestjs-typed plugin crash on array controller paths
		files: ['**/user-auth.controller.ts'],
		rules: {
			'@darraghor/nestjs-typed/param-decorator-name-matches-route-param': 'off',
		},
	}
);
