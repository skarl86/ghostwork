import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'server/src/**/*.test.ts', 'cli/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/', '**/dist/', '**/*.d.ts', '**/types.ts', '**/test/**'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/*/src/**/*.test.ts',
            'server/src/**/*.test.ts',
            'cli/src/**/*.test.ts',
          ],
          exclude: ['**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'packages/*/src/**/*.integration.test.ts',
            'server/src/**/*.integration.test.ts',
          ],
          isolate: true,
          sequence: {
            concurrent: false,
          },
        },
      },
    ],
  },
});
