import "./lib/load-env";
import mariadb from "mariadb";
import { mariaDbDriverUrl } from "../src/lib/mysql";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url?.startsWith("mysql://")) throw new Error("DATABASE_URL must be configured with a mysql:// connection.");
  const connection = await mariadb.createConnection(mariaDbDriverUrl(url));
  try {
    const server = await connection.query("SELECT DATABASE() AS databaseName, VERSION() AS version");
    const tables = await connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME");
    console.log(JSON.stringify({ provider: "mysql", database: server[0].databaseName, serverVersion: server[0].version, tables: tables.map((table: { name: string }) => table.name) }, null, 2));
  } finally { await connection.end(); }
}
main().catch(() => { console.error("Database inspection failed. Check the MySQL connection and access from this server; credentials are not printed."); process.exitCode = 1; });
