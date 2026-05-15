# 🚛 FreightBid — Production-Ready Reverse Bidding Transport Platform

## ✅ What's Included

| Layer | Tech | Status |
|---|---|---|
| Frontend | React 18, React Router, Socket.io-client | ✅ Built |
| Backend API | Node.js 18, Express 4 | ✅ 17 files, syntax verified |
| Database | PostgreSQL 15 (23 tables, triggers, indexes) | ✅ Full schema |
| Real-time | Socket.io (JWT-authenticated rooms) | ✅ Live bidding |
| Email | Nodemailer (Ethereal dev / SendGrid prod) | ✅ 5 email templates |
| SAP Hook | OData V4 stub (activate with 1 env var) | ✅ Provision ready |
| Deployment | Railway / Render / Heroku configs | ✅ One-click |

---

## 🚀 Quickstart (Local Development)

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- (Optional) Redis 7+

### 1. Clone & Install
```bash
# Install all dependencies
npm run install:all
```

### 2. Database Setup
```bash
# Create PostgreSQL database
createdb freightbid

# Copy and fill environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your DATABASE_URL and email settings

# Run migration (creates all 23 tables + triggers)
npm run db:migrate

# Seed demo data (5 internal users + 5 vendors with portal logins)
npm run db:seed
```

### 3. Start Development Servers
```bash
# Terminal 1 — Backend API (port 4000)
npm run dev:backend

# Terminal 2 — React Frontend (port 3000)
npm run dev:frontend
```

### 4. Open & Login
| Portal | URL | Credentials |
|---|---|---|
| Internal (PM) | http://localhost:3000 | procurement@freightbid.in / FreightBid@2024 |
| Internal (Admin) | http://localhost:3000 | admin@freightbid.in / FreightBid@2024 |
| Vendor Portal | http://localhost:3000/vendor/login | vendor1@sharmatransport.in / Vendor@2024 |
| API Health | http://localhost:4000/api/health | — |

---

## ☁️ Deploy to Railway (Free Tier — Gets Public URL)

1. Push this folder to a GitHub repository
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a **PostgreSQL** plugin from Railway dashboard
4. Set environment variables (copy from `backend/.env.example`)
5. Railway auto-detects `nixpacks.toml` and builds + deploys
6. Run seed: Railway dashboard → Shell → `node backend/scripts/seed.js`
7. Your app is live at `https://your-project.railway.app`

## ☁️ Deploy to Render (Free Tier)

1. Push to GitHub
2. New Web Service → Connect repo
3. Build command: `npm run deploy:build`
4. Start command: `node backend/server.js`
5. Add PostgreSQL database from Render dashboard
6. Set `DATABASE_URL` from the Render DB connection string

---

## 📧 Email Configuration

### Development (Zero Setup)
Leave `SMTP_HOST` blank — Nodemailer auto-creates an **Ethereal** catch-all account.
All emails are captured at https://ethereal.email (URL printed in console).

### Production Option A — SendGrid
```env
SENDGRID_API_KEY=SG.your_key_here
```

