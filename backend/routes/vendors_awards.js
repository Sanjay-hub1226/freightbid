// ── routes/vendors.js ─────────────────────────────────────
'use strict';
const router = require('express').Router();
const { authenticate, minRole } = require('../middleware/auth');
const { hashPw, signJWT } = require('../middleware/auth');
const emailSvc = require('../services/email');

router.get('/', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { status, search, page=1, limit=20 } = req.query;
  let w='WHERE 1=1'; const p=[];
  if(status){p.push(status);w+=` AND v.status=$${p.length}`;}
  if(search){p.push(`%${search}%`);w+=` AND (v.vendor_name ILIKE $${p.length} OR v.vendor_code ILIKE $${p.length} OR v.gst_number ILIKE $${p.length})`;}
  const off=(page-1)*limit;
  const {rows}=await db.query(`
    SELECT v.*,
      (SELECT COUNT(*) FROM rfq_vendor_mapping vm WHERE vm.vendor_id=v.id AND vm.is_participating) AS rfq_count,
      (SELECT COUNT(*) FROM award_details ad WHERE ad.vendor_id=v.id) AS win_count
    FROM vendors v ${w} ORDER BY v.created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`,
    [...p,limit,off]);
  res.json(rows);
});

router.get('/:id', authenticate, async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query('SELECT * FROM vendors WHERE id=$1 OR vendor_code=$1',[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'Vendor not found'});
  res.json(rows[0]);
});

