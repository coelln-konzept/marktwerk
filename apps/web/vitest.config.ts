import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/helpers/test-db-url.ts";

const src = fileURLToPath(new URL("./src", import.meta.url));
const emptyModule = fileURLToPath(new URL("./test/helpers/empty-module.ts", import.meta.url));

/**
 * Integration tests for server code (services, queries) against a dedicated Postgres database
 * (`marktwerk_test`, see test/global-setup.ts). Run with `pnpm --filter @marktwerk/web test:integration`.
 * Not part of the plain `pnpm test` (which must pass without a database).
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${src}/` },
      // `server-only` throws outside the Next.js server bundle; tests run in plain Node.
      { find: /^server-only$/, replacement: emptyModule },
    ],
  },
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    // All files share one database, so run them one after another.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // Mirrors `experimental.authInterrupts` in next.config.ts so forbidden() throws its 403 error.
      __NEXT_EXPERIMENTAL_AUTH_INTERRUPTS: "true",
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: "vitest-only-secret-that-is-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      APP_URL: "http://localhost:3000",
    },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
