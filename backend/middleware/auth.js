// middleware/auth.js
'use strict';
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const SECRET  = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const EXPIRES = process.env.JWT_EXPIRES || '24h';

const ROLE_LEVEL = {
  vendor_user:1, management_viewer:2, logistics_team:3,
  finance_team:4, procurement_manager:5, super_admin:99
};

const authenticate = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
};

const authorize = (...roles) => (req, res, next) =>
  roles.flat().includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: 'Insufficient permissions' });

const minRole = (role) => (req, res, next) =>
  (ROLE_LEVEL[req.user?.role] || 0) >= (ROLE_LEVEL[role] || 99)
    ? next()
    : res.status(403).json({ error: 'Insufficient role level' });

const hashPw  = p  => bcrypt.hash(p, 12);
const checkPw = (p, h) => bcrypt.compare(p, h);
const signJWT = p  => jwt.sign(p, SECRET, { expiresIn: EXPIRES });

module.exports = { authenticate, authorize, minRole, hashPw, checkPw, signJWT, ROLE_LEVEL };
