// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.data/**',
      'shots/**',
      'playwright-report/**',
      'test-results/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      // TypeScript vérifie déjà l'existence des symboles, et bien mieux qu'ESLint,
      // qui ignore ici les globales Node et navigateur.
      'no-undef': 'off',
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
  {
    // Règle non négociable n°2 du brief : la simulation doit rester déterministe.
    files: [
      'packages/engine/**/*.ts',
      'packages/content/**/*.ts',
      'packages/map/**/*.ts',
      'packages/bots/**/*.ts',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Interdit dans la simulation : utilisez le PRNG déterministe de packages/engine/src/rng.ts.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'La simulation ne doit pas dépendre du DOM.' },
        { name: 'document', message: 'La simulation ne doit pas dépendre du DOM.' },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'tools/**/*.mjs', '**/*.config.ts', '**/build.mjs'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-restricted-properties': 'off' },
  },
);
