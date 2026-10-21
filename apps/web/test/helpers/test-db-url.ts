try {
  // Picks up TEST_DATABASE_URL from the root .env (e.g. when the local Postgres isn't on :5432).
  process.loadEnvFile("../../.env");
} catch {
  // no root .env (CI): real environment variables are used
}

/** Dedicated test database. Override with TEST_DATABASE_URL (the database name must end in `_test`). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://marktwerk:marktwerk@localhost:5432/marktwerk_test";

export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test"))
    throw new Error(
      `Refusing to run integration tests against "${name}": the name must end in _test`,
    );
  return name;
}
