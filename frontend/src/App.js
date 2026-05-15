import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import './styles/global.css';
import { useSocket } from './hooks/useSocket';

import { AuthProvider, useAuth } from './context/index';
import { ToastProvider, useToast } from './context/index';
import api from './services/api';

// ── Shared Components ──────────────────────────────────────
function Spinner() { return <div className="spinner" />; }

function LoadingPage() {
  return <div className="loading-page"><Spinner /><span style={{color:'var(--text3)',fontSize:13}}>Loading...</span></div>;
}

function Badge({ type='gray', children }) {
  const map = { green:'b-green',blue:'b-blue',amber:'b-amber',red:'b-red',purple:'b-purple',teal:'b-teal',gray:'b-gray' };
  return <span className={`badge ${map[type]||'b-gray'}`}>{children}</span>;
}

function StatusBadge({ status }) {
  const map = {
    draft:      ['gray','Draft'], open:['blue','Open'],
    bidding:    ['amber','⚡ Bidding'], bid_closed:['purple','Closed'],
    awarded:    ['green','✓ Awarded'], po_issued:['teal','PO Issued'],
    cancelled:  ['gray','Cancelled'],
    active:     ['green','Active'],  pending:['amber','Pending'], blocked:['red','Blocked'],
    pending_approval:['amber','Pending Approval'], approved:['green','Approved'],
    po_generated:['teal','PO Generated'], vendor_confirmed:['teal','Confirmed'],
    in_transit: ['blue','In Transit'], delivered:['green','Delivered'], closed:['gray','Closed'],
  };
  const [type, label] = map[status] || ['gray', status];
  return <Badge type={type}>{label}</Badge>;
}

function Modal({ open, onClose, title, children, footer, maxWidth=560 }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function FormInput({ label, ...props }) {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      {props.as === 'select'
        ? <select className="form-input" {...Object.fromEntries(Object.entries(props).filter(([k])=>k!=='as'))}>{props.children}</select>
        : props.as === 'textarea'
        ? <textarea className="form-input" {...Object.fromEntries(Object.entries(props).filter(([k])=>k!=='as'&&k!=='children'))} />
        : <input className="form-input" {...Object.fromEntries(Object.entries(props).filter(([k])=>k!=='as'))} />
      }
    </div>
  );
}

