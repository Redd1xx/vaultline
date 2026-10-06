// Vitest configuration for Vaultline custody & circuit verification suite
import { defineConfig } from 'vitest/config';

const testSuitePatterns = ['tests/**/*.test.ts'];

export default defineConfig({
  test: {
    include: testSuitePatterns,
    environment: 'node',
    globals: false,
    passWithNoTests: false,
  },
});
