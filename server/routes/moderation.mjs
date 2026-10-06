import { reportReviewSchema } from "../../shared/validation.ts";
import { photoReviewSchema } from "../../shared/validation.ts";

import { fail, uuid } from "../domain.mjs";
export function registerModeration(app, context) {
  const { db, authenticated, staff, one, audit } = context;
  app.get("/api/v1/admin/queue", authenticated, staff, async (req, res) => {
    const reports = (
      await db.query(
        "SELECT r.*,u.display_name AS target_name,p.display_name AS reporter_name FROM reports r JOIN users u ON u.id=r.target_id JOIN users p ON p.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 100",
      )
    ).rows;
    const photos = (
      await db.query(
        "SELECT p.id,p.user_id,u.display_name,p.url AS pending_avatar FROM profile_photos p JOIN users u ON u.id=p.user_id WHERE p.status='pending' AND u.status='active' ORDER BY p.created_at LIMIT 100",
      )
    ).rows;
    res.json({ reports, photos });
  });
  app.post("/api/v1/admin/photos/:id", authenticated, staff, async () => {
    throw fail(
      409,
      "Refresh the photo queue and use the photo-specific review endpoint.",
      "REVIEW_CHANGED",
    );
  });
  app.post(
    "/api/v1/admin/reports/:id",
    authenticated,
    staff,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      const b = reportReviewSchema.parse(req.body);
      await db.transaction(async (tx) => {
        const report = await one(
          "SELECT * FROM reports WHERE id=$1 FOR UPDATE",
          [id],
          tx,
        );
        if (!report || report.status !== "open")
          throw fail(409, "This report has already been resolved.");
        if (b.suspend) {
          const target = await one(
            "SELECT * FROM users WHERE id=$1 FOR UPDATE",
            [report.target_id],
            tx,
          );
          if (target.staff_role)
            throw fail(
              403,
              "Staff account actions require a separate administrator review.",
            );
          await tx.query("UPDATE users SET status='suspended' WHERE id=$1", [
            report.target_id,
          ]);
          await tx.query(
            "UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1",
            [report.target_id],
          );
        }
        await tx.query(
          "UPDATE reports SET status='resolved',resolution=$1,resolved_by=$2 WHERE id=$3",
          [b.resolution, req.user.id, id],
        );
        await audit(
          tx,
          req.user.id,
          b.suspend ? "report_resolved_and_suspended" : "report_resolved",
          report.target_id,
          { report_id: id, resolution: b.resolution },
        );
      });
      res.json({ ok: true });
    },
  );
}
