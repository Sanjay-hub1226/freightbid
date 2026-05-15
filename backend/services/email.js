'use strict';
const nodemailer = require('nodemailer');

function createTransport() {
  // SendGrid SMTP (recommended for production)
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net', port: 587, secure: false,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
  }
  // Generic SMTP (Gmail, Zoho, etc.)
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  // Dev fallback — Ethereal (auto catches emails, no actual sending)
  console.warn('[Email] No SMTP configured. Using Ethereal catch-all for dev.');
  return null;
}

let transport = createTransport();
const FROM = process.env.EMAIL_FROM || 'FreightBid Platform <noreply@freightbid.in>';
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

async function getTransport() {
  if (transport) return transport;
  // Ethereal auto-account for dev
  const testAcc = await nodemailer.createTestAccount();
  transport = nodemailer.createTransport({
    host: 'smtp.ethereal.email', port: 587, secure: false,
    auth: { user: testAcc.user, pass: testAcc.pass },
  });
  console.log(`[Email] Ethereal preview: https://ethereal.email — user: ${testAcc.user}`);
  return transport;
}

async function send(to, subject, html) {
  try {
    const t = await getTransport();
    const info = await t.sendMail({ from: FROM, to, subject, html });
    if (info.messageId && process.env.NODE_ENV !== 'production') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) console.log(`[Email] Preview → ${previewUrl}`);
    }
    return info;
  } catch(e) {
    console.error('[Email] Send failed:', e.message);
  }
}

// ── Email Templates ────────────────────────────────────────

const base = (content) => `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#334155}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#1e40af,#4f46e5);padding:28px 32px;color:#fff}
  .logo{font-size:22px;font-weight:800;letter-spacing:-0.5px}
  .logo span{opacity:.7;font-size:14px;font-weight:400;margin-left:8px}
  .body{padding:28px 32px}
  .h2{font-size:18px;font-weight:700;color:#0f172a;margin-bottom:16px}
  .info-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0}
  .info-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
  .info-row:last-child{border-bottom:none}
  .label{color:#64748b}
  .value{font-weight:600;color:#0f172a}
  .btn{display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:16px 0}
  .green{color:#059669}.red{color:#dc2626}.amber{color:#d97706}
  .footer{background:#f8fafc;padding:16px 32px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;text-align:center}
  .chip{display:inline-block;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;padding:2px 8px;font-family:monospace;font-size:12px}
</style></head><body>
<div class="wrap">
  <div class="header">
    <div class="logo">🚛 FreightBid <span>Transport Management Platform</span></div>
  </div>
  <div class="body">${content}</div>
  <div class="footer">FreightBid Platform · Automated Notification · Do not reply to this email<br>
  Need help? Contact support@freightbid.in</div>
</div></body></html>`;

// Send RFQ Invite to Vendors
async function sendRFQInvites(rfq, vendorIds, db) {
  const { rows: vendors } = await db.query(
    `SELECT vendor_name,email FROM vendors WHERE id=ANY($1)`, [vendorIds]);
  for (const v of vendors) {
    const bidUrl = `${APP_URL}/vendor/bid/${rfq.id}`;
    await send(v.email, `[FreightBid] RFQ Invitation — ${rfq.rfq_number}`,
      base(`
        <div class="h2">You've been invited to quote!</div>
        <p>Dear <strong>${v.vendor_name}</strong>,</p>
        <p>You are invited to submit a competitive freight quote for the following shipment:</p>
        <div class="info-box">
          <div class="info-row"><span class="label">RFQ Number</span><span class="value chip">${rfq.rfq_number}</span></div>
          <div class="info-row"><span class="label">Route</span><span class="value">${rfq.dispatch_location_text} → ${rfq.delivery_location_text}</span></div>
          <div class="info-row"><span class="label">Material</span><span class="value">${rfq.material_type || '—'}</span></div>
          <div class="info-row"><span class="label">Weight</span><span class="value">${rfq.weight_mt || '—'} MT</span></div>
          <div class="info-row"><span class="label">Vehicle Type</span><span class="value">${rfq.vehicle_type_text || '—'}</span></div>
          <div class="info-row"><span class="label">Bid Closes</span><span class="value red">${new Date(rfq.bid_close_time).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</span></div>
        </div>
        <p>Log in to the FreightBid Vendor Portal to submit your quote before the deadline.</p>
        <a href="${bidUrl}" class="btn">Submit Quote Now →</a>
        <p style="font-size:12px;color:#94a3b8">Or copy this link: ${bidUrl}</p>
      `));
    await db.query(
      `UPDATE rfq_vendor_mapping SET invite_sent=TRUE,email_sent_at=NOW()
       WHERE rfq_id=$1 AND vendor_id=(SELECT id FROM vendors WHERE email=$2)`,
      [rfq.id, v.email]).catch(()=>{});
  }
}

