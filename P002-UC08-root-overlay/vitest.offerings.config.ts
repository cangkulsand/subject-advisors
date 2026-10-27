import { defineConfig } from 'vitest/config';
export default defineConfig({
  cacheDir: '.cache-offerings/vitest',
  test: { include: ["apps/api/src/modules/offerings/**/*.test.ts","apps/web/src/features/offerings/**/*.test.ts","packages/shared/src/offerings/**/*.test.ts"], restoreMocks: true },
});
