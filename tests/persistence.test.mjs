import { removeTestDirectory } from "./helpers.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/db.mjs";

test("disk-backed PostgreSQL data survives closing and reopening the application database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flingtopia-persistence-"));
  let db;
  try {
    db = await openDatabase({ directory });
    await db.query(
      "CREATE TABLE persistence_probe (id integer PRIMARY KEY, value text NOT NULL)",
    );
    await db.query("INSERT INTO persistence_probe(id,value) VALUES($1,$2)", [
      1,
      "saved across restarts",
    ]);
    await db.close();
    db = null;
    db = await openDatabase({ directory });
    assert.equal(
      (await db.query("SELECT value FROM persistence_probe WHERE id=1")).rows[0]
        .value,
      "saved across restarts",
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM schema_versions")).rows[0]
        .n,
      1,
    );
  } finally {
    await db?.close();
    await removeTestDirectory(directory);
  }
});
