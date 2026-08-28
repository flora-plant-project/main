import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';

export default [
  {
    // apps/mobile/design holds browser-JS design-tool exports, not app code
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      'apps/mobile/design/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
      react: reactPlugin,
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.json'],
        },
      },
      // exports-map-only packages the node resolver can't see (Metro resolves them fine)
      'import/core-modules': ['expo-status-bar'],
      react: {
        version: 'detect',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'error',
      eqeqeq: 'error',
      'import/no-unresolved': 'error',
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    // Design-system guardrail: raw hex colors may only live in the theme.
    files: ['apps/mobile/**/*.js'],
    ignores: ['apps/mobile/src/theme.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            'Raw hex colors are only allowed in apps/mobile/src/theme.js — use theme tokens.',
        },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.test.js', 'apps/mobile/jest.setup.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.commonjs,
      },
    },
  },
  prettierConfig,
];
