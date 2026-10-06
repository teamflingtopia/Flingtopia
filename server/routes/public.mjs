import { z } from 'zod';
import { fail, uuid } from '../domain.mjs';

// Public responses are explicit allowlists. Private routes retain their auth guards.
export function registerPublic(app, { db, config }) {
  const eligible = `status='active' AND staff_role IS NULL AND profile_visible=true
    AND email_verified=true AND (onboarding_completed_at IS NOT NULL OR is_demo=true)
    AND (is_demo=false OR $1=true) AND dob<=CURRENT_DATE-INTERVAL '18 years'`;
  const personFields = 'id,display_name,city,interests,role';
  app.get('/api/v1/public/people', async (req,res) => {
    const q=z.string().trim().max(100).default('').parse(req.query.q);
    const cursor=uuid.optional().parse(req.query.cursor);
    const rows=(await db.query(`SELECT ${personFields} FROM users WHERE ${eligible}
      AND (display_name ILIKE $2 OR city ILIKE $2)
      AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 21`,[!!config.demo,`%${q}%`,cursor||null])).rows;
    res.json({people:rows.slice(0,20),next_cursor:rows.length>20?rows[19].id:null});
  });
  app.get('/api/v1/public/people/:id',async(req,res)=>{
    const person=(await db.query(`SELECT ${personFields} FROM users WHERE ${eligible} AND id=$2`,[!!config.demo,uuid.parse(req.params.id)])).rows[0];
    if(!person) throw fail(404,'This profile is unavailable.','NOT_FOUND');
    res.json({person});
  });
  const eventFields='id,title,description,category,city,starts_at,image_url,price_inr';
  const published=`status='published' AND starts_at>now() AND (is_demo=false OR $1=true)`;
  app.get('/api/v1/public/events',async(req,res)=>{
    const offset=z.coerce.number().int().min(0).max(10000).default(0).parse(req.query.offset);
    const rows=(await db.query(`SELECT ${eventFields} FROM events WHERE ${published} ORDER BY starts_at,id LIMIT 21 OFFSET $2`,[!!config.demo,offset])).rows;
    res.json({events:rows.slice(0,20),next_offset:rows.length>20?offset+20:null});
  });
  app.get('/api/v1/public/events/:id',async(req,res)=>{
    const event=(await db.query(`SELECT ${eventFields} FROM events WHERE ${published} AND id=$2`,[!!config.demo,uuid.parse(req.params.id)])).rows[0];
    if(!event) throw fail(404,'This experience is unavailable.','NOT_FOUND');
    res.json({event});
  });
}
