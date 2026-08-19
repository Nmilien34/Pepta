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
    // Every ts/tsx file, not just .tsx and use-prefixed: a hook defined in a
    // plain .ts helper is still a hook, and rules-of-hooks is inert on files
    // with no hook calls, so the wide net costs nothing.
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Screen tests must not look a control up by accessibility label and take
    // the first match. When two controls share a label the lookup silently
    // answers with the wrong one, and a test written for the other keeps
    // passing — a false green, which tells you nothing.
    //
    // Two controls with one label is also a real accessibility defect: a
    // screen reader announces the same phrase for two different actions.
    //
    // Use src/tests/byLabel.ts — `one` / `maybeOne` throw on ambiguity, and
    // `duplicateLabels` sweeps a whole screen.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(find|findAll|filter)$/] BinaryExpression[operator='==='] MemberExpression[property.name='accessibilityLabel']",
          message:
            'Do not match on accessibilityLabel directly — two controls can share a label and the lookup will silently pick the wrong one. Use one() / maybeOne() / duplicateLabels() from src/tests/byLabel.',
        },
      ],
    },
  },
);
