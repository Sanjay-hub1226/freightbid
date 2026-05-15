'use strict';
const router = require('express').Router();
const { authenticate, minRole } = require('../middleware/auth');
const email  = require('../services/email');
const { emitToRoom } = require('../socket');

// GET /api/rfq
router.get('/', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { status, search, page=1, limit=20 } = req.query;
  const off = (page-1)*limit;
  let w = 'WHERE 1=1'; const p = [];
  if (status) { p.push(status); w += ` AND r.status=$${p.length}`; }
  if (search) { p.push(`%${search}%`); w += ` AND (r.rfq_number ILIKE $${p.length} OR r.dispatch_location_text ILIKE $${p.length} OR r.delivery_location_text ILIKE $${p.length})`; }

  // Vendor users only see RFQs they are invited to
  const isVendor = req.user.role === 'vendor_user';
  if (isVendor && req.user.vendor_id) {
    p.push(req.user.vendor_id);
    w += ` AND EXISTS (SELECT 1 FROM rfq_vendor_mapping vm WHERE vm.rfq_id=r.id AND vm.vendor_id=$${p.length})`;
  }

  const [cnt, rows] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM rfq_header r ${w}`, p),
    db.query(`
      SELECT r.id,r.rfq_number,r.status,r.shipment_date,r.dispatch_location_text,
             r.delivery_location_text,r.vehicle_type_text,r.weight_mt,r.quantity,
             r.target_budget,r.bid_open_time,r.bid_close_time,r.created_at,
             r.min_decrement,r.max_revisions_per_vendor,r.l1_visibility,r.auto_extend_minutes,
             u.full_name AS created_by_name,
             (SELECT COUNT(*) FROM rfq_vendor_mapping vm WHERE vm.rfq_id=r.id) AS vendor_count,
             (SELECT MIN(bt.quote_amount) FROM bid_transactions bt WHERE bt.rfq_id=r.id AND bt.is_current=TRUE) AS l1_amount
      FROM rfq_header r LEFT JOIN users u ON u.id=r.created_by
      ${w} ORDER BY r.created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}
    `, [...p, limit, off]),
  ]);
  res.json({ total: parseInt(cnt.rows[0].count), page: parseInt(page), data: rows.rows });
});

// GET /api/rfq/:id
router.get('/:id', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(`
    SELECT r.*, u.full_name AS created_by_name
    FROM rfq_header r LEFT JOIN users u ON u.id=r.created_by
    WHERE r.id=$1 OR r.rfq_number=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'RFQ not found' });
  const rfq = rows[0];
  const { rows: vendors } = await db.query(`
    SELECT vm.*,v.vendor_name,v.email,v.mobile,v.vendor_code,
           bt.quote_amount AS latest_quote,bt.rank,bt.revision_number
    FROM rfq_vendor_mapping vm JOIN vendors v ON v.id=vm.vendor_id
    LEFT JOIN bid_transactions bt ON bt.rfq_id=vm.rfq_id AND bt.vendor_id=vm.vendor_id AND bt.is_current=TRUE
    WHERE vm.rfq_id=$1 ORDER BY bt.rank ASC NULLS LAST`, [rfq.id]);
  rfq.vendors = vendors;
  res.json(rfq);
});

// POST /api/rfq
router.post('/', authenticate, minRole('logistics_team'), async (req, res) => {
  const { db } = req.app.locals;
  const {
    shipment_date, dispatch_location_text, delivery_location_text,
    vehicle_type_id, vehicle_type_text, material_type, quantity, quantity_unit,
    weight_mt, special_handling, expected_dispatch_time, bid_close_time,
    target_budget, internal_remarks, min_decrement, max_revisions_per_vendor,
    l1_visibility, auto_extend_minutes, vendor_ids = [],
  } = req.body;

  if (!dispatch_location_text || !delivery_location_text || !bid_close_time)
    return res.status(400).json({ error: 'dispatch_location_text, delivery_location_text, bid_close_time required' });
  if (new Date(bid_close_time) <= new Date())
    return res.status(400).json({ error: 'bid_close_time must be in future' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [rfq] } = await client.query(`
      INSERT INTO rfq_header(
        shipment_date,dispatch_location_text,delivery_location_text,
        vehicle_type_id,vehicle_type_text,material_type,quantity,quantity_unit,
        weight_mt,special_handling,expected_dispatch_time,bid_close_time,
        target_budget,internal_remarks,min_decrement,max_revisions_per_vendor,
        l1_visibility,auto_extend_minutes,created_by,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'open')
      RETURNING *`,
      [shipment_date,dispatch_location_text,delivery_location_text,
       vehicle_type_id||null,vehicle_type_text,material_type,quantity,quantity_unit||'MT',
       weight_mt,special_handling,expected_dispatch_time||null,bid_close_time,
       target_budget,internal_remarks,min_decrement||500,max_revisions_per_vendor||5,
       l1_visibility||'rank_only',auto_extend_minutes||5,req.user.id]);

    for (const vid of vendor_ids) {
      await client.query(
        `INSERT INTO rfq_vendor_mapping(rfq_id,vendor_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [rfq.id, vid]);
    }
    await client.query('COMMIT');

    // Send invite emails async
    if (vendor_ids.length) email.sendRFQInvites(rfq, vendor_ids, db).catch(console.error);
    res.status(201).json(rfq);
  } catch(e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Failed to create RFQ' }); }
  finally { client.release(); }
});

// PATCH /api/rfq/:id
router.patch('/:id', authenticate, minRole('logistics_team'), async (req, res) => {
  const { db } = req.app.locals;
  const allowed = ['bid_close_time','target_budget','internal_remarks','special_handling','status'];
  const sets = []; const vals = [req.params.id];
  for (const f of allowed) {
    if (req.body[f] !== undefined) { vals.push(req.body[f]); sets.push(`${f}=$${vals.length}`); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const { rows } = await db.query(`UPDATE rfq_header SET ${sets.join(',')} WHERE id=$1 RETURNING *`, vals);
  res.json(rows[0]);
});

// POST /api/rfq/:id/close
router.post('/:id/close', authenticate, minRole('procurement_manager'), async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(
    `UPDATE rfq_header SET status='bid_closed',closed_by=$2,closed_at=NOW()
     WHERE id=$1 AND status IN('open','bidding') RETURNING rfq_number`, [req.params.id, req.user.id]);
  if (!rows.length) return res.status(400).json({ error: 'RFQ not in active state' });
  emitToRoom(`rfq:${req.params.id}`, 'rfq:closed', { rfq_id: req.params.id });
  res.json({ message: 'Bid closed', rfq_number: rows[0].rfq_number });
});

// POST /api/rfq/:id/extend
router.post('/:id/extend', authenticate, minRole('logistics_team'), async (req, res) => {
  const { db } = req.app.locals;
  const { minutes = 15 } = req.body;
  const { rows } = await db.query(
    `UPDATE rfq_header SET bid_close_time=bid_close_time+($2||' minutes')::INTERVAL
     WHERE id=$1 AND status IN('open','bidding') RETURNING bid_close_time`, [req.params.id, minutes]);
  if (!rows.length) return res.status(404).json({ error: 'RFQ not found or inactive' });
  emitToRoom(`rfq:${req.params.id}`, 'rfq:extended', { new_close_time: rows[0].bid_close_time, minutes });
  res.json(rows[0]);
});

module.exports = router;
