'use strict';
const router = require('express').Router();
const { authenticate, minRole, hashPw } = require('../middleware/auth');

router.get('/', authenticate, minRole('procurement_manager'), async (req, res) => {
  const { db } = req.app.locals;
  const { rows } = await db.query(
    `SELECT id,employee_code,full_name,email,role,department,mobile,is_active,last_login_at,sap_user_id,created_at
     FROM users ORDER BY created_at DESC`);
  res.json(rows);
});

router.post('/', authenticate, minRole('super_admin'), async (req, res) => {
  const { db } = req.app.locals;
  const { email,password,full_name,role,department,mobile,employee_code } = req.body;
  if (!email||!password||!full_name) return res.status(400).json({ error: 'email, password, full_name required' });
  try {
    const hash = await hashPw(password);
    const { rows } = await db.query(
      `INSERT INTO users(email,password_hash,full_name,role,department,mobile,employee_code)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,email,full_name,role`,
      [email.toLowerCase(),hash,full_name,role||'logistics_team',department,mobile,employee_code]);
    res.status(201).json(rows[0]);
  } catch(e) {
    if (e.code==='23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', authenticate, minRole('super_admin'), async (req, res) => {
  const { db } = req.app.locals;
  const { is_active, role, department } = req.body;
  const sets=[]; const vals=[req.params.id];
  if (is_active!==undefined){vals.push(is_active);sets.push(`is_active=$${vals.length}`);}
  if (role){vals.push(role);sets.push(`role=$${vals.length}`);}
  if (department){vals.push(department);sets.push(`department=$${vals.length}`);}
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const { rows } = await db.query(`UPDATE users SET ${sets.join(',')} WHERE id=$1 RETURNING id,email,full_name,role,is_active`,vals);
  res.json(rows[0]);
});

module.exports = router;
