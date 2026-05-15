'use strict';
const router  = require('express').Router();
const crypto  = require('crypto');
const { authenticate, hashPw, checkPw, signJWT } = require('../middleware/auth');
const email   = require('../services/email');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email: e, password } = req.body;
  if (!e || !password) return res.status(400).json({ error: 'Email and password required' });
  const { db } = req.app.locals;
  try {
    const { rows } = await db.query(
      `SELECT u.*, v.id AS vendor_id, v.vendor_name, v.vendor_code
       FROM users u LEFT JOIN vendors v ON v.portal_user_id = u.id
       WHERE u.email = $1`, [e.toLowerCase().trim()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account deactivated' });
    if (!await checkPw(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    await db.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    const token = signJWT({
      id: user.id, email: user.email, role: user.role,
      name: user.full_name, vendor_id: user.vendor_id || null,
      vendor_code: user.vendor_code || null,
    });
    res.json({ token, user: { id:user.id, email:user.email, name:user.full_name, role:user.role, vendor_id:user.vendor_id } });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email:e, password, full_name, role='logistics_team', department, mobile, employee_code } = req.body;
  if (!e || !password || !full_name) return res.status(400).json({ error: 'email, password, full_name required' });
  const { db } = req.app.locals;
  try {
    const hash = await hashPw(password);
    const { rows } = await db.query(
      `INSERT INTO users(email,password_hash,full_name,role,department,mobile,employee_code)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,email,full_name,role`,
      [e.toLowerCase(), hash, full_name, role, department, mobile, employee_code]
    );
    res.status(201).json(rows[0]);
  } catch(err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(
    `SELECT u.id,u.email,u.full_name,u.role,u.department,u.mobile,u.last_login_at,u.is_active,
            v.id AS vendor_id, v.vendor_name, v.vendor_code, v.status AS vendor_status
     FROM users u LEFT JOIN vendors v ON v.portal_user_id=u.id WHERE u.id=$1`, [req.user.id]
  );
  res.json(rows[0] || {});
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { db } = req.app.locals;
  const { email: e } = req.body;
  const token = crypto.randomBytes(32).toString('hex');
  const exp   = new Date(Date.now() + 3600000);
  const { rows } = await db.query(
    `UPDATE users SET password_reset_token=$1,password_reset_expires=$2
     WHERE email=$3 RETURNING full_name,email`, [token, exp, e?.toLowerCase()]
  );
  if (rows.length) {
    await email.sendPasswordReset(rows[0].email, rows[0].full_name, token).catch(console.error);
  }
  res.json({ message: 'If account exists, reset link sent.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { db } = req.app.locals;
  const { token, password } = req.body;
  const { rows } = await db.query(
    `SELECT id FROM users WHERE password_reset_token=$1 AND password_reset_expires>NOW()`, [token]
  );
  if (!rows.length) return res.status(400).json({ error: 'Invalid or expired token' });
  const hash = await hashPw(password);
  await db.query(
    `UPDATE users SET password_hash=$1,password_reset_token=NULL,password_reset_expires=NULL WHERE id=$2`,
    [hash, rows[0].id]
  );
  res.json({ message: 'Password updated successfully' });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  const { db } = req.app.locals;
  const { current_password, new_password } = req.body;
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  if (!await checkPw(current_password, rows[0].password_hash))
    return res.status(400).json({ error: 'Current password incorrect' });
  const hash = await hashPw(new_password);
  await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
  res.json({ message: 'Password changed' });
});

module.exports = router;