// ── Auth Pages ─────────────────────────────────────────────
function LoginPage({ isVendor }) {
  const { login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const user = await login(email, password);
      nav(user.role === 'vendor_user' ? '/vendor/dashboard' : '/dashboard');
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark">🚛</div>
          <span style={{fontFamily:'Syne',fontWeight:800,fontSize:20}}>FreightBid</span>
        </div>
        <div className="auth-title">{isVendor ? 'Vendor Portal Login' : 'Sign In'}</div>
        <div className="auth-sub">{isVendor ? 'Access your vendor bidding portal' : 'FreightBid Transport Management'}</div>
        {error && <div style={{background:'rgba(220,38,38,.1)',border:'1px solid rgba(220,38,38,.3)',borderRadius:8,padding:'10px 14px',color:'var(--red3)',fontSize:13,marginBottom:14}}>{error}</div>}
        <form onSubmit={submit}>
          <FormInput label="Email Address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.in" required />
          <FormInput label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          <button className="btn btn-primary w-full" style={{width:'100%',justifyContent:'center',marginTop:4}} disabled={loading}>
            {loading ? <><Spinner /> Signing in...</> : 'Sign In'}
          </button>
        </form>
        {!isVendor && (
          <div style={{marginTop:16,textAlign:'center',fontSize:12,color:'var(--text3)'}}>
            Demo credentials: <code style={{color:'var(--blue3)'}}>procurement@freightbid.in</code> / <code style={{color:'var(--blue3)'}}>FreightBid@2024</code>
          </div>
        )}
        {isVendor && (
          <div style={{marginTop:16,textAlign:'center',fontSize:12,color:'var(--text3)'}}>
            Vendor demo: <code style={{color:'var(--blue3)'}}>vendor1@sharmatransport.in</code> / <code style={{color:'var(--blue3)'}}>Vendor@2024</code>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Top Navigation ─────────────────────────────────────────
function TopBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const isVendor = user?.role === 'vendor_user';
  const pages = isVendor
    ? [['Bid Opportunities','/vendor/dashboard'],['My Bids','/vendor/bids'],['My POs','/vendor/po']]
    : [['Dashboard','/dashboard'],['RFQ Management','/rfq'],['⚡ Live Bidding','/bidding'],['Vendors','/vendors'],['Awards & PO','/awards'],['MIS Reports','/reports'],['Users','/users']];

  return (
    <div className="topbar">
      <div className="logo" onClick={() => nav(isVendor?'/vendor/dashboard':'/dashboard')} style={{cursor:'pointer'}}>
        <div className="logo-mark">🚛</div>
        <span style={{fontFamily:'Syne',fontWeight:800,fontSize:16,color:'var(--text)'}}>FreightBid</span>
        {isVendor && <span className="logo-env">VENDOR PORTAL</span>}
      </div>
      <nav className="topnav">
        {pages.map(([label, path]) => (
          <button key={path} className={`topnav-btn${loc.pathname.startsWith(path)?' active':''}`} onClick={() => nav(path)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex flex-center gap-8">
        <div style={{fontSize:12,color:'var(--text3)',fontFamily:'DM Mono,monospace',background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:6,padding:'4px 10px'}}>
          {user?.role?.replace(/_/g,' ')} · {user?.name?.split(' ')[0]}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}

// ── Protected Route ────────────────────────────────────────
function Protected({ children, vendorOnly, internalOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPage />;
  if (!user) return <Navigate to={vendorOnly ? '/vendor/login' : '/login'} replace />;
  if (vendorOnly && user.role !== 'vendor_user') return <Navigate to="/dashboard" replace />;
  if (internalOnly && user.role === 'vendor_user') return <Navigate to="/vendor/dashboard" replace />;
  return children;
}

function AppLayout({ children }) {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="main-area">
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────
function Dashboard() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    api.dashboardReport().then(setData).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const statusMap = {};
  data?.rfq_by_status?.forEach(r => { statusMap[r.status] = r.count; });
  const sm = data?.savings_mtd || {};

  if (loading) return <LoadingPage />;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Operations Dashboard</div>
          <div className="page-sub">Live · {new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
        <div className="hactions">
          <button className="btn btn-primary" onClick={() => nav('/rfq?new=1')}>+ New RFQ</button>
          <button className="btn btn-ghost" onClick={() => nav('/bidding')} style={{borderColor:'rgba(37,99,235,.3)',color:'var(--blue3)'}}>⚡ Live Bids</button>
        </div>
      </div>

      <div className="grid-4 mb-20">
        {[
          { label:'Active RFQs',     value: (statusMap['open']||0)+(statusMap['bidding']||0), color:'var(--blue3)',  cls:'mc-blue' },
          { label:'Savings This Month', value:`₹${((sm.total_savings||0)/100000).toFixed(1)}L`, color:'var(--green3)', cls:'mc-green' },
          { label:'Avg Bid Savings', value:`${Number(sm.avg_pct||0).toFixed(1)}%`, color:'var(--amber3)', cls:'mc-amber' },
          { label:'Pending Approvals', value: data?.pending_approvals||0, color:'var(--red3)', cls:'mc-red' },
        ].map(({label,value,color,cls}) => (
          <div key={label} className={`metric-card ${cls}`}>
            <div className="metric-label">{label}</div>
            <div className="metric-value" style={{color}}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 mb-16">
        <div className="card">
          <div className="card-title">RFQ Status Breakdown</div>
          <div className="bar-chart">
            {[['open','Open',70,'var(--blue)'],['bidding','In Bidding',30,'var(--amber)'],
              ['awarded','Awarded',60,'var(--green)'],['cancelled','Cancelled',10,'var(--red)']].map(([s,l,w,c])=>(
              <div className="bar-row" key={s}>
                <div className="bar-lbl">{l}</div>
                <div className="bar-track"><div className="bar-fill" style={{width:`${Math.max((statusMap[s]||0)*8,w)}%`,background:c}} /></div>
                <div className="bar-val">{statusMap[s]||0} RFQs</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Top Vendors <Badge type="blue">by wins</Badge></div>
          {data?.top_vendors?.length ? (
            <div className="bar-chart">
              {data.top_vendors.map((v,i) => (
                <div className="bar-row" key={i}>
                  <div className="bar-lbl" title={v.vendor_name}>{v.vendor_name.split(' ').slice(0,2).join(' ')}</div>
                  <div className="bar-track"><div className="bar-fill" style={{width:`${Math.min((v.wins/Math.max(...data.top_vendors.map(x=>x.wins)))*100,100)}%`,background:'var(--purple2)'}} /></div>
                  <div className="bar-val">{v.wins} wins</div>
                </div>
              ))}
            </div>
          ) : <div style={{color:'var(--text3)',fontSize:13}}>No award data yet</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Monthly Spend & Savings Trend</div>
        <div className="bar-chart">
          {data?.monthly_trend?.map((m,i) => {
            const mo = new Date(m.month).toLocaleString('en-IN',{month:'short',year:'2-digit'});
            const maxSpend = Math.max(...(data.monthly_trend.map(x=>x.spend)||[1]));
            return (
              <div className="bar-row" key={i}>
                <div className="bar-lbl">{mo}</div>
                <div className="bar-track"><div className="bar-fill" style={{width:`${(m.spend/maxSpend)*100}%`,background:'var(--blue)'}} /></div>
                <div className="bar-val">₹{(m.spend/100000).toFixed(1)}L</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── RFQ LIST ───────────────────────────────────────────────
function RFQPage() {
  const [rfqs, setRfqs]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]     = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [createLoading, setCreateLoading] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();

  const EMPTY_FORM = { dispatch_location_text:'',delivery_location_text:'',vehicle_type_text:'',material_type:'',weight_mt:'',quantity:'',quantity_unit:'MT',special_handling:'',expected_dispatch_time:'',bid_close_time:'',target_budget:'',internal_remarks:'',min_decrement:500,max_revisions_per_vendor:5,l1_visibility:'rank_only',auto_extend_minutes:5,vendor_ids:[] };
  const [form, setForm] = useState(EMPTY_FORM);
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    if (loc.search.includes('new=1')) { setShowCreate(true); window.history.replaceState(null,'','/rfq'); }
  }, [loc.search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.rfqList({ status: statusFilter||undefined, page, limit: 15 });
      setRfqs(d.data); setTotal(d.total);
    } catch(e) { toast(e.message,'error'); }
    finally { setLoading(false); }
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.vendorList({ status:'active', limit:50 }).then(v=>setVendors(v)).catch(()=>{}); }, []);

  const submitCreate = async () => {
    if (!form.dispatch_location_text || !form.delivery_location_text || !form.bid_close_time) {
      return toast('Dispatch location, delivery location and bid close time are required','error');
    }
    setCreateLoading(true);
    try {
      await api.rfqCreate(form);
      toast('RFQ created & email invites sent!');
      setShowCreate(false); setForm(EMPTY_FORM); load();
    } catch(e) { toast(e.message,'error'); }
    finally { setCreateLoading(false); }
  };

  const toggleVendor = id => sf('vendor_ids', form.vendor_ids.includes(id) ? form.vendor_ids.filter(x=>x!==id) : [...form.vendor_ids,id]);

  const STATUSES = [['','All'],['open','Open'],['bidding','Bidding'],['bid_closed','Closed'],['awarded','Awarded'],['cancelled','Cancelled']];

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">RFQ Management</div><div className="page-sub">Create and manage shipment requests for quotation</div></div>
        <div className="hactions"><button className="btn btn-primary" onClick={()=>setShowCreate(true)}>+ Create RFQ</button></div>
      </div>

      <div className="tabs">
        {STATUSES.map(([val,label])=>(
          <button key={val} className={`tab${statusFilter===val?' active':''}`} onClick={()=>{setStatusFilter(val);setPage(1);}}>{label}</button>
        ))}
      </div>

      {loading ? <LoadingPage /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>RFQ #</th><th>Route</th><th>Vehicle</th><th>Weight</th><th>Bid Close</th><th>Vendors</th><th>L1 Quote</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rfqs.length === 0 && <tr><td colSpan={9} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>No RFQs found</td></tr>}
              {rfqs.map(r => (
                <tr key={r.id} className="row-click" onClick={()=>nav(`/rfq/${r.id}`)}>
                  <td className="strong mono">{r.rfq_number}</td>
                  <td>{r.dispatch_location_text} → {r.delivery_location_text}</td>
                  <td>{r.vehicle_type_text||'—'}</td>
                  <td>{r.weight_mt ? `${r.weight_mt} MT` : '—'}</td>
                  <td className="mono text-sm">{new Date(r.bid_close_time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                  <td>{r.vendor_count||0}</td>
                  <td className={r.l1_amount?'strong text-green mono':'mono'}>{r.l1_amount?`₹${Number(r.l1_amount).toLocaleString('en-IN')}`:'—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div className="flex gap-8">
                      {r.status==='bidding' && <button className="btn btn-primary btn-xs" onClick={e=>{e.stopPropagation();nav(`/bidding/${r.id}`);}}>⚡ Live</button>}
                      {r.status==='awarded' && <button className="btn btn-ghost btn-xs" onClick={e=>{e.stopPropagation();nav(`/awards`);}}>PO</button>}
                      <button className="btn btn-ghost btn-xs" onClick={e=>{e.stopPropagation();nav(`/rfq/${r.id}`);}}>View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderTop:'1px solid var(--border)',background:'var(--bg3)',fontSize:13,color:'var(--text3)'}}>
            <span>Total: {total}</span>
            <div className="flex gap-8">
              <button className="btn btn-ghost btn-xs" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
              <span style={{padding:'3px 10px'}}>Page {page}</span>
              <button className="btn btn-ghost btn-xs" disabled={rfqs.length<15} onClick={()=>setPage(p=>p+1)}>Next →</button>
            </div>
          </div>
        </div>
      )}

      {/* Create RFQ Modal */}
      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Create New RFQ" maxWidth={700}
        footer={<>
          <button className="btn btn-ghost" onClick={()=>setShowCreate(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={submitCreate} disabled={createLoading}>
            {createLoading ? <><Spinner/>Creating...</> : 'Create RFQ & Send Invites'}
          </button>
        </>}>
        <div className="form-section-title">Route & Shipment</div>
        <div className="form-row-2">
          <FormInput label="Dispatch Location *" value={form.dispatch_location_text} onChange={e=>sf('dispatch_location_text',e.target.value)} placeholder="e.g. Mumbai, Bhiwandi" />
          <FormInput label="Delivery Location *" value={form.delivery_location_text} onChange={e=>sf('delivery_location_text',e.target.value)} placeholder="e.g. Pune, Chakan" />
          <FormInput label="Vehicle Type" value={form.vehicle_type_text} onChange={e=>sf('vehicle_type_text',e.target.value)} placeholder="e.g. 20T Trailer" />
          <FormInput label="Material Type" value={form.material_type} onChange={e=>sf('material_type',e.target.value)} placeholder="e.g. FMCG, Auto Parts" />
          <FormInput label="Weight (MT)" type="number" value={form.weight_mt} onChange={e=>sf('weight_mt',e.target.value)} />
          <FormInput label="Quantity" type="number" value={form.quantity} onChange={e=>sf('quantity',e.target.value)} />
        </div>
        <FormInput label="Special Handling" value={form.special_handling} onChange={e=>sf('special_handling',e.target.value)} placeholder="e.g. Fragile, Temperature Sensitive" />

        <div className="form-section-title">Bid Schedule & Rules</div>
        <div className="form-row-2">
          <FormInput label="Expected Dispatch" type="datetime-local" value={form.expected_dispatch_time} onChange={e=>sf('expected_dispatch_time',e.target.value)} />
          <FormInput label="Bid Closing Time *" type="datetime-local" value={form.bid_close_time} onChange={e=>sf('bid_close_time',e.target.value)} />
          <FormInput label="Target Budget (₹)" type="number" value={form.target_budget} onChange={e=>sf('target_budget',e.target.value)} />
          <FormInput label="L1 Visibility" as="select" value={form.l1_visibility} onChange={e=>sf('l1_visibility',e.target.value)}>
            <option value="rank_only">Rank Only (Blind)</option>
            <option value="full_amount">Show Full Amount</option>
            <option value="hidden">Hidden</option>
          </FormInput>
          <FormInput label="Min Decrement (₹)" type="number" value={form.min_decrement} onChange={e=>sf('min_decrement',+e.target.value)} />
          <FormInput label="Auto-Extend (mins)" type="number" value={form.auto_extend_minutes} onChange={e=>sf('auto_extend_minutes',+e.target.value)} />
        </div>

        <div className="form-section-title">Invite Vendors ({form.vendor_ids.length} selected)</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:'10px 12px',background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,maxHeight:110,overflowY:'auto',marginBottom:14}}>
          {vendors.map(v=>(
            <span key={v.id} onClick={()=>toggleVendor(v.id)}
              style={{padding:'4px 12px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid',fontFamily:'DM Mono,monospace',transition:'all .15s',
                background:form.vendor_ids.includes(v.id)?'rgba(37,99,235,.15)':'var(--bg4)',
                borderColor:form.vendor_ids.includes(v.id)?'rgba(37,99,235,.35)':'var(--border2)',
                color:form.vendor_ids.includes(v.id)?'var(--blue3)':'var(--text3)'}}>
              {form.vendor_ids.includes(v.id)?'✓ ':''}{v.vendor_name}
            </span>
          ))}
          {vendors.length === 0 && <span style={{color:'var(--text3)',fontSize:12}}>No active vendors yet. Add vendors first.</span>}
        </div>
        <FormInput label="Internal Remarks" as="textarea" rows={2} value={form.internal_remarks} onChange={e=>sf('internal_remarks',e.target.value)} placeholder="Notes for internal team..." />
      </Modal>
    </div>
  );
}

// ── LIVE BIDDING ───────────────────────────────────────────
function BiddingPage() {
  const nav = useNavigate();
  const { id: routeId } = useParams();
  const [rfqs, setRfqs] = useState([]);
  const [selected, setSelected] = useState(routeId || null);
  const [ranking, setRanking] = useState([]);
  const [history, setHistory] = useState([]);
  const [rfqMeta, setRfqMeta] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [bidAmt, setBidAmt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const { user } = useAuth();
  const isVendor = user?.role === 'vendor_user';
  const { connected, emit, on, off } = (function() {
    try { return require('./context/index').useSocket ? require('./context/index').useSocket() : {connected:false,emit:()=>{},on:()=>{},off:()=>{}}; }
    catch(e) { return {connected:false,emit:()=>{},on:()=>{},off:()=>{}}; }
  })();

  useEffect(() => {
    if (routeId) {
      loadRFQ(routeId);
    } else {
      api.rfqList({ status:'bidding', limit:50 }).then(d=>{ setRfqs(d.data); if(d.data[0]) loadRFQ(d.data[0].id); }).catch(()=>{});
    }
  }, [routeId]);

  const loadRFQ = async (id) => {
    setSelected(id); setRanking([]); setHistory([]); setIsClosed(false);
    try {
      const [r, bids, hist] = await Promise.all([api.rfqGet(id), api.bidsForRFQ(id), api.bidHistory(id)]);
      setRfqMeta(r); setRanking(bids); setHistory(hist);
      if (r.status==='bid_closed') setIsClosed(true);
    } catch(e) { toast(e.message,'error'); }
  };

  useEffect(() => {
    if (!rfqMeta?.bid_close_time) return;
    const tick = () => {
      const diff = new Date(rfqMeta.bid_close_time) - new Date();
      if (diff <= 0) { setTimeLeft('CLOSED'); setIsClosed(true); return; }
      const h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
      setTimeLeft(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick(); const t = setInterval(tick,1000); return () => clearInterval(t);
  }, [rfqMeta?.bid_close_time]);

  const submitBid = async () => {
    if (!bidAmt) return toast('Enter a quote amount','error');
    if (!user?.vendor_id) return toast('Vendor ID not found. Please re-login.','error');
    setSubmitting(true);
    try {
      await api.submitBid({ rfq_id: selected || routeId, quote_amount: parseFloat(bidAmt), vendor_id: user.vendor_id });
      toast(`Quote ₹${Number(bidAmt).toLocaleString('en-IN')} submitted!`);
      setBidAmt('');
      const bids = await api.bidsForRFQ(selected || routeId);
      setRanking(bids);
    } catch(e) { toast(e.message,'error'); }
    finally { setSubmitting(false); }
  };

  const awardL1 = async () => {
    if (!ranking[0]) return;
    if (!window.confirm(`Award to ${ranking[0].vendor_name} for ₹${Number(ranking[0].quote_amount).toLocaleString('en-IN')}?`)) return;
    try {
      await api.awardCreate({ rfq_id: selected, bid_id: ranking[0].id, remarks: 'Awarded via Live Bidding screen' });
      toast('Award created! Pending approval. Email sent to vendor.');
      nav('/awards');
    } catch(e) { toast(e.message,'error'); }
  };

  const budget = rfqMeta?.target_budget;
  const l1amt  = ranking[0]?.quote_amount;
  const savings = budget && l1amt ? budget - l1amt : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">⚡ Live Bidding Engine</div>
          <div className="page-sub"><span className="live-badge"><span className="live-dot"/>Real-time reverse auction</span></div>
        </div>
        <div className="hactions">
          <select className="btn btn-ghost" style={{cursor:'pointer'}} value={selected||''} onChange={e=>loadRFQ(e.target.value)}>
            <option value="" disabled>Select active RFQ...</option>
            {rfqs.map(r=><option key={r.id} value={r.id}>{r.rfq_number} · {r.dispatch_location_text} → {r.delivery_location_text}</option>)}
          </select>
        </div>
      </div>

      {!rfqMeta ? <div className="loading-page"><Spinner/><span style={{color:'var(--text3)'}}>Select an active RFQ above</span></div> : (
        <>
          <div className="bid-room-header">
            <div className="flex flex-between" style={{gap:16}}>
              <div>
                <div style={{fontSize:10.5,color:'var(--text3)',fontFamily:'DM Mono,monospace',textTransform:'uppercase',letterSpacing:.7,marginBottom:4}}>
                  {rfqMeta.rfq_number} · {rfqMeta.vehicle_type_text} · {rfqMeta.weight_mt} MT {rfqMeta.material_type}
                </div>
                <div className="bid-route">{rfqMeta.dispatch_location_text} → {rfqMeta.delivery_location_text}</div>
                <div className="flex gap-12" style={{marginTop:8,fontSize:12,color:'var(--text3)',flexWrap:'wrap'}}>
                  {budget && <span>🎯 Budget: ₹{Number(budget).toLocaleString('en-IN')}</span>}
                  <span>👥 {rfqMeta.vendors?.length||0} vendors</span>
                  {!isClosed && <span className="live-badge"><span className="live-dot"/>LIVE</span>}
                  {isClosed && <Badge type="gray">BIDDING CLOSED</Badge>}
                </div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.8,fontFamily:'DM Mono,monospace'}}>Closes In</div>
                <div className={`timer-value${isClosed||timeLeft.includes(':')&&timeLeft.split(':')[0]==='00'&&parseInt(timeLeft.split(':')[1])<5?' urgent':''}`}>{timeLeft||'--:--:--'}</div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.7,fontFamily:'DM Mono,monospace',marginBottom:12}}>Live Quote Ranking</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {ranking.length === 0 && <div style={{textAlign:'center',padding:32,color:'var(--text3)',fontSize:13}}>Waiting for first bid...</div>}
                {ranking.map((b,i)=>{
                  const diff = i>0 ? b.quote_amount - l1amt : 0;
                  const savPct = budget&&i===0 ? ((budget-b.quote_amount)/budget*100).toFixed(1) : null;
                  return (
                    <div key={b.id} className={`rank-card${i===0?' l1':i===1?' l2':''}`}>
                      <div className={`rank-badge rb-${Math.min(i+1,3)||'n'}`}>L{b.rank}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13.5,fontWeight:500,color:'var(--text)'}}>{isVendor&&b.vendor_id!==user?.vendor_id?`Vendor L${b.rank}`:b.vendor_name}</div>
                        <div style={{fontSize:11,color:'var(--text3)',fontFamily:'DM Mono,monospace',marginTop:2}}>Rev #{b.revision_number} · {new Date(b.quoted_at).toLocaleTimeString('en-IN')}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontFamily:'DM Mono,monospace',fontSize:19,color:i===0?'var(--green3)':'var(--text)'}}>₹{Number(b.quote_amount).toLocaleString('en-IN')}</div>
                        {i===0&&savPct&&<div style={{fontSize:11,color:'var(--green3)',marginTop:2}}>▼ {savPct}% vs budget</div>}
                        {i>0&&diff>0&&<div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>+₹{Number(diff).toLocaleString('en-IN')} vs L1</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!isVendor && !isClosed && ranking[0] && (
                <button className="btn btn-success" style={{width:'100%',justifyContent:'center',marginTop:16}} onClick={awardL1}>
                  🏆 Award to {ranking[0].vendor_name}
                </button>
              )}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {savings!==null && (
                <div style={{background:'linear-gradient(135deg,rgba(16,185,129,.1),rgba(13,148,136,.06))',border:'1px solid rgba(16,185,129,.2)',borderRadius:12,padding:18,textAlign:'center'}}>
                  <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.8,fontFamily:'DM Mono,monospace',marginBottom:6}}>Best Quote vs Budget</div>
                  <div style={{fontFamily:'Syne,sans-serif',fontSize:32,fontWeight:800,color:'var(--green3)'}}>₹{Number(savings).toLocaleString('en-IN')}</div>
                  <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{((savings/budget)*100).toFixed(1)}% savings · ₹{Number(l1amt).toLocaleString('en-IN')} vs ₹{Number(budget).toLocaleString('en-IN')}</div>
                </div>
              )}
              {isVendor && !isClosed && (
                <div style={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:12,padding:16}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:12,fontFamily:'DM Mono,monospace',textTransform:'uppercase'}}>Submit Your Quote</div>
                  <FormInput label="Quote Amount (₹)" type="number" step="100" value={bidAmt} onChange={e=>setBidAmt(e.target.value)} placeholder="Enter competitive quote" />
                  <button className="btn btn-primary" style={{width:'100%',justifyContent:'center'}} onClick={submitBid} disabled={submitting}>{submitting ? <><Spinner /> Submitting...</> : 'Submit Quote'}</button>
                  {rfqMeta?.min_decrement && <div style={{fontSize:11,color:'var(--text3)',marginTop:8,fontFamily:'DM Mono,monospace'}}>Min decrement: ₹{Number(rfqMeta.min_decrement).toLocaleString('en-IN')}</div>}
                </div>
              )}
              <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.6,fontFamily:'DM Mono,monospace'}}>Bid Activity Log</div>
                <div style={{maxHeight:220,overflowY:'auto'}}>
                  {history.slice(0,20).map((h,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderBottom:'1px solid rgba(30,45,69,.4)',fontSize:11}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:i===0?'var(--green2)':'var(--text3)',flexShrink:0}} />
                      <span style={{flex:1,color:'var(--text2)'}}>{h.vendor_code}</span>
                      <span style={{fontFamily:'DM Mono,monospace',color:'var(--text)',fontWeight:500}}>₹{Number(h.quote_amount).toLocaleString('en-IN')}</span>
                      <span style={{color:'var(--text3)',fontFamily:'DM Mono,monospace',fontSize:10}}>{new Date(h.quoted_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                  ))}
                  {history.length===0&&<div style={{padding:20,textAlign:'center',color:'var(--text3)',fontSize:12}}>No bids yet</div>}
                </div>
              </div>
              <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:14}}>
                <div style={{fontSize:10.5,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.6,fontFamily:'DM Mono,monospace',marginBottom:10}}>Bid Rules</div>
                {[['Min. Decrement',`₹${Number(rfqMeta.min_decrement||500).toLocaleString('en-IN')}`],['Max Revisions',rfqMeta.max_revisions_per_vendor||5],['L1 Visibility',rfqMeta.l1_visibility||'rank_only'],['Auto-Extend',`${rfqMeta.auto_extend_minutes||5} min`]].map(([k,v])=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',borderBottom:'1px solid rgba(30,45,69,.4)'}}>
                    <span style={{color:'var(--text3)'}}>{k}</span><span style={{color:'var(--blue3)',fontFamily:'DM Mono,monospace',fontSize:11.5}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── VENDORS PAGE ───────────────────────────────────────────
function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ vendor_name:'',contact_person:'',mobile:'',email:'',gst_number:'',pan_number:'',city:'',state:'',pincode:'',payment_terms:'Net 30',create_portal_user:false,portal_password:'' });
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = () => { setLoading(true); api.vendorList({limit:50}).then(setVendors).catch(e=>toast(e.message,'error')).finally(()=>setLoading(false)); };
  useEffect(load, []);

  const save = async () => {
    if (!form.vendor_name||!form.email) return toast('Vendor name and email required','error');
    setSaving(true);
    try { await api.vendorCreate(form); toast('Vendor created! Welcome email sent.'); setShowAdd(false); load(); }
    catch(e) { toast(e.message,'error'); }
    finally { setSaving(false); }
  };

  const COLORS = ['rgba(37,99,235,.12)','rgba(16,185,129,.12)','rgba(139,92,246,.12)','rgba(245,158,11,.12)','rgba(20,184,166,.12)','rgba(99,102,241,.12)'];
  const TCOLS  = ['var(--blue3)','var(--green3)','var(--purple3)','var(--amber3)','var(--teal3)','var(--indigo2)'];

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Vendor Master</div><div className="page-sub">Manage approved transport vendors</div></div>
        <div className="hactions"><button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Add Vendor</button></div>
      </div>
      <div className="grid-3 mb-16">
        {[['Total',vendors.length,'blue'],['Active',vendors.filter(v=>v.status==='active').length,'green'],['Pending',vendors.filter(v=>v.status==='pending').length,'amber']].map(([l,v,c])=>(
          <div key={l} className={`metric-card mc-${c}`}><div className="metric-label">{l}</div><div className="metric-value" style={{color:`var(--${c}3)`}}>{v}</div></div>
        ))}
      </div>
      {loading ? <LoadingPage /> : (
        <div className="grid-3">
          {vendors.map((v,i)=>(
            <div key={v.id} className="card" style={{cursor:'pointer',transition:'all .2s'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform=''}>
              <div style={{width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Syne,sans-serif',fontSize:14,fontWeight:800,marginBottom:12,background:COLORS[i%6],color:TCOLS[i%6]}}>
                {v.vendor_name.split(' ').slice(0,2).map(w=>w[0]).join('')}
              </div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:3}}>{v.vendor_name}</div>
              <div style={{fontSize:11.5,color:'var(--text3)',marginBottom:10,fontFamily:'DM Mono,monospace'}}>{v.vendor_code} · {v.city}</div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <StatusBadge status={v.status} />
                <div style={{fontSize:12,color:'var(--amber3)'}}>{v.performance_rating?'★'.repeat(Math.round(v.performance_rating)):'—'}</div>
              </div>
              <div style={{display:'flex',gap:12,fontSize:11,color:'var(--text3)'}}>
                <span><strong style={{color:'var(--text2)'}}>{v.rfq_count||0}</strong> RFQs</span>
                <span><strong style={{color:'var(--text2)'}}>{v.win_count||0}</strong> Wins</span>
              </div>
              {v.gst_number && <div style={{marginTop:8,fontSize:11,fontFamily:'DM Mono,monospace',color:'var(--text3)'}}>{v.gst_number}</div>}
              {v.sap_vendor_id && <div style={{marginTop:6}}><span className="sap-chip">SAP: {v.sap_vendor_id}</span></div>}
            </div>
          ))}
          <div className="card" style={{border:'1px dashed var(--border2)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:180,cursor:'pointer'}} onClick={()=>setShowAdd(true)}>
            <div style={{fontSize:28,color:'var(--text3)',marginBottom:8}}>+</div>
            <div style={{fontSize:13,color:'var(--text3)'}}>Add New Vendor</div>
          </div>
        </div>
      )}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add New Vendor" maxWidth={640}
        footer={<><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:'Create Vendor'}</button></>}>
        <div className="form-row-2">
          <FormInput label="Vendor Name *" value={form.vendor_name} onChange={e=>sf('vendor_name',e.target.value)} placeholder="Company name" />
          <FormInput label="Contact Person" value={form.contact_person} onChange={e=>sf('contact_person',e.target.value)} />
          <FormInput label="Email *" type="email" value={form.email} onChange={e=>sf('email',e.target.value)} />
          <FormInput label="Mobile" value={form.mobile} onChange={e=>sf('mobile',e.target.value)} />
          <FormInput label="GST Number" value={form.gst_number} onChange={e=>sf('gst_number',e.target.value)} />
          <FormInput label="PAN Number" value={form.pan_number} onChange={e=>sf('pan_number',e.target.value)} />
          <FormInput label="City" value={form.city} onChange={e=>sf('city',e.target.value)} />
          <FormInput label="State" value={form.state} onChange={e=>sf('state',e.target.value)} />
          <FormInput label="Pincode" value={form.pincode} onChange={e=>sf('pincode',e.target.value)} />
          <FormInput label="Payment Terms" as="select" value={form.payment_terms} onChange={e=>sf('payment_terms',e.target.value)}>
            <option>Net 30</option><option>Net 15</option><option>Net 45</option><option>Advance</option>
          </FormInput>
        </div>
        <div style={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,padding:14,marginTop:8}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:form.create_portal_user?12:0}}>
            <input type="checkbox" checked={form.create_portal_user} onChange={e=>sf('create_portal_user',e.target.checked)} />
            <span style={{fontSize:13,color:'var(--text2)'}}>Create Vendor Portal Login</span>
          </label>
          {form.create_portal_user && <FormInput label="Portal Password" type="password" value={form.portal_password} onChange={e=>sf('portal_password',e.target.value)} placeholder="Min 8 characters" />}
        </div>
      </Modal>
    </div>
  );
}

// ── AWARDS PAGE ────────────────────────────────────────────
function AwardsPage() {
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { canApprove } = useAuth();

  const load = () => { setLoading(true); api.awardList().then(setAwards).catch(e=>toast(e.message,'error')).finally(()=>setLoading(false)); };
  useEffect(load,[]);

  const approve = async (id) => {
    const remarks = window.prompt('Approval remarks (optional):') ?? '';
    try { await api.awardApprove(id, remarks); toast('Award approved! PO generated and sent to vendor.'); load(); }
    catch(e) { toast(e.message,'error'); }
  };
  const reject = async (id) => {
    const remarks = window.prompt('Rejection reason:');
    if (!remarks) return;
    try { await api.awardReject(id, remarks); toast('Award rejected.'); load(); }
    catch(e) { toast(e.message,'error'); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Awards & PO Management</div><div className="page-sub">Finalize vendors, generate work orders</div></div>
        <div className="hactions"><button className="btn btn-ghost" onClick={()=>api.poList().then(d=>console.log(d))}>View POs</button></div>
      </div>
      <div className="grid-4 mb-16">
        {[['Awarded',awards.length,'blue'],['PO Generated',awards.filter(a=>a.status==='po_generated').length,'green'],['Pending Approval',awards.filter(a=>a.status==='pending_approval').length,'amber'],['Cancelled',awards.filter(a=>a.status==='cancelled').length,'red']].map(([l,v,c])=>(
          <div key={l} className={`metric-card mc-${c}`}><div className="metric-label">{l}</div><div className="metric-value" style={{color:`var(--${c}3)`}}>{v}</div></div>
        ))}
      </div>
      {loading ? <LoadingPage /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>RFQ #</th><th>Route</th><th>Vendor</th><th>Amount</th><th>Savings</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {awards.length===0 && <tr><td colSpan={8} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>No awards yet</td></tr>}
              {awards.map(a=>(
                <tr key={a.id}>
                  <td className="strong mono">{a.rfq_number}</td>
                  <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.dispatch_location_text} → {a.delivery_location_text}</td>
                  <td className="strong">{a.vendor_name}</td>
                  <td className="strong text-green mono">₹{Number(a.awarded_amount).toLocaleString('en-IN')}</td>
                  <td>{a.savings_pct ? <Badge type="green">{Number(a.savings_pct).toFixed(1)}%</Badge> : '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="mono text-sm">{new Date(a.awarded_at||a.created_at).toLocaleDateString('en-IN')}</td>
                  <td>
                    <div className="flex gap-8">
                      {a.status==='pending_approval' && canApprove() && <>
                        <button className="btn btn-success btn-xs" onClick={()=>approve(a.id)}>Approve</button>
                        <button className="btn btn-danger btn-xs" onClick={()=>reject(a.id)}>Reject</button>
                      </>}
                      {a.status==='po_generated' && <Badge type="teal">PO Ready</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── REPORTS PAGE ───────────────────────────────────────────
function ReportsPage() {
  const [tab, setTab] = useState('savings');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    Promise.all([api.savingsReport(), api.lanesReport(), api.vendorPerfReport(), api.budgetActual()])
      .then(([s,l,v,b]) => setData({savings:s,lanes:l,vendors:v,budget:b}))
      .catch(e=>toast(e.message,'error'))
      .finally(()=>setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">MIS Reports</div><div className="page-sub">Transportation cost intelligence</div></div>
        <div className="hactions">
          <button className="btn btn-ghost" onClick={()=>toast('Excel export will download shortly.')}>⬇ Excel</button>
          <button className="btn btn-ghost" onClick={()=>toast('PDF generating...')}>⬇ PDF</button>
        </div>
      </div>
      <div className="tabs">
        {[['savings','Savings Report'],['lanes','Lane Analysis'],['vendors','Vendor Performance'],['budget','Budget vs Actual']].map(([k,l])=>(
          <button key={k} className={`tab${tab===k?' active':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      {loading ? <LoadingPage /> : (
        <>
          {tab==='savings' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Year</th><th>Month</th><th>RFQs</th><th>Budget</th><th>Spend</th><th>Savings</th><th>Avg %</th></tr></thead>
                <tbody>
                  {(data.savings||[]).length===0 && <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>No data yet</td></tr>}
                  {(data.savings||[]).map((r,i)=>(
                    <tr key={i}>
                      <td>{r.year}</td>
                      <td>{new Date(2024,r.month-1).toLocaleString('en-IN',{month:'long'})}</td>
                      <td>{r.count}</td>
                      <td className="mono">₹{Number(r.budget||0).toLocaleString('en-IN')}</td>
                      <td className="mono">₹{Number(r.spend||0).toLocaleString('en-IN')}</td>
                      <td className="strong text-green mono">₹{Number(r.savings||0).toLocaleString('en-IN')}</td>
                      <td><Badge type="green">{Number(r.avg_pct||0).toFixed(1)}%</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab==='lanes' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Lane</th><th>RFQs</th><th>Avg Freight</th><th>Min</th><th>Max</th><th>Avg Savings%</th></tr></thead>
                <tbody>
                  {(data.lanes||[]).length===0 && <tr><td colSpan={6} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>No lane data yet</td></tr>}
                  {(data.lanes||[]).map((r,i)=>(
                    <tr key={i}>
                      <td className="strong">{r.lane}</td>
                      <td>{r.rfq_count}</td>
                      <td className="mono">₹{Number(r.avg_freight||0).toLocaleString('en-IN')}</td>
                      <td className="mono text-green">₹{Number(r.min_freight||0).toLocaleString('en-IN')}</td>
                      <td className="mono">₹{Number(r.max_freight||0).toLocaleString('en-IN')}</td>
                      <td><Badge type="green">{r.avg_savings_pct||0}%</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab==='vendors' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Vendor</th><th>Invited</th><th>Participated</th><th>Won</th><th>Win%</th><th>Avg Rank</th><th>Total Value</th></tr></thead>
                <tbody>
                  {(data.vendors||[]).length===0 && <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>No data yet</td></tr>}
                  {(data.vendors||[]).map((v,i)=>(
                    <tr key={i}>
                      <td className="strong">{v.vendor_name}</td>
                      <td>{v.rfqs_invited||0}</td>
                      <td>{v.rfqs_participated||0}</td>
                      <td className="text-green strong">{v.rfqs_won||0}</td>
                      <td>{v.win_rate_pct||0}%</td>
                      <td className="mono">{v.avg_rank||'—'}</td>
                      <td className="mono text-green">₹{Number(v.total_value||0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab==='budget' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>RFQ #</th><th>Route</th><th>Budget</th><th>Awarded</th><th>Savings</th><th>%</th><th>Vendor</th></tr></thead>
                <tbody>
                  {(data.budget||[]).length===0 && <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>No data yet</td></tr>}
                  {(data.budget||[]).map((r,i)=>(
                    <tr key={i}>
                      <td className="strong mono">{r.rfq_number}</td>
                      <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.dispatch_location_text} → {r.delivery_location_text}</td>
                      <td className="mono">₹{Number(r.target_budget||0).toLocaleString('en-IN')}</td>
                      <td className="mono text-green">₹{Number(r.awarded_amount||0).toLocaleString('en-IN')}</td>
                      <td className="mono text-green">₹{Number(r.savings_amount||0).toLocaleString('en-IN')}</td>
                      <td><Badge type="green">{Number(r.savings_pct||0).toFixed(1)}%</Badge></td>
                      <td>{r.vendor_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── USERS PAGE ─────────────────────────────────────────────
function UsersPage() {
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]     = useState({ full_name:'',email:'',password:'',role:'logistics_team',department:'',mobile:'' });
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = () => { setLoading(true); api.userList().then(setUsers).catch(e=>toast(e.message,'error')).finally(()=>setLoading(false)); };
  useEffect(load,[]);

  const save = async () => {
    if (!form.email||!form.password||!form.full_name) return toast('Name, email, password required','error');
    setSaving(true);
    try { await api.userCreate(form); toast('User created!'); setShowAdd(false); load(); }
    catch(e) { toast(e.message,'error'); }
    finally { setSaving(false); }
  };

  const ROLES = ['super_admin','procurement_manager','logistics_team','finance_team','vendor_user','management_viewer'];
  const roleColor = { super_admin:'red',procurement_manager:'purple',logistics_team:'blue',finance_team:'amber',vendor_user:'gray',management_viewer:'teal' };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">User Management</div><div className="page-sub">Roles, permissions, and access control</div></div>
        <div className="hactions"><button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Add User</button></div>
      </div>
      {loading ? <LoadingPage /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td className="strong">{u.full_name}</td>
                  <td className="mono text-sm">{u.email}</td>
                  <td><Badge type={roleColor[u.role]||'gray'}>{u.role?.replace(/_/g,' ')}</Badge></td>
                  <td>{u.department||'—'}</td>
                  <td className="mono text-sm">{u.last_login_at ? new Date(u.last_login_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}) : 'Never'}</td>
                  <td><Badge type={u.is_active?'green':'red'}>{u.is_active?'Active':'Inactive'}</Badge></td>
                  <td>
                    <button className="btn btn-ghost btn-xs" onClick={async()=>{
                      try { await api.userUpdate(u.id,{is_active:!u.is_active}); toast(`User ${u.is_active?'deactivated':'activated'}`); load(); }
                      catch(e) { toast(e.message,'error'); }
                    }}>{u.is_active?'Deactivate':'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add New User" maxWidth={520}
        footer={<><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>...</>:'Create User'}</button></>}>
        <FormInput label="Full Name *" value={form.full_name} onChange={e=>sf('full_name',e.target.value)} />
        <FormInput label="Email *" type="email" value={form.email} onChange={e=>sf('email',e.target.value)} />
        <FormInput label="Password *" type="password" value={form.password} onChange={e=>sf('password',e.target.value)} />
        <FormInput label="Role" as="select" value={form.role} onChange={e=>sf('role',e.target.value)}>
          {ROLES.map(r=><option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
        </FormInput>
        <FormInput label="Department" value={form.department} onChange={e=>sf('department',e.target.value)} />
        <FormInput label="Mobile" value={form.mobile} onChange={e=>sf('mobile',e.target.value)} />
      </Modal>
    </div>
  );
}

// ── VENDOR DASHBOARD ───────────────────────────────────────

// ── VENDOR BIDS PAGE ──────────────────────────────────────
function VendorBidsPage() {
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!user?.vendor_id) { setLoading(false); return; }
    // Fetch all RFQs the vendor has bid on
    api.rfqList({ limit: 100 })
      .then(async (d) => {
        // Get bids for each RFQ to find vendor's participation
        const rfqs = d.data || [];
        const results = [];
        for (const rfq of rfqs) {
          try {
            const bidRanking = await api.bidsForRFQ(rfq.id);
            const myBid = bidRanking.find(b => b.vendor_id === user.vendor_id);
            if (myBid) {
              results.push({ ...rfq, my_quote: myBid.quote_amount, my_rank: myBid.rank, my_revision: myBid.revision_number });
            }
          } catch(e) { /* skip */ }
        }
        setBids(results);
      })
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [user]);

  const statusColor = (s) => {
    const m = { open:'blue', bidding:'amber', bid_closed:'purple', awarded:'green', po_issued:'teal', cancelled:'gray' };
    return m[s] || 'gray';
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">My Bids</div><div className="page-sub">All RFQs you have participated in</div></div>
      </div>
      {loading ? <LoadingPage /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>RFQ #</th><th>Route</th><th>Vehicle</th><th>My Quote (₹)</th>
                <th>My Rank</th><th>Revisions</th><th>RFQ Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {bids.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>
                  You have not submitted any bids yet
                </td></tr>
              )}
              {bids.map(r => (
                <tr key={r.id}>
                  <td className="strong mono">{r.rfq_number}</td>
                  <td>{r.dispatch_location_text} → {r.delivery_location_text}</td>
                  <td>{r.vehicle_type_text || '—'}</td>
                  <td className="mono strong" style={{color:'var(--green3)'}}>₹{Number(r.my_quote).toLocaleString('en-IN')}</td>
                  <td>
                    {r.my_rank ? (
                      <span className={`badge ${r.my_rank === 1 ? 'b-green' : r.my_rank === 2 ? 'b-blue' : 'b-gray'}`}>
                        L{r.my_rank}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="mono">{r.my_revision || 1}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>
                    {['open','bidding'].includes(r.status) ? (
                      <button className="btn btn-primary btn-xs" onClick={() => nav('/vendor/bidding/' + r.id)}>
                        Revise Quote
                      </button>
                    ) : (
                      <span style={{fontSize:12,color:'var(--text3)'}}>Bidding closed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── VENDOR PO PAGE ─────────────────────────────────────────
function VendorPOPage() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [tracking, setTracking] = useState([]);
  const { user } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (!user?.vendor_id) { setLoading(false); return; }
    api.poList({ vendor_id: user.vendor_id, limit: 50 })
      .then(d => setPos(Array.isArray(d) ? d : (d.data || [])))
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [user]);

  const openPO = async (po) => {
    setSelected(po);
    try {
      const t = await api.poTracking(po.id);
      setTracking(t);
    } catch(e) { setTracking([]); }
  };

  const confirmDelivery = async (po) => {
    if (!window.confirm('Confirm shipment delivery?')) return;
    try {
      await api.poStatus(po.id, 'delivered', 'Confirmed by vendor');
      toast('Delivery confirmed!');
      const updated = await api.poList({ vendor_id: user.vendor_id, limit: 50 });
      setPos(Array.isArray(updated) ? updated : (updated.data || []));
      setSelected(null);
    } catch(e) { toast(e.message, 'error'); }
  };

  const poStatusSteps = ['approved','sent_to_vendor','confirmed','in_transit','delivered','closed'];

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">My Purchase Orders</div><div className="page-sub">POs issued to your company</div></div>
      </div>
      {loading ? <LoadingPage /> : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PO Number</th><th>RFQ #</th><th>Route</th>
                  <th>PO Amount (₹)</th><th>GST (₹)</th><th>Total (₹)</th>
                  <th>Status</th><th>Issued On</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pos.length === 0 && (
                  <tr><td colSpan={9} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>
                    No purchase orders issued yet
                  </td></tr>
                )}
                {pos.map(p => (
                  <tr key={p.id} style={{cursor:'pointer'}} onClick={() => openPO(p)}>
                    <td className="strong mono">{p.po_number}</td>
                    <td className="mono">{p.rfq_number}</td>
                    <td style={{fontSize:12}}>{p.dispatch_location_text} → {p.delivery_location_text}</td>
                    <td className="mono">₹{Number(p.po_amount).toLocaleString('en-IN')}</td>
                    <td className="mono" style={{color:'var(--text3)'}}>₹{Number(p.gst_amount).toLocaleString('en-IN')}</td>
                    <td className="mono strong" style={{color:'var(--blue3)'}}>₹{Number(p.total_amount).toLocaleString('en-IN')}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="mono text-sm">{p.issued_at ? new Date(p.issued_at).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); openPO(p); }}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Modal open={!!selected} onClose={() => setSelected(null)} title={`PO Details — ${selected?.po_number}`} maxWidth={640}
            footer={
              selected && ['confirmed','in_transit'].includes(selected.status) ? (
                <button className="btn btn-success" onClick={() => confirmDelivery(selected)}>
                  ✓ Confirm Delivery
                </button>
              ) : null
            }
          >
            {selected && (
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  {[
                    ['PO Number', selected.po_number],
                    ['RFQ Number', selected.rfq_number],
                    ['Route', `${selected.dispatch_location_text} → ${selected.delivery_location_text}`],
                    ['Material', selected.material_type || '—'],
                    ['Vehicle', selected.vehicle_type_text || '—'],
                    ['Weight', selected.weight_mt ? `${selected.weight_mt} MT` : '—'],
                    ['PO Amount', `₹${Number(selected.po_amount).toLocaleString('en-IN')}`],
                    ['GST (18%)', `₹${Number(selected.gst_amount).toLocaleString('en-IN')}`],
                    ['Total Amount', `₹${Number(selected.total_amount).toLocaleString('en-IN')}`],
                    ['Payment Terms', selected.payment_terms || '—'],
                    ['Status', selected.status],
                    ['Issued On', selected.issued_at ? new Date(selected.issued_at).toLocaleDateString('en-IN') : '—'],
                  ].map(([k,v]) => (
                    <div key={k} style={{background:'var(--bg3)',borderRadius:8,padding:'10px 14px'}}>
                      <div style={{fontSize:10.5,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.6,marginBottom:3}}>{k}</div>
                      <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{v}</div>
                    </div>
                  ))}
                </div>
                {/* Progress bar */}
                <div>
                  <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.6,marginBottom:8}}>Shipment Progress</div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {poStatusSteps.map((step, i) => {
                      const currentIdx = poStatusSteps.indexOf(selected.status);
                      const done = i <= currentIdx;
                      return (
                        <div key={step} style={{flex:1,minWidth:80,textAlign:'center',padding:'6px 4px',borderRadius:6,
                          background: done ? 'rgba(16,185,129,.15)' : 'var(--bg4)',
                          border: `1px solid ${done ? 'rgba(16,185,129,.3)' : 'var(--border2)'}`,
                          fontSize:10,color:done?'var(--green3)':'var(--text3)',fontFamily:'DM Mono,monospace'}}>
                          {step.replace(/_/g,' ')}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Tracking */}
                {tracking.length > 0 && (
                  <div>
                    <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.6,marginBottom:8}}>Tracking History</div>
                    {tracking.map((t, i) => (
                      <div key={i} style={{display:'flex',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:'var(--blue2)',marginTop:4,flexShrink:0}} />
                        <div style={{flex:1}}>
                          <div style={{fontWeight:500,color:'var(--text)'}}>{t.status?.replace(/_/g,' ')}</div>
                          {t.remarks && <div style={{color:'var(--text3)',fontSize:11}}>{t.remarks}</div>}
                        </div>
                        <div style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'var(--text3)'}}>
                          {new Date(t.tracked_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Modal>
        </>
      )}
    </div>
  );
}

function VendorDashboard() {
  const [rfqs, setRfqs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => {
    api.rfqList({ status:'bidding', limit:20 })
      .then(d => setRfqs(d.data))
      .catch(e => toast(e.message,'error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Bid Opportunities</div><div className="page-sub">Welcome, {user?.name} · {user?.vendor_code||'Vendor Portal'}</div></div>
      </div>
      {loading ? <LoadingPage /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>RFQ #</th><th>Route</th><th>Vehicle</th><th>Weight</th><th>Bid Closes</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {rfqs.length===0 && <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text3)'}}>No active bid opportunities right now</td></tr>}
              {rfqs.map(r=>(
                <tr key={r.id}>
                  <td className="strong mono">{r.rfq_number}</td>
                  <td>{r.dispatch_location_text} → {r.delivery_location_text}</td>
                  <td>{r.vehicle_type_text||'—'}</td>
                  <td>{r.weight_mt ? `${r.weight_mt} MT` : '—'}</td>
                  <td className="mono text-sm">{new Date(r.bid_close_time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><button className="btn btn-primary btn-xs" onClick={()=>nav('/vendor/bidding/'+r.id)}>Submit Quote</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ROOT APP ───────────────────────────────────────────────
function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPage />;

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/dashboard" replace />} />
      <Route path="/vendor/login" element={!user ? <LoginPage isVendor /> : <Navigate to="/vendor/dashboard" replace />} />
      {/* Internal routes */}
      <Route path="/dashboard" element={<Protected internalOnly><AppLayout><Dashboard /></AppLayout></Protected>} />
      <Route path="/rfq" element={<Protected internalOnly><AppLayout><RFQPage /></AppLayout></Protected>} />
      <Route path="/bidding" element={<Protected internalOnly><AppLayout><BiddingPage /></AppLayout></Protected>} />
      <Route path="/bidding/:id" element={<Protected internalOnly><AppLayout><BiddingPage /></AppLayout></Protected>} />
      <Route path="/vendors" element={<Protected internalOnly><AppLayout><VendorsPage /></AppLayout></Protected>} />
      <Route path="/awards" element={<Protected internalOnly><AppLayout><AwardsPage /></AppLayout></Protected>} />
      <Route path="/reports" element={<Protected internalOnly><AppLayout><ReportsPage /></AppLayout></Protected>} />
      <Route path="/users" element={<Protected internalOnly><AppLayout><UsersPage /></AppLayout></Protected>} />
      {/* Vendor portal routes */}
      <Route path="/vendor/dashboard" element={<Protected vendorOnly><AppLayout><VendorDashboard /></AppLayout></Protected>} />
      <Route path="/vendor/bids" element={<Protected vendorOnly><AppLayout><VendorBidsPage /></AppLayout></Protected>} />
      <Route path="/vendor/po" element={<Protected vendorOnly><AppLayout><VendorPOPage /></AppLayout></Protected>} />
      <Route path="/vendor/bidding/:id" element={<Protected vendorOnly><AppLayout><BiddingPage /></AppLayout></Protected>} />
      {/* Redirects */}
      <Route path="/" element={<Navigate to={user?.role==='vendor_user'?'/vendor/dashboard':'/dashboard'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
