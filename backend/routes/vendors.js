'use strict';
const router = require('express').Router();
const { authenticate, minRole } = require('../middleware/auth');
const emailSvc = require('../services/email');

router.get('/', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { status, search, page=1, limit=20 } = req.query;
  let w='WHERE 1=1'; const p=[];
  if(status){p.push(status);w+=` AND status=$${p.length}`;}
  if(search){p.push(`%${search}%`);w+=` AND (vendor_name ILIKE $${p.length} OR vendor_code ILIKE $${p.length} OR gst_number ILIKE $${p.length})`;}
  const { rows } = await db.query(
    `SELECT v.*, (SELECT COUNT(*) FROM rfq_vendor_mapping WHERE vendor_id=v.id AND is_participating) AS rfq_count,
     (SELECT COUNT(*) FROM award_details WHERE vendor_id=v.id AND status!='cancelled') AS win_count
     FROM vendors v ${w} ORDER BY created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`,
    [...p, limit, (page-1)*limit]);
  res.json(rows);
});

router.get('/:id', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query('SELECT * FROM vendors WHERE id=$1 OR vendor_code=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Vendor not found' });
  res.json(rows[0]);
});

router.post('/', authenticate, minRole('logistics_team'), async (req, res) => {
  const { db } = req.app.locals;
  const { vendor_name,contact_person,mobile,email,gst_number,pan_number,
          address_line1,city,state,pincode,payment_terms,create_portal_user,portal_password } = req.body;
  if (!vendor_name || !email) return res.status(400).json({ error: 'vendor_name and email required' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let portalUserId = null;
    if (create_portal_user && portal_password) {
      const { hashPw } = require('../middleware/auth');
      const hash = await hashPw(portal_password);
      const { rows:[u] } = await client.query(
        `INSERT INTO users(email,password_hash,full_name,role) VALUES($1,$2,$3,'vendor_user') RETURNING id`,
        [email.toLowerCase(), hash, vendor_name]);
      portalUserId = u.id;
    }
    const { rows:[v] } = await client.query(
      `INSERT INTO vendors(vendor_name,contact_person,mobile,email,gst_number,pan_number,
       address_line1,city,state,pincode,payment_terms,onboarded_by,portal_user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [vendor_name,contact_person,mobile,email,gst_number,pan_number,
       address_line1,city,state,pincode,payment_terms||'Net 30',req.user.id,portalUserId]);
    await client.query('COMMIT');
    if (create_portal_user && portal_password) {
      emailSvc.sendVendorWelcome(email, vendor_name, portal_password).catch(console.error);
    }
    res.status(201).json(v);
  } catch(e) {
    await client.query('ROLLBACK');
    if (e.code==='23505') return res.status(409).json({ error: 'Email or GST already exists' });
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

router.patch('/:id', authenticate, minRole('logistics_team'), async (req, res) => {
  const { db } = req.app.locals;
  const allowed = ['vendor_name','contact_person','mobile','gst_number','pan_number','city','state','pincode','payment_terms','status','sap_vendor_id','blacklist_reason'];
  const sets=[]; const vals=[req.params.id];
  for (const f of allowed) { if(req.body[f]!==undefined){vals.push(req.body[f]);sets.push(`${f}=$${vals.length}`);} }
  if (req.body.status==='active') sets.push('onboarded_at=NOW()');
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const { rows } = await db.query(`UPDATE vendors SET ${sets.join(',')} WHERE id=$1 RETURNING *`, vals);
  if (!rows.length) return res.status(404).json({ error: 'Vendor not found' });
  res.json(rows[0]);
});

module.exports = router;
