import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { applyMigrations, assertMigrated } from "./migrations.ts";
import type { Database, DatabaseOptions, Row } from "./database-types.ts";

export async function openDatabase({
  url,
  directory,
  ssl = false,
  migrate = true,
}: DatabaseOptions = {}): Promise<Database> {
  let db: Database;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      max: 10,
      ssl: ssl ? { rejectUnauthorized: true } : undefined,
    });
    db = {
      query: <T extends Row>(sql: string, params: unknown[] = []) =>
        pool.query<T>(sql, params),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn({
            query: <T extends Row>(sql: string, params: unknown[] = []) =>
              client.query<T>(sql, params),
            exec: (sql) => client.query(sql),
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    if (directory) await mkdir(resolve(directory), { recursive: true });
    const pg = new PGlite(directory ? resolve(directory) : undefined);
    await pg.waitReady;
    let queue: Promise<unknown> = Promise.resolve();
    const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
      const result = queue.then(fn);
      queue = result.catch(() => {});
      return result;
    };
    db = {
      query: <T extends Row>(sql: string, params: unknown[] = []) =>
        enqueue(() => pg.query<T>(sql, params)),
      exec: (sql) => enqueue(() => pg.exec(sql)),
      transaction: (fn) =>
        enqueue(() =>
          pg.transaction((tx) =>
            fn({
              query: <T extends Row>(sql: string, params: unknown[] = []) =>
                tx.query<T>(sql, params),
              exec: (sql) => tx.exec(sql),
            }),
          ),
        ),
      close: () => enqueue(() => pg.close()),
    };
  }
  try {
    if (migrate) await applyMigrations(db);
    else await assertMigrated(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
