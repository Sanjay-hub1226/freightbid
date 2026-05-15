'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false });
async function seed() {
  console.log('Seeding...');
  const pw = await bcrypt.hash('FreightBid@2024', 12);
  await db.query(`INSERT INTO users(email,password_hash,full_name,role,department,employee_code) VALUES
    ('admin@freightbid.in',$1,'Super Admin','super_admin','IT','EMP-001'),
    ('procurement@freightbid.in',$1,'Rajesh Kumar','procurement_manager','Supply Chain','EMP-002'),
    ('logistics@freightbid.in',$1,'Anita Sharma','logistics_team','Logistics','EMP-003'),
    ('finance@freightbid.in',$1,'Vikram Nair','finance_team','Finance','EMP-004'),
    ('viewer@freightbid.in',$1,'Priya Mehta','management_viewer','Management','EMP-005')
    ON CONFLICT(email) DO NOTHING`,[pw]);
  const vp = await bcrypt.hash('Vendor@2024',12);
  const vendors=[
    ['Sharma Transport Co.','Ravi Sharma','9876543210','vendor1@sharmatransport.in','27AABCS1429B1ZB','Mumbai','Maharashtra'],
    ['Swift Logistics Pvt.','Suresh Mehta','8765432109','vendor2@swiftlog.in','07AADCS2341B1ZC','Delhi','Delhi'],
    ['Blue Dart Freight','Priya Nair','7654321098','vendor3@bluedartfreight.in','29AABCB1234C1ZD','Bangalore','Karnataka'],
    ['Om Carriers','Ramesh Om','6543210987','vendor4@omcarriers.in','27AADCO3456D1ZE','Pune','Maharashtra'],
    ['FastMove India','Arun Kumar','5432109876','vendor5@fastmove.in','36AABCF5678E1ZF','Hyderabad','Telangana'],
  ];
  for (const [name,contact,mobile,email,gst,city,state] of vendors) {
    const {rows:[u]}=await db.query(`INSERT INTO users(email,password_hash,full_name,role) VALUES($1,$2,$3,'vendor_user') ON CONFLICT(email) DO UPDATE SET password_hash=$2 RETURNING id`,[email,vp,name]);
    await db.query(`INSERT INTO vendors(vendor_name,contact_person,mobile,email,gst_number,city,state,status,onboarded_at,payment_terms,portal_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,'active',NOW(),'Net 30',$8) ON CONFLICT(email) DO NOTHING`,[name,contact,mobile,email,gst,city,state,u.id]);
  }
  console.log('\n✅ Seed complete!');
  console.log('  Internal: admin@freightbid.in / FreightBid@2024');
  console.log('  Vendor:   vendor1@sharmatransport.in / Vendor@2024\n');
  await db.end();
}
seed().catch(e=>{ console.error(e); process.exit(1); });
