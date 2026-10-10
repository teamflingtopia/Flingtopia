import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  assertMigrated,
  migrationStatus,
} from "../server/migrations.ts";
const initial = await readFile(
  new URL("../server/migrations/001_initial.sql", import.meta.url),
  "utf8",
);
test("legacy baseline adopts all migrations without losing existing data", async () => {
  const db = new PGlite();
  try {
    await db.exec(initial);
    await db.exec(
      "CREATE TABLE legacy_probe(value text); INSERT INTO legacy_probe VALUES('preserved')",
    );
    await applyMigrations(db);
    await assertMigrated(db);
    await applyMigrations(db);
    assert.equal((await migrationStatus(db)).applied.length, 6);
    assert.equal(
      (await db.query("SELECT value FROM legacy_probe")).rows[0].value,
      "preserved",
    );
  } finally {
    await db.close();
  }
});
test("modified legacy schema refuses adoption and rolls back migration changes", async () => {
  const db = new PGlite();
  try {
    await db.exec(initial);
    await db.exec("ALTER TABLE users ADD COLUMN unexpected text");
    await assert.rejects(applyMigrations(db), /Legacy schema differs/);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM app_migrations")).rows[0]
        .n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT to_regnamespace('flingtopia_migration_baseline') AS n",
        )
      ).rows[0].n,
      null,
    );
  } finally {
    await db.close();
  }
});
test("startup refuses pending migrations and detects tampered migration history", async () => {
  const db = new PGlite();
  try {
    await assert.rejects(assertMigrated(db), /pending/);
    await applyMigrations(db);
    await db.exec(
      "UPDATE app_migrations SET checksum='tampered' WHERE version=2",
    );
    await assert.rejects(assertMigrated(db), /history mismatch/);
  } finally {
    await db.close();
  }
});
