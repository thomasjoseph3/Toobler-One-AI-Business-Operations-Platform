import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import moduleBoundaries from './tools/eslint/module-boundaries.js';

// What a file may import, by layer (docs/BACKEND.md): routes -> service -> repository -> kernel/database.
// ESLint applies ONE `no-restricted-imports` setting per file, so each group of files below lists every rule that applies to it.
const DATABASE_ONLY_IN_REPOSITORIES = {
  group: ['**/kernel/database', '**/kernel/database/index', '**/kernel/database/migrate'],
  allowTypeImports: true,
  message:
    'Only repository files (repository.ts or data/*.repository.ts) talk to the database. Call the repository from the service (importing the Db type is fine).',
};
const QUERY_BUILDER_ONLY_IN_REPOSITORIES = {
  group: ['kysely'],
  allowTypeImports: true,
  message: 'Queries are written in repository files only (repository.ts or data/*.repository.ts).',
};
const ROUTES_CALL_SERVICES = {
  group: ['**/repository', '**/repository.ts', '**/*.repository', '**/*.repository.ts'],
  message: 'Routes call the service; only the service talks to the repository.',
};

// The AI companies' packages are used in one folder only (apps/api/src/providers/llm). Everything else asks the AI model layer
// for a job, so switching or adding a company touches one place (docs/features/F37-ai-models-and-keys.md).
const AI_COMPANY_PACKAGES_ONLY_IN_LLM_FOLDER = {
  group: ['@langchain/google-genai', '@langchain/openai', '@langchain/anthropic'],
  message: 'Only apps/api/src/providers/llm talks to the AI companies. Ask the AI service (core.ai) for a job instead.',
};

// Names that hide what a thing is. `err` is not listed because the logging library requires that exact key in log lines (`{ err: error }`).
const UNCLEAR_NAMES = [
  'ctx',
  'tx',
  'trx',
  'e',
  'acc',
  'cb',
  'cfg',
  'opts',
  'msg',
  'req',
  'res',
  'idx',
  'val',
  'tmp',
  'arr',
  'obj',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'tools/eslint/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // A local name that hides an import or an outer one: how a renamed service ended up undefined inside a function
      '@typescript-eslint/no-shadow': ['error', { hoist: 'all' }],
      // Readable names (CLAUDE.md "Readability rules"): no one-letter names and none of the usual abbreviations.
      'id-length': [
        'error',
        {
          min: 2,
          properties: 'never',
          exceptions: ['_', 't'] /* `t` is the translate function CLAUDE.md prescribes */,
        },
      ],
      'id-denylist': ['error', ...UNCLEAR_NAMES],
    },
  },
  // Layering. Modules: only repository files (repository.ts, or *.repository.ts in a data/ folder) may use the database layer or the query builder; routes may not use repositories.
  {
    files: ['apps/api/src/modules/**/*.ts'],
    ignores: ['apps/api/src/modules/**/repository.ts', 'apps/api/src/modules/**/*.repository.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            DATABASE_ONLY_IN_REPOSITORIES,
            QUERY_BUILDER_ONLY_IN_REPOSITORIES,
            AI_COMPANY_PACKAGES_ONLY_IN_LLM_FOLDER,
          ],
        },
      ],
    },
  },
  // Outside the modules and the AI model layer (the app, the kernel, the other providers): the same AI rule
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/modules/**', 'apps/api/src/providers/llm/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [AI_COMPANY_PACKAGES_ONLY_IN_LLM_FOLDER] }],
    },
  },
  {
    files: ['apps/api/src/modules/**/routes.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            DATABASE_ONLY_IN_REPOSITORIES,
            QUERY_BUILDER_ONLY_IN_REPOSITORIES,
            ROUTES_CALL_SERVICES,
            AI_COMPANY_PACKAGES_ONLY_IN_LLM_FOLDER,
          ],
        },
      ],
    },
  },
  // Module boundaries (tools/eslint/module-boundaries.js): kernel, core/engine/channel/feature and `requires`.
  {
    files: ['apps/api/src/**/*.ts'],
    plugins: { toobler: moduleBoundaries },
    rules: { 'toobler/module-boundaries': 'error' },
  },
  // Settings are read in one place only, and checked there.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/kernel/config.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read settings through loadConfig() in kernel/config.ts, not process.env.',
        },
      ],
    },
  },
  // The small scripts served as they are by the web app (they run in the browser)
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  // The React apps and the shared UI package
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    ...reactHooks.configs.flat.recommended,
  },
);
