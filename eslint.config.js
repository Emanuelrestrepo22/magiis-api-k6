// eslint.config.js — flat config (ESLint 9)
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

export default [
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				project: './tsconfig.json'
			}
		},
		plugins: {
			'@typescript-eslint': tseslint
		},
		rules: {
			...tseslint.configs.recommended.rules,
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/naming-convention': [
				'warn',
				{ selector: 'variableLike', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] }
			]
		}
	},
	prettierConfig,
	{
		ignores: ['node_modules', 'reports', 'scripts/snapshots', '*.config.js', '*.config.cjs']
	}
];
