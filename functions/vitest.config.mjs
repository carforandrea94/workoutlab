import { defineConfig } from 'vitest/config';

// I test delle funzioni pure (orari, messaggio): niente Firebase, niente rete.
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'], environment: 'node' }
});