### Production Option B — Gmail SMTP
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-16-char-app-password   # Google Account → Security → App Passwords
```

---

## 🔗 SAP S/4HANA Integration (Phase 3)

Currently **stubbed** — all methods log to console and return mock responses.

### To Activate:
1. Create a **Communication Arrangement** in SAP S/4HANA Public Cloud for:
   - `API_BUSINESS_PARTNER` (Vendor sync)
   - `API_PURCHASEORDER_PROCESS_SRV` (PO push — ME21N)
   - `API_RFQ_PROCESS_SRV` (RFQ push — ME41)
2. Generate OAuth2 client credentials from SAP BTP
3. Set in `.env`:
```env
SAP_INTEGRATION_ENABLED=true
SAP_BASE_URL=https://your-tenant.s4hana.ondemand.com
SAP_CLIENT_ID=your_client_id
SAP_CLIENT_SECRET=your_client_secret
SAP_TOKEN_URL=https://your-tenant.authentication.sap.hana.ondemand.com/oauth/token
SAP_COMPANY_CODE=1000
```
4. Restart server — all PO approvals will auto-sync to SAP ME21N

### SAP API Endpoints (already wired):
- `POST /api/sap/po/:id/sync` — Push PO to SAP
- `POST /api/sap/vendor/:id/push` — Push vendor to SAP Business Partner
- `GET  /api/sap/sync-log` — View all sync attempts with full request/response
- Every sync attempt is logged in the `sap_sync_log` table with retry logic

---

## 🏗️ Architecture

```
freightbid/
├── backend/                    ← Node.js / Express API
│   ├── server.js               ← Main entry, Socket.io init, scheduler
│   ├── middleware/auth.js       ← JWT + 6-role RBAC
│   ├── routes/
│   │   ├── auth.js             ← Login, register, forgot/reset password
│   │   ├── rfq.js              ← RFQ CRUD, close, extend
│   │   ├── bids.js             ← Live bidding engine (min decrement, max revisions, auto-extend)
│   │   ├── vendors.js          ← Vendor master + portal user creation
│   │   ├── awards.js           ← Award workflow + auto PO generation
│   │   ├── purchase_orders.js  ← PO lifecycle + tracking
│   │   ├── reports.js          ← 5 MIS report endpoints
│   │   └── users.js            ← User management
│   ├── socket/index.js         ← Socket.io rooms, JWT auth, bid broadcast
│   ├── services/
│   │   ├── email.js            ← Nodemailer + 5 HTML email templates
│   │   └── scheduler.js        ← Auto-close expired RFQs, SAP retry
│   └── integrations/sap/
│       ├── sapService.js        ← OData V4 client (stubbed, production-ready)
│       └── router.js           ← /api/sap/* endpoints
│
├── frontend/                   ← React 18 SPA
│   ├── public/index.html
│   ├── build/                  ← Compiled, served by Express in production
│   └── src/
│       ├── App.js              ← All pages + routing (Dashboard, RFQ, Live Bidding,
│       │                         Vendors, Awards, Reports, Users, Vendor Portal)
│       ├── context/index.js    ← AuthContext + ToastContext
│       ├── hooks/useSocket.js  ← Socket.io live bidding hook
│       └── services/api.js     ← 35+ typed API calls
│
├── db/001_schema.sql           ← Complete PostgreSQL schema
│                                 23 tables, 15+ indexes, 7 triggers
├── nixpacks.toml               ← Railway deployment
├── Procfile                    ← Heroku/Render deployment
└── package.json                ← Root scripts (setup, build, deploy)
```

---

## 🔐 User Roles & Permissions

| Role | Login URL | Key Permissions |
|---|---|---|
| super_admin | /login | Everything |
| procurement_manager | /login | RFQ, Vendors, Awards, Reports |
| logistics_team | /login | Create RFQ, view bidding |
| finance_team | /login | Approve Awards & POs |
| management_viewer | /login | Read-only reports & dashboard |
| vendor_user | /vendor/login | Submit bids, view own POs |

---

## 📊 API Reference (Quick)

```
POST /api/auth/login           { email, password } → { token, user }
GET  /api/rfq                  List RFQs (paginated, filterable)
POST /api/rfq                  Create RFQ + send vendor invite emails
POST /api/bids                 Submit/revise bid (enforces decrement rules)
GET  /api/bids/rfq/:id         Live ranking (Redis-cached, 5s TTL)
POST /api/awards               Award to winning bid
POST /api/awards/:id/approve   Approve award → auto-generate PO → email vendor
GET  /api/reports/dashboard    KPIs, savings MTD, top vendors, monthly trend
POST /api/sap/po/:id/sync      Manually trigger SAP PO sync
GET  /api/health               DB + server health check
```

---

## 🔄 Live Bidding Flow

1. Procurement creates RFQ → vendor invite emails sent automatically
2. Vendors log into portal at `/vendor/login`
3. Vendors see active RFQs and submit quotes
4. Every quote submission:
   - Validates minimum decrement rule
   - Validates max revisions per vendor
   - Auto-extends bid time if submitted in last N minutes
   - Re-ranks all current bids via PostgreSQL trigger
   - Invalidates Redis cache
   - Broadcasts `bid:new` event to all Socket.io room subscribers
5. Procurement watches live at `/bidding` with real-time countdown
6. Click "Award to L1 Vendor" → approval email sent to finance
7. Finance approves → PO auto-generated → vendor confirmation email sent
8. Optional: SAP PO sync via `/api/sap/po/:id/sync`
