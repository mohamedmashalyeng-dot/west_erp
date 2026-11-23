import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import mariadb from "mariadb";
import { mariaDbDriverUrl } from "../../src/lib/mysql";
import { DEV_DB, testDatabaseUrl } from "./dev-db-config";

export { DEV_DB, databaseUrl, testDatabaseUrl } from "./dev-db-config";

function binaryPath(name: string): string {
  const directory = process.env.MYSQL_BIN_DIR;
  if (!directory) throw new Error("Set MYSQL_BIN_DIR to your MariaDB bin directory, or set TEST_DATABASE_URL to a running test database.");
  const binary = path.resolve(directory, process.platform === "win32" ? `${name}.exe` : name);
  if (!existsSync(binary)) throw new Error(`The MariaDB ${name} executable is missing from MYSQL_BIN_DIR.`);
  return binary;
}

export function isClusterInitialised(): boolean {
  return existsSync(path.join(DEV_DB.dir, "mysql"));
}

export function runningPid(): number | null {
  const pidFile = path.join(DEV_DB.dir, "server.pid");
  if (!existsSync(pidFile)) return null;
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export function isServerRunning(): boolean {
  const pid = runningPid();
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function connectLocal() {
  return mariadb.createConnection({ host: "127.0.0.1", port: DEV_DB.port, user: DEV_DB.user, password: DEV_DB.password, connectTimeout: 2000 });
}

export async function ensureCluster(databases: string[] = [DEV_DB.database]): Promise<{ started: boolean; created: string[] }> {
  let started = false;
  if (!isClusterInitialised()) {
    if (process.platform !== "win32") throw new Error("Start a local MySQL/MariaDB server and set TEST_DATABASE_URL. Automatic portable initialization currently supports Windows.");
    const result = spawnSync(binaryPath("mariadb-install-db"), [`--datadir=${DEV_DB.dir}`, `--password=${DEV_DB.password}`, `--port=${DEV_DB.port}`, "--silent"], { windowsHide: true, encoding: "utf8" });
    if (result.status !== 0) throw new Error("Local MariaDB initialization failed. Check MYSQL_BIN_DIR and the data directory permissions.");
  }
  if (!isServerRunning()) {
    const child = spawn(binaryPath("mariadbd"), [
      "--no-defaults", `--datadir=${DEV_DB.dir}`, `--port=${DEV_DB.port}`,
      "--bind-address=127.0.0.1", `--pid-file=${path.join(DEV_DB.dir, "server.pid")}`,
      `--log-error=${path.join(DEV_DB.dir, "server.log")}`, "--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci",
    ], { detached: true, stdio: "ignore", windowsHide: true });
    const launchError = new Promise<never>((_, reject) => child.once("error", () => reject(new Error("Local MariaDB could not be started."))));
    child.unref();
    const ready = async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        try { const connection = await connectLocal(); await connection.end(); return; } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
      }
      throw new Error("Local MariaDB did not become ready. Check .mysql-data/server.log.");
    };
    await Promise.race([ready(), launchError]);
    started = true;
  }
  const connection = await connectLocal();
  const created: string[] = [];
  try {
    for (const database of databases) {
      if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error("Invalid local database name.");
      const found = await connection.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [database]);
      if (found.length) continue;
      await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      created.push(database);
    }
  } finally { await connection.end(); }
  return { started, created };
}

export async function ensureTestDatabase(): Promise<void> {
  if (!process.env.TEST_DATABASE_URL) { await ensureCluster([DEV_DB.testDatabase]); return; }
  const connection = await mariadb.createConnection(mariaDbDriverUrl(testDatabaseUrl()));
  try { await connection.query("SELECT 1"); } finally { await connection.end(); }
}

export async function stopCluster(): Promise<void> {
  if (!isServerRunning()) return;
  const connection = await connectLocal();
  try { await connection.query("SHUTDOWN"); } finally { await connection.end(); }
}
