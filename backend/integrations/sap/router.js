// integrations/sap/router.js
'use strict';
const router = require('express').Router();
const { authenticate, minRole } = require('../../middleware/auth');
const sap = require('./sapService');

router.get('/status', authenticate, (req,res) => res.json({ enabled: sap.SAP.enabled, base_url: sap.SAP.baseUrl, note: sap.SAP.enabled ? 'Active' : 'Disabled — set SAP_INTEGRATION_ENABLED=true' }));

router.get('/sync-log', authenticate, minRole('procurement_manager'), async (req,res) => {
  const {db}=req.app.locals;
  const {rows}=await db.query(`SELECT * FROM sap_sync_log ORDER BY created_at DESC LIMIT 100`);
  res.json(rows);
});

router.post('/po/:poId/sync', authenticate, minRole('procurement_manager'), async (req,res) => {
  const {db}=req.app.locals;
  const {rows:[po]}=await db.query(`SELECT po.*,v.sap_vendor_id FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id WHERE po.id=$1`,[req.params.poId]);
  if (!po) return res.status(404).json({error:'PO not found'});
  try {
    const r = await sap.pushPurchaseOrder(po, db);
    res.json({ message:'SAP sync successful', sap_po_number: r.sap_po_number });
  } catch(e) { res.status(502).json({ error:'SAP sync failed', detail: e.message }); }
});

module.exports = router;


// ── routes/awards.js (standalone export) ─────────────────
const aRouter2 = require('express').Router();
const { authenticate:a2, minRole:m2 } = require('../../middleware/auth');
const emailSvc3 = require('../../services/email');
const sapSvc2   = require('../../integrations/sap/sapService');
const { emitToRoom:em2 } = require('../../socket');

aRouter2.get('/', a2, async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query(`
    SELECT ad.*,r.rfq_number,r.dispatch_location_text,r.delivery_location_text,
           v.vendor_name,v.vendor_code,u.full_name AS awarded_by_name
    FROM award_details ad JOIN rfq_header r ON r.id=ad.rfq_id
    JOIN vendors v ON v.id=ad.vendor_id LEFT JOIN users u ON u.id=ad.awarded_by
    ORDER BY ad.created_at DESC`);
  res.json(rows);
});

aRouter2.post('/', a2, m2('procurement_manager'), async (req,res)=>{
  const {db}=req.app.locals;
  const {rfq_id,bid_id,remarks}=req.body;
  const {rows:[rfq]}=await db.query('SELECT * FROM rfq_header WHERE id=$1',[rfq_id]);
  if (!rfq) return res.status(404).json({error:'RFQ not found'});
  if (!['bidding','bid_closed'].includes(rfq.status)) return res.status(400).json({error:'RFQ must be in bidding/bid_closed state'});
  const {rows:[bid]}=await db.query('SELECT bt.*,v.vendor_name FROM bid_transactions bt JOIN vendors v ON v.id=bt.vendor_id WHERE bt.id=$1 AND bt.rfq_id=$2',[bid_id,rfq_id]);
  if (!bid) return res.status(404).json({error:'Bid not found'});
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    const {rows:[award]}=await client.query(`INSERT INTO award_details(rfq_id,winning_bid_id,vendor_id,awarded_amount,awarded_by,remarks) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[rfq_id,bid_id,bid.vendor_id,bid.quote_amount,req.user.id,remarks]);
    await client.query(`UPDATE rfq_header SET status='awarded' WHERE id=$1`,[rfq_id]);
    await client.query('COMMIT');
    em2('procurement','award:created',{award_id:award.id,rfq_number:rfq.rfq_number});
    emailSvc3.sendAwardApproval(award,rfq,bid).catch(console.error);
    res.status(201).json(award);
  }catch(e){await client.query('ROLLBACK');if(e.code==='23505') return res.status(409).json({error:'Award exists'});res.status(500).json({error:'Failed'});}
  finally{client.release();}
});

aRouter2.post('/:id/approve', a2, m2('finance_team'), async (req,res)=>{
  const {db}=req.app.locals;
  const {rows:[award]}=await db.query(`UPDATE award_details SET status='approved' WHERE id=$1 AND status='pending_approval' RETURNING *`,[req.params.id]);
  if (!award) return res.status(400).json({error:'Not in pending_approval state'});
  await db.query(`UPDATE approval_logs SET action='approved',remarks=$2,acted_at=NOW() WHERE reference_id=$1 AND action='pending'`,[req.params.id,req.body.remarks]);
  const {rows:[rfq]}=await db.query('SELECT * FROM rfq_header WHERE id=$1',[award.rfq_id]);
  const {rows:[vendor]}=await db.query('SELECT * FROM vendors WHERE id=$1',[award.vendor_id]);
  const gst=parseFloat((award.awarded_amount*0.18).toFixed(2));
  const {rows:[po]}=await db.query(`INSERT INTO purchase_orders(award_id,rfq_id,vendor_id,po_amount,gst_amount,total_amount,payment_terms,status,issued_by,issued_at) VALUES($1,$2,$3,$4,$5,$6,$7,'pending_approval',$8,NOW()) RETURNING *`,
    [award.id,award.rfq_id,award.vendor_id,award.awarded_amount,gst,parseFloat((award.awarded_amount+gst).toFixed(2)),vendor?.payment_terms||'Net 30',req.user.id]);
  await db.query(`UPDATE award_details SET status='po_generated' WHERE id=$1`,[award.id]);
  if (process.env.SAP_INTEGRATION_ENABLED==='true') sapSvc2.pushPurchaseOrder({...po,sap_vendor_id:vendor?.sap_vendor_id},db).catch(console.error);
  emailSvc3.sendPOConfirmation(po,award).catch(console.error);
  em2('procurement','award:approved',{award_id:award.id,po_number:po.po_number});
  res.json({award,po});
});

aRouter2.post('/:id/reject', a2, m2('finance_team'), async (req,res)=>{
  const {db}=req.app.locals;
  const {rows:[award]}=await db.query(`UPDATE award_details SET status='cancelled' WHERE id=$1 RETURNING *`,[req.params.id]);
  await db.query(`UPDATE rfq_header SET status='bid_closed' WHERE id=$1`,[award.rfq_id]);
  res.json({message:'Rejected'});
});

module.exports = aRouter2;
