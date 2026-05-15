'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

router.get('/dashboard', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const [a,b,c,d,e] = await Promise.all([
    db.query(`SELECT status,COUNT(*)::int FROM rfq_header GROUP BY status`),
    db.query(`SELECT COALESCE(SUM(savings_amount),0)::float AS total_savings,
              COALESCE(AVG(savings_pct),0)::float AS avg_pct,COUNT(*)::int AS count
              FROM award_details WHERE status!='cancelled' AND created_at>=date_trunc('month',NOW())`),
    db.query(`SELECT COUNT(*)::int FROM approval_logs WHERE action='pending'`),
    db.query(`SELECT v.vendor_name,v.performance_rating,COUNT(DISTINCT ad.rfq_id)::int AS wins,
              COALESCE(SUM(ad.awarded_amount),0)::float AS total_value
              FROM award_details ad JOIN vendors v ON v.id=ad.vendor_id WHERE ad.status!='cancelled'
              GROUP BY v.id ORDER BY wins DESC LIMIT 5`),
    db.query(`SELECT DATE_TRUNC('month',created_at) AS month,COUNT(*)::int AS rfq_count,
              COALESCE(SUM(awarded_amount),0)::float AS spend,COALESCE(SUM(savings_amount),0)::float AS savings
              FROM award_details WHERE created_at>=NOW()-INTERVAL '6 months' GROUP BY 1 ORDER BY 1`),
  ]);
  res.json({ rfq_by_status:a.rows, savings_mtd:b.rows[0], pending_approvals:c.rows[0].count, top_vendors:d.rows, monthly_trend:e.rows });
});

router.get('/lanes', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(`
    SELECT CONCAT(r.dispatch_location_text,' → ',r.delivery_location_text) AS lane,
           COUNT(DISTINCT r.id)::int AS rfq_count,
           ROUND(AVG(ad.awarded_amount),0)::float AS avg_freight,
           MIN(ad.awarded_amount)::float AS min_freight,MAX(ad.awarded_amount)::float AS max_freight,
           ROUND(AVG(ad.savings_pct),2)::float AS avg_savings_pct,
           COALESCE(SUM(ad.savings_amount),0)::float AS total_savings
    FROM rfq_header r JOIN award_details ad ON ad.rfq_id=r.id WHERE ad.status!='cancelled'
    GROUP BY 1 ORDER BY rfq_count DESC`);
  res.json(rows);
});

router.get('/vendor-performance', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(`
    SELECT v.vendor_code,v.vendor_name,v.performance_rating,v.status,
           COUNT(DISTINCT vm.rfq_id)::int AS rfqs_invited,
           COUNT(DISTINCT bt.rfq_id)::int AS rfqs_participated,
           COUNT(DISTINCT ad.rfq_id)::int AS rfqs_won,
           ROUND(AVG(bt.rank) FILTER(WHERE bt.is_current),2)::float AS avg_rank,
           COALESCE(SUM(ad.awarded_amount),0)::float AS total_value,
           ROUND(COUNT(DISTINCT ad.rfq_id)::numeric/NULLIF(COUNT(DISTINCT bt.rfq_id),0)*100,1)::float AS win_rate_pct
    FROM vendors v LEFT JOIN rfq_vendor_mapping vm ON vm.vendor_id=v.id
    LEFT JOIN bid_transactions bt ON bt.vendor_id=v.id
    LEFT JOIN award_details ad ON ad.vendor_id=v.id AND ad.status!='cancelled'
    GROUP BY v.id ORDER BY rfqs_won DESC`);
  res.json(rows);
});

router.get('/savings', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(`
    SELECT EXTRACT(YEAR FROM created_at)::int AS year,EXTRACT(MONTH FROM created_at)::int AS month,
           COUNT(*)::int AS count,COALESCE(SUM(budget_amount),0)::float AS budget,
           COALESCE(SUM(awarded_amount),0)::float AS spend,COALESCE(SUM(savings_amount),0)::float AS savings,
           ROUND(AVG(savings_pct),2)::float AS avg_pct
    FROM award_details WHERE status!='cancelled' GROUP BY 1,2 ORDER BY 1 DESC,2 DESC`);
  res.json(rows);
});

router.get('/budget-vs-actual', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(`
    SELECT r.rfq_number,r.dispatch_location_text,r.delivery_location_text,
           r.target_budget::float,ad.awarded_amount::float,ad.savings_amount::float,ad.savings_pct::float,
           v.vendor_name,ad.awarded_at
    FROM rfq_header r JOIN award_details ad ON ad.rfq_id=r.id JOIN vendors v ON v.id=ad.vendor_id
    WHERE ad.status!='cancelled' ORDER BY ad.awarded_at DESC LIMIT 100`);
  res.json(rows);
});

module.exports = router;
