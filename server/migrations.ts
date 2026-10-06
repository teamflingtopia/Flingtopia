import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Database, Executor } from "./database-types.ts";
interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}
const folder = new URL("./migrations/", import.meta.url);
async function loadMigrations(): Promise<Migration[]> {
  const names = (await readdir(folder))
    .filter((n) => /^\d{3}_[a-z0-9_]+\.sql$/.test(n))
    .sort();
  const migrations = await Promise.all(
    names.map(async (name) => {
      const sql = (await readFile(new URL(name, folder), "utf8")).replace(
        /\r\n/g,
        "\n",
      );
      return {
        version: Number(name.slice(0, 3)),
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
  if (!migrations.length || migrations.some((m, i) => m.version !== i + 1))
    throw new Error("Migration versions must be contiguous starting at 001.");
  return migrations;
}
async function records(db: Executor) {
  return (
    await db.query<{ version: number; name: string; checksum: string }>(
      "SELECT version,name,checksum FROM app_migrations ORDER BY version",
    )
  ).rows;
}
function checkApplied(
  applied: Awaited<ReturnType<typeof records>>,
  migrations: Migration[],
) {
  for (const [i, row] of applied.entries()) {
    const expected = migrations[i];
    if (
      !expected ||
      row.version !== expected.version ||
      row.name !== expected.name ||
      row.checksum !== expected.checksum
    )
      throw new Error(
        `Migration history mismatch at version ${row.version}. Restore the original migration or use a compatible release; never edit applied SQL.`,
      );
  }
}
export async function migrationStatus(db: Database) {
  const migrations = await loadMigrations();
  const exists = (
    await db.query<{ present: boolean }>(
      "SELECT to_regclass('public.app_migrations') IS NOT NULL AS present",
    )
  ).rows[0]?.present;
  const applied = exists ? await records(db) : [];
  checkApplied(applied, migrations);
  return {
    applied,
    pending: migrations
      .slice(applied.length)
      .map(({ version, name }) => ({ version, name })),
  };
}
export async function assertMigrated(db: Database): Promise<void> {
  const status = await migrationStatus(db);
  if (status.pending.length)
    throw new Error(
      "Database migrations are pending. Run pnpm db:migrate using the migration role before starting this release.",
    );
}
export async function applyMigrations(db: Database): Promise<void> {
  const migrations = await loadMigrations();
  // The ledger is additive; schema_versions remains intact for legacy installations.
  await db.exec(
    "CREATE TABLE IF NOT EXISTS app_migrations (version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.transaction(async (tx) => {
    // Serializes migration runners on both PostgreSQL adapters, including an empty ledger.
    await tx.exec("LOCK TABLE app_migrations IN EXCLUSIVE MODE");
    const applied = await records(tx);
    checkApplied(applied, migrations);
    for (const migration of migrations.slice(applied.length)) {
      if (migration.version === 1)
        await validateLegacyBaseline(tx, migration.sql);
      await tx.exec(migration.sql);
      await tx.query(
        "INSERT INTO app_migrations(version,name,checksum) VALUES($1,$2,$3)",
        [migration.version, migration.name, migration.checksum],
      );
    }
  });
}
async function validateLegacyBaseline(
  tx: Executor,
  sql: string,
): Promise<void> {
  const existing = (
    await tx.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('schema_versions','users')",
    )
  ).rows;
  if (!existing.length) {
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
      (m) => m[1],
    );
    const partial = await tx.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",
      [tables],
    );
    if (partial.rows.length)
      throw new Error(
        "Partial legacy schema detected; review and restore before baseline adoption.",
      );
    return;
  }
  if (existing.length !== 2)
    throw new Error("Incomplete legacy database; refusing baseline adoption.");
  const versions = (
    await tx.query<{ version: number }>(
      "SELECT version FROM schema_versions ORDER BY version",
    )
  ).rows;
  if (versions.length !== 1 || versions[0]?.version !== 1)
    throw new Error("Unknown legacy schema version.");
  // Compare the legacy tables against the actual initial migration in a temporary schema.
  await tx.exec("CREATE SCHEMA flingtopia_migration_baseline");
  await tx.exec(
    "SET LOCAL search_path TO flingtopia_migration_baseline, public",
  );
  await tx.exec(sql);
  await tx.exec("SET LOCAL search_path TO public");
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
    (m) => m[1],
  );
  const snapshot = async (schema: string) => {
    const cols = await tx.query(
      "SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[]) ORDER BY table_name,ordinal_position",
      [schema, tables],
    );
    const constraints = await tx.query(
      "SELECT c.relname AS table_name, con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname,con.conname",
      [schema, tables],
    );
    return JSON.stringify({ columns: cols.rows, constraints: constraints.rows })
      .replaceAll("flingtopia_migration_baseline.", "")
      .replaceAll("public.", "");
  };
  const expected = await snapshot("flingtopia_migration_baseline");
  const actual = await snapshot("public");
  if (expected !== actual)
    throw new Error(
      "Legacy schema differs from migration 001. Baseline adoption stopped; no application records were changed.",
    );
  await tx.exec("DROP SCHEMA flingtopia_migration_baseline CASCADE");
}
