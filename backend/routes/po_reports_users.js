// routes/purchase_orders.js
'use strict';
const router = require('express').Router();
const { authenticate, minRole } = require('../middleware/auth');

router.get('/', authenticate, async (req,res)=>{
  const {db}=req.app.locals;
  const {status,vendor_id,page=1,limit=20}=req.query;
  let w='WHERE 1=1'; const p=[];
  if(status){p.push(status);w+=` AND po.status=$${p.length}`;}
  if(vendor_id){p.push(vendor_id);w+=` AND po.vendor_id=$${p.length}`;}
  const {rows}=await db.query(`
    SELECT po.*,r.rfq_number,r.dispatch_location_text,r.delivery_location_text,
           v.vendor_name,v.vendor_code,v.email AS vendor_email,v.gst_number,
           u.full_name AS issued_by_name
    FROM purchase_orders po JOIN rfq_header r ON r.id=po.rfq_id
    JOIN vendors v ON v.id=po.vendor_id LEFT JOIN users u ON u.id=po.issued_by
    ${w} ORDER BY po.created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`,
    [...p,limit,(page-1)*limit]);
  res.json(rows);
});

router.get('/:id', authenticate, async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query(`
    SELECT po.*,r.rfq_number,r.dispatch_location_text,r.delivery_location_text,
           r.material_type,r.weight_mt,r.vehicle_type_text,
           v.vendor_name,v.vendor_code,v.gst_number,v.pan_number,v.address_line1,v.city,v.state,
           ad.savings_amount,ad.savings_pct
    FROM purchase_orders po JOIN rfq_header r ON r.id=po.rfq_id
    JOIN vendors v ON v.id=po.vendor_id JOIN award_details ad ON ad.id=po.award_id
    WHERE po.id=$1 OR po.po_number=$1`,[req.params.id]);
  if(!rows.length) return res.status(404).json({error:'PO not found'});
  res.json(rows[0]);
});

router.patch('/:id/status', authenticate, minRole('logistics_team'), async (req,res)=>{
  const {db}=req.app.locals;
  const {status}=req.body;
  const {rows}=await db.query(
    `UPDATE purchase_orders SET status=$1,actual_delivery=CASE WHEN $1='delivered' THEN NOW()::date ELSE actual_delivery END
     WHERE id=$2 RETURNING *`,[status,req.params.id]);
  if(!rows.length) return res.status(404).json({error:'PO not found'});
  res.json(rows[0]);
});

