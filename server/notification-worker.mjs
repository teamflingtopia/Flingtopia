import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createMailTransport } from "./mail.mjs";
export function startNotificationWorker(db, config) {
  let running = null;
  const transport = createMailTransport(config);
  async function deliver() {
    await db.query(
      "DELETE FROM request_limits WHERE expires_at<now()-interval '1 day'",
    );
    await db.query(
      "DELETE FROM staff_stepups WHERE verified_at<now()-interval '1 day'",
    );
    await db.query(
      "UPDATE notification_mail SET failed_at=now() WHERE attempts>=5 AND sent_at IS NULL AND failed_at IS NULL AND (lease_until IS NULL OR lease_until<now())",
    );
    if (!transport && !(config.demo && !config.production)) return;
    const lease = randomUUID();
    const job = await db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "SELECT * FROM notification_mail WHERE sent_at IS NULL AND failed_at IS NULL AND attempts<5 AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED",
        )
      ).rows[0];
      if (!row) return null;
      await tx.query(
        "UPDATE notification_mail SET attempts=attempts+1,lease_id=$1,lease_until=now()+interval '2 minutes' WHERE id=$2",
        [lease, row.id],
      );
      return row;
    });
    if (!job) return;
    try {
      const row = (
        await db.query(
          "SELECT n.message,n.event_id,u.email FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.id=$1",
          [job.notification_id],
        )
      ).rows[0];
      const text = `${row.message}\nView your plan: ${config.origin}/#events/${row.event_id}`;
      if (transport)
        await transport.sendMail({
          deliveryKey: `event-${job.id}`,
          from: config.mailFrom,
          to: row.email,
          subject: "A Flingtopia event was cancelled",
          text,
        });
      else {
        await mkdir(config.mailPreviewDir, { recursive: true });
        await writeFile(
          resolve(config.mailPreviewDir, `event-${job.id}.txt`),
          `LOCAL PREVIEW ONLY\nTo: ${row.email}\n${text}`,
          { mode: 0o600 },
        );
      }
      await db.query(
        "UPDATE notification_mail SET sent_at=now(),lease_until=NULL WHERE id=$1 AND lease_id=$2",
        [job.id, lease],
      );
    } catch {
      await db.query(
        "UPDATE notification_mail SET lease_until=NULL,next_attempt_at=now()+interval '1 minute' WHERE id=$1 AND lease_id=$2",
        [job.id, lease],
      );
      console.error(
        JSON.stringify({ event: "event_mail_failed", job_id: job.id }),
      );
    }
  }
  const tick = () => {
    if (!running)
      running = deliver()
        .catch(() => console.error('{"event":"notification_worker_failed"}'))
        .finally(() => {
          running = null;
        });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await running;
    transport?.close();
  };
}
