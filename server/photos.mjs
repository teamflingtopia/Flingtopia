import { sharedLimit } from "./security.mjs";
import { randomUUID } from "node:crypto";
import { createMediaStorage } from "./media-storage.mjs";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { uuid, fail } from "./domain.mjs";
export function registerPhotos(
  app,
  {
    db,
    config,
    authenticated,
    verified,
    staff,
    staffVerified,
    one,
    audit,
    contactAllowed,
  },
) {
  const storage = config.photoStorage || createMediaStorage(config);
  const photoLimit = sharedLimit(
    db,
    config.secret,
    "photo-upload",
    6,
    900,
    (req) => req.user.id,
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  async function submit(req, res) {
    if (!req.file) throw fail(400, "Choose a JPEG, PNG or WebP photo.");
    let bytes;
    try {
      const instance = sharp(req.file.buffer, { limitInputPixels: 25000000 });
      const info = await instance.metadata();
      if (!["jpeg", "png", "webp"].includes(info.format)) throw 0;
      bytes = await instance
        .rotate()
        .resize(1000, 1000, { fit: "cover" })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw fail(400, "Choose a readable JPEG, PNG or WebP under 5 MB.");
    }
    const id = randomUUID(),
      url = `/media/${id}.jpg`;
    await storage.put(`${id}.jpg`, bytes);
    try {
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        const count = await one(
          "SELECT count(*)::int AS n FROM profile_photos WHERE user_id=$1 AND status IN ('pending','approved')",
          [req.user.id],
          tx,
        );
        if (count.n >= 6)
          throw fail(
            409,
            "Keep up to six approved or pending photos. Remove one before uploading.",
          );
        await tx.query(
          "INSERT INTO profile_photos(id,user_id,url,status) VALUES($1,$2,$3,'pending')",
          [id, req.user.id, url],
        );
        await tx.query("UPDATE users SET pending_avatar=$1 WHERE id=$2", [
          url,
          req.user.id,
        ]);
        await audit(tx, req.user.id, "photo_submitted", id);
      });
    } catch (e) {
      await storage.remove(`${id}.jpg`).catch(() => {
        console.error(
          JSON.stringify({ event: "photo_cleanup_failed", photo_id: id }),
        );
      });
      throw e;
    }
    res
      .status(201)
      .json({ id, message: "Photo submitted for moderator review." });
  }
  app.post(
    "/api/v1/me/photo",
    authenticated,
    verified,
    photoLimit,
    upload.single("photo"),
    submit,
  );
  app.post(
    "/api/v1/me/photos",
    authenticated,
    verified,
    photoLimit,
    upload.single("photo"),
    submit,
  );
  app.get("/api/v1/me/photos", authenticated, async (req, res) =>
    res.json({
      photos: (
        await db.query(
          "SELECT id,url,status,reason,created_at,reviewed_at FROM profile_photos WHERE user_id=$1 AND status<>'removed' ORDER BY created_at DESC",
          [req.user.id],
        )
      ).rows,
    }),
  );
  app.post(
    "/api/v1/me/photos/:id/primary",
    authenticated,
    verified,
    async (req, res) => {
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        const photo = await one(
          "SELECT * FROM profile_photos WHERE id=$1 AND user_id=$2 AND status='approved' FOR UPDATE",
          [uuid.parse(req.params.id), req.user.id],
          tx,
        );
        if (!photo) throw fail(404, "Approved photo unavailable.", "NOT_FOUND");
        await tx.query("UPDATE users SET avatar_url=$1 WHERE id=$2", [
          photo.url,
          req.user.id,
        ]);
        await audit(tx, req.user.id, "primary_photo_changed", photo.id);
      });
      res.json({ ok: true });
    },
  );
  app.delete("/api/v1/me/photos/:id", authenticated, async (req, res) => {
    const photo = await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.user.id,
      ]);
      const p = await one(
        "SELECT * FROM profile_photos WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [uuid.parse(req.params.id), req.user.id],
        tx,
      );
      if (!p) throw fail(404, "Photo unavailable.", "NOT_FOUND");
      await tx.query("UPDATE profile_photos SET status='removed' WHERE id=$1", [
        p.id,
      ]);
      await tx.query(
        "UPDATE users SET avatar_url=CASE WHEN avatar_url=$1 THEN NULL ELSE avatar_url END,pending_avatar=(SELECT url FROM profile_photos WHERE user_id=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1) WHERE id=$2",
        [p.url, req.user.id],
      );
      await audit(tx, req.user.id, "photo_removed", p.id);
      return p;
    });
    await storage.remove(`${photo.id}.jpg`).catch((e) => {
      if (e.code !== "ENOENT")
        console.error(
          JSON.stringify({ event: "photo_cleanup_failed", photo_id: photo.id }),
        );
    });
    res.json({ ok: true });
  });
  app.post(
    "/api/v1/admin/photo-reviews/:id",
    authenticated,
    staff,
    async (req, res) => {
      const b = z
        .object({
          approve: z.boolean(),
          reason: z.string().trim().min(10).max(500),
        })
        .parse(req.body);
      const photoId = uuid.parse(req.params.id);
      await db.transaction(async (tx) => {
        const candidate = await one(
          "SELECT user_id FROM profile_photos WHERE id=$1",
          [photoId],
          tx,
        );
        if (!candidate) throw fail(404, "Photo unavailable.");
        const owner = await one(
          "SELECT * FROM users WHERE id=$1 FOR UPDATE",
          [candidate.user_id],
          tx,
        );
        const photo = await one(
          "SELECT * FROM profile_photos WHERE id=$1 FOR UPDATE",
          [photoId],
          tx,
        );
        if (photo.status !== "pending" || owner.status !== "active")
          throw fail(409, "Photo is no longer awaiting review.");
        await tx.query(
          "UPDATE profile_photos SET status=$1,reason=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$4",
          [b.approve ? "approved" : "rejected", b.reason, req.user.id, photoId],
        );
        await tx.query(
          "UPDATE users SET avatar_url=CASE WHEN $1=true AND avatar_url IS NULL THEN $2 ELSE avatar_url END,pending_avatar=(SELECT url FROM profile_photos WHERE user_id=$3 AND status='pending' ORDER BY created_at DESC LIMIT 1) WHERE id=$3",
          [b.approve, photo.url, owner.id],
        );
        await audit(
          tx,
          req.user.id,
          b.approve ? "photo_approved" : "photo_rejected",
          photoId,
          { owner_id: owner.id, reason: b.reason },
        );
      });
      res.json({ ok: true });
    },
  );
  app.get("/media/:file", authenticated, async (req, res) => {
    if (!/^[a-f0-9-]{36}\.jpg$/.test(req.params.file))
      throw fail(404, "Not found.", "NOT_FOUND");
    const p = await one(
      "SELECT p.*,u.status AS account_status,u.profile_visible,u.email_verified,u.onboarding_completed_at,u.is_demo FROM profile_photos p JOIN users u ON u.id=p.user_id WHERE p.url=$1",
      [`/media/${req.params.file}`],
    );
    if (!p || p.status === "removed")
      throw fail(404, "Not found.", "NOT_FOUND");
    const owner = p.user_id === req.user.id,
      reviewer = req.user.staff_role && (await staffVerified(req));
    if (
      !owner &&
      !reviewer &&
      (p.status !== "approved" ||
        p.account_status !== "active" ||
        !p.profile_visible ||
        !p.email_verified ||
        (!p.onboarding_completed_at && !p.is_demo) ||
        !req.user.email_verified ||
        (!req.user.onboarding_completed_at && !req.user.is_demo) ||
        (p.is_demo && !config.demo) ||
        !(await contactAllowed(db, p.user_id, req.user.id)))
    )
      throw fail(404, "Not found.", "NOT_FOUND");
    res.set("Cache-Control", "private, no-store");
    res.type("jpeg").send(await storage.get(req.params.file));
  });
}
