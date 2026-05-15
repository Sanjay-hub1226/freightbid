// ── socket/index.js ───────────────────────────────────────
'use strict';
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const SECRET     = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

let io;

module.exports = function initSocket(server, db, redis) {
  io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || '*', credentials: true },
    pingTimeout: 30000, pingInterval: 10000,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Auth required'));
    try { socket.user = jwt.verify(token, SECRET); next(); }
    catch { next(new Error('Invalid token')); }
  });

  io.on('connection', socket => {
    const u = socket.user;
    console.log(`[WS] ${u.name} (${u.role}) connected`);
    if (u.role !== 'vendor_user') socket.join('procurement');
    if (u.vendor_id) socket.join(`vendor:${u.vendor_id}`);

    socket.on('rfq:join', async ({ rfq_id }) => {
      socket.join(`rfq:${rfq_id}`);
      try {
        const { rows } = await db.query(`SELECT * FROM rfq_header WHERE id=$1`, [rfq_id]);
        if (!rows.length) return;
        const { rows: ranking } = await db.query(`
          SELECT bt.vendor_id,bt.quote_amount,bt.rank,bt.revision_number,bt.quoted_at,
                 v.vendor_name,v.vendor_code
          FROM bid_transactions bt JOIN vendors v ON v.id=bt.vendor_id
          WHERE bt.rfq_id=$1 AND bt.is_current=TRUE ORDER BY bt.rank ASC NULLS LAST`, [rfq_id]);
        socket.emit('rfq:state', { rfq: rows[0], ranking: maskRanking(ranking, u) });
      } catch(e) { console.error('[WS] rfq:join error', e.message); }
    });

    socket.on('rfq:leave', ({ rfq_id }) => socket.leave(`rfq:${rfq_id}`));
    socket.on('ping', () => socket.emit('pong', { ts: Date.now() }));
    socket.on('disconnect', r => console.log(`[WS] ${u.name} disconnected: ${r}`));
  });

  console.log('[WS] Socket.io ready');
  return io;
};

function maskRanking(rows, user) {
  if (!user || user.role !== 'vendor_user') return rows;
  return rows.map(r => ({
    ...r,
    vendor_name: r.vendor_id === user.vendor_id ? r.vendor_name : `Vendor L${r.rank}`,
    vendor_code: r.vendor_id === user.vendor_id ? r.vendor_code : '***',
  }));
}

function emitToRoom(room, event, data) {
  io?.to(room).emit(event, data);
}
function emitToVendor(vendorId, event, data) {
  io?.to(`vendor:${vendorId}`).emit(event, data);
}
module.exports.emitToRoom   = emitToRoom;
module.exports.emitToVendor = emitToVendor;
