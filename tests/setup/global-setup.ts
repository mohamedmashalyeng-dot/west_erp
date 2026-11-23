import { spawnSync } from "node:child_process";
import { ensureTestDatabase, testDatabaseUrl } from "../../scripts/lib/dev-database";

/**
 * Connects to a dedicated MySQL/MariaDB test database and
 * applies migrations to the dedicated test database.
 *
 * Test files use testDatabaseUrl() before importing Prisma. It rejects names
 * that are not explicitly test databases and never uses production DATABASE_URL.
 */
export async function setup(): Promise<void> {
  await ensureTestDatabase();

  const url = testDatabaseUrl();
  const result = spawnSync("npx prisma migrate deploy", {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });

  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy failed for the test database (exit code ${result.status})`,
    );
  }
}
