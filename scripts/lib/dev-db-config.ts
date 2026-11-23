import "./load-env";
import path from "node:path";

export const DEV_DB = {
  port: Number(process.env.DEV_DATABASE_PORT ?? 3307),
  dir: path.resolve(process.cwd(), process.env.DEV_DATABASE_DIR ?? ".mysql-data"),
  database: process.env.DEV_DATABASE_NAME ?? "estateiq",
  testDatabase: process.env.TEST_DATABASE_NAME ?? "estateiq_test",
  user: process.env.DEV_DATABASE_USER ?? "root",
  password: process.env.DEV_DATABASE_PASSWORD ?? "password",
};

export function databaseUrl(database: string, port = DEV_DB.port): string {
  return `mysql://${encodeURIComponent(DEV_DB.user)}:${encodeURIComponent(DEV_DB.password)}@127.0.0.1:${port}/${encodeURIComponent(database)}`;
}

export function testDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL || databaseUrl(DEV_DB.testDatabase);
  const parsed = new URL(value);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (parsed.protocol !== "mysql:" || !/^(test_.+|.+_test)$/.test(name)) {
    throw new Error("Tests require a mysql:// URL whose database name starts with test_ or ends with _test.");
  }
  return value;
}