router.post('/:id/tracking', authenticate, async (req,res)=>{
  const {db}=req.app.locals;
  const {status,location,remarks}=req.body;
  const {rows:[t]}=await db.query(
    `INSERT INTO shipment_tracking(po_id,status,location,remarks,updated_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id,status,location,remarks,req.user.id]);
  res.status(201).json(t);
});

module.exports = router;


// ── routes/reports.js ─────────────────────────────────────
const rRouter = require('express').Router();
const { authenticate: ra } = require('../middleware/auth');

rRouter.get('/dashboard', ra, async (req,res)=>{
  const {db}=req.app.locals;
  const [rfqStats,savingsData,pending,topVendors,monthlyTrend]=await Promise.all([
    db.query(`SELECT status,COUNT(*) FROM rfq_header GROUP BY status`),
    db.query(`SELECT COALESCE(SUM(savings_amount),0) AS total_savings,COALESCE(AVG(savings_pct),0) AS avg_pct,COUNT(*) AS count FROM award_details WHERE status!='cancelled' AND created_at>=date_trunc('month',NOW())`),
    db.query(`SELECT COUNT(*) FROM approval_logs WHERE action='pending'`),
    db.query(`SELECT v.vendor_name,v.performance_rating,COUNT(DISTINCT ad.rfq_id) AS wins,COALESCE(SUM(ad.awarded_amount),0) AS total_value FROM award_details ad JOIN vendors v ON v.id=ad.vendor_id WHERE ad.status!='cancelled' GROUP BY v.id ORDER BY wins DESC LIMIT 5`),
    db.query(`SELECT DATE_TRUNC('month',created_at) AS month,COUNT(*) AS rfq_count,COALESCE(SUM(awarded_amount),0) AS spend,COALESCE(SUM(savings_amount),0) AS savings FROM award_details WHERE created_at>=NOW()-INTERVAL '6 months' GROUP BY 1 ORDER BY 1`),
  ]);
  res.json({rfq_by_status:rfqStats.rows,savings_mtd:savingsData.rows[0],pending_approvals:parseInt(pending.rows[0].count),top_vendors:topVendors.rows,monthly_trend:monthlyTrend.rows});
});

rRouter.get('/lanes', ra, async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query(`
    SELECT CONCAT(r.dispatch_location_text,' → ',r.delivery_location_text) AS lane,
           COUNT(DISTINCT r.id) AS rfq_count,ROUND(AVG(ad.awarded_amount),0) AS avg_freight,
           MIN(ad.awarded_amount) AS min_freight,MAX(ad.awarded_amount) AS max_freight,
           ROUND(AVG(ad.savings_pct),2) AS avg_savings_pct,COALESCE(SUM(ad.savings_amount),0) AS total_savings
    FROM rfq_header r JOIN award_details ad ON ad.rfq_id=r.id WHERE ad.status!='cancelled'
    GROUP BY 1 ORDER BY rfq_count DESC`);
  res.json(rows);
});

rRouter.get('/vendor-performance', ra, async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query(`
    SELECT v.vendor_code,v.vendor_name,v.performance_rating,v.status,
           COUNT(DISTINCT vm.rfq_id) AS rfqs_invited,COUNT(DISTINCT bt.rfq_id) AS rfqs_participated,
           COUNT(DISTINCT ad.rfq_id) AS rfqs_won,ROUND(AVG(bt.rank) FILTER(WHERE bt.is_current),2) AS avg_rank,
           COALESCE(SUM(ad.awarded_amount),0) AS total_value,
           ROUND(COUNT(DISTINCT ad.rfq_id)::numeric/NULLIF(COUNT(DISTINCT bt.rfq_id),0)*100,1) AS win_rate_pct
    FROM vendors v LEFT JOIN rfq_vendor_mapping vm ON vm.vendor_id=v.id
    LEFT JOIN bid_transactions bt ON bt.vendor_id=v.id LEFT JOIN award_details ad ON ad.vendor_id=v.id AND ad.status!='cancelled'
    GROUP BY v.id ORDER BY rfqs_won DESC`);
  res.json(rows);
});

rRouter.get('/savings', ra, async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query(`
    SELECT EXTRACT(YEAR FROM ad.created_at)::int AS year,EXTRACT(MONTH FROM ad.created_at)::int AS month,
           COUNT(*) AS count,COALESCE(SUM(ad.budget_amount),0) AS budget,COALESCE(SUM(ad.awarded_amount),0) AS spend,
           COALESCE(SUM(ad.savings_amount),0) AS savings,ROUND(AVG(ad.savings_pct),2) AS avg_pct
    FROM award_details ad WHERE ad.status!='cancelled' GROUP BY 1,2 ORDER BY 1 DESC,2 DESC`);
  res.json(rows);
});

rRouter.get('/budget-vs-actual', ra, async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query(`
    SELECT r.rfq_number,r.dispatch_location_text,r.delivery_location_text,r.target_budget,
           ad.awarded_amount,ad.savings_amount,ad.savings_pct,v.vendor_name,ad.awarded_at
    FROM rfq_header r JOIN award_details ad ON ad.rfq_id=r.id JOIN vendors v ON v.id=ad.vendor_id
    WHERE ad.status!='cancelled' ORDER BY ad.awarded_at DESC LIMIT 100`);
  res.json(rows);
});

module.exports = { poRouter: module.exports, reportRouter: rRouter };


// ── routes/users.js ───────────────────────────────────────
const uRouter = require('express').Router();
const { authenticate: ua, minRole: um, hashPw: uhash } = require('../middleware/auth');

uRouter.get('/', ua, um('procurement_manager'), async (req,res)=>{
  const {db}=req.app.locals;
  const {rows}=await db.query(`SELECT id,employee_code,full_name,email,role,department,mobile,is_active,last_login_at,sap_user_id,created_at FROM users ORDER BY created_at DESC`);
  res.json(rows);
});

uRouter.post('/', ua, um('super_admin'), async (req,res)=>{
  const {db}=req.app.locals;
  const {email,password,full_name,role,department,mobile,employee_code}=req.body;
  try{
    const hash=await uhash(password);
    const {rows}=await db.query(`INSERT INTO users(email,password_hash,full_name,role,department,mobile,employee_code) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,email,full_name,role`,[email.toLowerCase(),hash,full_name,role,department,mobile,employee_code]);
    res.status(201).json(rows[0]);
  }catch(e){
    if(e.code==='23505') return res.status(409).json({error:'Email already exists'});
    res.status(500).json({error:'Server error'});
  }
});

uRouter.patch('/:id', ua, um('super_admin'), async (req,res)=>{
  const {db}=req.app.locals;
  const {is_active,role,department}=req.body;
  const sets=[]; const vals=[req.params.id];
  if(is_active!==undefined){vals.push(is_active);sets.push(`is_active=$${vals.length}`);}
  if(role){vals.push(role);sets.push(`role=$${vals.length}`);}
  if(department){vals.push(department);sets.push(`department=$${vals.length}`);}
  if(!sets.length) return res.status(400).json({error:'Nothing to update'});
  const {rows}=await db.query(`UPDATE users SET ${sets.join(',')} WHERE id=$1 RETURNING id,email,full_name,role,is_active`,vals);
  res.json(rows[0]);
});

module.exports = { poRouter:module.exports, reportRouter:rRouter, userRouter:uRouter };
