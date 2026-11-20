import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    // Needs Postgres + Redis (see `make infra-up` / the CI services). DB_* / REDIS_* default to localhost.
    env: {
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'e2e-access-secret-e2e-access-secret-0123456789',
      GITHUB_CLIENT_ID: 'e2e-client-id', // dummy: lets the redirect test run for real (no network call is made)
      GITHUB_CLIENT_SECRET: 'e2e-client-secret',
      FRONTEND_URL: 'http://localhost:3000',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'e2e-refresh-secret-e2e-refresh-secret-0123456789',
    },
  },
});
