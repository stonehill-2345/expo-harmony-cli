import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.pack.test.ts', 'src/**/__tests__/**/*.pack.test.ts'],
    globalSetup: ['./__tests__/helpers/setup-pack.ts'],
  },
});
