import {
  onboardingSchema,
  completionSchema,
  creatorSchema,
} from "../../shared/validation.ts";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import multer from "multer";
import sharp from "sharp";

import { fail, privateUser, profileSchema, age } from "../domain.mjs";
export function registerProfiles(app, context) {
  const { db, config, authenticated, verified, one, audit, contactAllowed } =
    context;
  app.get("/api/v1/me", authenticated, (req, res) =>
    res.json({ user: privateUser(req.user) }),
  );
  app.patch("/api/v1/me/onboarding", authenticated, async (req, res) => {
    const draft = onboardingSchema.parse(req.body);
    const u = await one(
      "UPDATE users SET onboarding_draft=onboarding_draft || $1::jsonb,updated_at=now() WHERE id=$2 RETURNING *",
      [JSON.stringify(draft), req.user.id],
    );
    res.json({ user: privateUser(u) });
  });
  app.post(
    "/api/v1/me/onboarding/complete",
    authenticated,
    async (req, res) => {
      const b = completionSchema.parse(req.body);
      const user = await db.transaction(async (tx) => {
        const u = await one(
          "SELECT * FROM users WHERE id=$1 FOR UPDATE",
          [req.user.id],
          tx,
        );
        if (u.status !== 'active') throw fail(403, 'Account unavailable.');
        const dob = u.dob || b.dob;
        const gender = u.gender || b.gender;
        if (!dob || !gender || age(dob) < 18 || age(dob) > 120)
          throw fail(400, 'Enter your date of birth and gender. Flingtopia is for adults aged 18 and over.');
        if (!u.email_verified)
          throw fail(
            403,
            "Verify your email before finishing onboarding.",
            "EMAIL_UNVERIFIED",
          );
        await tx.query(
          "INSERT INTO user_consents(user_id,kind,version) VALUES($1,'community',$2) ON CONFLICT DO NOTHING",
          [u.id, b.consent_version],
        );
        const updated = await one(
          "UPDATE users SET display_name=$1,city=$2,bio=$3,interests=$4,looking_for=$5,profile_visible=$6,onboarding_completed_at=COALESCE(onboarding_completed_at,now()),onboarding_draft='{}',updated_at=now(),dob=$8,gender=$9 WHERE id=$7 RETURNING *",
          [
            b.display_name,
            b.city,
            b.bio,
            [...new Set(b.interests)],
            b.looking_for,
            b.profile_visible,
            u.id,
            dob,
            gender,
          ],
          tx,
        );
        await audit(tx, u.id, "onboarding_completed", u.id, {
          consent_version: b.consent_version,
        });
        return updated;
      });
      res.json({ user: privateUser(user) });
    },
  );
  app.patch("/api/v1/me", authenticated, async (req, res) => {
    const b = profileSchema.parse(req.body);
    const u = await one(
      "UPDATE users SET display_name=$1,city=$2,bio=$3,interests=$4,looking_for=$5,profile_visible=$6,updated_at=now() WHERE id=$7 RETURNING *",
      [
        b.display_name,
        b.city,
        b.bio,
        [...new Set(b.interests)],
        b.looking_for,
        b.profile_visible,
        req.user.id,
      ],
    );
    res.json({ user: privateUser(u) });
  });
  app.post("/api/v1/me/creator", authenticated, verified, async (req, res) => {
    const consent = creatorSchema.parse(req.body);
    await db.transaction(async (tx) => {
      const u = await one(
        "SELECT role FROM users WHERE id=$1 FOR UPDATE",
        [req.user.id],
        tx,
      );
      if (u.role === "user") {
        await tx.query("UPDATE users SET role='creator' WHERE id=$1", [
          req.user.id,
        ]);
        await tx.query(
          "INSERT INTO user_consents(user_id,kind,version) VALUES($1,'creator',$2) ON CONFLICT DO NOTHING",
          [req.user.id, consent.consent_version],
        );
        await audit(tx, req.user.id, "creator_enabled", req.user.id, {
          consent_version: consent.consent_version,
        });
      }
    });
    res.json({
      user: privateUser(
        await one("SELECT * FROM users WHERE id=$1", [req.user.id]),
      ),
    });
  });
}
