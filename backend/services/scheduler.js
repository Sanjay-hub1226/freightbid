// services/scheduler.js
'use strict';
module.exports = function startSchedulers(db, redis) {
  const { emitToRoom } = require('../socket');
  // Auto-close expired RFQs every minute
  setInterval(async () => {
    try {
      const { rows } = await db.query(`
        UPDATE rfq_header SET status='bid_closed',closed_at=NOW()
        WHERE status IN('open','bidding') AND bid_close_time<NOW() RETURNING id,rfq_number`);
      for (const r of rows) {
        if (redis) await redis.del(`rfq:${r.id}:ranking`).catch(()=>{});
        emitToRoom(`rfq:${r.id}`, 'rfq:closed', { rfq_id: r.id, rfq_number: r.rfq_number });
        console.log(`[Scheduler] Auto-closed: ${r.rfq_number}`);
      }
    } catch(e) { console.error('[Scheduler] auto-close error:', e.message); }
  }, 60 * 1000);

  // SAP retry every 30 min
  if (process.env.SAP_INTEGRATION_ENABLED === 'true') {
    setInterval(async () => {
      try {
        const sapSvc = require('../integrations/sap/sapService');
        await sapSvc.retryFailed(db);
      } catch(e) { console.error('[Scheduler] SAP retry error:', e.message); }
    }, 30 * 60 * 1000);
  }
  console.log('[Scheduler] Background jobs started');
};
