import { defineConfig } from 'vitest/config';

// Tests sur la couche domaine pure uniquement (aucune dépendance Expo/React Native).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
});
