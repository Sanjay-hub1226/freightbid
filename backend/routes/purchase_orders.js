'use strict';
const router = require('express').Router();
const { authenticate, minRole } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { status, page=1, limit=20 } = req.query;
  let w='WHERE 1=1'; const p=[];
  if(status){p.push(status);w+=` AND po.status=$${p.length}`;}
  // Vendors can only see their own POs
  const vendor_id = req.user.role === 'vendor_user' ? req.user.vendor_id : req.query.vendor_id;
  if(vendor_id){p.push(vendor_id);w+=` AND po.vendor_id=$${p.length}`;}
  const { rows } = await db.query(
    `SELECT po.*,r.rfq_number,r.dispatch_location_text,r.delivery_location_text,
     v.vendor_name,v.vendor_code,v.email AS vendor_email,v.gst_number,
     ad.savings_amount,ad.savings_pct,u.full_name AS issued_by_name
     FROM purchase_orders po JOIN rfq_header r ON r.id=po.rfq_id
     JOIN vendors v ON v.id=po.vendor_id JOIN award_details ad ON ad.id=po.award_id
     LEFT JOIN users u ON u.id=po.issued_by ${w}
     ORDER BY po.created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`,
    [...p, limit, (page-1)*limit]);
  res.json(rows);
});

router.get('/:id', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(
    `SELECT po.*,r.rfq_number,r.dispatch_location_text,r.delivery_location_text,r.material_type,r.weight_mt,r.vehicle_type_text,
     v.vendor_name,v.vendor_code,v.gst_number,v.pan_number,v.address_line1,v.city,v.state,
     ad.savings_amount,ad.savings_pct
     FROM purchase_orders po JOIN rfq_header r ON r.id=po.rfq_id
     JOIN vendors v ON v.id=po.vendor_id JOIN award_details ad ON ad.id=po.award_id
     WHERE po.id=$1 OR po.po_number=$1`,[req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'PO not found' });
  res.json(rows[0]);
});

router.patch('/:id/status', authenticate, minRole('logistics_team'), async (req, res) => {
  const { db } = req.app.locals;
  const { status, remarks } = req.body;
  const valid = ['approved','sent_to_vendor','confirmed','in_transit','delivered','closed','cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { rows } = await db.query(
    `UPDATE purchase_orders SET status=$1,
     actual_delivery=CASE WHEN $1='delivered' THEN NOW()::date ELSE actual_delivery END
     WHERE id=$2 RETURNING *`,[status,req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'PO not found' });
  // Add tracking event
  if (['in_transit','delivered'].includes(status)) {
    await db.query(`INSERT INTO shipment_tracking(po_id,status,remarks,updated_by) VALUES($1,$2,$3,$4)`,
      [req.params.id,status,remarks||null,req.user.id]).catch(()=>{});
  }
  res.json(rows[0]);
});

router.get('/:id/tracking', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(
    `SELECT st.*,u.full_name FROM shipment_tracking st LEFT JOIN users u ON u.id=st.updated_by
     WHERE st.po_id=$1 ORDER BY st.tracked_at DESC`,[req.params.id]);
  res.json(rows);
});

module.exports = router;
