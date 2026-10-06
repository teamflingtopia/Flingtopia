import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./database.ts";
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// A deployment job injects MIGRATION_DATABASE_URL. The runtime credential need not own DDL.
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (
  process.env.NODE_ENV === "production" &&
  !process.env.MIGRATION_DATABASE_URL
)
  throw new Error(
    "Production migration jobs require MIGRATION_DATABASE_URL for the separately provisioned migration role.",
  );
const db = await openDatabase({
  url,
  directory: resolve(root, process.env.DATA_DIR || "data", "postgres"),
  ssl: process.env.DATABASE_SSL === "true",
  migrate: true,
});
await db.close();
console.log("Database migration history is current.");
