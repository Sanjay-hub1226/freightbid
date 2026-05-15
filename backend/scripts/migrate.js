'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false });
async function migrate() {
  console.log('Running migration...');
  const sql = fs.readFileSync(path.join(__dirname,'../../db/001_schema.sql'),'utf8');
  await db.query(sql);
  console.log('Migration complete.');
  await db.end();
}
migrate().catch(e => { console.error(e); process.exit(1); });
