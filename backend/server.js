'use strict';
require('dotenv').config();
const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const { Pool }  = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, idleTimeoutMillis: 30000,
});
db.on('error', e => console.error('[DB]', e.message));

let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, retryStrategy: t => t > 3 ? null : Math.min(t*100,2000) });
    redis.on('error', () => {});
  } catch(e) {}
}

const app    = express();
const server = http.createServer(app);
app.locals.db    = db;
app.locals.redis = redis;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', rateLimit({ windowMs: 15*60*1000, max: 1000, standardHeaders: true, legacyHeaders: false }));

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/rfq',     require('./routes/rfq'));
app.use('/api/bids',    require('./routes/bids'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/awards',  require('./routes/awards'));
app.use('/api/po',      require('./routes/purchase_orders'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/sap',     require('./integrations/sap/router'));

app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { await db.query('SELECT 1'); dbOk = true; } catch(e) {}
  res.json({ ok: true, db: dbOk, env: process.env.NODE_ENV, ts: new Date().toISOString() });
});

if (process.env.NODE_ENV === 'production') {
  const build = path.join(__dirname, '..', 'frontend', 'build');
  app.use(express.static(build));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(build, 'index.html'));
  });
}

require('./socket')(server, db, redis);
require('./services/scheduler')(db, redis);

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 FreightBid API -> http://localhost:${PORT}\n`));
module.exports = { app, server, db };
