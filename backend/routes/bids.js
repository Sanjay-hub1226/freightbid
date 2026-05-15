// ── routes/bids.js ────────────────────────────────────────
'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { emitToRoom } = require('../socket');

router.get('/rfq/:rfqId', authenticate, async (req, res) => {
  const { db, redis } = req.app.locals;
  const key = `rfq:${req.params.rfqId}:ranking`;
  if (redis) { const c = await redis.get(key).catch(()=>null); if(c) return res.json(JSON.parse(c)); }
  const { rows } = await db.query(`
    SELECT bt.id,bt.vendor_id,bt.quote_amount,bt.revision_number,bt.rank,bt.quoted_at,bt.remarks,
           bt.previous_amount,bt.decrement_amount,
           v.vendor_name,v.vendor_code,
           (SELECT COUNT(*) FROM bid_transactions WHERE rfq_id=$1 AND vendor_id=bt.vendor_id) AS total_revisions
    FROM bid_transactions bt JOIN vendors v ON v.id=bt.vendor_id
    WHERE bt.rfq_id=$1 AND bt.is_current=TRUE ORDER BY bt.rank ASC NULLS LAST`, [req.params.rfqId]);
  if (redis) await redis.setex(key, 5, JSON.stringify(rows)).catch(()=>{});
  res.json(rows);
});

router.get('/rfq/:rfqId/history', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(`
    SELECT bt.*,v.vendor_name,v.vendor_code FROM bid_transactions bt
    JOIN vendors v ON v.id=bt.vendor_id WHERE bt.rfq_id=$1 ORDER BY bt.quoted_at DESC LIMIT 200`,
    [req.params.rfqId]);
  res.json(rows);
});

router.post('/', authenticate, authorize('vendor_user','super_admin','procurement_manager'), async (req, res) => {
  const { db, redis } = req.app.locals;
  const { rfq_id, quote_amount, remarks } = req.body;
  const vendor_id = req.user.vendor_id || req.body.vendor_id;
  if (!rfq_id || !quote_amount || !vendor_id)
    return res.status(400).json({ error: 'rfq_id, quote_amount, vendor_id required' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows:[rfq] } = await client.query(
      `SELECT * FROM rfq_header WHERE id=$1 FOR UPDATE`, [rfq_id]);
    if (!rfq) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'RFQ not found' }); }
    if (!['open','bidding'].includes(rfq.status)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'RFQ not open for bidding' }); }
    if (new Date(rfq.bid_close_time) < new Date()) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Bidding window closed' }); }

    const { rows:[inv] } = await client.query(
      'SELECT id FROM rfq_vendor_mapping WHERE rfq_id=$1 AND vendor_id=$2', [rfq_id, vendor_id]);
    if (!inv) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Vendor not invited for this RFQ' }); }

    const { rows:[prev] } = await client.query(
      'SELECT id,quote_amount,revision_number FROM bid_transactions WHERE rfq_id=$1 AND vendor_id=$2 AND is_current=TRUE',
      [rfq_id, vendor_id]);

    if (prev && rfq.min_decrement) {
      const dec = parseFloat(prev.quote_amount) - parseFloat(quote_amount);
      if (dec < rfq.min_decrement) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Minimum decrement is ₹${rfq.min_decrement}. Quote must be ≤ ₹${parseFloat(prev.quote_amount)-rfq.min_decrement}` });
      }
    }
    const { rows:[rc] } = await client.query(
      'SELECT COUNT(*) FROM bid_transactions WHERE rfq_id=$1 AND vendor_id=$2', [rfq_id, vendor_id]);
    if (parseInt(rc.count) >= rfq.max_revisions_per_vendor) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Maximum ${rfq.max_revisions_per_vendor} revisions allowed` });
    }

    const rev = prev ? prev.revision_number+1 : 1;
    const { rows:[bid] } = await client.query(`
      INSERT INTO bid_transactions(rfq_id,vendor_id,quote_amount,revision_number,previous_amount,decrement_amount,remarks,ip_address)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [rfq_id, vendor_id, quote_amount, rev,
       prev?.quote_amount||null, prev?(parseFloat(prev.quote_amount)-parseFloat(quote_amount)):null,
       remarks||null, req.ip]);

    await client.query(`UPDATE rfq_header SET status='bidding' WHERE id=$1 AND status='open'`, [rfq_id]);
    await client.query(`UPDATE rfq_vendor_mapping SET is_participating=TRUE WHERE rfq_id=$1 AND vendor_id=$2`, [rfq_id, vendor_id]);

    const minsLeft = (new Date(rfq.bid_close_time)-new Date())/60000;
    if (rfq.auto_extend_minutes && minsLeft <= rfq.auto_extend_minutes) {
      await client.query(`UPDATE rfq_header SET bid_close_time=bid_close_time+($2||' minutes')::INTERVAL WHERE id=$1`,
        [rfq_id, rfq.auto_extend_minutes]);
    }
    await client.query('COMMIT');
    if (redis) await redis.del(`rfq:${rfq_id}:ranking`).catch(()=>{});

    const { rows:ranking } = await db.query(`
      SELECT bt.vendor_id,bt.quote_amount,bt.rank,v.vendor_name
      FROM bid_transactions bt JOIN vendors v ON v.id=bt.vendor_id
      WHERE bt.rfq_id=$1 AND bt.is_current=TRUE ORDER BY bt.rank ASC NULLS LAST`, [rfq_id]);
    emitToRoom(`rfq:${rfq_id}`, 'bid:new', { rfq_id, vendor_id, quote_amount: parseFloat(quote_amount), revision_number: rev, ranking });
    res.status(201).json(bid);
  } catch(e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Failed to submit bid' }); }
  finally { client.release(); }
});

module.exports = router;
