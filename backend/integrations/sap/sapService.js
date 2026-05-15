// integrations/sap/sapService.js
'use strict';
const SAP = {
  enabled:    process.env.SAP_INTEGRATION_ENABLED === 'true',
  baseUrl:    process.env.SAP_BASE_URL    || '',
  clientId:   process.env.SAP_CLIENT_ID   || '',
  clientSecret: process.env.SAP_CLIENT_SECRET || '',
  tokenUrl:   process.env.SAP_TOKEN_URL   || '',
  compCode:   process.env.SAP_COMPANY_CODE || '1000',
};

let _token = null, _tokenExp = 0;
async function getToken() {
  if (_token && Date.now() < _tokenExp - 60000) return _token;
  const axios = require('axios');
  const r = await axios.post(SAP.tokenUrl, new URLSearchParams({
    grant_type:'client_credentials', client_id:SAP.clientId, client_secret:SAP.clientSecret }));
  _token = r.data.access_token;
  _tokenExp = Date.now() + r.data.expires_in * 1000;
  return _token;
}
async function sapReq(method, path, data) {
  if (!SAP.enabled) { console.log(`[SAP STUB] ${method} ${path}`); return { stub:true, DocumentNumber:`STUB-${Date.now()}` }; }
  const axios = require('axios');
  const token = await getToken();
  const r = await axios({ method, url: SAP.baseUrl+path, data, headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', Accept:'application/json' } });
  return r.data;
}

async function pushPurchaseOrder(po, db) {
  const payload = { CompanyCode:SAP.compCode, PurchaseOrderType:'NB', Supplier:po.sap_vendor_id||'', DocumentCurrency:'INR', to_PurchaseOrderItem:[{ PurchaseOrderItem:'00010', NetPriceAmount:po.po_amount, OrderQuantity:1, PurchaseOrderQuantityUnit:'EA' }] };
  const result = await sapReq('POST','/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder', payload);
  const sapPoNum = result.PurchaseOrder || result.DocumentNumber || `SAP-PO-${Date.now()}`;
  if (db) {
    await db.query(`UPDATE purchase_orders SET sap_po_number=$1,sap_sync_status='synced',sap_sync_payload=$2 WHERE id=$3`,
      [sapPoNum, JSON.stringify({payload,result}), po.id]).catch(()=>{});
    await db.query(`INSERT INTO sap_sync_log(direction,object_type,local_id,sap_object_id,status,completed_at) VALUES('outbound','PO',$1,$2,'success',NOW())`,
      [po.id, sapPoNum]).catch(()=>{});
  }
  return { sap_po_number: sapPoNum };
}

async function retryFailed(db) {
  const { rows } = await db.query(`SELECT * FROM sap_sync_log WHERE status='failed' AND retry_count<3 LIMIT 20`);
  for (const log of rows) {
    try {
      if (log.object_type === 'PO') {
        const { rows:[po] } = await db.query('SELECT * FROM purchase_orders WHERE id=$1',[log.local_id]);
        if (po) await pushPurchaseOrder(po, db);
      }
      await db.query(`UPDATE sap_sync_log SET status='success',completed_at=NOW() WHERE id=$1`,[log.id]);
    } catch(e) {
      await db.query(`UPDATE sap_sync_log SET retry_count=retry_count+1,error_message=$1 WHERE id=$2`,[e.message,log.id]);
    }
  }
}
module.exports = { pushPurchaseOrder, retryFailed, SAP };
