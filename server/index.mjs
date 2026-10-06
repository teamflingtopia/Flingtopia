import { startNotificationWorker } from "./notification-worker.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { openDatabase } from "./db.mjs";
import { createApp } from "./app.mjs";
import { policies } from "../shared/policies.ts";
import { startRecoveryMail } from "./recovery.mjs";
import { seed } from "./seed.mjs";
import { createMediaStorage } from "./media-storage.mjs";
try {
  process.loadEnvFile();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = process.env.NODE_ENV === "production";
const staging = process.env.APP_ENV === "staging";
const stagingPublicAccess = staging && process.env.STAGING_PUBLIC_ACCESS === "true";
const emailDisabled = process.env.STAGING_DISABLE_EMAIL === "true";
if (stagingPublicAccess && emailDisabled)
  throw new Error("Public staging requires email to be enabled.");
if (emailDisabled && !staging)
  throw new Error(
    "STAGING_DISABLE_EMAIL is allowed only with APP_ENV=staging.",
  );
if (
  staging &&
  (!production || (!stagingPublicAccess && (process.env.STAGING_ACCESS_PASSWORD || "").length < 24))
)
  throw new Error(
    "Staging requires NODE_ENV=production and STAGING_ACCESS_PASSWORD of at least 24 characters.",
  );
const demo =
  process.env.DEMO_MODE === undefined
    ? !production
    : process.env.DEMO_MODE === "true";
const directory = resolve(root, process.env.DATA_DIR || "data");
await mkdir(directory, { recursive: true });
if (
  production &&
  (!process.env.DATABASE_URL ||
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    (!emailDisabled &&
      (!(process.env.SMTP_HOST || process.env.RESEND_API_KEY) ||
        !process.env.MAIL_FROM)) ||
    !process.env.MFA_ENCRYPTION_KEY ||
    process.env.MFA_ENCRYPTION_KEY.length < 32 ||
    !process.env.APP_ORIGIN?.startsWith("https://") ||
    demo)
)
  throw new Error(
    "Hosted runtime requires DATABASE_URL, 32+ character JWT_SECRET and MFA_ENCRYPTION_KEY, SMTP_HOST or RESEND_API_KEY, MAIL_FROM, HTTPS APP_ORIGIN, and DEMO_MODE=false.",
  );
if (
  production &&
  !staging &&
  Object.values(policies).some((p) => p.version.includes("preview"))
)
  throw new Error(
    "Approved consent policies and versions are required before production; current text is development-only.",
  );
let secret = process.env.JWT_SECRET;
if (!secret) {
  const path = resolve(directory, "local-session-secret");
  try {
    secret = await readFile(path, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    secret = randomBytes(48).toString("hex");
    await writeFile(path, secret, { mode: 0o600 });
  }
}
const db = await openDatabase({
  url: process.env.DATABASE_URL,
  directory: resolve(directory, "postgres"),
  ssl: process.env.DATABASE_SSL === "true",
  migrate: !production,
});
if (demo) await seed(db);
if (
  production &&
  (await db.query("SELECT 1 FROM users WHERE is_demo=true LIMIT 1")).rows.length
)
  throw new Error(
    "Use a clean production database; development sample accounts must not be deployed.",
  );
const port = Number(process.env.PORT || 4100);
const appConfig = {
  secret,
  mfaSecret: process.env.MFA_ENCRYPTION_KEY || secret,
  production,
  staging,
  stagingPublicAccess,
  social: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
    apple: { clientId: process.env.APPLE_CLIENT_ID, teamId: process.env.APPLE_TEAM_ID, keyId: process.env.APPLE_KEY_ID, privateKey: process.env.APPLE_PRIVATE_KEY },
  },
  emailDisabled,
  stagingAccessPassword: process.env.STAGING_ACCESS_PASSWORD,
  // Enable only behind the documented single trusted proxy deployment.
  trustProxy: process.env.TRUST_PROXY_HOPS === "1" ? 1 : false,
  demo,
  origin: process.env.APP_ORIGIN || "http://127.0.0.1:5173",
  mediaDir: resolve(directory, "media"),
  distDir: resolve(root, "dist"),
  dummyHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  mailFrom: process.env.MAIL_FROM,
  resendApiKey: process.env.RESEND_API_KEY,
  mediaStorage: process.env.MEDIA_STORAGE || "local",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET,
  eventPublisherRoles: ["admin", "moderator"], // Approved 4 October 2026; staff MFA still required.
  accountRequests: true, // Approved export/intake only; does not enable account erasure.
  mailPreviewDir: resolve(directory, "mail-preview"),
};
if (staging && appConfig.mediaStorage !== "supabase")
  throw new Error("Free staging requires persistent Supabase photo storage.");
appConfig.photoStorage = createMediaStorage(appConfig);
await appConfig.photoStorage.ready();
const app = createApp(db, appConfig);
const stopRecoveryMail = startRecoveryMail(db, appConfig);
const stopNotificationWorker = startNotificationWorker(db, appConfig);
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `Flingtopia API: http://${process.env.HOST || "127.0.0.1"}:${port} | ${demo ? "local demo data enabled" : "demo disabled"}`,
  ),
);
async function shutdown() {
  server.close(async () => {
    await stopRecoveryMail();
    await stopNotificationWorker();
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