router.post('/', authenticate, minRole('logistics_team'), async (req,res)=>{
  const {db}=req.app.locals;
  const {vendor_name,contact_person,mobile,email,gst_number,pan_number,
         address_line1,city,state,pincode,payment_terms,
         create_portal_user=false,portal_password} = req.body;
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    let portalUserId=null;
    if(create_portal_user && portal_password && email){
      const hash=await hashPw(portal_password);
      const {rows:[u]}=await client.query(
        `INSERT INTO users(email,password_hash,full_name,role) VALUES($1,$2,$3,'vendor_user') RETURNING id`,
        [email.toLowerCase(), hash, vendor_name]);
      portalUserId=u.id;
    }
    const {rows:[v]}=await client.query(`
      INSERT INTO vendors(vendor_name,contact_person,mobile,email,gst_number,pan_number,
        address_line1,city,state,pincode,payment_terms,onboarded_by,portal_user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [vendor_name,contact_person,mobile,email,gst_number,pan_number,
       address_line1,city,state,pincode,payment_terms||'Net 30',req.user.id,portalUserId]);
    await client.query('COMMIT');
    if(create_portal_user && portal_password){
      emailSvc.sendVendorWelcome(email,vendor_name,portal_password).catch(console.error);
    }
    res.status(201).json(v);
  }catch(e){
    await client.query('ROLLBACK');
    if(e.code==='23505') return res.status(409).json({error:'Vendor email or GST already exists'});
    res.status(500).json({error:'Server error'});
  }finally{client.release();}
});

router.patch('/:id', authenticate, minRole('logistics_team'), async (req,res)=>{
  const {db}=req.app.locals;
  const allowed=['vendor_name','contact_person','mobile','gst_number','pan_number','city','state','pincode','payment_terms','status','sap_vendor_id'];
  const sets=[]; const vals=[req.params.id];
  for(const f of allowed){if(req.body[f]!==undefined){vals.push(req.body[f]);sets.push(`${f}=$${vals.length}`);}}
  if(req.body.status==='active'){sets.push('onboarded_at=NOW()');}
  if(!sets.length) return res.status(400).json({error:'Nothing to update'});
  const {rows}=await db.query(`UPDATE vendors SET ${sets.join(',')} WHERE id=$1 RETURNING *`,vals);
  res.json(rows[0]);
});

module.exports = router;

// ── routes/awards.js ──────────────────────────────────────
const aRouter = require('express').Router();
const { authenticate:auth2, minRole:mr2 } = require('../middleware/auth');
const emailSvc2 = require('../services/email');
const sapSvc = require('../integrations/sap/sapService');
const { emitToRoom:emit2 } = require('../socket');

aRouter.get('/', auth2, async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query(`
    SELECT ad.*,r.rfq_number,r.dispatch_location_text,r.delivery_location_text,r.bid_close_time,
           v.vendor_name,v.vendor_code,v.email AS vendor_email,
           u.full_name AS awarded_by_name
    FROM award_details ad JOIN rfq_header r ON r.id=ad.rfq_id
    JOIN vendors v ON v.id=ad.vendor_id LEFT JOIN users u ON u.id=ad.awarded_by
    ORDER BY ad.created_at DESC`);
  res.json(rows);
});

aRouter.post('/', auth2, mr2('procurement_manager'), async (req,res)=>{
  const {db}=req.app.locals;
  const {rfq_id,bid_id,remarks}=req.body;
  const {rows:[rfq]}=await db.query('SELECT * FROM rfq_header WHERE id=$1',[rfq_id]);
  if(!rfq) return res.status(404).json({error:'RFQ not found'});
  if(!['bidding','bid_closed'].includes(rfq.status))
    return res.status(400).json({error:'RFQ must be in bidding/bid_closed state'});
  const {rows:[bid]}=await db.query(
    'SELECT bt.*,v.vendor_name FROM bid_transactions bt JOIN vendors v ON v.id=bt.vendor_id WHERE bt.id=$1 AND bt.rfq_id=$2',
    [bid_id,rfq_id]);
  if(!bid) return res.status(404).json({error:'Bid not found'});
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    const {rows:[award]}=await client.query(`
      INSERT INTO award_details(rfq_id,winning_bid_id,vendor_id,awarded_amount,awarded_by,awarded_at,remarks)
      VALUES($1,$2,$3,$4,$5,NOW(),$6) RETURNING *`,
      [rfq_id,bid_id,bid.vendor_id,bid.quote_amount,req.user.id,remarks]);
    await client.query(`UPDATE rfq_header SET status='awarded' WHERE id=$1`,[rfq_id]);
    await client.query(`INSERT INTO approval_logs(module,reference_id,reference_type,level,approver_id,action)
      VALUES('rfq_award',$1,'award_details',1,$2,'pending')`,[award.id,req.user.id]);
    await client.query('COMMIT');
    emit2('procurement','award:created',{award_id:award.id,rfq_number:rfq.rfq_number});
    emailSvc2.sendAwardApproval(award,rfq,bid).catch(console.error);
    res.status(201).json(award);
  }catch(e){
    await client.query('ROLLBACK');
    if(e.code==='23505') return res.status(409).json({error:'Award already exists for this RFQ'});
    res.status(500).json({error:'Failed to create award'});
  }finally{client.release();}
});

aRouter.post('/:id/approve', auth2, mr2('finance_team'), async (req,res)=>{
  const {db}=req.app.locals;
  const {rows:[award]}=await db.query(
    `UPDATE award_details SET status='approved' WHERE id=$1 AND status='pending_approval' RETURNING *`,[req.params.id]);
  if(!award) return res.status(400).json({error:'Award not in pending_approval state'});
  await db.query(`UPDATE approval_logs SET action='approved',remarks=$2,acted_at=NOW() WHERE reference_id=$1 AND action='pending'`,[req.params.id,req.body.remarks]);
  const po=await generatePO(award,db,req.user.id);
  if(process.env.SAP_INTEGRATION_ENABLED==='true'){
    sapSvc.pushPurchaseOrder(po,db).catch(e=>db.query(`UPDATE purchase_orders SET sap_sync_status='failed' WHERE id=$1`,[po.id]));
  }
  emailSvc2.sendPOConfirmation(po,award).catch(console.error);
  emit2('procurement','award:approved',{award_id:award.id,po_number:po.po_number});
  res.json({award,po});
});

aRouter.post('/:id/reject', auth2, mr2('finance_team'), async (req,res)=>{
  const {db}=req.app.locals;
  const {rows:[award]}=await db.query(`UPDATE award_details SET status='cancelled' WHERE id=$1 RETURNING *`,[req.params.id]);
  await db.query(`UPDATE rfq_header SET status='bid_closed' WHERE id=$1`,[award.rfq_id]);
  await db.query(`UPDATE approval_logs SET action='rejected',remarks=$2,acted_at=NOW() WHERE reference_id=$1 AND action='pending'`,[req.params.id,req.body.remarks]);
  res.json({message:'Award rejected'});
});

async function generatePO(award,db,userId){
  const {rows:[rfq]}=await db.query('SELECT * FROM rfq_header WHERE id=$1',[award.rfq_id]);
  const {rows:[vendor]}=await db.query('SELECT * FROM vendors WHERE id=$1',[award.vendor_id]);
  const gst=parseFloat((award.awarded_amount*0.18).toFixed(2));
  const total=parseFloat((award.awarded_amount+gst).toFixed(2));
  const {rows:[po]}=await db.query(`
    INSERT INTO purchase_orders(award_id,rfq_id,vendor_id,po_amount,gst_amount,total_amount,payment_terms,status,issued_by,issued_at,expected_delivery)
    VALUES($1,$2,$3,$4,$5,$6,$7,'pending_approval',$8,NOW(),$9::date) RETURNING *`,
    [award.id,award.rfq_id,award.vendor_id,award.awarded_amount,gst,total,
     vendor.payment_terms||'Net 30',userId,rfq.shipment_date]);
  await db.query(`UPDATE award_details SET status='po_generated' WHERE id=$1`,[award.id]);
  return po;
}

module.exports = { vendorRouter: module.exports, awardRouter: aRouter };
