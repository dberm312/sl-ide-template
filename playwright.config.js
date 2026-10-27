import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // *.test.mjs are node:test suites (pnpm test).
  testMatch: '**/*.spec.js',
  timeout: 90_000,
  // One worker per editor-*.spec.js; tests within a file share a beforeAll.
  workers: 2,
  fullyParallel: false,
  outputDir: 'output/playwright',
  use: { channel: 'chrome', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
});
