import { spawnSync } from "node:child_process";
import path from "node:path";

const prismaCli = path.resolve("node_modules/prisma/build/index.js");
function run(args: string[]): number {
  return spawnSync(process.execPath, [prismaCli, ...args], { stdio: "inherit", windowsHide: true }).status ?? 1;
}

// Read-only comparison first. Never mark an imported database as compatible
// merely because it contains tables; that could hide missing columns or data.
const status = run(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/mysql-baseline.prisma", "--exit-code"]);
if (status !== 0) {
  console.error("Baseline refused: the existing schema must match prisma/mysql-baseline.prisma. Review the differences without resetting or dropping data.");
  process.exitCode = status;
} else {
  process.exitCode = run(["migrate", "resolve", "--applied", "20261123150000_mysql_init"]);
}
