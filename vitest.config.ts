import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'examples/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '.eslintrc.cjs',
        'vitest.workspace.ts',
        'coverage/**',
        'packages/core/coverage/**',
        'packages/cli/src/cli.ts',
        'packages/cli/src/index.ts',
        'packages/core/src/index.ts',
        'packages/integrations/src/index.ts',
        'packages/interceptors/src/index.ts',
        'packages/interceptors/src/adapter.ts',
        'packages/web-ui/src/index.ts',
        'packages/agent-replay/src/index.ts',
        'packages/shared/src/index.ts',
      ],
    },
  },
});
