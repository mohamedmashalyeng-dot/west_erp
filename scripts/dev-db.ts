import { DEV_DB, ensureCluster, isServerRunning, stopCluster } from "./lib/dev-database";

async function main() {
  const command = (process.argv[2] ?? "start").toLowerCase();
  if (command === "start") {
    const result = await ensureCluster([DEV_DB.database, DEV_DB.testDatabase]);
    console.log(`[db] MariaDB ${result.started ? "started" : "running"} on 127.0.0.1:${DEV_DB.port}; ${result.created.length} databases created.`);
  } else if (command === "stop") {
    await stopCluster();
    console.log("[db] Local MariaDB stopped.");
  } else if (command === "status") {
    console.log(`[db] Local MariaDB ${isServerRunning() ? "running" : "stopped"} on port ${DEV_DB.port}.`);
  } else {
    throw new Error("Use start, stop, or status. Data directories are never removed by this script.");
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Database operation failed."); process.exitCode = 1; });
