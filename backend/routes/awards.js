'use strict';
const router   = require('express').Router();
const { authenticate, minRole } = require('../middleware/auth');
const emailSvc = require('../services/email');
const sapSvc   = require('../integrations/sap/sapService');
const { emitToRoom } = require('../socket');

router.get('/', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(`
    SELECT ad.*,r.rfq_number,r.dispatch_location_text,r.delivery_location_text,
           v.vendor_name,v.vendor_code,u.full_name AS awarded_by_name
    FROM award_details ad JOIN rfq_header r ON r.id=ad.rfq_id
    JOIN vendors v ON v.id=ad.vendor_id LEFT JOIN users u ON u.id=ad.awarded_by
    ORDER BY ad.created_at DESC`);
  res.json(rows);
});

router.get('/:id', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(`
    SELECT ad.*,r.rfq_number,r.dispatch_location_text,r.delivery_location_text,r.target_budget,
           v.vendor_name,v.vendor_code,v.email AS vendor_email,v.sap_vendor_id,
           bt.quote_amount AS winning_quote,u.full_name AS awarded_by_name
    FROM award_details ad JOIN rfq_header r ON r.id=ad.rfq_id
    JOIN vendors v ON v.id=ad.vendor_id JOIN bid_transactions bt ON bt.id=ad.winning_bid_id
    LEFT JOIN users u ON u.id=ad.awarded_by WHERE ad.id=$1 OR ad.rfq_id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Award not found' });
  res.json(rows[0]);
});

router.post('/', authenticate, minRole('procurement_manager'), async (req, res) => {
  const { db } = req.app.locals;
  const { rfq_id, bid_id, remarks } = req.body;
  const { rows:[rfq] } = await db.query('SELECT * FROM rfq_header WHERE id=$1', [rfq_id]);
  if (!rfq) return res.status(404).json({ error: 'RFQ not found' });
  if (!['bidding','bid_closed'].includes(rfq.status)) return res.status(400).json({ error: 'RFQ must be in bidding/bid_closed state' });
  const { rows:[bid] } = await db.query('SELECT bt.*,v.vendor_name FROM bid_transactions bt JOIN vendors v ON v.id=bt.vendor_id WHERE bt.id=$1 AND bt.rfq_id=$2',[bid_id,rfq_id]);
  if (!bid) return res.status(404).json({ error: 'Bid not found' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows:[award] } = await client.query(
      `INSERT INTO award_details(rfq_id,winning_bid_id,vendor_id,awarded_amount,awarded_by,remarks)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [rfq_id,bid_id,bid.vendor_id,bid.quote_amount,req.user.id,remarks]);
    await client.query(`UPDATE rfq_header SET status='awarded' WHERE id=$1`,[rfq_id]);
    await client.query('COMMIT');
    emitToRoom('procurement','award:created',{award_id:award.id,rfq_number:rfq.rfq_number});
    emailSvc.sendAwardApproval(award,rfq,bid).catch(console.error);
    res.status(201).json(award);
  } catch(e) {
    await client.query('ROLLBACK');
    if (e.code==='23505') return res.status(409).json({ error: 'Award already exists for this RFQ' });
    res.status(500).json({ error: 'Failed to create award' });
  } finally { client.release(); }
});

router.post('/:id/approve', authenticate, minRole('finance_team'), async (req, res) => {
  const { db } = req.app.locals;
  const { rows:[award] } = await db.query(
    `UPDATE award_details SET status='approved' WHERE id=$1 AND status='pending_approval' RETURNING *`,[req.params.id]);
  if (!award) return res.status(400).json({ error: 'Not in pending_approval state' });
  await db.query(`UPDATE approval_logs SET action='approved',remarks=$2,acted_at=NOW() WHERE reference_id=$1 AND action='pending'`,[req.params.id,req.body.remarks||'']);
  const { rows:[vendor] } = await db.query('SELECT * FROM vendors WHERE id=$1',[award.vendor_id]);
  const gst = parseFloat((award.awarded_amount*0.18).toFixed(2));
  const { rows:[po] } = await db.query(
    `INSERT INTO purchase_orders(award_id,rfq_id,vendor_id,po_amount,gst_amount,total_amount,payment_terms,issued_by,issued_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
    [award.id,award.rfq_id,award.vendor_id,award.awarded_amount,gst,
     parseFloat((award.awarded_amount+gst).toFixed(2)),vendor?.payment_terms||'Net 30',req.user.id]);
  await db.query(`UPDATE award_details SET status='po_generated' WHERE id=$1`,[award.id]);
  if (process.env.SAP_INTEGRATION_ENABLED==='true') {
    sapSvc.pushPurchaseOrder({...po,sap_vendor_id:vendor?.sap_vendor_id},db).catch(console.error);
  }
  emailSvc.sendPOConfirmation(po,award).catch(console.error);
  emitToRoom('procurement','award:approved',{award_id:award.id,po_number:po.po_number});
  res.json({ award, po });
});

router.post('/:id/reject', authenticate, minRole('finance_team'), async (req, res) => {
  const { db } = req.app.locals;
  const { rows:[award] } = await db.query(`UPDATE award_details SET status='cancelled' WHERE id=$1 RETURNING *`,[req.params.id]);
  if (!award) return res.status(404).json({ error: 'Award not found' });
  await db.query(`UPDATE rfq_header SET status='bid_closed' WHERE id=$1`,[award.rfq_id]);
  res.json({ message: 'Award rejected. RFQ returned to bid_closed.' });
});

module.exports = router;
