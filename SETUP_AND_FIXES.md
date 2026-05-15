# FreightBid — Setup Guide & Bug Fixes Applied

## 🐛 Issues Fixed in This Build

### 1. Database Connection (Critical)
**Problem:** No `.env` file existed — server started but couldn't connect to PostgreSQL.
**Fix:** Created `backend/.env` with correct `DATABASE_URL`. You still need to create the database (see setup below).

### 2. Missing Vendor Pages (Critical)
**Problem:** Vendor nav had "My Bids" and "My POs" links but no page components or routes — clicking them redirected to home.
**Fix:** Added full `VendorBidsPage` and `VendorPOPage` components with proper routes (`/vendor/bids`, `/vendor/po`).

### 3. Vendor Bidding Page (Critical)
**Problem:** When vendor clicked "Submit Quote" from their dashboard, it navigated to `/vendor/bidding/:id` but the BiddingPage ignored the route `:id` param — it always tried to load the first active RFQ instead.
**Fix:** `BiddingPage` now reads `useParams().id` and loads that specific RFQ directly.

### 4. Vendor Bid Submission (Bug)
**Problem:** `submitBid` called with `selected` state which was `null` when arriving via direct route link.
**Fix:** Submit now uses `selected || routeId` so either path works correctly.

### 5. RFQ Visibility for Vendors (Security + UX)
**Problem:** Vendors could see ALL RFQs in the system, not just ones they were invited to.
**Fix:** Backend `/api/rfq` now filters by `rfq_vendor_mapping` for `vendor_user` role.

### 6. PO List Vendor Filter (Bug)
**Problem:** Vendors calling `/api/po` could see all POs or none (depending on query param), not automatically filtered to their vendor.
**Fix:** Backend now auto-applies `vendor_id` filter from JWT when role is `vendor_user`.

### 7. Socket useParams Fix
**Problem:** BiddingPage used `require()` inside a function component for `useParams` — React hooks rules violation.
**Fix:** Proper `useParams` import at top level, called normally.

---

## 🗄️ Database Setup (One-Time)

### Install PostgreSQL (if not installed)
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y postgresql postgresql-contrib

# macOS (Homebrew)
brew install postgresql@15 && brew services start postgresql@15

# Windows — download from https://www.postgresql.org/download/windows/
```

### Create Database & User
```bash
sudo -u postgres psql
```
Run these SQL commands:
```sql
CREATE USER freightbid WITH PASSWORD 'freightbid123';
CREATE DATABASE freightbid OWNER freightbid;
GRANT ALL PRIVILEGES ON DATABASE freightbid TO freightbid;
\q
```

### Run Schema + Seed
```bash
cd freightbid-full/backend
npm install

# Run schema
psql postgresql://freightbid:freightbid123@localhost:5432/freightbid -f ../db/001_schema.sql

# Seed demo data
node scripts/seed.js
```

Expected output:
```
✅ Seed complete!
  Internal: admin@freightbid.in / FreightBid@2024
  Vendor:   vendor1@sharmatransport.in / Vendor@2024
```

---

## 🚀 Starting the App

### Terminal 1 — Backend
```bash
cd freightbid-full/backend
npm install
node server.js
# → 🚛 FreightBid API → http://localhost:4000
```

### Terminal 2 — Frontend
```bash
cd freightbid-full/frontend
npm install
npm start
# → Opens http://localhost:3000
```

### Verify Database Connected
Open http://localhost:4000/api/health
Expected response:
```json
{ "ok": true, "db": true, "env": "development", "ts": "..." }
```
If `"db": false` — the database isn't running or `.env` credentials are wrong.

---

## 👤 Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@freightbid.in | FreightBid@2024 |
| Procurement Manager | procurement@freightbid.in | FreightBid@2024 |
| Logistics Team | logistics@freightbid.in | FreightBid@2024 |
| Finance Team | finance@freightbid.in | FreightBid@2024 |
| Vendor 1 | vendor1@sharmatransport.in | Vendor@2024 |
| Vendor 2 | vendor2@swiftlog.in | Vendor@2024 |

Vendor login URL: http://localhost:3000/vendor/login
Internal login URL: http://localhost:3000/login

---

## 🧪 Testing the Full Workflow

1. **Login as Logistics** → Create an RFQ, select vendors (Sharma Transport, Swift Logistics)
2. **Login as Vendor** (vendor1@sharmatransport.in) → Dashboard shows the RFQ
3. Click "Submit Quote" → Redirects to `/vendor/bidding/:id` → Enter quote and submit
4. **My Bids tab** → Shows all RFQs the vendor has bid on with rank
5. **Login as Procurement** → Go to ⚡ Live Bidding → Select the RFQ → Award to L1
6. **Login as Finance** → Awards & PO → Approve the award (auto-generates PO)
7. **Login as Vendor again** → My POs tab → PO appears → can confirm delivery

---

## 🔧 Troubleshooting

### "No token" / 401 errors
- Backend not running, or CORS issue. Make sure backend is on port 4000 and frontend proxy is set.

### Vendor sees "No active bid opportunities"
- Create an RFQ first and set its status to 'open' or 'bidding', and select that vendor.

### "Vendor not invited for this RFQ"
- When creating an RFQ, tick the checkboxes for vendors to invite them.

### Port already in use
```bash
# Kill port 4000
lsof -ti:4000 | xargs kill -9
# Kill port 3000
lsof -ti:3000 | xargs kill -9
```
