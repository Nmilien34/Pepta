import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'pepta-frontend/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // React rules-of-hooks, on every component/hook file. This was MISSING for
  // the project's whole life: files carried eslint-disable comments for
  // react-hooks rules that never ran ("Definition for rule ... was not
  // found"), and a conditional-hook crash shipped in builds 20-22 that took
  // the app down on entry the moment /home data arrived. exhaustive-deps
  // stays a warning (the codebase manages deps deliberately in places), but
  // rules-of-hooks is an error: a violation is a runtime crash, not a style.
  {
    files: ['**/*.tsx', '**/use*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
