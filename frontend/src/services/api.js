// src/services/api.js
const BASE = process.env.REACT_APP_API_URL || '';
const getToken = () => localStorage.getItem('fb_token');

async function req(method, path, body, params) {
  const url = new URL(BASE + '/api' + path, window.location.origin);
  if (params) Object.entries(params).forEach(([k,v]) => v != null && url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

export const api = {
  // Auth
  login:         (e,p)        => req('POST','/auth/login',{email:e,password:p}),
  me:            ()           => req('GET','/auth/me'),
  register:      (b)          => req('POST','/auth/register',b),
  forgotPw:      (e)          => req('POST','/auth/forgot-password',{email:e}),
  resetPw:       (t,p)        => req('POST','/auth/reset-password',{token:t,password:p}),
  changePw:      (b)          => req('POST','/auth/change-password',b),
  // RFQ
  rfqList:       (p={})       => req('GET','/rfq',null,p),
  rfqGet:        (id)         => req('GET',`/rfq/${id}`),
  rfqCreate:     (b)          => req('POST','/rfq',b),
  rfqUpdate:     (id,b)       => req('PATCH',`/rfq/${id}`,b),
  rfqClose:      (id)         => req('POST',`/rfq/${id}/close`),
  rfqExtend:     (id,m)       => req('POST',`/rfq/${id}/extend`,{minutes:m}),
  // Bids
  bidsForRFQ:    (id)         => req('GET',`/bids/rfq/${id}`),
  bidHistory:    (id)         => req('GET',`/bids/rfq/${id}/history`),
  submitBid:     (b)          => req('POST','/bids',b),
  // Vendors
  vendorList:    (p={})       => req('GET','/vendors',null,p),
  vendorGet:     (id)         => req('GET',`/vendors/${id}`),
  vendorCreate:  (b)          => req('POST','/vendors',b),
  vendorUpdate:  (id,b)       => req('PATCH',`/vendors/${id}`,b),
  // Awards
  awardList:     ()           => req('GET','/awards'),
  awardGet:      (id)         => req('GET',`/awards/${id}`),
  awardCreate:   (b)          => req('POST','/awards',b),
  awardApprove:  (id,remarks) => req('POST',`/awards/${id}/approve`,{remarks}),
  awardReject:   (id,remarks) => req('POST',`/awards/${id}/reject`,{remarks}),
  // PO
  poList:        (p={})       => req('GET','/po',null,p),
  poGet:         (id)         => req('GET',`/po/${id}`),
  poStatus:      (id,s,r)     => req('PATCH',`/po/${id}/status`,{status:s,remarks:r}),
  poTracking:    (id)         => req('GET',`/po/${id}/tracking`),
  poSAPSync:     (id)         => req('POST',`/sap/po/${id}/sync`),
  // Reports
  dashboardReport: ()         => req('GET','/reports/dashboard'),
  lanesReport:     (p)        => req('GET','/reports/lanes',null,p),
  vendorPerfReport:()         => req('GET','/reports/vendor-performance'),
  savingsReport:   (p)        => req('GET','/reports/savings',null,p),
  budgetActual:    (p)        => req('GET','/reports/budget-vs-actual',null,p),
  // Users
  userList:      ()           => req('GET','/users'),
  userCreate:    (b)          => req('POST','/users',b),
  userUpdate:    (id,b)       => req('PATCH',`/users/${id}`,b),
  // SAP
  sapStatus:     ()           => req('GET','/sap/status'),
  sapSyncLog:    (p)          => req('GET','/sap/sync-log',null,p),
};
export default api;
