import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import mariadb, { type Connection } from "mariadb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../scripts/lib/dev-db-config";
import { mariaDbDriverUrl } from "@/lib/mysql";

process.env.DATABASE_URL = testDatabaseUrl();
const { prisma, forOrganization } = await import("@/lib/prisma");

describe("MySQL data compatibility", () => {
  let organizationId: string;
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "اختبار MySQL", slug: `mysql-${randomUUID()}` } });
    organizationId = org.id;
  });
  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("stores Arabic long notes, UUIDs and JSON priority factors without truncating them", async () => {
    const notes = "تفاصيل التواصل مع العميل ومتابعة الطلب. ".repeat(1000);
    const lead = await forOrganization(organizationId).lead.create({
      data: { organizationId, firstName: "Mona", lastName: "علي", phone: "+201012345678", notes, priorityFactors: ["زيارة", "Budget verified"], budgetMax: "1234567.89" },
    });
    const saved = await forOrganization(organizationId).lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.id).toHaveLength(36);
    expect(saved.notes).toBe(notes);
    expect(saved.priorityFactors).toEqual(["زيارة", "Budget verified"]);
    expect(saved.budgetMax?.toString()).toBe("1234567.89");
  });

  it("uses case-insensitive lead searches and keeps the JSON-array default", async () => {
    const db = forOrganization(organizationId);
    expect(await db.lead.count({ where: { firstName: { contains: "MONA" } } })).toBe(1);
    const lead = await db.lead.create({ data: { organizationId, firstName: "Ahmed", lastName: "Ali", phone: "" } });
    expect(lead.priorityFactors).toEqual([]);
  });

  it("stores long Page credentials without losing data", async () => {
    const ciphertext = "test-only-ciphertext:" + "x".repeat(2500);
    await forOrganization(organizationId).organizationSettings.create({ data: { organizationId, facebookPageAccessToken: ciphertext } });
    const settings = await forOrganization(organizationId).organizationSettings.findUniqueOrThrow({ where: { organizationId } });
    expect(settings.facebookPageAccessToken).toBe(ciphertext);
  });
});

describe("adopting an existing MySQL database", () => {
  const database = `estateiq_adoption_${randomBytes(6).toString("hex")}_test`;
  const scratchUrl = new URL(testDatabaseUrl());
  scratchUrl.pathname = `/${database}`;
  scratchUrl.searchParams.set("multipleStatements", "true");
  let admin: Connection;
  let connection: Connection;
  const organizationId = randomUUID();
  const prismaCli = path.resolve("node_modules/prisma/build/index.js");

  function run(args: string[]) {
    return spawnSync(process.execPath, args, {
      env: { ...process.env, DATABASE_URL: scratchUrl.toString() }, encoding: "utf8", windowsHide: true,
    });
  }
  beforeAll(async () => {
    // Only disposable databases derived from the explicitly selected test URL.
    if (!/^estateiq_adoption_[a-f0-9]+_test$/.test(database)) throw new Error("Invalid scratch database name");
    admin = await mariadb.createConnection(mariaDbDriverUrl(testDatabaseUrl()));
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    connection = await mariadb.createConnection(mariaDbDriverUrl(scratchUrl.toString()));
    await connection.query(readFileSync("prisma/migrations/20261123150000_mysql_init/migration.sql", "utf8"));
    await connection.query("INSERT INTO `Organization` (`id`, `name`, `slug`, `updatedAt`) VALUES (?, ?, ?, NOW(3))", [organizationId, "بيانات موجودة قبل التحديث", "existing-org"]);
    await connection.query("INSERT INTO `OrganizationSettings` (`id`, `organizationId`, `leadsSheetUrl`, `updatedAt`) VALUES (?, ?, ?, NOW(3))", [randomUUID(), organizationId, "https://docs.google.com/spreadsheets/d/existing-data"]);
  });
  afterAll(async () => {
    await connection?.end();
    if (admin && /^estateiq_adoption_[a-f0-9]+_test$/.test(database)) {
      await admin.query(`DROP DATABASE \`${database}\``);
      await admin.end();
    }
  });

  it("baselines matching existing tables and adds Facebook fields while preserving existing records", () => {
    const baseline = run(["--import", "tsx", "scripts/baseline-mysql.ts"]);
    expect(baseline.status, baseline.stdout + baseline.stderr).toBe(0);
    const migration = run([prismaCli, "migrate", "deploy"]);
    expect(migration.status, migration.stdout + migration.stderr).toBe(0);
  }, 60_000);

  it("preserves imported data and refuses to baseline a mismatched schema", async () => {
    const rows = await connection.query("SELECT o.name, s.leadsSheetUrl, s.facebookPageId FROM `Organization` o JOIN `OrganizationSettings` s ON s.organizationId = o.id WHERE o.id = ?", [organizationId]);
    expect(rows[0]).toMatchObject({ name: "بيانات موجودة قبل التحديث", leadsSheetUrl: "https://docs.google.com/spreadsheets/d/existing-data", facebookPageId: null });
    await connection.query("CREATE TABLE `ImportedExtraRecords` (`value` INT NOT NULL)");
    await connection.query("INSERT INTO `ImportedExtraRecords` VALUES (123)");
    const before = await connection.query("SELECT COUNT(*) AS count FROM `_prisma_migrations`");
    const baseline = run(["--import", "tsx", "scripts/baseline-mysql.ts"]);
    expect(baseline.status).not.toBe(0);
    expect(baseline.stderr).toContain("Baseline refused");
    expect((await connection.query("SELECT value FROM `ImportedExtraRecords`"))[0].value).toBe(123);
    expect((await connection.query("SELECT COUNT(*) AS count FROM `_prisma_migrations`"))[0].count).toBe(before[0].count);
  }, 60_000);
});