// Award approval request to procurement team
async function sendAwardApproval(award, rfq, bid) {
  const approvalUrl = `${APP_URL}/awards/${award.id}`;
  await send(
    process.env.APPROVAL_EMAIL || process.env.SMTP_USER,
    `[FreightBid] Award Approval Required — ${rfq.rfq_number}`,
    base(`
      <div class="h2">⚠️ Award Pending Your Approval</div>
      <p>An award has been recommended for <strong>${rfq.rfq_number}</strong> and requires your approval.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">RFQ Number</span><span class="value chip">${rfq.rfq_number}</span></div>
        <div class="info-row"><span class="label">Route</span><span class="value">${rfq.dispatch_location_text} → ${rfq.delivery_location_text}</span></div>
        <div class="info-row"><span class="label">Winning Vendor</span><span class="value">${bid.vendor_name}</span></div>
        <div class="info-row"><span class="label">Winning Quote</span><span class="value green">₹${Number(award.awarded_amount).toLocaleString('en-IN')}</span></div>
        <div class="info-row"><span class="label">Budget</span><span class="value">₹${Number(award.budget_amount||rfq.target_budget).toLocaleString('en-IN')}</span></div>
        <div class="info-row"><span class="label">Savings</span><span class="value green">₹${Number(award.savings_amount||0).toLocaleString('en-IN')} (${Number(award.savings_pct||0).toFixed(1)}%)</span></div>
      </div>
      <a href="${approvalUrl}" class="btn">Review & Approve →</a>
    `)
  );
}

// PO confirmation to vendor
async function sendPOConfirmation(po, award) {
  const {Pool}=require('pg');
  const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
  const {rows:[vendor]}=await db.query('SELECT * FROM vendors WHERE id=$1',[po.vendor_id]).catch(()=>({rows:[]}));
  const {rows:[rfq]}=await db.query('SELECT * FROM rfq_header WHERE id=$1',[po.rfq_id]).catch(()=>({rows:[]}));
  db.end();
  if (!vendor?.email) return;
  const poUrl = `${APP_URL}/vendor/po/${po.id}`;
  await send(vendor.email, `[FreightBid] Purchase Order ${po.po_number} — Action Required`,
    base(`
      <div class="h2">🎉 You've been awarded the shipment!</div>
      <p>Dear <strong>${vendor.vendor_name}</strong>,</p>
      <p>Congratulations! Your quote has been selected and a Purchase Order has been generated.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">PO Number</span><span class="value chip">${po.po_number}</span></div>
        <div class="info-row"><span class="label">Route</span><span class="value">${rfq?.dispatch_location_text||''} → ${rfq?.delivery_location_text||''}</span></div>
        <div class="info-row"><span class="label">PO Amount</span><span class="value">₹${Number(po.po_amount).toLocaleString('en-IN')}</span></div>
        <div class="info-row"><span class="label">GST (18%)</span><span class="value">₹${Number(po.gst_amount).toLocaleString('en-IN')}</span></div>
        <div class="info-row"><span class="label">Total</span><span class="value green" style="font-size:16px">₹${Number(po.total_amount).toLocaleString('en-IN')}</span></div>
        <div class="info-row"><span class="label">Payment Terms</span><span class="value">${po.payment_terms}</span></div>
        <div class="info-row"><span class="label">Expected Dispatch</span><span class="value">${rfq?.shipment_date ? new Date(rfq.shipment_date).toLocaleDateString('en-IN') : 'TBD'}</span></div>
      </div>
      <p>Please log in to the portal to <strong>confirm this PO</strong> within 24 hours.</p>
      <a href="${poUrl}" class="btn">Confirm PO →</a>
    `)
  );
}

// Password reset
async function sendPasswordReset(toEmail, name, token) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  await send(toEmail, '[FreightBid] Password Reset Request',
    base(`
      <div class="h2">Password Reset Request</div>
      <p>Hi <strong>${name}</strong>,</p>
      <p>We received a request to reset your FreightBid password. Click the link below to set a new password:</p>
      <a href="${resetUrl}" class="btn">Reset Password →</a>
      <p style="font-size:12px;color:#94a3b8">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
    `)
  );
}

// Vendor welcome / portal credentials
async function sendVendorWelcome(toEmail, vendorName, password) {
  const loginUrl = `${APP_URL}/vendor/login`;
  await send(toEmail, '[FreightBid] Your Vendor Portal Access',
    base(`
      <div class="h2">Welcome to FreightBid Vendor Portal!</div>
      <p>Dear <strong>${vendorName}</strong>,</p>
      <p>Your vendor portal account has been created. Use the credentials below to log in:</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Portal URL</span><span class="value"><a href="${loginUrl}">${loginUrl}</a></span></div>
        <div class="info-row"><span class="label">Email</span><span class="value chip">${toEmail}</span></div>
        <div class="info-row"><span class="label">Password</span><span class="value chip">${password}</span></div>
      </div>
      <p style="color:#dc2626;font-size:13px">⚠️ Please change your password after first login.</p>
      <a href="${loginUrl}" class="btn">Login to Portal →</a>
    `)
  );
}

module.exports = { sendRFQInvites, sendAwardApproval, sendPOConfirmation, sendPasswordReset, sendVendorWelcome, send };
