// Disposable browser QA server: never reads the application's saved database.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import bcrypt from "bcryptjs";
import { openDatabase } from "../server/db.mjs";
import { seed } from "../server/seed.mjs";
import { createApp } from "../server/app.mjs";
import { removeTestDirectory } from "../tests/helpers.mjs";
const dir = await mkdtemp(join(tmpdir(), "flingtopia-validation-"));
const db = await openDatabase();
await seed(db);
const password = await bcrypt.hash("Test-password-1234", 12);
await db.query("UPDATE users SET password_hash=$1", [password]);
const config = {
  secret: "disposable-browser-validation-secret-32-characters",
  origin: "http://127.0.0.1:4199",
  demo: true,
  production: false,
  mediaDir: dir,
  distDir: resolve("dist"),
  dummyHash: password,
  eventPublisherRoles: ["admin", "moderator"],
  accountRequests: true,
};
const server = createApp(db, config).listen(4199, "127.0.0.1");
await once(server, "listening");
console.log("Isolated validation preview: " + config.origin);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await db.close();
  await removeTestDirectory(dir);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
