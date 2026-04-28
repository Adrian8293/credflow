import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import {
  loadAll, upsertProvider, deleteProvider,
  upsertPayer, deletePayer,
  upsertEnrollment, deleteEnrollment,
  upsertDocument, deleteDocument,
  upsertTask, deleteTask, markTaskDone,
  fetchAuditLog, clearAuditLog as clearAuditLogDB,
  uploadProviderPhoto, deleteProviderPhoto,
  saveSettings as saveSettingsDB,
  subscribeToAll, addAudit,
  upsertEligibilityCheck, deleteEligibilityCheck,
  upsertClaim, deleteClaim,
  upsertDenial, deleteDenial,
  upsertPayment,
} from '../lib/db'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STAGES = ['Not Started','Application Submitted','Awaiting CAQH','Pending Verification','Additional Info Requested','Under Review','Approved – Awaiting Contract','Contracted – Pending Effective Date','Active','Denied']
const STAGE_COLOR = { 'Active':'b-green','Denied':'b-red','Not Started':'b-gray','Application Submitted':'b-blue','Awaiting CAQH':'b-amber','Pending Verification':'b-amber','Additional Info Requested':'b-red','Under Review':'b-blue','Approved – Awaiting Contract':'b-teal','Contracted – Pending Effective Date':'b-teal' }
const SPEC_COLORS = { 'Mental Health':'#3563c9','Massage Therapy':'#1a8a7a','Naturopathic':'#6d3fb5','Chiropractic':'#c97d1e','Acupuncture':'#b8292e' }
const PRIORITY_COLOR = { 'Urgent':'b-red','High':'b-amber','Medium':'b-blue','Low':'b-gray' }
const STATUS_COLOR = { 'Open':'b-red','In Progress':'b-blue','Waiting':'b-amber','Done':'b-green' }
const BADGE_CLASS = { 'b-green':'badge b-green','b-red':'badge b-red','b-amber':'badge b-amber','b-blue':'badge b-blue','b-teal':'badge b-teal','b-gray':'badge b-gray','b-purple':'badge b-purple','b-gold':'badge b-gold' }

// ─── RCM CONSTANTS ────────────────────────────────────────────────────────────
const DENIAL_CODES = [
  { code:'CO-4',   cat:'Coding',       desc:'Service inconsistent with modifier' },
  { code:'CO-11',  cat:'Coding',       desc:'Diagnosis inconsistent with procedure' },
  { code:'CO-16',  cat:'Information',  desc:'Claim lacks required information' },
  { code:'CO-22',  cat:'Coordination', desc:'Covered by another payer per COB' },
  { code:'CO-29',  cat:'Timely Filing',desc:'Claim exceeded timely filing limit' },
  { code:'CO-50',  cat:'Authorization',desc:'Non-covered service — not authorized' },
  { code:'CO-97',  cat:'Authorization',desc:'Payment included in another service' },
  { code:'CO-109', cat:'Eligibility',  desc:'Claim not covered by this payer' },
  { code:'PR-1',   cat:'Patient Resp', desc:'Deductible amount' },
  { code:'PR-2',   cat:'Patient Resp', desc:'Coinsurance amount' },
  { code:'PR-3',   cat:'Patient Resp', desc:'Co-payment amount' },
  { code:'OA-23',  cat:'Prior Payer',  desc:'Payment adjusted — prior payer' },
]

function getAgingBucket(submittedDate) {
  if (!submittedDate) return 'Unknown'
  const days = Math.floor((new Date() - new Date(submittedDate)) / 86400000)
  if (days <= 30)  return '0–30'
  if (days <= 60)  return '31–60'
  if (days <= 90)  return '61–90'
  if (days <= 120) return '91–120'
  return '120+'
}

const AGING_BUCKETS = ['0–30','31–60','61–90','91–120','120+']

function fmtMoney(n) {
  if (n == null || n === '') return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function daysUntil(d) { if(!d) return null; return Math.ceil((new Date(d) - new Date()) / 86400000) }
function fmtDate(d) { if(!d) return '—'; const [y,m,day]=d.split('-'); return `${m}/${day}/${y}` }
function fmtTS(ts) { const d=new Date(ts); return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) }
function initials(p) { return ((p.fname||'')[0]||'')+((p.lname||'')[0]||'') }
function pName(providers, id) { const p=providers.find(x=>x.id===id); return p?`${p.fname} ${p.lname}${p.cred?', '+p.cred:''}`:'—' }
function pNameShort(providers, id) { const p=providers.find(x=>x.id===id); return p?`${p.fname} ${p.lname}`:'—' }
function payName(payers, id) { const p=payers.find(x=>x.id===id); return p?p.name:'—' }

// ─── SAMPLE DATA ──────────────────────────────────────────────────────────────
const d = n => { const x=new Date(); x.setDate(x.getDate()+n); return x.toISOString().split('T')[0] }
const p = n => { const x=new Date(); x.setDate(x.getDate()-n); return x.toISOString().split('T')[0] }

const SAMPLE_PROVIDERS = [
  { fname:'Sarah', lname:'Chen', cred:'LCSW', spec:'Mental Health', status:'Active', email:'', phone:'(503)555-0101', focus:'Trauma, PTSD, EMDR, Anxiety', npi:'1234567890', caqh:'12345678', caqhAttest:p(120), caqhDue:d(45), medicaid:'OR1000001', ptan:'', license:'C12345', licenseExp:d(280), malCarrier:'HPSO', malPolicy:'HP-001', malExp:d(180), dea:'', deaExp:'', recred:d(310), supervisor:'', supExp:'', notes:'Bilingual Spanish/English.' },
  { fname:'Marcus', lname:'Rivera', cred:'LPC', spec:'Mental Health', status:'Active', email:'', phone:'(503)555-0102', focus:'Adolescents, Substance Use, CBT', npi:'2345678901', caqh:'23456789', caqhAttest:p(20), caqhDue:d(10), medicaid:'OR1000002', ptan:'', license:'C23456', licenseExp:d(60), malCarrier:'CPH&A', malPolicy:'CP-002', malExp:d(20), dea:'', deaExp:'', recred:d(370), supervisor:'', supExp:'', notes:'' },
  { fname:'Priya', lname:'Nair', cred:'Naturopathic Physician', spec:'Naturopathic', status:'Active', email:'', phone:'(503)555-0103', focus:'Integrative Medicine, Hormone Health, BioCharger', npi:'3456789012', caqh:'34567890', caqhAttest:p(90), caqhDue:d(90), medicaid:'', ptan:'', license:'ND45678', licenseExp:d(365), malCarrier:'HPSO', malPolicy:'HP-003', malExp:d(300), dea:'AB1234567', deaExp:d(400), recred:d(730), supervisor:'', supExp:'', notes:'BioCharger certified.' },
  { fname:'Elena', lname:'Vasquez', cred:'Licensed Psychologist', spec:'Mental Health', status:'Active', email:'', phone:'(503)555-0105', focus:'Neuropsychology, Assessment, Testing', npi:'5678901234', caqh:'56789012', caqhAttest:p(200), caqhDue:d(5), medicaid:'OR1000003', ptan:'PT12345', license:'PSY67890', licenseExp:d(18), malCarrier:'APA Insurance', malPolicy:'APA-005', malExp:d(-5), dea:'', deaExp:'', recred:d(30), supervisor:'', supExp:'', notes:'EPPP certified.' },
  { fname:'David', lname:'Park', cred:'Chiropractor', spec:'Chiropractic', status:'Active', email:'', phone:'(503)555-0106', focus:'Sports Injury, Spinal Manipulation, Rehab', npi:'6789012345', caqh:'67890123', caqhAttest:p(30), caqhDue:d(150), medicaid:'', ptan:'', license:'DC89012', licenseExp:d(410), malCarrier:'HPSO', malPolicy:'HP-006', malExp:d(390), dea:'', deaExp:'', recred:d(800), supervisor:'', supExp:'', notes:'' },
]

const SAMPLE_PAYERS = [
  { name:'Aetna', payerId:'60054', type:'Commercial', phone:'1-800-872-3862', email:'', portal:'https://www.aetna.com/health-care-professionals.html', timeline:'60–90 days', notes:'Submit via Availity. Requires CAQH.' },
  { name:'BCBS Oregon (Regence)', payerId:'00550', type:'Commercial', phone:'1-800-452-7278', email:'', portal:'https://www.regence.com/providers', timeline:'45–60 days', notes:'OHA participation typically required first.' },
  { name:'OHP / Medicaid (OHA)', payerId:'OROHP', type:'Medicaid', phone:'1-800-273-0557', email:'', portal:'https://www.oregon.gov/oha/hsd/ohp', timeline:'45–60 days', notes:'DMAP enrollment.' },
]


const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');

:root {
  --navy:#0d1b3d; --navy-deep:#081526; --navy-mid:#132240; --navy-light:#1a2f55;
  --navy-hover:#1e3666; --navy-active:#243e7a; --navy-border:rgba(255,255,255,0.08);
  --sidebar-text:rgba(255,255,255,0.55); --sidebar-active:#ffffff; --sidebar-accent:#10b981;
  --bg:#f0f2f7; --surface:#ffffff; --surface-2:#f7f9fc;
  --border:#e2e8f0; --border-2:#edf0f5;
  --ink:#0d1b3d; --ink-2:#2d3f5c; --ink-3:#5a6d8a; --ink-4:#9aa5b8;
  --primary:#2563eb; --primary-h:#1d55d4; --primary-l:#eff6ff; --accent:#10b981;
  --green:#10b981; --green-l:#ecfdf5; --green-b:#a7f3d0;
  --red:#dc2626; --red-l:#fef2f2; --red-b:#fecaca;
  --amber:#d97706; --amber-l:#fffbeb; --amber-b:#fed7aa;
  --blue:#2563eb; --blue-l:#eff6ff; --blue-b:#bfdbfe;
  --teal:#0891b2; --teal-l:#ecfeff; --teal-b:#a5f3fc;
  --purple:#7c3aed; --purple-l:#f5f3ff; --purple-b:#ddd6fe;
  --gold:#ca8a04; --gold-l:#fefce8; --gold-b:#fde68a;
  --r:6px; --r-md:10px; --r-lg:14px; --r-xl:20px;
  --shadow-sm:0 1px 3px rgba(13,27,61,.08),0 1px 2px rgba(13,27,61,.04);
  --shadow:0 4px 12px rgba(13,27,61,.08),0 2px 4px rgba(13,27,61,.04);
  --shadow-md:0 8px 24px rgba(13,27,61,.12);
  --shadow-lg:0 20px 60px rgba(13,27,61,.18);
  --t:0.16s cubic-bezier(.4,0,.2,1);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:14px;}
body{font-family:'Poppins',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;}
a{text-decoration:none;color:inherit;}

.app-root{display:flex;min-height:100vh;}

/* SIDEBAR */
.sidebar{width:220px;height:100vh;background:var(--navy);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;overflow:hidden;}
.sb-logo{padding:18px 16px 14px;border-bottom:1px solid var(--navy-border);flex-shrink:0;}
.sb-logo-mark{display:flex;align-items:center;gap:10px;}
.sb-logo-icon{width:34px;height:34px;background:var(--sidebar-accent);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;color:white;flex-shrink:0;box-shadow:0 4px 12px rgba(16,185,129,.35);}
.sb-logo h1{font-family:'Poppins',sans-serif;font-size:15px;font-weight:700;color:#fff;line-height:1.2;letter-spacing:-0.3px;}
.sb-logo h1 span{color:var(--sidebar-accent);}
.sb-nav{padding:8px 8px;flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;}
.sb-nav-groups{flex:1;overflow:hidden;}

/* Accordion groups */
.sb-group{margin-bottom:2px;}
.sb-group-header{display:flex;align-items:center;justify-content:space-between;padding:7px 10px 5px;cursor:pointer;border-radius:6px;transition:background var(--t);}
.sb-group-header:hover{background:var(--navy-hover);}
.sb-group-label{font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,0.35);}
.sb-group-arrow{font-size:9px;color:rgba(255,255,255,0.3);transition:transform var(--t);}
.sb-group.open .sb-group-arrow{transform:rotate(180deg);}
.sb-group-items{overflow:hidden;max-height:0;transition:max-height 0.22s ease;}
.sb-group.open .sb-group-items{max-height:400px;}

.sb-item{display:flex;align-items:center;gap:0;padding:7px 10px;border-radius:7px;cursor:pointer;color:var(--sidebar-text);font-size:12.5px;font-weight:400;transition:all var(--t);margin-bottom:1px;user-select:none;position:relative;}
.sb-item:hover{background:var(--navy-hover);color:rgba(255,255,255,0.85);}
.sb-item.active{background:var(--navy-active);color:var(--sidebar-active);font-weight:600;}
.sb-item.active::before{content:'';position:absolute;left:0;top:5px;bottom:5px;width:3px;background:var(--sidebar-accent);border-radius:0 3px 3px 0;}
.sb-badge{margin-left:auto;background:var(--red);color:white;font-size:9.5px;font-weight:700;border-radius:20px;padding:1px 6px;min-width:18px;text-align:center;line-height:1.7;}
.sb-badge.amber{background:var(--amber);}
.sb-footer{padding:10px 12px;border-top:1px solid var(--navy-border);flex-shrink:0;}
.sb-user{display:flex;align-items:center;gap:8px;}
.sb-avatar{width:28px;height:28px;border-radius:50%;background:var(--navy-active);border:2px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:11px;color:rgba(255,255,255,0.8);font-weight:600;flex-shrink:0;}
.sb-user-info{flex:1;min-width:0;}
.sb-user-email{font-size:10.5px;color:rgba(255,255,255,0.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sb-signout{background:none;border:none;color:rgba(255,255,255,0.3);font-size:10px;cursor:pointer;padding:0;margin-top:1px;font-family:inherit;transition:color var(--t);}
.sb-signout:hover{color:rgba(255,255,255,0.65);}

/* MAIN */
.main{margin-left:220px;flex:1;display:flex;flex-direction:column;min-height:100vh;}

/* TOPBAR */
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:0 28px;height:60px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:100;box-shadow:var(--shadow-sm);}
.topbar-left{flex:1;display:flex;align-items:center;gap:8px;}
.topbar-crumb{font-size:11px;color:var(--ink-4);font-weight:500;letter-spacing:0.3px;}
.topbar-sep{color:var(--border);font-size:16px;}
.topbar-title{font-family:'Poppins',sans-serif;font-size:20px;color:var(--ink);letter-spacing:-0.3px;}
.topbar-actions{display:flex;gap:8px;align-items:center;}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--r-md);font-family:'Poppins',sans-serif;font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;transition:all var(--t);white-space:nowrap;line-height:1;}
.btn:disabled{opacity:.55;cursor:not-allowed;}
.btn-primary{background:var(--primary);color:white;border-color:var(--primary);box-shadow:0 2px 8px rgba(26,110,245,.25);}
.btn-primary:hover:not(:disabled){background:var(--primary-h);}
.btn-secondary{background:var(--surface);color:var(--ink-2);border-color:var(--border);}
.btn-secondary:hover:not(:disabled){background:var(--surface-2);border-color:var(--ink-4);}
.btn-ghost{background:transparent;color:var(--ink-3);border-color:transparent;}
.btn-ghost:hover:not(:disabled){background:var(--surface-2);color:var(--ink);}
.btn-danger{background:var(--red-l);color:var(--red);border-color:var(--red-b);}
.btn-danger:hover:not(:disabled){background:#fee2e2;}
.btn-sm{padding:6px 12px;font-size:12px;border-radius:var(--r);}
.btn-green{background:var(--green-l);color:var(--green);border-color:var(--green-b);}
.btn-green:hover:not(:disabled){background:#dcfce7;}
.btn-navy{background:var(--navy);color:white;border-color:var(--navy);}
.btn-navy:hover:not(:disabled){background:var(--navy-mid);}

/* PAGES */
.pages{padding:24px 28px;}
.page{animation:pageIn .18s ease;}
@keyframes pageIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}

/* CARDS */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);overflow:hidden;}
.card-header{padding:16px 20px 14px;border-bottom:1px solid var(--border-2);display:flex;align-items:center;gap:10px;}
.card-header h3{font-family:'Poppins',sans-serif;font-size:16px;color:var(--ink);letter-spacing:-0.2px;flex:1;}
.ch-meta{font-size:12px;color:var(--ink-4);}
.card-body{padding:18px 20px;}

/* KPI */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:14px;margin-bottom:22px;}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:18px 20px 16px;box-shadow:var(--shadow-sm);position:relative;overflow:hidden;transition:box-shadow var(--t),transform var(--t);}
.kpi:hover{box-shadow:var(--shadow);transform:translateY(-1px);}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--kpi-color,var(--primary));}
.kpi-icon{width:36px;height:36px;border-radius:var(--r-md);background:var(--kpi-bg,var(--primary-l));display:flex;align-items:center;justify-content:center;font-size:16px;margin-bottom:12px;}
.kpi-label{font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:var(--ink-4);margin-bottom:6px;}
.kpi-value{font-family:'Poppins',sans-serif;font-size:36px;line-height:1;color:var(--ink);margin-bottom:4px;}
.kpi-sub{font-size:11.5px;color:var(--ink-4);}
.kpi.kpi-red{--kpi-color:var(--red);--kpi-bg:var(--red-l);}
.kpi.kpi-amber{--kpi-color:var(--amber);--kpi-bg:var(--amber-l);}
.kpi.kpi-blue{--kpi-color:var(--blue);--kpi-bg:var(--blue-l);}
.kpi.kpi-teal{--kpi-color:var(--teal);--kpi-bg:var(--teal-l);}
.kpi.kpi-purple{--kpi-color:var(--purple);--kpi-bg:var(--purple-l);}

/* TABLE */
.tbl-wrap{border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);}
table{width:100%;border-collapse:collapse;background:var(--surface);}
thead th{padding:11px 14px;text-align:left;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:var(--ink-3);background:var(--surface-2);border-bottom:1px solid var(--border);white-space:nowrap;user-select:none;cursor:pointer;transition:background var(--t);}
thead th:hover{background:#edf2f8;color:var(--ink-2);}
thead th.sort-asc::after{content:' ↑';color:var(--primary);}
thead th.sort-desc::after{content:' ↓';color:var(--primary);}
thead th.no-sort{cursor:default;}
thead th.no-sort:hover{background:var(--surface-2);color:var(--ink-3);}
tbody td{padding:12px 14px;border-bottom:1px solid var(--border-2);font-size:13px;vertical-align:middle;}
tbody tr:last-child td{border-bottom:none;}
tbody tr{transition:background var(--t);}
tbody tr:hover{background:#f8fafd;}

/* BADGES */
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:500;white-space:nowrap;line-height:1.5;}
.badge-dot::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.7;}
.b-green{background:var(--green-l);color:var(--green);border:1px solid var(--green-b);}
.b-red{background:var(--red-l);color:var(--red);border:1px solid var(--red-b);}
.b-amber{background:var(--amber-l);color:var(--amber);border:1px solid var(--amber-b);}
.b-blue{background:var(--blue-l);color:var(--blue);border:1px solid var(--blue-b);}
.b-teal{background:var(--teal-l);color:var(--teal);border:1px solid var(--teal-b);}
.b-purple{background:var(--purple-l);color:var(--purple);border:1px solid var(--purple-b);}
.b-gold{background:var(--gold-l);color:var(--gold);border:1px solid var(--gold-b);}
.b-gray{background:var(--surface-2);color:var(--ink-3);border:1px solid var(--border);}

/* TOOLBAR */
.toolbar{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;}
.search-box{position:relative;}
.search-box input{padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--r-md);font-family:'Poppins',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;width:240px;transition:border-color var(--t),box-shadow var(--t);}
.search-box input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(26,110,245,.12);}
.search-box .si{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--ink-4);font-size:14px;pointer-events:none;}
.filter-select{padding:7px 12px;border:1px solid var(--border);border-radius:var(--r-md);font-family:'Poppins',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;cursor:pointer;transition:border-color var(--t);}
.filter-select:focus{border-color:var(--primary);}
.toolbar-right{margin-left:auto;display:flex;gap:8px;}

/* FORMS */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.form-grid .full{grid-column:1/-1;}
.fg{display:flex;flex-direction:column;gap:5px;}
.fg label{font-size:12px;font-weight:600;color:var(--ink-3);}
.fg input,.fg select,.fg textarea{padding:8px 11px;border:1px solid var(--border);border-radius:var(--r);font-family:'Poppins',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color var(--t),box-shadow var(--t);}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(26,110,245,.12);}
.fg textarea{resize:vertical;min-height:72px;line-height:1.5;}
.field-note{font-size:11px;color:var(--ink-4);margin-top:2px;}
.section-divider{font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--primary);background:var(--primary-l);border:1px solid #c3d9fd;border-radius:var(--r);padding:5px 10px;grid-column:1/-1;margin-top:6px;}

/* MODAL */
.overlay{display:none;position:fixed;inset:0;background:rgba(9,22,48,.5);backdrop-filter:blur(6px);z-index:500;align-items:center;justify-content:center;padding:24px;}
.overlay.open{display:flex;}
.modal{background:var(--surface);border-radius:var(--r-xl);box-shadow:var(--shadow-lg);width:100%;max-width:620px;max-height:90vh;overflow-y:auto;animation:modalIn .2s ease;}
.modal-lg{max-width:780px;}
@keyframes modalIn{from{opacity:0;transform:scale(.96) translateY(12px);}to{opacity:1;transform:none;}}
.modal-header{padding:22px 24px 16px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:12px;position:sticky;top:0;background:var(--surface);z-index:2;border-radius:var(--r-xl) var(--r-xl) 0 0;}
.modal-header h3{font-family:'Poppins',sans-serif;font-size:20px;flex:1;letter-spacing:-0.3px;}
.mh-sub{font-size:12px;color:var(--ink-4);margin-top:2px;}
.modal-close{background:var(--surface-2);border:1px solid var(--border);font-size:14px;cursor:pointer;color:var(--ink-3);border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all var(--t);}
.modal-close:hover{background:var(--red-l);border-color:var(--red-b);color:var(--red);}
.modal-body{padding:20px 24px;}
.modal-footer{padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:var(--surface);border-radius:0 0 var(--r-xl) var(--r-xl);}

/* TABS */
.tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:18px;}
.tab{padding:10px 16px;cursor:pointer;font-size:13px;font-weight:500;color:var(--ink-4);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all var(--t);white-space:nowrap;}
.tab:hover{color:var(--ink);background:var(--surface-2);}
.tab.active{color:var(--primary);border-bottom-color:var(--primary);}

/* PROVIDER CARDS */
.prov-card{display:grid;grid-template-columns:auto 1fr auto;align-items:start;gap:14px;padding:16px 20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);margin-bottom:10px;cursor:pointer;transition:all var(--t);box-shadow:var(--shadow-sm);}
.prov-card:hover{border-color:#93c5fd;box-shadow:var(--shadow);transform:translateY(-1px);}
.prov-avatar{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:17px;color:white;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,.15);}
.prov-name{font-size:14.5px;font-weight:600;color:var(--ink);margin-bottom:2px;}
.prov-title{font-size:12px;color:var(--ink-3);margin-bottom:8px;}
.prov-chips{display:flex;gap:5px;flex-wrap:wrap;}
.prov-actions{display:flex;flex-direction:column;gap:6px;align-items:flex-end;}

/* WORKFLOW STEPS */
.workflow-steps{display:flex;align-items:center;overflow-x:auto;padding:4px 0;}
.ws{display:flex;flex-direction:column;align-items:center;flex-shrink:0;min-width:72px;position:relative;}
.ws:not(:last-child)::after{content:'';position:absolute;left:50%;top:14px;width:100%;height:2px;background:var(--border-2);z-index:0;}
.ws.done:not(:last-child)::after{background:var(--primary);}
.ws-dot{width:28px;height:28px;border-radius:50%;border:2px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--ink-4);z-index:1;position:relative;transition:all var(--t);}
.ws.done .ws-dot{background:var(--primary);border-color:var(--primary);color:white;}
.ws.active .ws-dot{border-color:var(--primary);color:var(--primary);box-shadow:0 0 0 4px rgba(26,110,245,.15);}
.ws-label{font-size:9.5px;color:var(--ink-4);margin-top:5px;text-align:center;max-width:68px;line-height:1.3;}
.ws.done .ws-label,.ws.active .ws-label{color:var(--primary);font-weight:600;}

/* ALERTS */
.alert-item{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:10px;margin-bottom:8px;font-size:13px;}
.alert-item.al-red{background:var(--red-l);border-left:3px solid var(--red);}
.alert-item.al-amber{background:var(--amber-l);border-left:3px solid var(--amber);}
.alert-item.al-blue{background:var(--blue-l);border-left:3px solid var(--blue);}
.al-icon{font-size:15px;flex-shrink:0;margin-top:1px;}
.al-body{flex:1;}
.al-title{font-weight:600;color:var(--ink);margin-bottom:2px;}
.al-sub{color:var(--ink-3);font-size:11.5px;}

/* MISC */
.stat-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border-2);font-size:13px;}
.stat-row:last-child{border-bottom:none;}
.stat-row-label{color:var(--ink-3);}
.stat-row-value{font-weight:600;color:var(--ink);}
.donut-wrap{display:flex;align-items:center;gap:24px;}
.donut-legend{flex:1;}
.donut-legend-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;}
.donut-legend-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;}
.npi-result-box{border-radius:10px;padding:12px 14px;margin-top:8px;}
.nr-name{font-weight:600;font-size:14px;color:var(--ink);}
.nr-detail{font-size:12px;color:var(--ink-3);margin-top:3px;}
.report-card{padding:16px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border);margin-bottom:10px;cursor:pointer;transition:all var(--t);}
.report-card:hover{background:var(--primary-l);border-color:#c3d9fd;}
.report-card h4{font-size:13.5px;font-weight:600;color:var(--ink);margin-bottom:3px;}
.report-card p{font-size:12px;color:var(--ink-4);}
.audit-entry{display:flex;gap:12px;padding:11px 0;border-bottom:1px solid var(--border-2);font-size:12.5px;}
.audit-entry:last-child{border-bottom:none;}
.audit-dot{width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:5px;}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
.mb-12{margin-bottom:12px;}.mb-16{margin-bottom:16px;}.mb-20{margin-bottom:20px;}.mt-12{margin-top:12px;}
.text-muted{color:var(--ink-4);font-size:12px;}
.text-sm{font-size:12.5px;}.text-xs{font-size:11.5px;}.font-500{font-weight:500;}
.info-chip{display:inline-flex;align-items:center;gap:4px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11.5px;color:var(--ink-3);}
.empty-state{text-align:center;padding:52px 20px;color:var(--ink-4);}
.ei{font-size:38px;margin-bottom:12px;opacity:.6;}
.empty-state h4{font-size:15px;color:var(--ink-3);margin-bottom:6px;font-weight:600;}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;}
.spinner-lg{display:inline-block;width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
.loading-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px;}
.loading-screen p{color:var(--ink-4);font-size:13px;}
.toast-wrap{position:fixed;bottom:22px;right:22px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;}
.toast{background:var(--navy);color:white;padding:12px 16px;border-radius:12px;font-size:13px;box-shadow:var(--shadow-lg);animation:toastIn .2s ease;display:flex;align-items:center;gap:10px;min-width:240px;pointer-events:auto;}
@keyframes toastIn{from{opacity:0;transform:translateY(8px) scale(.97);}to{opacity:1;transform:none;}}
.toast-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}
.t-success .toast-icon{background:var(--green);}
.t-error .toast-icon{background:var(--red);}
.t-warn .toast-icon{background:var(--amber);}
.t-info .toast-icon{background:var(--blue);}
.sort-pill-row{display:flex;gap:5px;align-items:center;margin-left:6px;}
.sort-pill{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--ink-3);transition:all var(--t);}
.sort-pill:hover{border-color:var(--primary);color:var(--primary);}
.sort-pill.active{background:var(--primary);border-color:var(--primary);color:white;}

/* GLOBAL SEARCH */
.gsearch-overlay{position:fixed;inset:0;background:rgba(9,22,48,.55);backdrop-filter:blur(8px);z-index:800;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;animation:fadeIn .15s ease;}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
.gsearch-box{background:var(--surface);border-radius:var(--r-xl);box-shadow:var(--shadow-lg);width:100%;max-width:620px;overflow:hidden;animation:slideDown .18s ease;}
@keyframes slideDown{from{opacity:0;transform:translateY(-12px);}to{opacity:1;transform:none;}}
.gsearch-input-wrap{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border);}
.gsearch-icon{font-size:18px;color:var(--ink-4);flex-shrink:0;}
.gsearch-input{flex:1;border:none;outline:none;font-family:'Poppins',sans-serif;font-size:16px;color:var(--ink);background:transparent;}
.gsearch-input::placeholder{color:var(--ink-4);}
.gsearch-kbd{background:var(--surface-2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;font-size:11px;color:var(--ink-4);font-family:'Poppins',sans-serif;white-space:nowrap;}
.gsearch-results{max-height:440px;overflow-y:auto;}
.gsearch-section{padding:8px 0 4px;}
.gsearch-section-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink-4);padding:4px 20px 6px;}
.gsearch-item{display:flex;align-items:center;gap:12px;padding:10px 20px;cursor:pointer;transition:background var(--t);}
.gsearch-item:hover,.gsearch-item.focused{background:var(--primary-l);}
.gsearch-item-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.gsearch-item-main{flex:1;min-width:0;}
.gsearch-item-title{font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gsearch-item-sub{font-size:11.5px;color:var(--ink-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gsearch-item-tag{flex-shrink:0;}
.gsearch-empty{text-align:center;padding:36px 20px;color:var(--ink-4);font-size:13px;}
.gsearch-footer{padding:10px 20px;border-top:1px solid var(--border);display:flex;gap:16px;align-items:center;}
.gsearch-hint{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-4);}
.topbar-search-btn{display:flex;align-items:center;gap:8px;padding:7px 14px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);cursor:pointer;color:var(--ink-4);font-size:12.5px;font-family:'Poppins',sans-serif;transition:all var(--t);min-width:200px;}
.topbar-search-btn:hover{border-color:var(--primary);color:var(--ink);}
.topbar-search-btn span{flex:1;}
.progress-bar{height:8px;background:var(--border-2);border-radius:4px;overflow:hidden;}

/* PROVIDER PHOTO */
.photo-upload-wrap{display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:16px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-lg);}
.photo-preview{width:72px;height:72px;border-radius:14px;object-fit:cover;border:2px solid var(--border);flex-shrink:0;background:var(--primary-l);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:26px;color:var(--primary);overflow:hidden;}
.photo-preview img{width:100%;height:100%;object-fit:cover;}
.photo-actions{flex:1;}
.photo-label{font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px;}
.photo-sub{font-size:11.5px;color:var(--ink-4);margin-bottom:10px;}
.photo-btns{display:flex;gap:8px;flex-wrap:wrap;}
.photo-upload-input{display:none;}
.photo-uploading{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-3);}

/* PSYCHOLOGY TODAY */
.pt-status-bar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:var(--r-md);margin-bottom:12px;}
.pt-status-bar.pt-active{background:#e8f5e9;border:1px solid #a5d6a7;}
.pt-status-bar.pt-none{background:var(--surface-2);border:1px solid var(--border);}
.pt-status-bar.pt-inactive{background:var(--amber-l);border:1px solid var(--amber-b);}
.pt-icon{font-size:20px;flex-shrink:0;}
.pt-body{flex:1;}
.pt-title{font-size:13px;font-weight:600;color:var(--ink);}
.pt-sub{font-size:11.5px;color:var(--ink-3);}
.pt-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 18px;margin-bottom:10px;display:flex;align-items:center;gap:12px;transition:all var(--t);}
.pt-card:hover{border-color:#93c5fd;box-shadow:var(--shadow);}
.pt-card-avatar{width:46px;height:46px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--primary-l);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:16px;color:var(--primary);overflow:hidden;}
.pt-card-avatar img{width:100%;height:100%;object-fit:cover;}
.pt-missing{background:var(--amber-l);border:1px dashed var(--amber-b);}


/* PROVIDER LOOKUP */
.lookup-result-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 20px;margin-bottom:10px;display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start;box-shadow:var(--shadow-sm);transition:all var(--t);}
.lookup-result-card:hover{border-color:#93c5fd;box-shadow:var(--shadow);}
.lookup-avatar{width:44px;height:44px;border-radius:10px;background:var(--primary-l);border:1px solid var(--blue-b);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:17px;color:var(--primary);flex-shrink:0;}
.lookup-name{font-size:14.5px;font-weight:700;color:var(--ink);margin-bottom:3px;}
.lookup-meta{font-size:12px;color:var(--ink-3);margin-bottom:6px;}
.lookup-chips{display:flex;gap:5px;flex-wrap:wrap;}
.lookup-actions{display:flex;flex-direction:column;gap:6px;align-items:flex-end;}
.lookup-count{font-size:12px;color:var(--ink-4);margin-bottom:12px;font-style:italic;}
.verif-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px;margin-bottom:12px;display:flex;align-items:flex-start;gap:16px;box-shadow:var(--shadow-sm);}
.verif-icon{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
.verif-body{flex:1;}
.verif-title{font-size:14px;font-weight:700;color:var(--ink);margin-bottom:4px;}
.verif-desc{font-size:12.5px;color:var(--ink-3);margin-bottom:10px;line-height:1.5;}
.verif-note{font-size:11.5px;color:var(--ink-4);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);padding:6px 10px;margin-top:8px;}
.lookup-tabs{display:flex;gap:2px;margin-bottom:20px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-lg);padding:4px;}
.lookup-tab{flex:1;padding:8px 12px;border-radius:var(--r-md);cursor:pointer;font-size:13px;font-weight:500;color:var(--ink-4);text-align:center;transition:all var(--t);}
.lookup-tab:hover{color:var(--ink);}
.lookup-tab.active{background:var(--surface);color:var(--primary);box-shadow:var(--shadow-sm);border:1px solid var(--border);}
.import-preview{background:var(--primary-l);border:1px solid #c3d9fd;border-radius:var(--r-lg);padding:16px 18px;margin-top:10px;}
.import-preview-title{font-size:12px;font-weight:700;color:var(--primary);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;}
.import-row{display:flex;gap:8px;font-size:12.5px;padding:4px 0;border-bottom:1px solid #d0e6fc;}
.import-row:last-child{border-bottom:none;}
.import-label{color:var(--ink-4);width:130px;flex-shrink:0;}
.import-val{color:var(--ink);font-weight:500;}
.progress-fill{height:100%;border-radius:4px;transition:width .4s ease;}
@media(max-width:900px){.sidebar{width:180px;}.main{margin-left:180px;}.kpi-grid{grid-template-columns:repeat(2,1fr);}.form-grid,.grid-2,.grid-3{grid-template-columns:1fr;}.form-grid .full{grid-column:1;}}
`



// ─── SORT HOOK ────────────────────────────────────────────────────────────────
function useSorted(items, defaultKey, defaultDir='asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)
  function toggleSort(key) {
    if (sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sorted = [...(items||[])].sort((a,b)=>{
    const av=a[sortKey]??'', bv=b[sortKey]??''
    const cmp = typeof av==='number'&&typeof bv==='number' ? av-bv : String(av).localeCompare(String(bv),undefined,{numeric:true})
    return sortDir==='asc'?cmp:-cmp
  })
  function thProps(key, label, noSort=false) {
    if(noSort) return {className:'no-sort',children:label}
    return {onClick:()=>toggleSort(key),className:sortKey===key?`sort-${sortDir}`:'',children:label,style:{cursor:'pointer'}}
  }
  return {sorted,sortKey,sortDir,toggleSort,thProps}
}


export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [db, setDb] = useState({ providers:[], payers:[], enrollments:[], documents:[], tasks:[], auditLog:[], settings:{} })
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])
  const [modal, setModal] = useState(null) // null | 'enroll' | 'payer' | 'doc' | 'task' | 'provDetail'
  const [editingId, setEditingId] = useState({})
  const [provDetailId, setProvDetailId] = useState(null)
  const [provDetailTab, setProvDetailTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)

  // Form states
  const [provForm, setProvForm] = useState({})
  const [enrollForm, setEnrollForm] = useState({})
  const [payerForm, setPayerForm] = useState({})
  const [docForm, setDocForm] = useState({})
  const [taskForm, setTaskForm] = useState({})
  const [settingsForm, setSettingsForm] = useState({})

  // Filter/search states
  const [provSearch, setProvSearch] = useState(''); const [provFStatus, setProvFStatus] = useState(''); const [provFSpec, setProvFSpec] = useState('')
  const [enrSearch, setEnrSearch] = useState(''); const [enrFStage, setEnrFStage] = useState(''); const [enrFProv, setEnrFProv] = useState('')
  const [paySearch, setPaySearch] = useState(''); const [payFType, setPayFType] = useState('')
  const [docSearch, setDocSearch] = useState(''); const [docFType, setDocFType] = useState(''); const [docFStatus, setDocFStatus] = useState('')
  const [wfSearch, setWfSearch] = useState(''); const [wfFPriority, setWfFPriority] = useState(''); const [wfFStatus, setWfFStatus] = useState('')
  const [auditSearch, setAuditSearch] = useState(''); const [auditFType, setAuditFType] = useState('')
  const [npiInput, setNpiInput] = useState(''); const [npiResult, setNpiResult] = useState(null); const [npiLoading, setNpiLoading] = useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)

  // ─── AUTH ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ─── GLOBAL SEARCH SHORTCUT
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setGlobalSearchOpen(o => !o)
      }
      if (e.key === 'Escape') setGlobalSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ─── LOAD DATA ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    setLoading(true)
    loadAll().then(data => {
      setDb(data)
      setSettingsForm(data.settings)
      setLoading(false)
    }).catch(err => {
      toast('Error loading data: ' + err.message, 'error')
      setLoading(false)
    })
  }, [user])

  // ─── REALTIME ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const unsub = subscribeToAll(() => {
      loadAll().then(data => setDb(data))
    })
    return unsub
  }, [user])

  // ─── TOAST ───────────────────────────────────────────────────────────────────
  function toast(msg, type='success') {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3400)
  }

  // ─── SIGN OUT ─────────────────────────────────────────────────────────────────
  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // ─── AUTH GUARD ───────────────────────────────────────────────────────────────
  if (authLoading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Poppins,sans-serif', color:'#5a6e5a' }}>Loading…</div>
  if (!user) {
    if (typeof window !== 'undefined') window.location.href = '/login'
    return null
  }

  // ─── COMPUTED ALERTS ──────────────────────────────────────────────────────────
  const alertDays = db.settings.alertDays || 90
  const alertCount = db.providers.reduce((n, prov) => {
    ['licenseExp','malExp','deaExp','caqhDue','recred'].forEach(f => { const d=daysUntil(prov[f]); if(d!==null && d<=alertDays) n++ })
    return n
  }, 0)
  const pendingEnroll = db.enrollments.filter(e => !['Active','Denied'].includes(e.stage)).length
  const expDocs = db.documents.filter(d => { const days=daysUntil(d.exp); return days!==null && days<=90 }).length

  // ─── SAVE PROVIDER ────────────────────────────────────────────────────────────
  async function handlePhotoUpload(file, providerId) {
    if (!providerId) { alert('Save the provider first before uploading a photo.'); return }
    setPhotoUploading(true)
    try {
      const url = await uploadProviderPhoto(providerId, file)
      setProvForm(f => ({ ...f, avatarUrl: url }))
      setDb(prev => ({
        ...prev,
        providers: prev.providers.map(p => p.id === providerId ? { ...p, avatarUrl: url } : p)
      }))
      toast('Photo uploaded!', 'success')
    } catch(err) { toast(err.message, 'error') }
    setPhotoUploading(false)
  }

  async function handleDeletePhoto(providerId) {
    if (!confirm('Remove this photo?')) return
    try {
      await deleteProviderPhoto(providerId)
      setProvForm(f => ({ ...f, avatarUrl: '' }))
      setDb(prev => ({
        ...prev,
        providers: prev.providers.map(p => p.id === providerId ? { ...p, avatarUrl: '' } : p)
      }))
      toast('Photo removed.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleSaveProvider() {
    if (!provForm.fname?.trim() || !provForm.lname?.trim()) { toast('First and last name required.', 'error'); return }
    setSaving(true)
    try {
      const saved = await upsertProvider({ ...provForm, id: editingId.provider || undefined })
      setDb(prev => {
        const list = editingId.provider ? prev.providers.map(x => x.id===saved.id ? saved : x) : [...prev.providers, saved]
        return { ...prev, providers: list }
      })
      toast(editingId.provider ? 'Provider updated!' : 'Provider saved!', 'success')
      setEditingId(e => ({ ...e, provider: null }))
      setProvForm({})
      setNpiResult(null)
      setNpiInput('')
      setPage('providers')
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteProvider(id) {
    if (!confirm('Delete this provider and all linked data?')) return
    setSaving(true)
    try {
      await deleteProvider(id)
      setDb(prev => ({
        ...prev,
        providers: prev.providers.filter(x => x.id !== id),
        enrollments: prev.enrollments.filter(e => e.provId !== id),
        documents: prev.documents.filter(d => d.provId !== id),
        tasks: prev.tasks.filter(t => t.provId !== id),
      }))
      toast('Provider deleted.', 'warn')
      setEditingId(e => ({ ...e, provider: null }))
      setPage('providers')
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  // ─── SAVE ENROLLMENT ──────────────────────────────────────────────────────────
  async function handleSaveEnrollment() {
    if (!enrollForm.provId || !enrollForm.payId) { toast('Provider and payer required.', 'error'); return }
    setSaving(true)
    try {
      const provN = pNameShort(db.providers, enrollForm.provId)
      const payN = payName(db.payers, enrollForm.payId)
      const saved = await upsertEnrollment({ ...enrollForm, id: editingId.enrollment || undefined }, provN, payN)
      setDb(prev => {
        const list = editingId.enrollment ? prev.enrollments.map(x => x.id===saved.id ? saved : x) : [...prev.enrollments, saved]
        return { ...prev, enrollments: list }
      })
      toast(editingId.enrollment ? 'Enrollment updated!' : 'Enrollment saved!', 'success')
      setModal(null)
      setEnrollForm({})
      setEditingId(e => ({ ...e, enrollment: null }))
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteEnrollment(id) {
    if (!confirm('Delete this enrollment?')) return
    try {
      await deleteEnrollment(id)
      setDb(prev => ({ ...prev, enrollments: prev.enrollments.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── SAVE PAYER ───────────────────────────────────────────────────────────────
  async function handleSavePayer() {
    if (!payerForm.name?.trim()) { toast('Payer name required.', 'error'); return }
    setSaving(true)
    try {
      const saved = await upsertPayer({ ...payerForm, id: editingId.payer || undefined })
      setDb(prev => {
        const list = editingId.payer ? prev.payers.map(x => x.id===saved.id ? saved : x) : [...prev.payers, saved]
        return { ...prev, payers: list }
      })
      toast(editingId.payer ? 'Payer updated!' : 'Payer saved!', 'success')
      setModal(null)
      setPayerForm({})
      setEditingId(e => ({ ...e, payer: null }))
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeletePayer(id) {
    if (!confirm('Delete this payer?')) return
    try {
      await deletePayer(id)
      setDb(prev => ({ ...prev, payers: prev.payers.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── SAVE DOCUMENT ────────────────────────────────────────────────────────────
  async function handleSaveDocument() {
    if (!docForm.provId || !docForm.exp) { toast('Provider and expiration date required.', 'error'); return }
    setSaving(true)
    try {
      const provN = pNameShort(db.providers, docForm.provId)
      const saved = await upsertDocument({ ...docForm, id: editingId.doc || undefined }, provN)
      setDb(prev => {
        const list = editingId.doc ? prev.documents.map(x => x.id===saved.id ? saved : x) : [...prev.documents, saved]
        return { ...prev, documents: list }
      })
      toast(editingId.doc ? 'Document updated!' : 'Document saved!', 'success')
      setModal(null)
      setDocForm({})
      setEditingId(e => ({ ...e, doc: null }))
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteDocument(id) {
    if (!confirm('Delete this document?')) return
    try {
      await deleteDocument(id)
      setDb(prev => ({ ...prev, documents: prev.documents.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── SAVE TASK ────────────────────────────────────────────────────────────────
  async function handleSaveTask() {
    if (!taskForm.task?.trim() || !taskForm.due) { toast('Task description and due date required.', 'error'); return }
    setSaving(true)
    try {
      const saved = await upsertTask({ ...taskForm, id: editingId.task || undefined })
      setDb(prev => {
        const list = editingId.task ? prev.tasks.map(x => x.id===saved.id ? saved : x) : [...prev.tasks, saved]
        return { ...prev, tasks: list }
      })
      toast(editingId.task ? 'Task updated!' : 'Task saved!', 'success')
      setModal(null)
      setTaskForm({})
      setEditingId(e => ({ ...e, task: null }))
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleMarkDone(id, taskName) {
    try {
      await markTaskDone(id, taskName)
      setDb(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id===id ? { ...t, status:'Done' } : t) }))
      toast('Task marked complete!', 'success')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleDeleteTask(id) {
    if (!confirm('Delete this task?')) return
    try {
      await deleteTask(id)
      setDb(prev => ({ ...prev, tasks: prev.tasks.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── SAVE SETTINGS ────────────────────────────────────────────────────────────
  async function handleSaveSettings() {
    try {
      await saveSettingsDB(settingsForm)
      setDb(prev => ({ ...prev, settings: settingsForm }))
      toast('Settings saved!', 'success')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── CLEAR AUDIT ──────────────────────────────────────────────────────────────
  async function handleClearAudit() {
    if (!confirm('Clear the audit log?')) return
    try {
      await clearAuditLogDB()
      setDb(prev => ({ ...prev, auditLog: [] }))
      toast('Audit log cleared.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── NPI LOOKUP ───────────────────────────────────────────────────────────────
  async function lookupNPI() {
    if (!/^\d{10}$/.test(npiInput)) { toast('Enter a valid 10-digit NPI.', 'error'); return }
    setNpiLoading(true)
    setNpiResult(null)
    try {
      const res = await fetch(`/api/npi?number=${npiInput}`)
      const data = await res.json()
      if (!data.results?.length) { setNpiResult({ error: 'No provider found for this NPI.' }); return }
      const r = data.results[0]
      const basic = r.basic || {}
      const isOrg = r.enumeration_type === 'NPI-2'
      const fname = isOrg ? '' : (basic.first_name || '')
      const lname = isOrg ? (basic.organization_name || '') : (basic.last_name || '')
      const cred = isOrg ? '' : (basic.credential || '').replace(/\./g, '').trim()
      const spec = r.taxonomies?.[0]?.desc || ''
      const loc = r.addresses?.[0]
      const addr = loc ? [loc.address_1, loc.city, loc.state, loc.postal_code].filter(Boolean).join(', ') : ''
      setNpiResult({ fname, lname, cred, spec, addr, npi: npiInput })
      setProvForm(f => ({ ...f, fname: fname||f.fname, lname: lname||f.lname, npi: npiInput }))
      await addAudit('Provider', 'NPI Lookup', `NPI ${npiInput} → ${fname} ${lname}`, '')
      toast('NPI data loaded!', 'success')
    } catch(e) { setNpiResult({ error: 'Could not reach NPI registry.' }) }
    setNpiLoading(false)
  }

  // ─── LOAD SAMPLE DATA ─────────────────────────────────────────────────────────
  async function loadSampleData() {
    if (!confirm('Load sample data? This will add sample providers and payers.')) return
    setSaving(true)
    try {
      for (const prov of SAMPLE_PROVIDERS) {
        await upsertProvider(prov)
      }
      const savedPayers = []
      for (const pay of SAMPLE_PAYERS) {
        const saved = await upsertPayer(pay)
        savedPayers.push(saved)
      }
      const freshData = await loadAll()
      setDb(freshData)
      setSettingsForm(freshData.settings)
      toast('Sample data loaded!', 'success')
    } catch(err) { toast('Error loading sample data: ' + err.message, 'error') }
    setSaving(false)
  }

  // ─── EXPORT ───────────────────────────────────────────────────────────────────
  function exportJSON() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `credentialiq-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    toast('Backup exported!', 'success')
  }

  // ─── OPEN MODALS ──────────────────────────────────────────────────────────────
  function openEnrollModal(id, preProvId) {
    setEditingId(e => ({ ...e, enrollment: id || null }))
    if (id) {
      const en = db.enrollments.find(x => x.id === id)
      if (en) setEnrollForm({ ...en })
    } else {
      setEnrollForm({ stage:'Not Started', eft:'Not Set Up', era:'Not Set Up', contract:'No', provId: preProvId||'', payId:'' })
    }
    setModal('enroll')
  }

  function openPayerModal(id) {
    setEditingId(e => ({ ...e, payer: id || null }))
    if (id) {
      const pay = db.payers.find(x => x.id === id)
      if (pay) setPayerForm({ ...pay })
    } else {
      setPayerForm({ type:'Commercial', timeline:'60–90 days' })
    }
    setModal('payer')
  }

  function openDocModal(id) {
    setEditingId(e => ({ ...e, doc: id || null }))
    if (id) {
      const doc = db.documents.find(x => x.id === id)
      if (doc) setDocForm({ ...doc })
    } else {
      setDocForm({ type:'License' })
    }
    setModal('doc')
  }

  function openTaskModal(id) {
    setEditingId(e => ({ ...e, task: id || null }))
    if (id) {
      const t = db.tasks.find(x => x.id === id)
      if (t) setTaskForm({ ...t })
    } else {
      setTaskForm({ priority:'Medium', status:'Open', cat:'Follow-up' })
    }
    setModal('task')
  }

  function openProvDetail(id) {
    setProvDetailId(id)
    setProvDetailTab('profile')
    setModal('provDetail')
  }

  function editProvider(id) {
    const prov = db.providers.find(x => x.id === id)
    if (!prov) return
    setEditingId(e => ({ ...e, provider: id }))
    setProvForm({ ...prov })
    setNpiInput(prov.npi || '')
    setNpiResult(null)
    setPage('add-provider')
    setModal(null)
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  const provDetail = provDetailId ? db.providers.find(x => x.id === provDetailId) : null

  return (
    <>
      <Head>
        <title>CredFlow — Credentialing. Simplified. Accelerated.</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
        <style>{CSS}</style>
      </Head>
      <div className="app-root">
        {/* ─── SIDEBAR ─── */}
        <Sidebar page={page} setPage={setPage} alertCount={alertCount} pendingEnroll={pendingEnroll} expDocs={expDocs} user={user} signOut={signOut} />

        {/* ─── MAIN ─── */}
        <div className="main">
          <Topbar page={page} setPage={setPage} openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} openDocModal={openDocModal} openTaskModal={openTaskModal} exportJSON={exportJSON} saving={saving} onOpenSearch={()=>setGlobalSearchOpen(true)} />

          {loading ? (
            <div className="loading-screen">
              <div className="spinner-lg"></div>
              <div style={{ marginTop:16, color:'#5a6e5a' }}>Loading your data…</div>
            </div>
          ) : (
            <div className="pages">
              {page === 'dashboard' && <Dashboard db={db} setPage={setPage} openEnrollModal={openEnrollModal} />}
              {page === 'alerts' && <Alerts db={db} />}
              {page === 'providers' && <Providers db={db} search={provSearch} setSearch={setProvSearch} fStatus={provFStatus} setFStatus={setProvFStatus} fSpec={provFSpec} setFSpec={setProvFSpec} openProvDetail={openProvDetail} editProvider={editProvider} setPage={setPage} setProvForm={setProvForm} setEditingId={setEditingId} setNpiInput={setNpiInput} setNpiResult={setNpiResult} />}
              {page === 'provider-lookup' && <ProviderLookup db={db} setPage={setPage} setProvForm={setProvForm} setEditingId={setEditingId} setNpiInput={setNpiInput} setNpiResult={setNpiResult} />}
              {page === 'add-provider' && <AddProvider db={db} provForm={provForm} setProvForm={setProvForm} editingId={editingId} setEditingId={setEditingId} npiInput={npiInput} setNpiInput={setNpiInput} npiResult={npiResult} setNpiResult={setNpiResult} npiLoading={npiLoading} lookupNPI={lookupNPI} handleSaveProvider={handleSaveProvider} handleDeleteProvider={handleDeleteProvider} handlePhotoUpload={handlePhotoUpload} handleDeletePhoto={handleDeletePhoto} photoUploading={photoUploading} setPage={setPage} saving={saving} />}
              {page === 'enrollments' && <Enrollments db={db} search={enrSearch} setSearch={setEnrSearch} fStage={enrFStage} setFStage={setEnrFStage} fProv={enrFProv} setFProv={setEnrFProv} openEnrollModal={openEnrollModal} handleDeleteEnrollment={handleDeleteEnrollment} />}
              {page === 'payers' && <Payers db={db} search={paySearch} setSearch={setPaySearch} fType={payFType} setFType={setPayFType} openPayerModal={openPayerModal} handleDeletePayer={handleDeletePayer} />}
              {page === 'documents' && <Documents db={db} search={docSearch} setSearch={setDocSearch} fType={docFType} setFType={setDocFType} fStatus={docFStatus} setFStatus={setDocFStatus} openDocModal={openDocModal} handleDeleteDocument={handleDeleteDocument} />}
              {page === 'workflows' && <Workflows db={db} search={wfSearch} setSearch={setWfSearch} fPriority={wfFPriority} setFPriority={setWfFPriority} fStatus={wfFStatus} setFStatus={setWfFStatus} openTaskModal={openTaskModal} handleMarkDone={handleMarkDone} handleDeleteTask={handleDeleteTask} />}
              {page === 'reports' && <Reports db={db} exportJSON={exportJSON} />}
              {page === 'audit' && <Audit db={db} search={auditSearch} setSearch={setAuditSearch} fType={auditFType} setFType={setAuditFType} handleClearAudit={handleClearAudit} />}
              {page === 'psychology-today' && <PsychologyToday db={db} setPage={setPage} editProvider={editProvider} />}
              {page === 'eligibility' && <EligibilityPage db={db} toast={toast} />}
              {page === 'claims' && <ClaimsPage db={db} toast={toast} />}
              {page === 'denials' && <DenialLog db={db} toast={toast} />}
              {page === 'revenue' && <RevenueAnalytics db={db} />}
              {page === 'settings' && <Settings settingsForm={settingsForm} setSettingsForm={setSettingsForm} handleSaveSettings={handleSaveSettings} exportJSON={exportJSON} />}
            </div>
          )}
        </div>

        {/* ─── MODALS ─── */}
        {modal === 'enroll' && <EnrollModal db={db} enrollForm={enrollForm} setEnrollForm={setEnrollForm} editingId={editingId} handleSaveEnrollment={handleSaveEnrollment} onClose={()=>{setModal(null);setEnrollForm({});setEditingId(e=>({...e,enrollment:null}))}} saving={saving} />}
        {modal === 'payer' && <PayerModal payerForm={payerForm} setPayerForm={setPayerForm} editingId={editingId} handleSavePayer={handleSavePayer} onClose={()=>{setModal(null);setPayerForm({});setEditingId(e=>({...e,payer:null}))}} saving={saving} />}
        {modal === 'doc' && <DocModal db={db} docForm={docForm} setDocForm={setDocForm} editingId={editingId} handleSaveDocument={handleSaveDocument} onClose={()=>{setModal(null);setDocForm({});setEditingId(e=>({...e,doc:null}))}} saving={saving} />}
        {modal === 'task' && <TaskModal db={db} taskForm={taskForm} setTaskForm={setTaskForm} editingId={editingId} handleSaveTask={handleSaveTask} onClose={()=>{setModal(null);setTaskForm({});setEditingId(e=>({...e,task:null}))}} saving={saving} />}
        {modal === 'provDetail' && provDetail && <ProvDetailModal prov={provDetail} db={db} tab={provDetailTab} setTab={setProvDetailTab} onClose={()=>setModal(null)} editProvider={editProvider} openEnrollModal={openEnrollModal} />}

        {/* ─── TOASTS ─── */}
        {globalSearchOpen && <GlobalSearch db={db} onClose={()=>setGlobalSearchOpen(false)} setPage={setPage} openProvDetail={openProvDetail} openEnrollModal={openEnrollModal} />}

        <div className="toast-wrap">
          {toasts.map(t => (
            <div key={t.id} className={`toast t-${t.type}`}>
              <div className="toast-icon">{t.type==='success'?'✓':t.type==='error'?'✕':t.type==='warn'?'!':'i'}</div>
              {t.msg}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function Sidebar({ page, setPage, alertCount, pendingEnroll, expDocs, user, signOut }) {
  // Track which groups are open. Default: all open
  const [open, setOpen] = useState({ overview:true, providers:true, enrollments:true, compliance:true, rcm:true, analytics:false, system:false })
  const toggle = g => setOpen(o => ({ ...o, [g]: !o[g] }))

  const navItem = (pg, label, badge, badgeClass) => (
    <div className={`sb-item ${page===pg?'active':''}`} onClick={() => setPage(pg)}>
      <span>{label}</span>
      {badge > 0 && <span className={`sb-badge ${badgeClass||''}`}>{badge}</span>}
    </div>
  )

  const Group = ({ id, label, children }) => (
    <div className={`sb-group ${open[id]?'open':''}`}>
      <div className="sb-group-header" onClick={() => toggle(id)}>
        <span className="sb-group-label">{label}</span>
        <span className="sb-group-arrow">▼</span>
      </div>
      <div className="sb-group-items">{children}</div>
    </div>
  )

  const emailInitial = (user?.email||'U')[0].toUpperCase()
  return (
    <nav className="sidebar">
      <div className="sb-logo">
        <div className="sb-logo-mark">
          <div className="sb-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div><h1>Cred<span>Flow</span></h1></div>
        </div>
      </div>
      <div className="sb-nav">
        <div className="sb-nav-groups">
          <Group id="overview" label="Overview">
            {navItem('dashboard','Dashboard')}
            {navItem('alerts','Alerts', alertCount)}
          </Group>
          <Group id="providers" label="Providers">
            {navItem('providers','All Providers')}
            {navItem('add-provider','Add Provider')}
            {navItem('provider-lookup','Provider Lookup')}
          </Group>
          <Group id="enrollments" label="Enrollments">
            {navItem('enrollments','Payer Enrollments', pendingEnroll, 'amber')}
            {navItem('payers','Payer Directory')}
          </Group>
          <Group id="compliance" label="Compliance">
            {navItem('documents','Documents & Expiry', expDocs)}
            {navItem('workflows','Workflows & Tasks')}
            {navItem('psychology-today','Psychology Today')}
          </Group>
          <Group id="rcm" label="Revenue Cycle">
            {navItem('eligibility','Eligibility Checks')}
            {navItem('claims','Claims Tracker')}
            {navItem('denials','Denial Log')}
            {navItem('revenue','Revenue Analytics')}
          </Group>
          <Group id="analytics" label="Analytics">
            {navItem('reports','Reports')}
            {navItem('audit','Audit Trail')}
          </Group>
          <Group id="system" label="System">
            {navItem('settings','Settings')}
          </Group>
        </div>
      </div>
      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">{emailInitial}</div>
          <div className="sb-user-info">
            <div className="sb-user-email">{user?.email}</div>
            <button className="sb-signout" onClick={signOut}>Sign out →</button>
          </div>
        </div>
      </div>
    </nav>
  )
}

function Topbar({ page, setPage, openEnrollModal, openPayerModal, openDocModal, openTaskModal, exportJSON, saving, onOpenSearch }) {
  const titles = { dashboard:'Dashboard', alerts:'Alerts', providers:'All Providers', 'add-provider':'Add Provider', 'provider-lookup':'Provider Lookup', 'psychology-today':'Psychology Today', enrollments:'Payer Enrollments', payers:'Payer Directory', documents:'Documents & Expiry', workflows:'Workflows & Tasks', reports:'Reports & Analytics', audit:'Audit Trail', settings:'Settings', eligibility:'Eligibility Verification', claims:'Claims Tracker', denials:'Denial Log', revenue:'Revenue Analytics' }
  function topCTA() {
    if (page==='enrollments') openEnrollModal()
    else if (page==='payers') openPayerModal()
    else if (page==='documents') openDocModal()
    else if (page==='workflows') openTaskModal()
    else setPage('add-provider')
  }
  const ctaLabel = page==='enrollments'?'＋ New Enrollment':page==='payers'?'＋ Add Payer':page==='documents'?'＋ Add Document':page==='workflows'?'＋ New Task':['reports','audit','settings','eligibility','claims','denials','revenue'].includes(page)?null:'＋ Add Provider'
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-crumb">CredFlow</span>
        <span className="topbar-sep"> / </span>
        <span className="topbar-title">{titles[page]||page}</span>
        <button className="topbar-search-btn" onClick={onOpenSearch} style={{marginLeft:20}}>
          <span style={{fontSize:14,opacity:.6}}>🔍</span>
          <span>Search everything…</span>
          <span className="gsearch-kbd">⌘K</span>
        </button>
      </div>
      <div className="topbar-actions">
        <button className="btn btn-ghost btn-sm" onClick={exportJSON}>⬇ Export</button>

        {ctaLabel && <button className="btn btn-primary btn-sm" onClick={topCTA}>{ctaLabel}</button>}
      </div>
    </div>
  )
}

// ─── BADGE HELPERS ─────────────────────────────────────────────────────────────
function Badge({ cls, children }) { return <span className={`badge ${cls||'b-gray'}`}>{children}</span> }
function ExpiryBadge({ date }) {
  const days = daysUntil(date)
  if (days === null) return <Badge cls="b-gray">Not Set</Badge>
  if (days < 0) return <Badge cls="b-red">Expired {Math.abs(days)}d ago</Badge>
  if (days <= 30) return <Badge cls="b-red">{days}d left</Badge>
  if (days <= 90) return <Badge cls="b-amber">{days}d left</Badge>
  return <Badge cls="b-green">{days}d left</Badge>
}
function StageBadge({ stage }) { return <Badge cls={STAGE_COLOR[stage]||'b-gray'}>{stage}</Badge> }

// ─── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ db, setPage, openEnrollModal }) {
  const alertDays = db.settings.alertDays || 90
  const activeProvs = db.providers.filter(p => p.status==='Active').length
  const activeEnr = db.enrollments.filter(e => e.stage==='Active').length
  const pendingEnr = db.enrollments.filter(e => !['Active','Denied'].includes(e.stage)).length
  let expiring = 0
  db.providers.forEach(p => { ['licenseExp','malExp','caqhDue'].forEach(f => { const d=daysUntil(p[f]); if(d!==null && d<=alertDays) expiring++ }) })
  const openTasks = db.tasks.filter(t => t.status!=='Done').length
  const expDocs = db.documents.filter(d => { const days=daysUntil(d.exp); return days!==null && days<=90 }).length

  const alerts = []
  db.providers.forEach(p => {
    [{f:'licenseExp',l:'License'},{f:'malExp',l:'Malpractice'},{f:'deaExp',l:'DEA'},{f:'caqhDue',l:'CAQH Attestation'},{f:'recred',l:'Recredentialing'}].forEach(c => {
      const d = daysUntil(p[c.f]); if(d!==null && d<=90) alerts.push({ p, label:c.label, days:d, date:p[c.f] })
    })
  })
  alerts.sort((a,b) => a.days-b.days)

  const fu = db.enrollments.filter(e => e.followup && daysUntil(e.followup)!==null && daysUntil(e.followup)<=14).sort((a,b) => daysUntil(a.followup)-daysUntil(b.followup))

  const stages = {}
  db.enrollments.forEach(e => { stages[e.stage]=(stages[e.stage]||0)+1 })
  const colors = ['#1e6b3f','#2563a8','#c97d1e','#c5383a','#6d3fb5','#1a8a7a','#b8880d','#5a6e5a']
  const total = db.enrollments.length || 1
  let offset = 25; const r = 35; const circ = 2*Math.PI*r

  const specs = {}
  db.providers.filter(p => p.status==='Active').forEach(p => { specs[p.spec]=(specs[p.spec]||0)+1 })

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Active Providers</div><div className="kpi-value">{activeProvs}</div><div className="kpi-sub">{db.providers.length} total on file</div></div>
        <div className="kpi kpi-teal"><div className="kpi-label">Active Panels</div><div className="kpi-value">{activeEnr}</div><div className="kpi-sub">of {db.enrollments.length} total</div></div>
        <div className="kpi kpi-amber"><div className="kpi-label">Pending Enrollments</div><div className="kpi-value">{pendingEnr}</div><div className="kpi-sub">Awaiting approval</div></div>
        <div className="kpi kpi-red"><div className="kpi-label">Credentials Expiring</div><div className="kpi-value">{expiring}</div><div className="kpi-sub">Within {alertDays} days</div></div>
        <div className="kpi kpi-blue"><div className="kpi-label">Open Tasks</div><div className="kpi-value">{openTasks}</div><div className="kpi-sub">Pending & in progress</div></div>
        <div className="kpi kpi-purple"><div className="kpi-label">Docs Expiring</div><div className="kpi-value">{expDocs}</div><div className="kpi-sub">Within 90 days</div></div>
      </div>
      <div className="grid-2">
        <div>
          <div className="card mb-16">
            <div className="card-header"><h3>🚨 Active Alerts</h3></div>
            <div className="card-body" style={{ maxHeight:220, overflowY:'auto' }}>
              {alerts.length ? alerts.slice(0,6).map((a,i) => (
                <div key={i} className={`alert-item ${a.days<0?'al-red':a.days<=30?'al-red':'al-amber'}`}>
                  <div className="al-icon">{a.days<0?'❌':'⚠️'}</div>
                  <div className="al-body"><div className="al-title">{a.p.fname} {a.p.lname} — {a.label}</div><div className="al-sub">{fmtDate(a.date)} · {a.days<0?`Expired ${Math.abs(a.days)}d ago`:`${a.days}d remaining`}</div></div>
                </div>
              )) : <div className="empty-state" style={{ padding:20 }}><div className="ei">✅</div><p>No active alerts</p></div>}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>📅 Upcoming Follow-ups</h3></div>
            <div className="card-body" style={{ maxHeight:200, overflowY:'auto' }}>
              {fu.length ? fu.slice(0,5).map((e,i) => {
                const d = daysUntil(e.followup)
                return <div key={i} className={`alert-item ${d<=0?'al-red':d<=7?'al-amber':'al-blue'}`}>
                  <div className="al-icon">📌</div>
                  <div className="al-body"><div className="al-title">{pNameShort(db.providers,e.provId)} × {payName(db.payers,e.payId)}</div><div className="al-sub">Follow-up {d<=0?`overdue by ${Math.abs(d)}d`:`in ${d}d`} · {fmtDate(e.followup)}</div></div>
                </div>
              }) : <div className="text-muted" style={{ padding:'8px 0' }}>No upcoming follow-ups in 14 days.</div>}
            </div>
          </div>
        </div>
        <div>
          <div className="card mb-16">
            <div className="card-header"><h3>📊 Enrollment Pipeline</h3></div>
            <div className="card-body">
              <div className="donut-wrap">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  {Object.entries(stages).map(([s,n],i) => {
                    const pct = (n/total)*circ; const el = <circle key={s} cx="50" cy="50" r={r} fill="none" stroke={colors[i%colors.length]} strokeWidth="12" strokeDasharray={`${pct} ${circ-pct}`} strokeDashoffset={-offset} style={{ transform:'rotate(-90deg)', transformOrigin:'50% 50%' }} />; offset -= pct; return el
                  })}
                  <text x="50" y="54" textAnchor="middle" fontFamily="Instrument Serif,serif" fontSize="18" fill="#0f1a0f">{db.enrollments.length}</text>
                </svg>
                <div className="donut-legend">
                  {Object.entries(stages).map(([s,n],i) => <div key={s} className="donut-legend-item"><div className="donut-legend-dot" style={{ background:colors[i%colors.length] }}></div><span style={{ flex:1, fontSize:'11.5px' }}>{s}</span><span style={{ fontWeight:600, fontSize:'11.5px' }}>{n}</span></div>)}
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>👥 Providers by Specialty</h3></div>
            <div className="card-body">
              {Object.entries(specs).map(([s,n]) => (
                <div key={s} className="stat-row"><span className="stat-row-label"><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: SPEC_COLORS[s]||'#6b7f6b', marginRight:8 }}></span>{s}</span><span className="stat-row-value">{n}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ALERTS PAGE ───────────────────────────────────────────────────────────────
function Alerts({ db }) {
  const alertDays = db.settings.alertDays || 90
  const caqhDays = db.settings.caqhDays || 30
  const items = []
  db.providers.forEach(p => {
    [{f:'licenseExp',l:'License',th:alertDays},{f:'malExp',l:'Malpractice Insurance',th:alertDays},{f:'deaExp',l:'DEA Certificate',th:alertDays},{f:'caqhDue',l:'CAQH Attestation',th:caqhDays},{f:'recred',l:'Recredentialing',th:alertDays},{f:'supExp',l:'Supervision Agreement',th:alertDays}].forEach(c => {
      if (!p[c.f]) return; const d = daysUntil(p[c.f]); if(d!==null && d<=c.th) items.push({ p, label:c.label, days:d, date:p[c.f] })
    })
  })
  items.sort((a,b) => a.days-b.days)
  const urgent = items.filter(a => a.days<=0)
  const critical = items.filter(a => a.days>0 && a.days<=30)
  const warning = items.filter(a => a.days>30 && a.days<=60)
  const notice = items.filter(a => a.days>60)
  function Section({ title, list, cls }) {
    if (!list.length) return null
    return <div className="mb-20">
      <div className="text-xs font-500" style={{ letterSpacing:'.6px', textTransform:'uppercase', color:'var(--ink-4)', marginBottom:10 }}>{title} ({list.length})</div>
      {list.map((a,i) => <div key={i} className={`alert-item ${cls}`}>
        <div className="al-icon">{a.days<0?'❌':'⚠️'}</div>
        <div className="al-body"><div className="al-title">{a.p.fname} {a.p.lname}{a.p.cred?', '+a.p.cred:''} — {a.label}</div><div className="al-sub">{fmtDate(a.date)} · {a.days<0?`Expired ${Math.abs(a.days)} days ago`:`${a.days} days remaining`}</div></div>
      </div>)}
    </div>
  }
  return <div className="page">
    {items.length ? <>
      <Section title="🔴 Expired / Overdue" list={urgent} cls="al-red" />
      <Section title="🟠 Critical — ≤30 Days" list={critical} cls="al-red" />
      <Section title="🟡 Warning — 31–60 Days" list={warning} cls="al-amber" />
      <Section title="📅 Notice — 61–90 Days" list={notice} cls="al-blue" />
    </> : <div className="empty-state"><div className="ei">✅</div><h4>No Active Alerts</h4><p>All credentials are within acceptable thresholds.</p></div>}
  </div>
}

// ─── PROVIDERS PAGE ────────────────────────────────────────────────────────────
function Providers({ db, search, setSearch, fStatus, setFStatus, fSpec, setFSpec, openProvDetail, editProvider, setPage, setProvForm, setEditingId, setNpiInput, setNpiResult }) {
  const list = db.providers.filter(p => {
    const txt = `${p.fname} ${p.lname} ${p.cred} ${p.npi} ${p.focus} ${p.spec} ${p.email||''} ${p.phone||''} ${p.license||''} ${p.medicaid||''} ${p.caqh||''} ${p.dea||''} ${p.supervisor||''} ${p.notes||''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase())) && (!fStatus || (p.status||'').trim()===fStatus) && (!fSpec || (p.spec||'').trim().toLowerCase()===fSpec.toLowerCase())
  })
  return <div className="page">
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, NPI, license, specialty…" style={{width:280}} /></div>
      <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="">All Statuses</option><option>Active</option><option>Pending</option><option>Inactive</option></select>
      <select className="filter-select" value={fSpec} onChange={e=>setFSpec(e.target.value)}><option value="">All Specialties</option><option>Mental Health</option><option>Massage Therapy</option><option>Naturopathic</option><option>Chiropractic</option><option>Acupuncture</option></select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>{setProvForm({});setEditingId(e=>({...e,provider:null}));setNpiInput('');setNpiResult(null);setPage('add-provider')}}>＋ Add Provider</button></div>
    </div>
    {!list.length ? <div className="empty-state"><div className="ei">👤</div><h4>No providers found</h4></div> : list.map(p => {
      const licD=daysUntil(p.licenseExp); const malD=daysUntil(p.malExp); const caqhD=daysUntil(p.caqhDue)
      const urgent=(licD!==null&&licD<=30)||(malD!==null&&malD<=30)||(caqhD!==null&&caqhD<=30)
      const activeP=db.enrollments.filter(e=>e.provId===p.id&&e.stage==='Active').length
      const totalP=db.enrollments.filter(e=>e.provId===p.id).length
      return <div key={p.id} className="prov-card" onClick={()=>openProvDetail(p.id)}>
        <div className="prov-avatar" style={{ background: SPEC_COLORS[p.spec]||'#4f7ef8' }}>
          {p.avatarUrl
            ? <img src={p.avatarUrl} alt={p.fname} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:12}} onError={e=>{e.target.style.display='none'}} />
            : initials(p)
          }
        </div>
        <div>
          <div className="prov-name">{p.fname} {p.lname}</div>
          <div className="prov-title">{p.cred}{p.focus?' · '+p.focus:''}</div>
          <div className="prov-chips">
            <span className={`badge ${p.status==='Active'?'b-green':p.status==='Pending'?'b-amber':'b-gray'} badge-dot`}>{p.status}</span>
            <span className="badge b-gray">{p.spec}</span>
            {p.npi && <span className="info-chip">NPI: {p.npi}</span>}
            {activeP>0 && <span className="badge b-teal">{activeP}/{totalP} panels</span>}
            {urgent && <span className="badge b-red">⚠ Expiring Soon</span>}
            {p.supervisor && <span className="badge b-purple">Supervised</span>}
            {p.ptStatus === 'Active' && <span className="badge b-green">🧠 PT Listed</span>}
            {p.ptStatus === 'None' && p.spec === 'Mental Health' && <span className="badge b-gray">No PT Profile</span>}
          </div>
        </div>
        <div className="prov-actions" onClick={e=>e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" onClick={()=>openProvDetail(p.id)}>View</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>editProvider(p.id)}>Edit</button>
        </div>
      </div>
    })}
  </div>
}

// ─── ADD / EDIT PROVIDER ───────────────────────────────────────────────────────
function AddProvider({ db, provForm, setProvForm, editingId, setEditingId, npiInput, setNpiInput, npiResult, setNpiResult, npiLoading, lookupNPI, handleSaveProvider, handleDeleteProvider, handlePhotoUpload, handleDeletePhoto, photoUploading, setPage, saving }) {
  const f = (k) => provForm[k] || ''
  const set = (k, v) => setProvForm(prev => ({ ...prev, [k]: v }))
  const inp = (k, placeholder, type='text', opts={}) => <input type={type} value={f(k)} onChange={e=>set(k,e.target.value)} placeholder={placeholder} {...opts} />
  const sel = (k, children) => <select value={f(k)} onChange={e=>set(k,e.target.value)}>{children}</select>
  return <div className="page">
    <div className="card" style={{ maxWidth:760 }}>
      <div className="card-header">
        <h3>{editingId.provider ? 'Edit Provider' : 'New Provider'}</h3>
        <div className="ch-meta">{editingId.provider ? `${f('fname')} ${f('lname')}` : 'Fill in provider details below'}</div>
      </div>
      <div className="card-body">
        {/* ── PHOTO UPLOAD ── */}
        <div className="photo-upload-wrap">
          <div className="photo-preview">
            {provForm.avatarUrl
              ? <img src={provForm.avatarUrl} alt="Provider photo" onError={e=>{e.target.style.display='none'}} />
              : <span>{((provForm.fname||'?')[0]||'')}{((provForm.lname||'')[0]||'')}</span>
            }
          </div>
          <div className="photo-actions">
            <div className="photo-label">Provider Photo</div>
            <div className="photo-sub">JPG, PNG or WebP · Max 5MB · Stored in Supabase Storage</div>
            <div className="photo-btns">
              <label className="btn btn-primary btn-sm" style={{cursor:'pointer'}}>
                {photoUploading ? <><span className="spinner"></span> Uploading…</> : '📷 Upload Photo'}
                <input className="photo-upload-input" type="file" accept="image/jpeg,image/png,image/webp"
                  disabled={photoUploading}
                  onChange={e => { if(e.target.files[0]) handlePhotoUpload(e.target.files[0], editingId.provider) }}
                />
              </label>
              {provForm.avatarUrl && (
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeletePhoto(editingId.provider)}>Remove</button>
              )}
              {!editingId.provider && (
                <span style={{fontSize:11,color:'var(--ink-4)',alignSelf:'center'}}>Save provider first to enable photo upload</span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-16 fg">
          <label>NPI Registry Lookup</label>
          <div style={{ display:'flex', gap:6 }}>
            <input type="text" value={npiInput} onChange={e=>setNpiInput(e.target.value)} placeholder="Enter NPI number to auto-fill…" maxLength={10} style={{ flex:1 }} />
            <button className="btn btn-green" onClick={lookupNPI} disabled={npiLoading}>{npiLoading ? '⏳ Searching…' : '🔍 Look Up NPI'}</button>
          </div>
          {npiResult && <div className={`npi-result-box show`} style={{ background: npiResult.error?'#fdf0f0':'var(--primary-ll)', border: `1px solid ${npiResult.error?'#f0c8c8':'#c8e6d4'}` }}>
            {npiResult.error ? <div style={{ color:'var(--red)', fontSize:'12.5px' }}>{npiResult.error}</div> : <>
              <div className="nr-name">{[npiResult.fname,npiResult.lname].filter(Boolean).join(' ')} {npiResult.cred?'· '+npiResult.cred:''}</div>
              <div className="nr-detail">{npiResult.spec} {npiResult.addr?' · '+npiResult.addr:''}</div>
            </>}
          </div>}
          <span className="field-note">
            Auto-fills name and credential from the NPPES National Provider Registry. {' '}
            <span style={{color:'var(--primary)',cursor:'pointer',fontWeight:500,textDecoration:'underline'}} onClick={()=>setPage('provider-lookup')}>
              Search by name instead →
            </span>
          </span>
        </div>
        <div className="form-grid">
          <div className="section-divider">Personal Information</div>
          <div className="fg"><label>First Name *</label>{inp('fname','Jane')}</div>
          <div className="fg"><label>Last Name *</label>{inp('lname','Smith')}</div>
          <div className="fg"><label>Credential / License Type</label>{sel('cred',<>
            <option value="LCSW">LCSW — Licensed Clinical Social Worker</option>
            <option value="LPC">LPC — Licensed Professional Counselor</option>
            <option value="LMFT">LMFT — Licensed Marriage & Family Therapist</option>
            <option value="MFT Associate">MFT Associate (Supervised)</option>
            <option value="LCSW Associate">LCSW Associate (Supervised)</option>
            <option value="Licensed Psychologist">Licensed Psychologist (PhD/PsyD)</option>
            <option value="PMHNP">PMHNP — Psychiatric Nurse Practitioner</option>
            <option value="Naturopathic Physician">Naturopathic Physician (ND)</option>
            <option value="Chiropractor">Chiropractor (DC)</option>
            <option value="Acupuncturist">Licensed Acupuncturist (LAc)</option>
            <option value="LMT">Licensed Massage Therapist (LMT)</option>
            <option value="MD">Medical Doctor (MD)</option>
            <option value="DO">Doctor of Osteopathy (DO)</option>
            <option value="Other">Other</option>
          </>)}</div>
          <div className="fg"><label>Specialty Category</label>{sel('spec',<>
            <option>Mental Health</option><option>Massage Therapy</option><option>Naturopathic</option><option>Chiropractic</option><option>Acupuncture</option>
          </>)}</div>
          <div className="fg"><label>Provider Status</label>{sel('status',<><option>Active</option><option>Pending</option><option>Inactive</option></>)}</div>
          <div className="fg"><label>Email</label>{inp('email','provider@pis.com','email')}</div>
          <div className="fg"><label>Phone</label>{inp('phone','(503) 000-0000','tel')}</div>
          <div className="fg full"><label>Specialty Focus</label>{inp('focus','Trauma, EMDR, Anxiety…')}</div>

          <div className="section-divider">Identification Numbers</div>
          <div className="fg"><label>NPI Number</label>{inp('npi','1234567890','text',{maxLength:10})}</div>
          <div className="fg"><label>CAQH ID</label>{inp('caqh','12345678')}</div>
          <div className="fg"><label>CAQH Attestation Date</label>{inp('caqhAttest','','date')}</div>
          <div className="fg"><label>Next CAQH Attestation Due</label>{inp('caqhDue','','date')}</div>
          <div className="fg"><label>Medicaid / DMAP ID</label>{inp('medicaid','OR1234567')}</div>
          <div className="fg"><label>Medicare PTAN</label>{inp('ptan','If applicable')}</div>
          <div className="fg"><label>State License Number</label>{inp('license','C12345')}</div>
          <div className="fg"><label>License Expiration *</label>{inp('licenseExp','','date')}</div>

          <div className="section-divider">Insurance & Malpractice</div>
          <div className="fg"><label>Malpractice Carrier</label>{inp('malCarrier','HPSO, CPH&A…')}</div>
          <div className="fg"><label>Malpractice Policy #</label>{inp('malPolicy','POL-123456')}</div>
          <div className="fg"><label>Malpractice Expiration *</label>{inp('malExp','','date')}</div>
          <div className="fg"><label>DEA Registration #</label>{inp('dea','AB1234567')}</div>
          <div className="fg"><label>DEA Expiration</label>{inp('deaExp','','date')}</div>
          <div className="fg"><label>Recredentialing Due Date</label>{inp('recred','','date')}</div>

          <div className="section-divider">Supervision (Associates Only)</div>
          <div className="fg"><label>Supervising Provider</label>{inp('supervisor','Name of supervisor')}</div>
          <div className="fg"><label>Supervision Expiration</label>{inp('supExp','','date')}</div>

          <div className="section-divider">Psychology Today Profile</div>
          <div className="fg"><label>PT Profile URL</label><input type="url" value={f('ptUrl')} onChange={e=>set('ptUrl',e.target.value)} placeholder="https://www.psychologytoday.com/us/therapists/…" /></div>
          <div className="fg"><label>PT Listing Status</label>
            <select value={f('ptStatus')||'None'} onChange={e=>set('ptStatus',e.target.value)}>
              <option value="None">No Listing</option>
              <option value="Active">Active Listing</option>
              <option value="Inactive">Inactive / Paused</option>
            </select>
          </div>
          <div className="fg"><label>Paying Monthly Fee ($29.95/mo)?</label>
            <select value={f('ptMonthlyFee')?'true':'false'} onChange={e=>set('ptMonthlyFee',e.target.value==='true')}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
          <div className="fg"><label>PT Notes</label><input type="text" value={f('ptNotes')} onChange={e=>set('ptNotes',e.target.value)} placeholder="Profile views, referrals, notes…" /></div>

          <div className="section-divider">Notes</div>
          <div className="fg full"><label>Internal Notes</label><textarea value={f('notes')} onChange={e=>set('notes',e.target.value)} placeholder="Any relevant credentialing notes…"></textarea></div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button className="btn btn-primary" onClick={handleSaveProvider} disabled={saving}>{saving?'Saving…':'Save Provider'}</button>
          <button className="btn btn-secondary" onClick={()=>setPage('providers')}>Cancel</button>
          {editingId.provider && <button className="btn btn-danger" style={{ marginLeft:'auto' }} onClick={()=>handleDeleteProvider(editingId.provider)} disabled={saving}>Delete Provider</button>}
        </div>
      </div>
    </div>
  </div>
}

// ─── ENROLLMENTS ───────────────────────────────────────────────────────────────
function Enrollments({ db, search, setSearch, fStage, setFStage, fProv, setFProv, openEnrollModal, handleDeleteEnrollment }) {
  const filtered = db.enrollments.filter(e => {
    const txt = `${pName(db.providers,e.provId)} ${payName(db.payers,e.payId)} ${e.stage} ${e.notes}`.toLowerCase()
    return (!search||txt.includes(search.toLowerCase())) && (!fStage||e.stage===fStage) && (!fProv||e.provId===fProv)
  })
  const {sorted:list, thProps} = useSorted(filtered, 'stage')
  return <div className="page">
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search enrollments…" /></div>
      <select className="filter-select" value={fStage} onChange={e=>setFStage(e.target.value)}>
        <option value="">All Stages</option>
        {STAGES.map(s=><option key={s}>{s}</option>)}
      </select>
      <select className="filter-select" value={fProv} onChange={e=>setFProv(e.target.value)}>
        <option value="">All Providers</option>
        {db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
      </select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>openEnrollModal()}>＋ New Enrollment</button></div>
    </div>
    <div className="tbl-wrap">
      <table><thead><tr>
          <th {...thProps('provId','Provider')} />
          <th {...thProps('payId','Payer')} />
          <th {...thProps('stage','Stage')} />
          <th {...thProps('submitted','Submitted')} />
          <th {...thProps('effective','Effective')} />
          <th className="no-sort">EFT / ERA</th>
          <th {...thProps('followup','Follow-up')} />
          <th className="no-sort">Actions</th>
        </tr></thead>
        <tbody>
          {!list.length ? <tr><td colSpan={8}><div className="empty-state"><div className="ei">🏥</div><h4>No enrollments found</h4></div></td></tr> : list.map(e => {
            const fuD = daysUntil(e.followup)
            const fuCls = fuD!==null&&fuD<=0?'b-red':fuD!==null&&fuD<=7?'b-amber':'b-blue'
            return <tr key={e.id}>
              <td><strong>{pNameShort(db.providers,e.provId)}</strong><div className="text-xs text-muted">{db.providers.find(x=>x.id===e.provId)?.cred||''}</div></td>
              <td>{payName(db.payers,e.payId)}</td>
              <td><StageBadge stage={e.stage} /></td>
              <td style={{ whiteSpace:'nowrap' }}>{fmtDate(e.submitted)}</td>
              <td style={{ whiteSpace:'nowrap' }}>{fmtDate(e.effective)}</td>
              <td><div style={{ display:'flex', gap:4 }}><Badge cls={e.eft==='Active'?'b-green':'b-gray'}>EFT: {e.eft}</Badge><Badge cls={e.era==='Active'?'b-green':'b-gray'}>ERA: {e.era}</Badge></div></td>
              <td style={{ whiteSpace:'nowrap' }}>{e.followup?<Badge cls={fuCls}>{fmtDate(e.followup)}</Badge>:'—'}</td>
              <td><div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-secondary btn-sm" onClick={()=>openEnrollModal(e.id)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeleteEnrollment(e.id)}>Del</button>
              </div></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>
}

// ─── PAYERS ────────────────────────────────────────────────────────────────────
function Payers({ db, search, setSearch, fType, setFType, openPayerModal, handleDeletePayer }) {
  const rawPayers = db.payers.filter(p => `${p.name} ${p.payerId} ${p.type}`.toLowerCase().includes(search.toLowerCase()) && (!fType||p.type===fType))
  const {sorted:list, thProps} = useSorted(rawPayers, 'name')
  return <div className="page">
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search payers…" /></div>
      <select className="filter-select" value={fType} onChange={e=>setFType(e.target.value)}><option value="">All Types</option><option>Commercial</option><option>Medicaid</option><option>Medicare</option><option>Medicare Advantage</option><option>EAP</option><option>Other</option></select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>openPayerModal()}>＋ Add Payer</button></div>
    </div>
    <div className="tbl-wrap">
      <table><thead><tr>
          <th {...thProps('name','Payer Name')} />
          <th {...thProps('payerId','Payer ID')} />
          <th {...thProps('type','Type')} />
          <th className="no-sort">Phone</th>
          <th className="no-sort">Portal</th>
          <th {...thProps('timeline','Timeline')} />
          <th className="no-sort">Notes</th>
          <th className="no-sort">Actions</th>
        </tr></thead>
        <tbody>
          {!list.length ? <tr><td colSpan={8}><div className="empty-state"><div className="ei">🗂</div><h4>No payers found</h4></div></td></tr> : list.map(p => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong></td>
              <td><code style={{ background:'var(--surface-2)', padding:'2px 6px', borderRadius:4, fontSize:'11.5px' }}>{p.payerId||'—'}</code></td>
              <td><Badge cls="b-blue">{p.type}</Badge></td>
              <td>{p.phone||'—'}</td>
              <td>{p.portal?<a href={p.portal} target="_blank" rel="noreferrer" style={{ color:'var(--primary)', fontSize:'12px' }}>Portal ↗</a>:'—'}</td>
              <td><Badge cls="b-gray">{p.timeline||'—'}</Badge></td>
              <td style={{ maxWidth:180, fontSize:12, color:'var(--ink-4)' }}>{p.notes?p.notes.slice(0,70)+(p.notes.length>70?'…':''):'—'}</td>
              <td><div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-secondary btn-sm" onClick={()=>openPayerModal(p.id)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeletePayer(p.id)}>Del</button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
}

// ─── DOCUMENTS ─────────────────────────────────────────────────────────────────
function Documents({ db, search, setSearch, fType, setFType, fStatus, setFStatus, openDocModal, handleDeleteDocument }) {
  const rawDocs = db.documents.filter(d => {
    const txt = `${pName(db.providers,d.provId)} ${d.type} ${d.issuer} ${d.number}`.toLowerCase()
    if (!txt.includes(search.toLowerCase())) return false
    if (fType && d.type !== fType) return false
    if (fStatus) {
      const days = daysUntil(d.exp)
      if (fStatus==='expired' && (days===null||days>=0)) return false
      if (fStatus==='critical' && (days===null||days<0||days>30)) return false
      if (fStatus==='warning' && (days===null||days<0||days>90)) return false
      if (fStatus==='ok' && (days===null||days<=90)) return false
    }
    return true
  })
  const {sorted:list, thProps} = useSorted(rawDocs, 'exp')
  return <div className="page">
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents…" /></div>
      <select className="filter-select" value={fType} onChange={e=>setFType(e.target.value)}><option value="">All Types</option><option>License</option><option>Malpractice</option><option>DEA</option><option>CAQH Attestation</option><option>Recredentialing</option><option>Supervision Agreement</option><option>Other</option></select>
      <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="">All</option><option value="expired">Expired</option><option value="critical">Critical (≤30d)</option><option value="warning">Warning (≤90d)</option><option value="ok">OK</option></select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>openDocModal()}>＋ Add Document</button></div>
    </div>
    <div className="tbl-wrap">
      <table><thead><tr>
          <th {...thProps('provId','Provider')} />
          <th {...thProps('type','Type')} />
          <th {...thProps('issuer','Issuer')} />
          <th className="no-sort">Number</th>
          <th {...thProps('exp','Expiration')} />
          <th className="no-sort">Days Left</th>
          <th className="no-sort">Status</th>
          <th className="no-sort">Actions</th>
        </tr></thead>
        <tbody>
          {!list.length ? <tr><td colSpan={8}><div className="empty-state"><div className="ei">📎</div><h4>No documents found</h4></div></td></tr> : list.map(d => {
            const days = daysUntil(d.exp)
            const statusCls = days===null?'b-gray':days<0?'b-red':days<=30?'b-red':days<=90?'b-amber':'b-green'
            return <tr key={d.id}>
              <td><strong>{pNameShort(db.providers,d.provId)}</strong></td>
              <td>{d.type}</td>
              <td>{d.issuer||'—'}</td>
              <td style={{ fontSize:12 }}>{d.number||'—'}</td>
              <td style={{ whiteSpace:'nowrap' }}>{fmtDate(d.exp)}</td>
              <td style={{ fontWeight:600, color: days!==null&&days<=30?'var(--red)':days!==null&&days<=90?'var(--amber)':'var(--ink-3)' }}>{days===null?'—':days<0?`−${Math.abs(days)}`:''+days}</td>
              <td><Badge cls={statusCls}>{days===null?'Not Set':days<0?'Expired':'Active'}</Badge> <ExpiryBadge date={d.exp} /></td>
              <td><div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-secondary btn-sm" onClick={()=>openDocModal(d.id)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeleteDocument(d.id)}>Del</button>
              </div></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>
}

// ─── WORKFLOWS ─────────────────────────────────────────────────────────────────
function Workflows({ db, search, setSearch, fPriority, setFPriority, fStatus, setFStatus, openTaskModal, handleMarkDone, handleDeleteTask }) {
  const rawTasks = db.tasks.filter(t => {
    const txt = `${t.task} ${pName(db.providers,t.provId)} ${payName(db.payers,t.payId)} ${t.cat}`.toLowerCase()
    return txt.includes(search.toLowerCase()) && (!fPriority||t.priority===fPriority) && (!fStatus||t.status===fStatus)
  })
  const {sorted:list, thProps} = useSorted(rawTasks, 'due')

  return <div className="page">
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks…" /></div>
      <select className="filter-select" value={fPriority} onChange={e=>setFPriority(e.target.value)}><option value="">All Priorities</option><option>Urgent</option><option>High</option><option>Medium</option><option>Low</option></select>
      <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="">All Statuses</option><option>Open</option><option>In Progress</option><option>Waiting</option><option>Done</option></select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>openTaskModal()}>＋ New Task</button></div>
    </div>
    <div className="tbl-wrap">
      <table><thead><tr>
          <th {...thProps('due','Due Date')} />
          <th {...thProps('task','Task')} />
          <th {...thProps('provId','Provider')} />
          <th className="no-sort">Payer</th>
          <th {...thProps('priority','Priority')} />
          <th {...thProps('status','Status')} />
          <th {...thProps('cat','Category')} />
          <th className="no-sort">Actions</th>
        </tr></thead>
        <tbody>
          {!list.length ? <tr><td colSpan={8}><div className="empty-state"><div className="ei">⚡</div><h4>No tasks found</h4></div></td></tr> : list.map(t => {
            const dd = daysUntil(t.due)
            const dCls = dd!==null&&dd<=0?'b-red':dd!==null&&dd<=3?'b-amber':'b-gray'
            const dTxt = dd!==null&&dd<0?`${Math.abs(dd)}d overdue`:dd===0?'Today':dd!==null?`${dd}d`:'—'
            return <tr key={t.id} style={{ opacity: t.status==='Done' ? 0.55 : 1 }}>
              <td><Badge cls={dCls}>{fmtDate(t.due)} · {dTxt}</Badge></td>
              <td style={{ maxWidth:260 }}><div style={{ fontSize:13, fontWeight: t.status!=='Done'?'500':'400' }}>{t.task}</div>{t.notes&&<div className="text-xs text-muted">{t.notes.slice(0,60)}</div>}</td>
              <td>{t.provId ? pNameShort(db.providers,t.provId) : '—'}</td>
              <td>{t.payId ? payName(db.payers,t.payId) : '—'}</td>
              <td><Badge cls={PRIORITY_COLOR[t.priority]||'b-gray'}>{t.priority}</Badge></td>
              <td><Badge cls={STATUS_COLOR[t.status]||'b-gray'}>{t.status}</Badge></td>
              <td><Badge cls="b-gray">{t.cat}</Badge></td>
              <td><div style={{ display:'flex', gap:6 }}>
                {t.status!=='Done' && <button className="btn btn-green btn-sm" onClick={()=>handleMarkDone(t.id,t.task)}>✓</button>}
                <button className="btn btn-secondary btn-sm" onClick={()=>openTaskModal(t.id)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeleteTask(t.id)}>Del</button>
              </div></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>
}

// ─── REPORTS ───────────────────────────────────────────────────────────────────
function Reports({ db, exportJSON }) {
  const stages = {}; db.enrollments.forEach(e => { stages[e.stage]=(stages[e.stage]||0)+1 })
  const total = db.providers.length||1
  const compliant = db.providers.filter(p => { const l=daysUntil(p.licenseExp); const m=daysUntil(p.malExp); const c=daysUntil(p.caqhDue); return (l===null||l>0)&&(m===null||m>0)&&(c===null||c>0) }).length
  const pct = Math.round((compliant/total)*100)
  const done = db.tasks.filter(t=>t.status==='Done').length; const tTotal=db.tasks.length||1; const tPct=Math.round((done/tTotal)*100)
  const panels = {}; db.enrollments.filter(e=>e.stage==='Active').forEach(e=>{ panels[e.payId]=(panels[e.payId]||0)+1 })
  return <div className="page">
    <div className="grid-2 mb-20">
      <div className="card"><div className="card-header"><h3>📈 Enrollment Summary</h3></div><div className="card-body">{Object.entries(stages).map(([s,n])=><div key={s} className="stat-row"><span className="stat-row-label"><StageBadge stage={s} /></span><span className="stat-row-value">{n}</span></div>)}</div></div>
      <div className="card"><div className="card-header"><h3>📋 Provider Compliance Rate</h3></div><div className="card-body">
        <div style={{ fontFamily:'Instrument Serif,serif', fontSize:48, lineHeight:1 }}>{pct}%</div>
        <div className="text-muted mb-12">{compliant} of {total} providers fully compliant</div>
        <div style={{ height:8, background:'var(--line)', borderRadius:4, overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background: pct>=80?'var(--accent)':pct>=60?'var(--amber)':'var(--red)', borderRadius:4 }}></div></div>
      </div></div>
    </div>
    <div className="grid-2">
      <div className="card"><div className="card-header"><h3>⚡ Task Completion</h3></div><div className="card-body">
        <div style={{ fontFamily:'Instrument Serif,serif', fontSize:48, lineHeight:1 }}>{tPct}%</div>
        <div className="text-muted mb-12">{done} of {tTotal} tasks completed</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>{['Open','In Progress','Waiting','Done'].map(s=><div key={s}><Badge cls={STATUS_COLOR[s]||'b-gray'}>{s}</Badge> <strong>{db.tasks.filter(t=>t.status===s).length}</strong></div>)}</div>
      </div></div>
      <div className="card"><div className="card-header"><h3>🏥 Active Panels by Payer</h3></div><div className="card-body">{Object.entries(panels).sort((a,b)=>b[1]-a[1]).map(([payId,n])=><div key={payId} className="stat-row"><span className="stat-row-label">{payName(db.payers,payId)}</span><span className="stat-row-value">{n} provider{n>1?'s':''}</span></div>)}</div></div>
    </div>
    <div className="card mt-12"><div className="card-header"><h3>📤 Export Reports</h3></div><div className="card-body">
      <div className="grid-3">
        {[['👤 Provider Roster','All providers with license & expiry details'],['🏥 Enrollment Status','All payer enrollments by stage'],['📅 Expiration Report','All credentials expiring within 90 days'],['⚡ Open Tasks','All pending and in-progress tasks'],['💾 Full Data Backup','Export all data as a JSON backup file']].map(([h,p])=>(
          <div key={h} className="report-card" onClick={exportJSON}><h4>{h}</h4><p>{p}</p></div>
        ))}
      </div>
    </div></div>
  </div>
}

// ─── AUDIT ─────────────────────────────────────────────────────────────────────
function Audit({ db, search, setSearch, fType, setFType, handleClearAudit }) {
  const typeColor = { Provider:'b-purple', Enrollment:'b-blue', Document:'b-teal', Task:'b-green', Payer:'b-gold', Settings:'b-gray' }
  const list = db.auditLog.filter(a => `${a.type} ${a.action} ${a.detail}`.toLowerCase().includes(search.toLowerCase()) && (!fType||a.type===fType))
  return <div className="page">
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search audit log…" /></div>
      <select className="filter-select" value={fType} onChange={e=>setFType(e.target.value)}><option value="">All Actions</option><option value="Provider">Provider</option><option value="Enrollment">Enrollment</option><option value="Document">Document</option><option value="Task">Task</option><option value="Payer">Payer</option></select>
      <div className="toolbar-right"><button className="btn btn-secondary btn-sm" onClick={handleClearAudit}>Clear Log</button></div>
    </div>
    <div className="card"><div className="card-body" style={{ maxHeight:600, overflowY:'auto' }}>
      {!list.length ? <div className="empty-state"><div className="ei">📋</div><h4>No audit entries</h4></div> : list.map(a => (
        <div key={a.id} className="audit-entry">
          <div className="audit-dot"></div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <Badge cls={typeColor[a.type]||'b-gray'}>{a.type}</Badge>
              <span style={{ fontWeight:500, fontSize:'12.5px' }}>{a.action}</span>
              <span style={{ marginLeft:'auto', color:'var(--ink-4)', fontSize:'11px', whiteSpace:'nowrap' }}>{fmtTS(a.ts)}</span>
            </div>
            <div style={{ fontSize:'12.5px', color:'var(--ink-2)' }}>{a.detail||'—'}</div>
          </div>
        </div>
      ))}
    </div></div>
  </div>
}

// ─── SETTINGS ──────────────────────────────────────────────────────────────────
function Settings({ settingsForm, setSettingsForm, handleSaveSettings, exportJSON }) {
  const f = k => settingsForm[k] ?? ''
  const set = (k, v) => setSettingsForm(prev => ({ ...prev, [k]: v }))
  return <div className="page">
    <div className="grid-2">
      <div className="card"><div className="card-header"><h3>🏢 Practice Information</h3></div><div className="card-body">
        <div className="form-grid">
          <div className="fg full"><label>Practice Name</label><input type="text" value={f('practice')} onChange={e=>set('practice',e.target.value)} /></div>
          <div className="fg full"><label>Address</label><input type="text" value={f('address')} onChange={e=>set('address',e.target.value)} /></div>
          <div className="fg"><label>Phone</label><input type="tel" value={f('phone')} onChange={e=>set('phone',e.target.value)} /></div>
          <div className="fg"><label>Intake Email</label><input type="email" value={f('email')} onChange={e=>set('email',e.target.value)} /></div>
        </div>
        <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save</button>
      </div></div>
      <div className="card"><div className="card-header"><h3>⚠️ Alert Thresholds</h3></div><div className="card-body">
        <div className="form-grid">
          <div className="fg"><label>License / Malpractice alert (days)</label><input type="number" value={f('alertDays')} onChange={e=>set('alertDays',parseInt(e.target.value)||90)} min={30} max={365} /></div>
          <div className="fg"><label>CAQH attestation alert (days)</label><input type="number" value={f('caqhDays')} onChange={e=>set('caqhDays',parseInt(e.target.value)||30)} min={7} max={90} /></div>
        </div>
        <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save</button>
      </div></div>
    </div>
    <div className="card mt-12"><div className="card-header"><h3>⚡ Data Management</h3></div><div className="card-body">
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-secondary" onClick={exportJSON}>⬇ Export Backup</button>
      </div>
    </div></div>
  </div>
}

// ─── MODALS ────────────────────────────────────────────────────────────────────
function Modal({ onClose, title, sub, children, footer, lg }) {
  return <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className={`modal ${lg?'modal-lg':''}`}>
      <div className="modal-header">
        <div><h3>{title}</h3>{sub&&<div className="mh-sub">{sub}</div>}</div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-footer">{footer}</div>
    </div>
  </div>
}

function EnrollModal({ db, enrollForm, setEnrollForm, editingId, handleSaveEnrollment, onClose, saving }) {
  const f = k => enrollForm[k] ?? ''
  const set = (k, v) => setEnrollForm(prev => ({ ...prev, [k]: v }))
  const stageIdx = STAGES.indexOf(f('stage'))
  return <Modal title={editingId.enrollment?'Edit Enrollment':'New Payer Enrollment'} sub={editingId.enrollment?`${pNameShort(db.providers,f('provId'))} × ${payName(db.payers,f('payId'))}`:''}
    onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSaveEnrollment} disabled={saving}>{saving?'Saving…':'Save Enrollment'}</button></>}>
    <div className="mb-16">
      <div className="text-xs text-muted mb-8" style={{ fontWeight:600, letterSpacing:'.6px', textTransform:'uppercase' }}>Enrollment Stage</div>
      <div className="workflow-steps">
        {STAGES.filter(s=>s!=='Denied').map((s,i)=>(
          <div key={s} className={`ws ${stageIdx>i?'done':stageIdx===i?'active':''}`}>
            <div className="ws-dot">{stageIdx>i?'✓':i+1}</div>
            <div className="ws-label">{s.split('–')[0].trim()}</div>
          </div>
        ))}
      </div>
    </div>
    <div className="form-grid">
      <div className="fg"><label>Provider *</label><select value={f('provId')} onChange={e=>set('provId',e.target.value)}><option value="">— Select —</option>{db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}, {p.cred}</option>)}</select></div>
      <div className="fg"><label>Payer *</label><select value={f('payId')} onChange={e=>set('payId',e.target.value)}><option value="">— Select —</option>{db.payers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="fg"><label>Stage</label><select value={f('stage')} onChange={e=>set('stage',e.target.value)}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
      <div className="fg"><label>Date Submitted</label><input type="date" value={f('submitted')} onChange={e=>set('submitted',e.target.value)} /></div>
      <div className="fg"><label>Effective Date</label><input type="date" value={f('effective')} onChange={e=>set('effective',e.target.value)} /></div>
      <div className="fg"><label>Recredentialing Due</label><input type="date" value={f('recred')} onChange={e=>set('recred',e.target.value)} /></div>
      <div className="fg"><label>EFT Status</label><select value={f('eft')} onChange={e=>set('eft',e.target.value)}><option>Not Set Up</option><option>Submitted</option><option>Active</option></select></div>
      <div className="fg"><label>ERA Status</label><select value={f('era')} onChange={e=>set('era',e.target.value)}><option>Not Set Up</option><option>Submitted</option><option>Active</option></select></div>
      <div className="fg"><label>Follow-up Date</label><input type="date" value={f('followup')} onChange={e=>set('followup',e.target.value)} /></div>
      <div className="fg"><label>Contract Received</label><select value={f('contract')} onChange={e=>set('contract',e.target.value)}><option value="No">No</option><option value="Yes">Yes</option></select></div>
      <div className="fg full"><label>Notes / Audit Entry</label><textarea value={f('notes')} onChange={e=>set('notes',e.target.value)} placeholder="Add a note (logged to audit trail)…"></textarea></div>
    </div>
  </Modal>
}

function PayerModal({ payerForm, setPayerForm, editingId, handleSavePayer, onClose, saving }) {
  const f = k => payerForm[k] ?? ''
  const set = (k, v) => setPayerForm(prev => ({ ...prev, [k]: v }))
  return <Modal title={editingId.payer?'Edit Payer':'Add Payer'} onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSavePayer} disabled={saving}>{saving?'Saving…':'Save Payer'}</button></>}>
    <div className="form-grid">
      <div className="fg full"><label>Payer Name *</label><input type="text" value={f('name')} onChange={e=>set('name',e.target.value)} placeholder="Aetna" /></div>
      <div className="fg"><label>Payer ID / EDI ID</label><input type="text" value={f('payerId')} onChange={e=>set('payerId',e.target.value)} placeholder="60054" /></div>
      <div className="fg"><label>Type</label><select value={f('type')} onChange={e=>set('type',e.target.value)}><option>Commercial</option><option>Medicaid</option><option>Medicare</option><option>Medicare Advantage</option><option>EAP</option><option>Other</option></select></div>
      <div className="fg"><label>Provider Relations Phone</label><input type="tel" value={f('phone')} onChange={e=>set('phone',e.target.value)} /></div>
      <div className="fg"><label>Credentialing Email</label><input type="email" value={f('email')} onChange={e=>set('email',e.target.value)} /></div>
      <div className="fg"><label>Provider Portal URL</label><input type="text" value={f('portal')} onChange={e=>set('portal',e.target.value)} placeholder="https://…" /></div>
      <div className="fg"><label>Avg. Credentialing Timeline</label><select value={f('timeline')} onChange={e=>set('timeline',e.target.value)}><option>30–45 days</option><option>45–60 days</option><option>60–90 days</option><option>90–120 days</option><option>120+ days</option></select></div>
      <div className="fg full"><label>Notes</label><textarea value={f('notes')} onChange={e=>set('notes',e.target.value)} placeholder="Submission requirements, contacts…"></textarea></div>
    </div>
  </Modal>
}

function DocModal({ db, docForm, setDocForm, editingId, handleSaveDocument, onClose, saving }) {
  const f = k => docForm[k] ?? ''
  const set = (k, v) => setDocForm(prev => ({ ...prev, [k]: v }))
  return <Modal title={editingId.doc?'Edit Document':'Add Document / Credential'} onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSaveDocument} disabled={saving}>{saving?'Saving…':'Save Document'}</button></>}>
    <div className="form-grid">
      <div className="fg"><label>Provider *</label><select value={f('provId')} onChange={e=>set('provId',e.target.value)}><option value="">— Select Provider —</option>{db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}</select></div>
      <div className="fg"><label>Document Type *</label><select value={f('type')} onChange={e=>set('type',e.target.value)}><option>License</option><option>Malpractice</option><option>DEA</option><option>CAQH Attestation</option><option>Recredentialing</option><option>Supervision Agreement</option><option>NPI Letter</option><option>W-9</option><option>CV / Resume</option><option>Other</option></select></div>
      <div className="fg"><label>Issuer / Carrier</label><input type="text" value={f('issuer')} onChange={e=>set('issuer',e.target.value)} placeholder="OBRC, HPSO…" /></div>
      <div className="fg"><label>License / Policy Number</label><input type="text" value={f('number')} onChange={e=>set('number',e.target.value)} /></div>
      <div className="fg"><label>Issue Date</label><input type="date" value={f('issue')} onChange={e=>set('issue',e.target.value)} /></div>
      <div className="fg"><label>Expiration Date *</label><input type="date" value={f('exp')} onChange={e=>set('exp',e.target.value)} /></div>
      <div className="fg full"><label>Notes</label><textarea value={f('notes')} onChange={e=>set('notes',e.target.value)} style={{ minHeight:56 }}></textarea></div>
    </div>
  </Modal>
}

function TaskModal({ db, taskForm, setTaskForm, editingId, handleSaveTask, onClose, saving }) {
  const f = k => taskForm[k] ?? ''
  const set = (k, v) => setTaskForm(prev => ({ ...prev, [k]: v }))
  return <Modal title={editingId.task?'Edit Task':'New Task'} onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSaveTask} disabled={saving}>{saving?'Saving…':'Save Task'}</button></>}>
    <div className="form-grid">
      <div className="fg full"><label>Task Description *</label><input type="text" value={f('task')} onChange={e=>set('task',e.target.value)} placeholder="Follow up with Aetna re: enrollment…" /></div>
      <div className="fg"><label>Due Date *</label><input type="date" value={f('due')} onChange={e=>set('due',e.target.value)} /></div>
      <div className="fg"><label>Priority</label><select value={f('priority')} onChange={e=>set('priority',e.target.value)}><option>Urgent</option><option>High</option><option>Medium</option><option>Low</option></select></div>
      <div className="fg"><label>Status</label><select value={f('status')} onChange={e=>set('status',e.target.value)}><option>Open</option><option>In Progress</option><option>Waiting</option><option>Done</option></select></div>
      <div className="fg"><label>Category</label><select value={f('cat')} onChange={e=>set('cat',e.target.value)}><option>Follow-up</option><option>Application</option><option>Document Renewal</option><option>Recredentialing</option><option>Enrollment</option><option>Internal</option><option>Other</option></select></div>
      <div className="fg"><label>Provider (optional)</label><select value={f('provId')} onChange={e=>set('provId',e.target.value)}><option value="">— None —</option>{db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}</select></div>
      <div className="fg"><label>Payer (optional)</label><select value={f('payId')} onChange={e=>set('payId',e.target.value)}><option value="">— None —</option>{db.payers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="fg full"><label>Notes</label><textarea value={f('notes')} onChange={e=>set('notes',e.target.value)} style={{ minHeight:56 }}></textarea></div>
    </div>
  </Modal>
}

function ProvDetailModal({ prov, db, tab, setTab, onClose, editProvider, openEnrollModal }) {
  const enrs = db.enrollments.filter(e => e.provId === prov.id)
  const docs = db.documents.filter(d => d.provId === prov.id)
  const tabs = [['profile','Profile'],['creds','Credentials'],['enrollments',`Enrollments (${enrs.length})`],['documents',`Documents (${docs.length})`]]
  return <Modal lg title={`${prov.fname} ${prov.lname}, ${prov.cred}`} sub={`${prov.spec} · ${prov.status}`} onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Close</button><button className="btn btn-secondary" onClick={()=>{onClose();editProvider(prov.id)}}>Edit Provider</button><button className="btn btn-primary" onClick={()=>{onClose();openEnrollModal(null,prov.id)}}>＋ Add Enrollment</button></>}>
    <div className="tabs">{tabs.map(([k,l])=><div key={k} className={`tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</div>)}</div>
    {tab==='profile' && <div className="grid-2" style={{ gap:12 }}>
      <div className="fg"><div className="text-xs text-muted">Email</div><div>{prov.email||'—'}</div></div>
      <div className="fg"><div className="text-xs text-muted">Phone</div><div>{prov.phone||'—'}</div></div>
      <div className="fg"><div className="text-xs text-muted">Specialty Focus</div><div>{prov.focus||'—'}</div></div>
      <div className="fg"><div className="text-xs text-muted">Supervisor</div><div>{prov.supervisor||'—'}</div></div>
      {prov.notes && <div className="fg full"><div className="text-xs text-muted">Notes</div><div style={{ fontSize:13, color:'var(--ink-2)', background:'var(--surface-2)', padding:'10px 12px', borderRadius:8 }}>{prov.notes}</div></div>}
    </div>}
    {tab==='creds' && <div className="grid-2" style={{ gap:12 }}>
      {[['NPI',prov.npi],['CAQH ID',prov.caqh],['CAQH Due',prov.caqhDue?`${fmtDate(prov.caqhDue)} `:null],['Medicaid / DMAP',prov.medicaid],['Medicare PTAN',prov.ptan],['License #',prov.license],['License Exp',prov.licenseExp?fmtDate(prov.licenseExp):null],['Malpractice',prov.malCarrier?`${prov.malCarrier} (${prov.malPolicy})`:null],['Mal. Exp',prov.malExp?fmtDate(prov.malExp):null],['DEA #',prov.dea],['DEA Exp',prov.deaExp?fmtDate(prov.deaExp):null],['Recredentialing Due',prov.recred?fmtDate(prov.recred):null]].map(([l,v])=>(
        <div key={l} className="fg"><div className="text-xs text-muted">{l}</div><div style={{ display:'flex', alignItems:'center', gap:6 }}>{v||'—'}{['CAQH Due','License Exp','Mal. Exp','DEA Exp','Recredentialing Due'].includes(l)&&<ExpiryBadge date={prov[{['CAQH Due']:'caqhDue',['License Exp']:'licenseExp',['Mal. Exp']:'malExp',['DEA Exp']:'deaExp',['Recredentialing Due']:'recred'}[l]]} />}</div></div>
      ))}
    </div>}
    {tab==='enrollments' && (!enrs.length ? <div className="text-muted" style={{ padding:'12px 0' }}>No enrollments on file.</div> : enrs.map(e=>(
      <div key={e.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--line-2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}><strong style={{ flex:1 }}>{payName(db.payers,e.payId)}</strong><StageBadge stage={e.stage} /></div>
        <div className="text-sm text-muted">Submitted: {fmtDate(e.submitted)} · Effective: {fmtDate(e.effective)} · EFT: {e.eft} · ERA: {e.era}</div>
        {e.followup && <div className="text-sm text-muted">Follow-up: {fmtDate(e.followup)}</div>}
      </div>
    )))}
    {tab==='documents' && (!docs.length ? <div className="text-muted" style={{ padding:'12px 0' }}>No documents on file.</div> : docs.map(d=>(
      <div key={d.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--line-2)' }}>
        <div style={{ width:34, height:34, borderRadius:8, background:'var(--blue-l)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>📄</div>
        <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:500 }}>{d.type}</div><div className="text-xs text-muted">{d.issuer} {d.number?'· '+d.number:''}</div></div>
        <ExpiryBadge date={d.exp} />
      </div>
    )))}
  </Modal>
}


// ═══════════════════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════════════════


// ─── GLOBAL SEARCH ─────────────────────────────────────────────────────────────
function GlobalSearch({ db, onClose, setPage, openProvDetail, openEnrollModal }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const q = query.trim().toLowerCase()

  const provResults = q.length < 1 ? [] : db.providers.filter(p => {
    const txt = [p.fname, p.lname, p.cred, p.spec, p.npi, p.license, p.medicaid,
      p.caqh, p.dea, p.email, p.phone, p.focus, p.supervisor, p.notes].join(' ').toLowerCase()
    return txt.includes(q)
  }).slice(0, 5)

  const enrResults = q.length < 1 ? [] : db.enrollments.filter(e => {
    const pn = pName(db.providers, e.provId).toLowerCase()
    const pay = payName(db.payers, e.payId).toLowerCase()
    return pn.includes(q) || pay.includes(q) || e.stage.toLowerCase().includes(q)
  }).slice(0, 4)

  const payResults = q.length < 1 ? [] : db.payers.filter(p =>
    `${p.name} ${p.payerId} ${p.type}`.toLowerCase().includes(q)
  ).slice(0, 3)

  const docResults = q.length < 1 ? [] : db.documents.filter(d => {
    const pn = pName(db.providers, d.provId).toLowerCase()
    return pn.includes(q) || (d.type||'').toLowerCase().includes(q) ||
      (d.issuer||'').toLowerCase().includes(q) || (d.number||'').toLowerCase().includes(q)
  }).slice(0, 3)

  const taskResults = q.length < 1 ? [] : db.tasks.filter(t =>
    (t.task||'').toLowerCase().includes(q) || (t.cat||'').toLowerCase().includes(q)
  ).slice(0, 3)

  // Build flat list for keyboard nav
  const allItems = [
    ...provResults.map(r => ({ type:'provider', data:r })),
    ...enrResults.map(r => ({ type:'enrollment', data:r })),
    ...payResults.map(r => ({ type:'payer', data:r })),
    ...docResults.map(r => ({ type:'doc', data:r })),
    ...taskResults.map(r => ({ type:'task', data:r })),
  ]
  const total = allItems.length

  useEffect(() => { setFocused(0) }, [query])

  function handleKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f+1, total-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f-1, 0)) }
    if (e.key === 'Enter' && total > 0) { handleSelect(allItems[focused]) }
  }

  function handleSelect(item) {
    if (item.type === 'provider') { setPage('providers'); openProvDetail(item.data.id) }
    else if (item.type === 'enrollment') { setPage('enrollments'); openEnrollModal(item.data.id) }
    else if (item.type === 'payer') { setPage('payers') }
    else if (item.type === 'doc') { setPage('documents') }
    else if (item.type === 'task') { setPage('workflows') }
    onClose()
  }

  const isEmpty = q.length > 0 && total === 0
  const isBlank = q.length === 0

  let itemIdx = 0
  function Section({ label, items, icon, color, renderItem }) {
    if (!items.length) return null
    return (
      <div className="gsearch-section">
        <div className="gsearch-section-label">{label}</div>
        {items.map((item, i) => {
          const idx = itemIdx++
          return (
            <div key={i} className={`gsearch-item ${focused===idx?'focused':''}`}
              onMouseEnter={() => setFocused(idx)}
              onClick={() => handleSelect({ type: item._type, data: item })}>
              <div className="gsearch-item-icon" style={{background:color+'22',color}}>{icon}</div>
              <div className="gsearch-item-main">{renderItem(item)}</div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="gsearch-overlay" onClick={e => { if(e.target===e.currentTarget) onClose() }}>
      <div className="gsearch-box">
        <div className="gsearch-input-wrap">
          <span className="gsearch-icon">🔍</span>
          <input
            ref={inputRef}
            className="gsearch-input"
            placeholder="Search providers, payers, enrollments, documents…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          <span className="gsearch-kbd">ESC</span>
        </div>

        <div className="gsearch-results">
          {isBlank && (
            <div className="gsearch-empty">
              <div style={{fontSize:28,marginBottom:8}}>🔍</div>
              <div style={{fontWeight:600,color:'var(--ink-3)',marginBottom:4}}>Search everything</div>
              <div>Providers · Payers · Enrollments · Documents · Tasks</div>
            </div>
          )}
          {isEmpty && (
            <div className="gsearch-empty">
              <div style={{fontSize:28,marginBottom:8}}>😔</div>
              <div style={{fontWeight:600,color:'var(--ink-3)',marginBottom:4}}>No results for "{query}"</div>
              <div>Try a name, NPI, license number, payer, or specialty</div>
            </div>
          )}

          {provResults.map(p => { p._type='provider'; return null })}
          {enrResults.map(e => { e._type='enrollment'; return null })}
          {payResults.map(p => { p._type='payer'; return null })}
          {docResults.map(d => { d._type='doc'; return null })}
          {taskResults.map(t => { t._type='task'; return null })}

          {(() => { itemIdx = 0; return null })()}

          {provResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Providers</div>
              {provResults.map((p, i) => {
                const idx = itemIdx++
                const hasDays = daysUntil(p.licenseExp)
                const urgent = hasDays !== null && hasDays <= 30
                return (
                  <div key={p.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'provider',data:p})}>
                    <div className="gsearch-item-icon" style={{background:(SPEC_COLORS[p.spec]||'#4f7ef8')+'25',color:SPEC_COLORS[p.spec]||'#4f7ef8',fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:600}}>
                      {initials(p)}
                    </div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{p.fname} {p.lname}{p.cred?', '+p.cred:''}</div>
                      <div className="gsearch-item-sub">
                        {p.spec}{p.npi?' · NPI '+p.npi:''}{p.license?' · '+p.license:''}
                        {p.email?' · '+p.email:''}
                      </div>
                    </div>
                    <div className="gsearch-item-tag" style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
                      <span className={`badge badge-dot ${p.status==='Active'?'b-green':p.status==='Pending'?'b-amber':'b-gray'}`}>{p.status}</span>
                      {urgent && <span className="badge b-red" style={{fontSize:10}}>⚠ Expiring</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {enrResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Enrollments</div>
              {enrResults.map((e, i) => {
                const idx = itemIdx++
                return (
                  <div key={e.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'enrollment',data:e})}>
                    <div className="gsearch-item-icon" style={{background:'#eff6ff',color:'#2563eb'}}>🏥</div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{pNameShort(db.providers, e.provId)}</div>
                      <div className="gsearch-item-sub">{payName(db.payers, e.payId)}</div>
                    </div>
                    <div className="gsearch-item-tag">
                      <span className={`badge ${STAGE_COLOR[e.stage]||'b-gray'}`} style={{fontSize:10}}>{e.stage}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {payResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Payers</div>
              {payResults.map((p, i) => {
                const idx = itemIdx++
                return (
                  <div key={p.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'payer',data:p})}>
                    <div className="gsearch-item-icon" style={{background:'#fefce8',color:'#ca8a04'}}>🗂</div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{p.name}</div>
                      <div className="gsearch-item-sub">{p.type}{p.payerId?' · ID: '+p.payerId:''}{p.timeline?' · '+p.timeline:''}</div>
                    </div>
                    <div className="gsearch-item-tag">
                      <span className="badge b-blue" style={{fontSize:10}}>{p.type}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {docResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Documents</div>
              {docResults.map((d, i) => {
                const idx = itemIdx++
                const days = daysUntil(d.exp)
                return (
                  <div key={d.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'doc',data:d})}>
                    <div className="gsearch-item-icon" style={{background:'#ecfeff',color:'#0891b2'}}>📎</div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{d.type} — {pNameShort(db.providers, d.provId)}</div>
                      <div className="gsearch-item-sub">{d.issuer||''}{d.number?' · '+d.number:''}</div>
                    </div>
                    <div className="gsearch-item-tag">
                      <span className={`badge ${days===null?'b-gray':days<0?'b-red':days<=30?'b-red':days<=90?'b-amber':'b-green'}`} style={{fontSize:10}}>
                        {days===null?'No exp':days<0?`Expired`:days<=90?`${days}d left`:'Active'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {taskResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Tasks</div>
              {taskResults.map((t, i) => {
                const idx = itemIdx++
                const dd = daysUntil(t.due)
                return (
                  <div key={t.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'task',data:t})}>
                    <div className="gsearch-item-icon" style={{background:'#f5f3ff',color:'#7c3aed'}}>⚡</div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{t.task}</div>
                      <div className="gsearch-item-sub">{t.cat}{t.due?' · Due '+fmtDate(t.due):''}</div>
                    </div>
                    <div className="gsearch-item-tag" style={{display:'flex',gap:4}}>
                      <span className={`badge ${PRIORITY_COLOR[t.priority]||'b-gray'}`} style={{fontSize:10}}>{t.priority}</span>
                      <span className={`badge ${STATUS_COLOR[t.status]||'b-gray'}`} style={{fontSize:10}}>{t.status}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="gsearch-footer">
          <div className="gsearch-hint"><span className="gsearch-kbd">↑↓</span> navigate</div>
          <div className="gsearch-hint"><span className="gsearch-kbd">↵</span> open</div>
          <div className="gsearch-hint"><span className="gsearch-kbd">ESC</span> close</div>
          <div style={{marginLeft:'auto',fontSize:11,color:'var(--ink-4)'}}>
            {total > 0 ? `${total} result${total!==1?'s':''}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── PROVIDER LOOKUP PAGE ─────────────────────────────────────────────────────
function ProviderLookup({ db, setPage, setProvForm, setEditingId, setNpiInput, setNpiResult }) {
  const [activeTab, setActiveTab] = useState('nppes')

  // NPPES search state
  const [fname, setFname] = useState('')
  const [lname, setLname] = useState('')
  const [state, setState] = useState('OR')
  const [specialty, setSpecialty] = useState('')
  const [results, setResults] = useState(null)
  const [resultCount, setResultCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(null) // result being previewed

  const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

  const SPECIALTIES = [
    'Clinical Social Worker','Licensed Professional Counselor','Marriage & Family Therapist',
    'Psychologist','Psychiatry','Naturopathic Medicine','Chiropractic',
    'Acupuncture','Massage Therapy','Mental Health Counselor','Nurse Practitioner',
  ]

  async function doSearch(e) {
    e && e.preventDefault()
    if (!fname.trim() && !lname.trim()) { setError('Enter at least a first or last name.'); return }
    setLoading(true); setError(''); setResults(null); setImporting(null)
    try {
      const params = new URLSearchParams()
      if (fname.trim()) params.append('first_name', fname.trim())
      if (lname.trim()) params.append('last_name', lname.trim())
      if (state)        params.append('state', state)
      if (specialty)    params.append('taxonomy', specialty)
      const res = await fetch(`/api/npi-search?${params}`)
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setResults(data.results || [])
      setResultCount(data.resultCount || 0)
    } catch (e) {
      setError('Could not reach the NPI registry. Please try again.')
    }
    setLoading(false)
  }

  function importProvider(r) {
    // Pre-fill the Add Provider form with NPPES data and navigate
    setProvForm({
      fname: r.fname,
      lname: r.lname,
      cred:  r.cred || '',
      npi:   r.npi  || '',
      phone: r.phone || '',
      status: 'Active',
      spec: guessSpec(r.specialty),
      focus: r.specialty || '',
    })
    setEditingId(e => ({ ...e, provider: null }))
    setNpiInput(r.npi || '')
    setNpiResult({ fname: r.fname, lname: r.lname, cred: r.cred, spec: r.specialty, addr: r.address, npi: r.npi })
    setPage('add-provider')
  }

  function guessSpec(tax) {
    if (!tax) return 'Mental Health'
    const t = tax.toLowerCase()
    if (t.includes('social work') || t.includes('counselor') || t.includes('psycholog') || t.includes('mental') || t.includes('marriage') || t.includes('psychiatr')) return 'Mental Health'
    if (t.includes('naturo')) return 'Naturopathic'
    if (t.includes('chiroprac')) return 'Chiropractic'
    if (t.includes('acupunc')) return 'Acupuncture'
    if (t.includes('massage')) return 'Massage Therapy'
    return 'Mental Health'
  }

  function alreadyInSystem(npi) {
    return db.providers.some(p => p.npi === npi)
  }

  // Oregon board deep-link builder
  function oregonBoardLink(boardName, lname, fname) {
    const boards = {
      'OBLPCT': `https://oblpct.state.or.us/lookup/default.aspx`,
      'OMB':    `https://omb.oregon.gov/search`,
      'OBN':    `https://www.oregon.gov/osbn/Pages/license-verification.aspx`,
      'HLO':    `https://hlo.oregon.gov/Lookup/LicenseLookup.aspx`,
      'OBOP':   `https://pharmacy.oregon.gov/Pages/VerifyLicense.aspx`,
    }
    return boards[boardName] || '#'
  }

  const VERIF_SOURCES = [

    {
      icon: '🎓',
      title: 'OBLPCT — LPCs & MFTs (Oregon Board of LPC & Therapists)',
      desc: 'Verify licenses for Licensed Professional Counselors (LPC, LPCA), Licensed Marriage & Family Therapists (LMFT, LMFTA). Most common mental health credentials at your practice.',
      bg: '#f0fdf4', color: '#16a34a',
      cta: 'Verify LPC / LMFT License →',
      href: 'https://oblpct.us.thentiacloud.net/webs/oblpct/register/#',
      note: 'Covers: LPC, LPCA, LMFT, LMFTA — Powered by Thentia Cloud (Oregon official registry)',
    },
    {
      icon: '🧩',
      title: 'BLSW — LCSWs (Oregon Board of Licensed Social Workers)',
      desc: 'Verify licenses for Licensed Clinical Social Workers (LCSW) and Clinical Social Work Associates (CSWA). Required for Sarah Chen and similar providers.',
      bg: '#f0fdf4', color: '#0891b2',
      cta: 'Verify LCSW License →',
      href: 'https://blsw.us.thentiacloud.net/webs/blsw/register/#/',
      note: 'Covers: LCSW, CSWA, LSW — Powered by Thentia Cloud (Oregon official registry)',
    },
    {
      icon: '🧠',
      title: 'Oregon Board of Psychology (OBP)',
      desc: 'Verify licenses for Licensed Psychologists (PhD/PsyD). Required for Elena Vasquez and similar providers.',
      bg: '#faf5ff', color: '#7c3aed',
      cta: 'Verify License →',
      href: 'https://obp.us.thentiacloud.net/webs/obp/register/#',
      note: 'Covers: Licensed Psychologist, Psychological Associate — Powered by Thentia Cloud (Oregon official registry)',
    },
    {
      icon: '🌿',
      title: 'Oregon Board of Naturopathic Medicine (OBNM)',
      desc: 'Verify ND (Naturopathic Doctor) licenses. Required for Priya Nair and naturopathic providers.',
      bg: '#f0fdf4', color: '#0891b2',
      cta: 'Verify License →',
      href: 'https://obnm.us.thentiacloud.net/webs/obnm/register/#',
      note: 'Covers: Naturopathic Physician (ND) — Powered by Thentia Cloud (Oregon official registry)',
    },
    {
      icon: '🦴',
      title: 'Oregon Board of Chiropractic Examiners (OBCE)',
      desc: 'Verify DC (Doctor of Chiropractic) licenses. Required for David Park and chiropractic providers.',
      bg: '#fffbeb', color: '#d97706',
      cta: 'Verify License →',
      href: 'https://obce.us.thentiacloud.net/webs/obce/register/#',
      note: 'Covers: Doctor of Chiropractic (DC) — Powered by Thentia Cloud (Oregon official registry)',
    },
    {
      icon: '⚕️',
      title: 'Oregon Health Licensing Office (HLO)',
      desc: 'Central hub for massage therapists, acupuncturists, and 19 other health professions licensed in Oregon.',
      bg: '#fef2f2', color: '#dc2626',
      cta: 'Verify License →',
      href: 'https://hlo.us.thentiacloud.net/webs/hlo/register/#',
      note: 'Covers: LMT, LAc, and 17 other health professions — Powered by Thentia Cloud (Oregon official registry)',
    },
    {
      icon: '📋',
      title: 'CAQH ProView',
      desc: 'Access full provider credentialing profiles, attestation status, and document uploads. Requires a Participating Organization (PO) account — contact CAQH to set up API access for your practice.',
      bg: '#ecfeff', color: '#0891b2',
      cta: 'Open CAQH ProView →',
      href: 'https://proview.caqh.org',
      note: 'Note: CAQH ProView requires a Participating Organization agreement. Public lookup is not available. Call CAQH at 888-599-1771 to request PO access.',
      apiAvail: false,
    },
    {
      icon: '🏥',
      title: 'OHA Medicaid Provider Enrollment Check',
      desc: 'Verify if a provider is currently enrolled in Oregon Health Plan (OHP/Medicaid). Enter the provider NPI on the OHA tool.',
      bg: '#f0fdf4', color: '#16a34a',
      cta: 'Check OHA Enrollment →',
      href: 'https://www.oregon.gov/oha/hsd/ohp/pages/provider-enroll.aspx',
      note: 'Enter the provider NPI at the OHA tool to check enrollment status.',
    },
    {
      icon: '🚨',
      title: 'OIG LEIE — Exclusions Database',
      desc: 'Check if a provider has been excluded from federal healthcare programs (Medicare, Medicaid). Required for compliance. Search by name or NPI.',
      bg: '#fef2f2', color: '#dc2626',
      cta: 'Search OIG Exclusions →',
      href: 'https://exclusions.oig.hhs.gov/',
      note: 'Always run this check before credentialing a new provider. Free and real-time.',
    },
    {
      icon: '💊',
      title: 'DEA Registration Verification',
      desc: 'Verify active DEA registration for providers with prescribing authority (NDs, PMHNPs, MDs). Requires DEA number.',
      bg: '#faf5ff', color: '#7c3aed',
      cta: 'Verify DEA →',
      href: 'https://apps.deadiversion.usdoj.gov/webforms2/spring/validationLogin',
      note: 'DEA verification requires a DEA account. Contact your DEA Diversion Investigator for access if needed.',
    },
  ]

  return (
    <div className="page">
      {/* Tab switcher */}
      <div className="lookup-tabs">
        <div className={`lookup-tab ${activeTab==='nppes'?'active':''}`} onClick={()=>setActiveTab('nppes')}>
          🔍 NPI Registry Search
        </div>
        <div className={`lookup-tab ${activeTab==='verify'?'active':''}`} onClick={()=>setActiveTab('verify')}>
          ✅ License Verification Sources
        </div>
      </div>

      {/* ── TAB 1: NPPES SEARCH ── */}
      {activeTab === 'nppes' && (
        <div>
          <div className="card mb-16">
            <div className="card-header">
              <h3>Search NPPES National Provider Registry</h3>
              <span className="ch-meta">Live data from CMS · 8M+ providers · No login required</span>
            </div>
            <div className="card-body">
              <form onSubmit={doSearch}>
                <div className="form-grid" style={{marginBottom:14}}>
                  <div className="fg">
                    <label>First Name</label>
                    <input type="text" value={fname} onChange={e=>setFname(e.target.value)} placeholder="Sarah" />
                  </div>
                  <div className="fg">
                    <label>Last Name</label>
                    <input type="text" value={lname} onChange={e=>setLname(e.target.value)} placeholder="Chen" />
                  </div>
                  <div className="fg">
                    <label>State</label>
                    <select value={state} onChange={e=>setState(e.target.value)}>
                      <option value="">All States</option>
                      {STATES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="fg">
                    <label>Specialty / Taxonomy</label>
                    <select value={specialty} onChange={e=>setSpecialty(e.target.value)}>
                      <option value="">All Specialties</option>
                      {SPECIALTIES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {error && (
                  <div style={{color:'var(--red)',background:'var(--red-l)',border:'1px solid var(--red-b)',borderRadius:'var(--r)',padding:'8px 12px',fontSize:12.5,marginBottom:12}}>
                    {error}
                  </div>
                )}
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? <><span className="spinner"></span> Searching NPPES…</> : '🔍 Search Registry'}
                  </button>
                  {results && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{setResults(null);setFname('');setLname('');setState('OR');setSpecialty('');setImporting(null)}}>
                      Clear
                    </button>
                  )}
                  <span style={{fontSize:12,color:'var(--ink-4)',marginLeft:4}}>
                    Searches the official CMS NPPES database in real time
                  </span>
                </div>
              </form>
            </div>
          </div>

          {/* Results */}
          {results !== null && (
            <div>
              <div className="lookup-count">
                {results.length === 0
                  ? 'No providers found. Try a broader search — use last name only, or remove the state filter.'
                  : `Showing ${results.length} of ${resultCount.toLocaleString()} matches in NPPES${resultCount > 20 ? ' — refine your search to narrow results' : ''}`
                }
              </div>

              {results.map((r, i) => {
                const inSystem = alreadyInSystem(r.npi)
                const isImporting = importing?.npi === r.npi
                return (
                  <div key={r.npi || i} className="lookup-result-card">
                    <div className="lookup-avatar">
                      {(r.fname[0]||'?')}{(r.lname[0]||'')}
                    </div>
                    <div>
                      <div className="lookup-name">
                        {r.fname} {r.lname}{r.cred ? `, ${r.cred}` : ''}
                      </div>
                      <div className="lookup-meta">
                        {[r.specialty, r.address].filter(Boolean).join(' · ')}
                      </div>
                      <div className="lookup-chips">
                        <span className="info-chip">NPI {r.npi}</span>
                        {r.phone && <span className="info-chip">📞 {r.phone}</span>}
                        {r.state && <span className="badge b-blue">{r.state}</span>}
                        {inSystem && <span className="badge b-green">✓ In CredentialIQ</span>}
                      </div>

                      {/* Import preview */}
                      {isImporting && (
                        <div className="import-preview">
                          <div className="import-preview-title">Will be imported as:</div>
                          {[
                            ['Name', `${r.fname} ${r.lname}${r.cred?', '+r.cred:''}`],
                            ['NPI', r.npi],
                            ['Specialty', guessSpec(r.specialty) + (r.specialty?' ('+r.specialty+')':'')],
                            ['Phone', r.phone || '—'],
                            ['Address', r.address || '—'],
                          ].map(([label, val]) => (
                            <div key={label} className="import-row">
                              <span className="import-label">{label}</span>
                              <span className="import-val">{val}</span>
                            </div>
                          ))}
                          <div style={{display:'flex',gap:8,marginTop:12}}>
                            <button className="btn btn-primary btn-sm" onClick={()=>importProvider(r)}>
                              ✓ Confirm Import to CredentialIQ
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={()=>setImporting(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="lookup-actions">
                      {!inSystem ? (
                        <button
                          className={`btn btn-sm ${isImporting ? 'btn-secondary' : 'btn-primary'}`}
                          onClick={() => isImporting ? setImporting(null) : setImporting(r)}
                        >
                          {isImporting ? 'Cancel' : '＋ Import'}
                        </button>
                      ) : (
                        <span className="badge b-green" style={{fontSize:11}}>Already added</span>
                      )}
                      <a
                        href={`https://npiregistry.cms.hhs.gov/provider-view/${r.npi}`}
                        target="_blank" rel="noreferrer"
                        className="btn btn-ghost btn-sm"
                        style={{textAlign:'center'}}
                      >
                        NPPES ↗
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {results === null && !loading && (
            <div className="empty-state">
              <div className="ei">🔍</div>
              <h4>Search the national provider registry</h4>
              <p style={{maxWidth:400,margin:'0 auto',lineHeight:1.6}}>
                Enter a provider's first or last name above to search all 8M+ providers
                in the CMS NPPES registry. Filter by state and specialty to narrow results.
                Import directly into CredentialIQ with one click.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: VERIFICATION SOURCES ── */}
      {activeTab === 'verify' && (
        <div>
          <div style={{background:'var(--blue-l)',border:'1px solid var(--blue-b)',borderRadius:'var(--r-lg)',padding:'14px 18px',marginBottom:20,fontSize:13,color:'var(--blue)'}}>
            <strong>How to use this page:</strong> Click any source below to open the official verification portal in a new tab.
            For each provider you credential, run checks against NPPES, their state board, and the OIG exclusions database at minimum.
          </div>
          {VERIF_SOURCES.map((s, i) => (
            <div key={i} className="verif-card">
              <div className="verif-icon" style={{background:s.bg,color:s.color}}>{s.icon}</div>
              <div className="verif-body">
                <div className="verif-title">{s.title}</div>
                <div className="verif-desc">{s.desc}</div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <a href={s.href} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">
                    {s.cta}
                  </a>
                  {s.apiAvail && <span className="badge b-green" style={{fontSize:10}}>✓ Free API</span>}
                </div>
                {s.note && <div className="verif-note">{s.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  function guessSpec(tax) {
    if (!tax) return 'Mental Health'
    const t = tax.toLowerCase()
    if (t.includes('social work') || t.includes('counselor') || t.includes('psycholog') || t.includes('mental') || t.includes('marriage') || t.includes('psychiatr')) return 'Mental Health'
    if (t.includes('naturo')) return 'Naturopathic'
    if (t.includes('chiroprac')) return 'Chiropractic'
    if (t.includes('acupunc')) return 'Acupuncture'
    if (t.includes('massage')) return 'Massage Therapy'
    return 'Mental Health'
  }
}


// ─── PSYCHOLOGY TODAY PAGE ─────────────────────────────────────────────────────
function PsychologyToday({ db, setPage, editProvider }) {
  const [activeTab, setActiveTab] = useState('overview')

  const mentalHealthProvs = db.providers.filter(p => p.spec === 'Mental Health' && p.status === 'Active')
  const allProvs = db.providers.filter(p => p.status === 'Active')
  const listed = allProvs.filter(p => p.ptStatus === 'Active')
  const inactive = allProvs.filter(p => p.ptStatus === 'Inactive')
  const unlisted = mentalHealthProvs.filter(p => !p.ptStatus || p.ptStatus === 'None')
  const monthlySpend = listed.filter(p => p.ptMonthlyFee).length * 29.95

  const PT_TIPS = [
    { icon: '📸', title: 'Add a professional photo', desc: 'Profiles with photos get significantly more clicks. Upload via the provider Edit page.' },
    { icon: '✍️', title: 'Write a personal bio', desc: 'Therapists who describe their approach, personality, and ideal client in first person convert better.' },
    { icon: '🎥', title: 'Add a video introduction', desc: 'PT supports a short video. Even a 60-second intro dramatically increases inquiries.' },
    { icon: '🏥', title: 'List all accepted insurances', desc: 'Many clients filter by insurance. Make sure every active payer enrollment is reflected on the PT profile.' },
    { icon: '🎯', title: 'Narrow your specialty focus', desc: 'Specific is better than general. "Trauma and PTSD using EMDR" outperforms "anxiety and depression".' },
    { icon: '💬', title: 'Enable online booking', desc: 'Profiles with booking links convert at a higher rate. Consider linking your intake form.' },
    { icon: '🔄', title: 'Keep availability updated', desc: 'Profiles marked as accepting new clients rank higher in PT search results.' },
    { icon: '⭐', title: 'Complete the entire profile', desc: 'PT favors complete profiles in their algorithm. Fill in every section including finances and statement.' },
  ]

  return (
    <div className="page">
      <div className="lookup-tabs">
        {[['overview','📊 Overview'],['directory','📋 Profile Directory'],['tips','💡 Optimization Tips']].map(([k,l]) => (
          <div key={k} className={`lookup-tab ${activeTab===k?'active':''}`} onClick={()=>setActiveTab(k)}>{l}</div>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div>
          <div className="kpi-grid" style={{marginBottom:20}}>
            <div className="kpi kpi-green">
              <div className="kpi-icon">✅</div>
              <div className="kpi-label">Active PT Listings</div>
              <div className="kpi-value">{listed.length}</div>
              <div className="kpi-sub">of {allProvs.length} active providers</div>
            </div>
            <div className="kpi kpi-red">
              <div className="kpi-icon">⚠️</div>
              <div className="kpi-label">No PT Profile</div>
              <div className="kpi-value">{unlisted.length}</div>
              <div className="kpi-sub">Mental Health providers</div>
            </div>
            <div className="kpi kpi-amber">
              <div className="kpi-icon">⏸️</div>
              <div className="kpi-label">Inactive Listings</div>
              <div className="kpi-value">{inactive.length}</div>
              <div className="kpi-sub">Paused or deactivated</div>
            </div>
            <div className="kpi kpi-blue">
              <div className="kpi-icon">💰</div>
              <div className="kpi-label">Monthly PT Spend</div>
              <div className="kpi-value">${monthlySpend.toFixed(0)}</div>
              <div className="kpi-sub">${(monthlySpend * 12).toFixed(0)}/year · $29.95/provider</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <h3>Active PT Profiles</h3>
                <a href="https://www.psychologytoday.com/us/therapists/oregon/beaverton" target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">Search PT Directory ↗</a>
              </div>
              <div className="card-body" style={{padding:'12px 16px'}}>
                {listed.length === 0 ? (
                  <div className="text-muted">No active Psychology Today listings on file.</div>
                ) : listed.map(p => (
                  <div key={p.id} className="pt-card">
                    <div className="pt-card-avatar">
                      {p.avatarUrl
                        ? <img src={p.avatarUrl} alt={p.fname} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                        : initials(p)
                      }
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13}}>{p.fname} {p.lname}{p.cred?', '+p.cred:''}</div>
                      <div style={{fontSize:11.5,color:'var(--ink-3)'}}>{p.focus||p.spec}</div>
                      {p.ptNotes && <div style={{fontSize:11,color:'var(--ink-4)',marginTop:2}}>{p.ptNotes}</div>}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:5,alignItems:'flex-end'}}>
                      <span className="badge b-green" style={{fontSize:10}}>Active</span>
                      {p.ptMonthlyFee && <span className="badge b-blue" style={{fontSize:10}}>$29.95/mo</span>}
                      {p.ptUrl && (
                        <a href={p.ptUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{padding:'3px 8px',fontSize:11}}>View ↗</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="card mb-16">
                <div className="card-header">
                  <h3>Missing PT Profiles</h3>
                  {unlisted.length > 0 && <span className="badge b-amber">{unlisted.length} providers</span>}
                </div>
                <div className="card-body" style={{padding:'12px 16px'}}>
                  {unlisted.length === 0 ? (
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0'}}>
                      <span style={{fontSize:20}}>🎉</span>
                      <span style={{fontSize:13,color:'var(--ink-3)'}}>All mental health providers have PT listings!</span>
                    </div>
                  ) : unlisted.map(p => (
                    <div key={p.id} className="pt-card pt-missing">
                      <div className="pt-card-avatar" style={{background:'var(--amber-l)',color:'var(--amber)'}}>
                        {p.avatarUrl
                          ? <img src={p.avatarUrl} alt={p.fname} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                          : initials(p)
                        }
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13}}>{p.fname} {p.lname}{p.cred?', '+p.cred:''}</div>
                        <div style={{fontSize:11.5,color:'var(--ink-3)'}}>{p.focus||p.spec}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:5}}>
                        <button className="btn btn-sm btn-primary" style={{fontSize:11}} onClick={()=>editProvider(p.id)}>
                          + Add PT Profile
                        </button>
                        <a href="https://member.psychologytoday.com/us/login" target="_blank" rel="noreferrer"
                          className="btn btn-ghost btn-sm" style={{fontSize:11,textAlign:'center'}}>Sign up PT ↗</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h3>Quick Links</h3></div>
                <div className="card-body" style={{padding:'12px 16px'}}>
                  {[
                    ['🔑 PT Provider Login','Sign into your Psychology Today account','https://member.psychologytoday.com/us/login'],
                    ['🔍 Our Beaverton Listing','See how PIS appears in PT search results','https://www.psychologytoday.com/us/therapists/positive-inner-self-llc-beaverton-or/751449'],
                    ['📖 PT Profile Best Practices','PT guide to getting more clients from your listing','https://www.psychologytoday.com/us/therapists/how-to-attract-clients'],
                    ['💳 PT Billing & Subscription','Manage your $29.95/mo subscription','https://member.psychologytoday.com/us/profile'],
                  ].map(([label, desc, href]) => (
                    <a key={label} href={href} target="_blank" rel="noreferrer"
                      style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:'1px solid var(--border-2)',textDecoration:'none',transition:'color var(--t)'}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--primary)'}}>{label}</div>
                        <div style={{fontSize:11.5,color:'var(--ink-4)'}}>{desc}</div>
                      </div>
                      <span style={{color:'var(--ink-4)',fontSize:12}}>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DIRECTORY TAB ── */}
      {activeTab === 'directory' && (
        <div>
          <div style={{background:'var(--blue-l)',border:'1px solid var(--blue-b)',borderRadius:'var(--r-lg)',padding:'13px 16px',marginBottom:16,fontSize:13,color:'var(--blue)'}}>
            <strong>Tip:</strong> Click "Edit" on any provider to update their PT profile URL, status, and notes. PT profiles cost $29.95/month per provider.
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th className="no-sort">Provider</th>
                <th className="no-sort">Specialty</th>
                <th className="no-sort">PT Status</th>
                <th className="no-sort">Monthly Fee</th>
                <th className="no-sort">PT Profile</th>
                <th className="no-sort">Notes</th>
                <th className="no-sort">Actions</th>
              </tr></thead>
              <tbody>
                {allProvs.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:32,height:32,borderRadius:8,background:SPEC_COLORS[p.spec]||'#4f7ef8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'white',fontFamily:'Poppins,sans-serif',flexShrink:0,overflow:'hidden'}}>
                          {p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : initials(p)}
                        </div>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>{p.fname} {p.lname}</div>
                          <div style={{fontSize:11,color:'var(--ink-4)'}}>{p.cred}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="badge b-gray" style={{fontSize:11}}>{p.spec}</span></td>
                    <td>
                      <span className={`badge ${p.ptStatus==='Active'?'b-green':p.ptStatus==='Inactive'?'b-amber':'b-gray'}`} style={{fontSize:11}}>
                        {p.ptStatus || 'No Listing'}
                      </span>
                    </td>
                    <td style={{fontSize:12,color:'var(--ink-3)'}}>
                      {p.ptMonthlyFee ? <span className="badge b-blue" style={{fontSize:10}}>$29.95/mo</span> : '—'}
                    </td>
                    <td>
                      {p.ptUrl
                        ? <a href={p.ptUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{fontSize:11}}>View Profile ↗</a>
                        : <span style={{fontSize:12,color:'var(--ink-4)'}}>No URL saved</span>
                      }
                    </td>
                    <td style={{fontSize:12,color:'var(--ink-4)',maxWidth:160}}>{p.ptNotes||'—'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={()=>editProvider(p.id)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TIPS TAB ── */}
      {activeTab === 'tips' && (
        <div>
          <div style={{background:'var(--navy)',borderRadius:'var(--r-lg)',padding:'20px 22px',marginBottom:20,color:'white'}}>
            <div style={{fontFamily:'Poppins,sans-serif',fontSize:20,marginBottom:6}}>Psychology Today Profile Optimization</div>
            <div style={{fontSize:13,opacity:.75,lineHeight:1.6}}>
              PT is the largest therapist directory in the US with 1.5M+ monthly visitors. A well-optimized profile is one of the highest-ROI marketing investments for a mental health practice. These tips are based on PT guidance and industry best practices.
            </div>
          </div>
          <div className="grid-2">
            {PT_TIPS.map((tip, i) => (
              <div key={i} className="card" style={{marginBottom:0}}>
                <div className="card-body" style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                  <div style={{width:40,height:40,borderRadius:10,background:'var(--primary-l)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{tip.icon}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13.5,color:'var(--ink)',marginBottom:5}}>{tip.title}</div>
                    <div style={{fontSize:12.5,color:'var(--ink-3)',lineHeight:1.55}}>{tip.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card mt-12">
            <div className="card-header"><h3>Psychology Today Resources</h3></div>
            <div className="card-body">
              <div className="grid-3">
                {[
                  ['📊 Analytics Dashboard','Track profile views and inquiries','https://member.psychologytoday.com'],
                  ['🔧 Edit Your Profile','Update bio, photo, specialties','https://member.psychologytoday.com'],
                  ['💰 Subscription & Billing','Manage $29.95/mo fee','https://member.psychologytoday.com'],
                  ['📚 PT Help Center','Guides on optimizing your listing','https://support.psychologytoday.com'],
                  ['🔍 Preview Your Listing','See how clients see our profile','https://www.psychologytoday.com/us/therapists/positive-inner-self-llc-beaverton-or/751449'],
                  ['📧 Contact PT Support','Questions about your account','https://support.psychologytoday.com'],
                ].map(([title, desc, href]) => (
                  <a key={title} href={href} target="_blank" rel="noreferrer" className="report-card" style={{textDecoration:'none'}}>
                    <h4>{title}</h4><p>{desc}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ELIGIBILITY PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function EligibilityPage({ db, toast }) {
  const { providers, payers, eligibilityChecks: initChecks = [] } = db
  const [checks, setChecks] = useState(initChecks)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => { setChecks(db.eligibilityChecks || []) }, [db.eligibilityChecks])

  function openAdd() { setForm({ status:'Pending', appt_date: new Date().toISOString().split('T')[0] }); setModal(true) }
  function openEdit(c) { setForm({...c}); setModal(true) }

  async function handleVerify() {
    if (!form.member_id || !form.payer_id) { toast('Member ID and payer required to verify.','error'); return }
    setVerifying(true)
    try {
      const res = await fetch('/api/eligibility', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ memberId: form.member_id, payerId: form.payer_id, dob: form.dob, provId: form.prov_id })
      })
      const data = await res.json()
      if (data.error) { toast(data.error,'error'); setVerifying(false); return }
      setForm(f => ({ ...f, status: data.status||'Eligible', copay: data.copay, deductible: data.deductible, deductible_met: data.deductible_met, oop_max: data.oop_max, oop_met: data.oop_met, plan_name: data.plan_name, group_num: data.group_num, raw_response: data.raw }))
      toast('Eligibility verified!','success')
    } catch(e) { toast('Availity API error: '+e.message,'error') }
    setVerifying(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await upsertEligibilityCheck(form)
      setChecks(prev => {
        const idx = prev.findIndex(x => x.id === saved.id)
        return idx >= 0 ? prev.map(x => x.id===saved.id?saved:x) : [saved,...prev]
      })
      toast('Saved!','success')
      setModal(false)
    } catch(e) { toast(e.message,'error') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this eligibility check?')) return
    try { await deleteEligibilityCheck(id); setChecks(c => c.filter(x => x.id!==id)); toast('Deleted.','warn') }
    catch(e) { toast(e.message,'error') }
  }

  const filtered = checks.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.patient_name?.toLowerCase().includes(q) || c.member_id?.toLowerCase().includes(q)
    const matchS = !fStatus || c.status === fStatus
    return matchQ && matchS
  })

  const statusColor = { Eligible:'b-green', Ineligible:'b-red', Pending:'b-amber', Error:'b-gray' }

  return (
    <div className="page">
      <div className="kpi-grid">
        {[['Total Checks', checks.length, ''],
          ['Eligible', checks.filter(c=>c.status==='Eligible').length, 'kpi-teal'],
          ['Ineligible', checks.filter(c=>c.status==='Ineligible').length, 'kpi-red'],
          ['Pending', checks.filter(c=>c.status==='Pending').length, 'kpi-amber'],
        ].map(([label, val, cls]) => (
          <div key={label} className={`kpi ${cls}`}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{val}</div>
          </div>
        ))}
      </div>

      <div style={{background:'var(--blue-l)',border:'1px solid var(--blue-b)',borderRadius:'var(--r-lg)',padding:'13px 16px',marginBottom:16,fontSize:13,color:'var(--blue)'}}>
        <strong>ℹ️ Availity Integration:</strong> Real-time verification requires an Availity provider account (free). Configure your Availity API credentials in Settings, or log checks manually here. SimplePractice data must be entered manually.
      </div>

      <div className="toolbar">
        <div className="search-box"><span className="si">🔍</span><input placeholder="Search patient, member ID…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
        <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['Eligible','Ineligible','Pending','Error'].map(s=><option key={s}>{s}</option>)}
        </select>
        <div className="toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={openAdd}>＋ Add Check</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th className="no-sort">Patient</th>
            <th className="no-sort">Payer</th>
            <th className="no-sort">Provider</th>
            <th className="no-sort">Appt Date</th>
            <th className="no-sort">Member ID</th>
            <th className="no-sort">Status</th>
            <th className="no-sort">Copay</th>
            <th className="no-sort">Deductible</th>
            <th className="no-sort">Checked</th>
            <th className="no-sort">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10}><div className="empty-state"><div className="ei">🩺</div><h4>No eligibility checks yet</h4><p>Add a check or verify insurance before appointments</p></div></td></tr>}
            {filtered.map(c => (
              <tr key={c.id}>
                <td><div style={{fontWeight:600}}>{c.patient_name}</div><div style={{fontSize:11,color:'var(--ink-4)'}}>{c.dob ? fmtDate(c.dob) : ''}</div></td>
                <td style={{fontSize:12}}>{payName(payers, c.payer_id)}</td>
                <td style={{fontSize:12}}>{pNameShort(providers, c.prov_id)}</td>
                <td style={{fontSize:12}}>{c.appt_date ? fmtDate(c.appt_date) : '—'}</td>
                <td style={{fontSize:12,fontFamily:'monospace'}}>{c.member_id||'—'}</td>
                <td><span className={`badge ${statusColor[c.status]||'b-gray'}`}>{c.status||'Pending'}</span></td>
                <td style={{fontSize:12}}>{c.copay != null ? fmtMoney(c.copay) : '—'}</td>
                <td style={{fontSize:12}}>
                  {c.deductible != null ? <span>{fmtMoney(c.deductible_met||0)} / {fmtMoney(c.deductible)} met</span> : '—'}
                </td>
                <td style={{fontSize:11,color:'var(--ink-4)'}}>{c.checked_at ? new Date(c.checked_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div style={{display:'flex',gap:5}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>openEdit(c)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(c.id)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="overlay open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div><h3>{form.id?'Edit Eligibility Check':'New Eligibility Check'}</h3><div className="mh-sub">Verify patient insurance coverage before appointment</div></div>
              <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg full"><label>Patient Name *</label><input value={form.patient_name||''} onChange={e=>setForm(f=>({...f,patient_name:e.target.value}))} placeholder="Last, First" /></div>
                <div className="fg"><label>Date of Birth</label><input type="date" value={form.dob||''} onChange={e=>setForm(f=>({...f,dob:e.target.value}))} /></div>
                <div className="fg"><label>Appointment Date</label><input type="date" value={form.appt_date||''} onChange={e=>setForm(f=>({...f,appt_date:e.target.value}))} /></div>
                <div className="fg"><label>Payer</label>
                  <select value={form.payer_id||''} onChange={e=>setForm(f=>({...f,payer_id:e.target.value}))}>
                    <option value="">— Select Payer —</option>
                    {payers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Provider</label>
                  <select value={form.prov_id||''} onChange={e=>setForm(f=>({...f,prov_id:e.target.value}))}>
                    <option value="">— Select Provider —</option>
                    {providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Member ID</label><input value={form.member_id||''} onChange={e=>setForm(f=>({...f,member_id:e.target.value}))} placeholder="Insurance member ID" /></div>
                <div className="fg"><label>Group Number</label><input value={form.group_num||''} onChange={e=>setForm(f=>({...f,group_num:e.target.value}))} /></div>
                <div className="fg"><label>Plan Name</label><input value={form.plan_name||''} onChange={e=>setForm(f=>({...f,plan_name:e.target.value}))} /></div>
                <div className="fg"><label>Coverage Type</label>
                  <select value={form.cov_type||''} onChange={e=>setForm(f=>({...f,cov_type:e.target.value}))}>
                    <option value="">—</option><option>Individual</option><option>Family</option>
                  </select>
                </div>
                <div className="fg"><label>Status</label>
                  <select value={form.status||'Pending'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    {['Pending','Eligible','Ineligible','Error'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="section-divider">Financial Details (manual entry or from API)</div>
                <div className="fg"><label>Copay</label><input type="number" step="0.01" value={form.copay||''} onChange={e=>setForm(f=>({...f,copay:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>Deductible</label><input type="number" step="0.01" value={form.deductible||''} onChange={e=>setForm(f=>({...f,deductible:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>Deductible Met</label><input type="number" step="0.01" value={form.deductible_met||''} onChange={e=>setForm(f=>({...f,deductible_met:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>OOP Max</label><input type="number" step="0.01" value={form.oop_max||''} onChange={e=>setForm(f=>({...f,oop_max:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>OOP Met</label><input type="number" step="0.01" value={form.oop_met||''} onChange={e=>setForm(f=>({...f,oop_met:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg full"><label>Notes</label><textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} /></div>
              </div>
              <div style={{marginTop:14,padding:'12px 14px',background:'var(--surface-2)',borderRadius:'var(--r-md)',border:'1px solid var(--border)',fontSize:12.5,color:'var(--ink-3)'}}>
                💡 <strong>Availity real-time verification:</strong> Enter member ID + payer, then click "Verify via Availity" to auto-fill eligibility data. Requires Availity API credentials in Settings.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-ghost" onClick={handleVerify} disabled={verifying}>
                {verifying ? <><span className="spinner"/>Verifying…</> : '🔗 Verify via Availity'}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><span className="spinner"/>Saving…</> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIMS TRACKER PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function ClaimsPage({ db, toast }) {
  const { providers, payers, claims: initClaims = [] } = db
  const [claims, setClaims] = useState(initClaims)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fProv, setFProv] = useState('')
  const [activeTab, setActiveTab] = useState('list')

  useEffect(() => { setClaims(db.claims || []) }, [db.claims])

  function openAdd() {
    setForm({ status:'Submitted', submitted_date: new Date().toISOString().split('T')[0] })
    setModal(true)
  }
  function openEdit(c) { setForm({...c, cpt_codes_str: (c.cpt_codes||[]).join(', '), diag_codes_str: (c.diagnosis_codes||[]).join(', ')}); setModal(true) }

  async function handleSave() {
    const obj = { ...form,
      cpt_codes: form.cpt_codes_str ? form.cpt_codes_str.split(',').map(s=>s.trim()).filter(Boolean) : [],
      diagnosis_codes: form.diag_codes_str ? form.diag_codes_str.split(',').map(s=>s.trim()).filter(Boolean) : [],
    }
    delete obj.cpt_codes_str; delete obj.diag_codes_str
    setSaving(true)
    try {
      const saved = await upsertClaim(obj)
      setClaims(prev => { const idx=prev.findIndex(x=>x.id===saved.id); return idx>=0?prev.map(x=>x.id===saved.id?saved:x):[saved,...prev] })
      toast('Claim saved!','success'); setModal(false)
    } catch(e) { toast(e.message,'error') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this claim?')) return
    try { await deleteClaim(id); setClaims(c=>c.filter(x=>x.id!==id)); toast('Deleted.','warn') }
    catch(e) { toast(e.message,'error') }
  }

  const filtered = claims.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.patient_name?.toLowerCase().includes(q) || c.claim_num?.toLowerCase().includes(q)
    const matchS = !fStatus || c.status === fStatus
    const matchP = !fProv || c.prov_id === fProv
    return matchQ && matchS && matchP
  })

  // A/R Aging
  const aging = Object.fromEntries(AGING_BUCKETS.map(b=>[b,0]))
  const pendingClaims = claims.filter(c => !['Paid','Written Off'].includes(c.status))
  pendingClaims.forEach(c => {
    const bucket = getAgingBucket(c.submitted_date)
    aging[bucket] = (aging[bucket]||0) + (Number(c.billed_amount||0) - Number(c.paid_amount||0))
  })
  const totalAR = Object.values(aging).reduce((s,v)=>s+v,0)
  const totalBilled = claims.reduce((s,c)=>s+Number(c.billed_amount||0),0)
  const totalPaid = claims.reduce((s,c)=>s+Number(c.paid_amount||0),0)
  const totalDenied = claims.filter(c=>c.status==='Denied').reduce((s,c)=>s+Number(c.billed_amount||0),0)

  const statusColor = { Submitted:'b-blue', Pending:'b-amber', Paid:'b-green', Denied:'b-red', Partial:'b-teal', Appeal:'b-purple' }
  const agingColor = ['#16a34a','#d97706','#c97d1e','#dc2626','#7c3aed']

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Total Billed</div><div className="kpi-value" style={{fontSize:26}}>{fmtMoney(totalBilled)}</div></div>
        <div className="kpi kpi-teal"><div className="kpi-label">Total Paid</div><div className="kpi-value" style={{fontSize:26}}>{fmtMoney(totalPaid)}</div><div className="kpi-sub">{totalBilled>0?((totalPaid/totalBilled)*100).toFixed(1):0}% collection rate</div></div>
        <div className="kpi kpi-amber"><div className="kpi-label">Total A/R</div><div className="kpi-value" style={{fontSize:26}}>{fmtMoney(totalAR)}</div><div className="kpi-sub">{pendingClaims.length} open claims</div></div>
        <div className="kpi kpi-red"><div className="kpi-label">Denied</div><div className="kpi-value" style={{fontSize:26}}>{fmtMoney(totalDenied)}</div><div className="kpi-sub">{claims.filter(c=>c.status==='Denied').length} claims</div></div>
      </div>

      <div className="tabs">
        {[['list','📋 All Claims'],['aging','📊 A/R Aging']].map(([t,l])=>(
          <div key={t} className={`tab ${activeTab===t?'active':''}`} onClick={()=>setActiveTab(t)}>{l}</div>
        ))}
      </div>

      {activeTab === 'aging' && (
        <div className="card mb-20">
          <div className="card-header"><h3>A/R Aging Report</h3><span className="ch-meta">Unpaid balance by days outstanding</span></div>
          <div className="card-body">
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
              {AGING_BUCKETS.map((b,i) => (
                <div key={b} style={{textAlign:'center',padding:'16px 8px',borderRadius:'var(--r-lg)',background:'var(--surface-2)',border:'1px solid var(--border)'}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:.5,textTransform:'uppercase',color:'var(--ink-4)',marginBottom:6}}>{b} days</div>
                  <div style={{fontFamily:'Poppins,sans-serif',fontSize:22,color:agingColor[i],marginBottom:4}}>{fmtMoney(aging[b])}</div>
                  <div style={{fontSize:10,color:'var(--ink-4)'}}>{totalAR>0?((aging[b]/totalAR)*100).toFixed(0):0}% of A/R</div>
                </div>
              ))}
            </div>
            <div style={{background:'var(--surface-2)',borderRadius:'var(--r-md)',padding:'12px 16px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--ink-4)',marginBottom:8,textTransform:'uppercase',letterSpacing:.5}}>Visual Distribution</div>
              <div style={{display:'flex',height:20,borderRadius:6,overflow:'hidden',gap:2}}>
                {AGING_BUCKETS.map((b,i) => {
                  const pct = totalAR>0?(aging[b]/totalAR)*100:0
                  return pct>0 ? <div key={b} style={{width:`${pct}%`,background:agingColor[i],transition:'width .4s'}} title={`${b} days: ${fmtMoney(aging[b])}`}/> : null
                })}
              </div>
              <div style={{display:'flex',gap:16,marginTop:8,flexWrap:'wrap'}}>
                {AGING_BUCKETS.map((b,i) => (
                  <div key={b} style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}>
                    <div style={{width:8,height:8,borderRadius:2,background:agingColor[i],flexShrink:0}}/>
                    <span style={{color:'var(--ink-3)'}}>{b} days</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'list' && <>
        <div className="toolbar">
          <div className="search-box"><span className="si">🔍</span><input placeholder="Search patient, claim #…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
          <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {['Submitted','Pending','Paid','Denied','Partial','Appeal'].map(s=><option key={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={fProv} onChange={e=>setFProv(e.target.value)}>
            <option value="">All Providers</option>
            {providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
          </select>
          <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={openAdd}>＋ Add Claim</button></div>
        </div>
        <div style={{marginBottom:12,fontSize:12,color:'var(--ink-4)',padding:'8px 12px',background:'var(--amber-l)',border:'1px solid var(--amber-b)',borderRadius:'var(--r-md)'}}>
          💡 <strong>SimplePractice users:</strong> Export claims from SP → Reports → Billing, then enter manually here. A CSV import tool is planned for a future update.
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th className="no-sort">Claim #</th>
              <th className="no-sort">Patient</th>
              <th className="no-sort">DOS</th>
              <th className="no-sort">Provider</th>
              <th className="no-sort">Payer</th>
              <th className="no-sort">CPT</th>
              <th className="no-sort">Billed</th>
              <th className="no-sort">Paid</th>
              <th className="no-sort">Status</th>
              <th className="no-sort">Aging</th>
              <th className="no-sort">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={11}><div className="empty-state"><div className="ei">📋</div><h4>No claims yet</h4><p>Add claims manually or import from your clearinghouse</p></div></td></tr>}
              {filtered.map(c => {
                const bucket = getAgingBucket(c.submitted_date)
                const agingCls = bucket==='120+'?'b-red':bucket==='91–120'?'b-red':bucket==='61–90'?'b-amber':bucket==='31–60'?'b-amber':'b-green'
                return (
                  <tr key={c.id}>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{c.claim_num||'—'}</td>
                    <td><div style={{fontWeight:600,fontSize:13}}>{c.patient_name}</div><div style={{fontSize:11,color:'var(--ink-4)'}}>{c.dob?fmtDate(c.dob):''}</div></td>
                    <td style={{fontSize:12}}>{c.dos?fmtDate(c.dos):'—'}</td>
                    <td style={{fontSize:12}}>{pNameShort(providers,c.prov_id)}</td>
                    <td style={{fontSize:12}}>{payName(payers,c.payer_id)}</td>
                    <td style={{fontSize:11,fontFamily:'monospace'}}>{(c.cpt_codes||[]).join(', ')||'—'}</td>
                    <td style={{fontSize:12,fontWeight:500}}>{fmtMoney(c.billed_amount)}</td>
                    <td style={{fontSize:12,color:'var(--green)'}}>{c.paid_amount?fmtMoney(c.paid_amount):'—'}</td>
                    <td><span className={`badge ${statusColor[c.status]||'b-gray'}`}>{c.status}</span></td>
                    <td>{!['Paid','Written Off'].includes(c.status) ? <span className={`badge ${agingCls}`}>{bucket}</span> : <span style={{fontSize:11,color:'var(--ink-4)'}}>—</span>}</td>
                    <td><div style={{display:'flex',gap:5}}><button className="btn btn-secondary btn-sm" onClick={()=>openEdit(c)}>Edit</button><button className="btn btn-danger btn-sm" onClick={()=>handleDelete(c.id)}>✕</button></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>}

      {modal && (
        <div className="overlay open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div><h3>{form.id?'Edit Claim':'New Claim'}</h3><div className="mh-sub">Log a claim from SimplePractice or your clearinghouse</div></div>
              <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg"><label>Claim Number</label><input value={form.claim_num||''} onChange={e=>setForm(f=>({...f,claim_num:e.target.value}))} placeholder="Clearinghouse claim #" /></div>
                <div className="fg"><label>Status</label>
                  <select value={form.status||'Submitted'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    {['Submitted','Pending','Paid','Denied','Partial','Appeal'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="fg full"><label>Patient Name *</label><input value={form.patient_name||''} onChange={e=>setForm(f=>({...f,patient_name:e.target.value}))} /></div>
                <div className="fg"><label>Date of Birth</label><input type="date" value={form.dob||''} onChange={e=>setForm(f=>({...f,dob:e.target.value}))} /></div>
                <div className="fg"><label>Date of Service *</label><input type="date" value={form.dos||''} onChange={e=>setForm(f=>({...f,dos:e.target.value}))} /></div>
                <div className="fg"><label>Provider</label>
                  <select value={form.prov_id||''} onChange={e=>setForm(f=>({...f,prov_id:e.target.value}))}>
                    <option value="">— Select —</option>
                    {providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Payer</label>
                  <select value={form.payer_id||''} onChange={e=>setForm(f=>({...f,payer_id:e.target.value}))}>
                    <option value="">— Select —</option>
                    {payers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="fg"><label>CPT Codes (comma-separated)</label><input value={form.cpt_codes_str||''} onChange={e=>setForm(f=>({...f,cpt_codes_str:e.target.value}))} placeholder="90837, 90846" /></div>
                <div className="fg"><label>Diagnosis Codes (comma-separated)</label><input value={form.diag_codes_str||''} onChange={e=>setForm(f=>({...f,diag_codes_str:e.target.value}))} placeholder="F41.1, Z63.0" /></div>
                <div className="section-divider">Financials</div>
                <div className="fg"><label>Billed Amount</label><input type="number" step="0.01" value={form.billed_amount||''} onChange={e=>setForm(f=>({...f,billed_amount:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>Allowed Amount</label><input type="number" step="0.01" value={form.allowed_amount||''} onChange={e=>setForm(f=>({...f,allowed_amount:e.target.value}))} /></div>
                <div className="fg"><label>Paid Amount</label><input type="number" step="0.01" value={form.paid_amount||''} onChange={e=>setForm(f=>({...f,paid_amount:e.target.value}))} /></div>
                <div className="fg"><label>Patient Responsibility</label><input type="number" step="0.01" value={form.patient_resp||''} onChange={e=>setForm(f=>({...f,patient_resp:e.target.value}))} /></div>
                <div className="fg"><label>Submitted Date</label><input type="date" value={form.submitted_date||''} onChange={e=>setForm(f=>({...f,submitted_date:e.target.value}))} /></div>
                <div className="fg"><label>Paid Date</label><input type="date" value={form.paid_date||''} onChange={e=>setForm(f=>({...f,paid_date:e.target.value}))} /></div>
                <div className="fg"><label>Clearinghouse</label><input value={form.clearinghouse||''} onChange={e=>setForm(f=>({...f,clearinghouse:e.target.value}))} placeholder="Availity, Office Ally…" /></div>
                <div className="fg"><label>ERA Received</label>
                  <select value={form.era_received?'yes':'no'} onChange={e=>setForm(f=>({...f,era_received:e.target.value==='yes'}))}>
                    <option value="no">No</option><option value="yes">Yes</option>
                  </select>
                </div>
                <div className="fg full"><label>Notes</label><textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?<><span className="spinner"/>Saving…</>:'Save Claim'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DENIAL LOG PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function DenialLog({ db, toast }) {
  const { providers, payers, denials: initDenials = [], claims = [] } = db
  const [denials, setDenials] = useState(initDenials)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [fAppeal, setFAppeal] = useState('')
  const [fCat, setFCat] = useState('')

  useEffect(() => { setDenials(db.denials || []) }, [db.denials])

  function openAdd() { setForm({ appeal_status:'Not Started', denial_date: new Date().toISOString().split('T')[0] }); setModal(true) }
  function openEdit(d) { setForm({...d}); setModal(true) }

  // Auto-calc appeal deadline (90 days from denial) when denial date changes
  function handleDenialDateChange(val) {
    const deadline = new Date(val)
    deadline.setDate(deadline.getDate()+90)
    setForm(f=>({...f, denial_date:val, appeal_deadline: deadline.toISOString().split('T')[0]}))
  }

  function handleCodeSelect(code) {
    const found = DENIAL_CODES.find(d=>d.code===code)
    if (found) setForm(f=>({...f, reason_code:found.code, reason_desc:found.desc, category:found.cat}))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await upsertDenial(form)
      setDenials(prev=>{ const idx=prev.findIndex(x=>x.id===saved.id); return idx>=0?prev.map(x=>x.id===saved.id?saved:x):[saved,...prev] })
      toast('Denial logged!','success'); setModal(false)
    } catch(e) { toast(e.message,'error') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this denial?')) return
    try { await deleteDenial(id); setDenials(d=>d.filter(x=>x.id!==id)); toast('Deleted.','warn') }
    catch(e) { toast(e.message,'error') }
  }

  const filtered = denials.filter(d => {
    const q = search.toLowerCase()
    const claimPatient = d.claims?.patient_name||''
    const matchQ = !q || d.reason_code?.toLowerCase().includes(q) || claimPatient.toLowerCase().includes(q) || d.reason_desc?.toLowerCase().includes(q)
    const matchA = !fAppeal || d.appeal_status===fAppeal
    const matchC = !fCat || d.category===fCat
    return matchQ && matchA && matchC
  })

  // Stats
  const totalDenied = denials.length
  const won = denials.filter(d=>d.appeal_status==='Won').length
  const pending = denials.filter(d=>['Not Started','In Progress'].includes(d.appeal_status)).length
  const overdue = denials.filter(d=>d.appeal_deadline && daysUntil(d.appeal_deadline)!==null && daysUntil(d.appeal_deadline)<0 && !['Won','Lost','Written Off'].includes(d.appeal_status)).length

  const appealColor = { 'Not Started':'b-gray','In Progress':'b-blue','Won':'b-green','Lost':'b-red','Written Off':'b-amber' }
  const catColor = { 'Authorization':'b-purple','Coding':'b-blue','Eligibility':'b-teal','Timely Filing':'b-red','Coordination':'b-amber','Information':'b-gray','Patient Resp':'b-gold','Prior Payer':'b-gray' }

  // Denial by category breakdown
  const byCat = {}
  denials.forEach(d=>{ byCat[d.category||'Other']=(byCat[d.category||'Other']||0)+1 })

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Total Denials</div><div className="kpi-value">{totalDenied}</div></div>
        <div className="kpi kpi-red"><div className="kpi-label">Overdue Appeals</div><div className="kpi-value">{overdue}</div><div className="kpi-sub">Deadline passed</div></div>
        <div className="kpi kpi-amber"><div className="kpi-label">Pending Appeals</div><div className="kpi-value">{pending}</div></div>
        <div className="kpi kpi-teal"><div className="kpi-label">Appeals Won</div><div className="kpi-value">{won}</div><div className="kpi-sub">{totalDenied>0?((won/totalDenied)*100).toFixed(0):0}% win rate</div></div>
      </div>

      {overdue > 0 && (
        <div style={{background:'var(--red-l)',border:'1px solid var(--red-b)',borderRadius:'var(--r-lg)',padding:'12px 16px',marginBottom:16,fontSize:13,color:'var(--red)'}}>
          ⚠️ <strong>{overdue} appeal deadline{overdue>1?'s':''} overdue.</strong> Review and mark as Written Off or escalate immediately.
        </div>
      )}

      {Object.keys(byCat).length > 0 && (
        <div className="card mb-20">
          <div className="card-header"><h3>Denials by Category</h3></div>
          <div className="card-body">
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat, count]) => (
                <div key={cat} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)'}}>
                  <span className={`badge ${catColor[cat]||'b-gray'}`} style={{fontSize:10}}>{cat}</span>
                  <span style={{fontFamily:'Poppins,sans-serif',fontSize:20,color:'var(--ink)'}}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="search-box"><span className="si">🔍</span><input placeholder="Search code, patient, description…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
        <select className="filter-select" value={fCat} onChange={e=>setFCat(e.target.value)}>
          <option value="">All Categories</option>
          {['Authorization','Coding','Eligibility','Timely Filing','Coordination','Information','Patient Resp','Prior Payer'].map(c=><option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={fAppeal} onChange={e=>setFAppeal(e.target.value)}>
          <option value="">All Appeal Statuses</option>
          {['Not Started','In Progress','Won','Lost','Written Off'].map(s=><option key={s}>{s}</option>)}
        </select>
        <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={openAdd}>＋ Log Denial</button></div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th className="no-sort">Patient / DOS</th>
            <th className="no-sort">Reason Code</th>
            <th className="no-sort">Category</th>
            <th className="no-sort">Denial Date</th>
            <th className="no-sort">Appeal Deadline</th>
            <th className="no-sort">Appeal Status</th>
            <th className="no-sort">Days Left</th>
            <th className="no-sort">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length===0 && <tr><td colSpan={8}><div className="empty-state"><div className="ei">🚫</div><h4>No denials logged</h4><p>Log a denial to track appeals and deadlines</p></div></td></tr>}
            {filtered.map(d => {
              const dl = daysUntil(d.appeal_deadline)
              const deadlineClass = dl===null?'b-gray':dl<0?'b-red':dl<=14?'b-red':dl<=30?'b-amber':'b-green'
              const isDone = ['Won','Lost','Written Off'].includes(d.appeal_status)
              return (
                <tr key={d.id} style={d.appeal_status==='Won'?{background:'#f0fdf4'}:overdue&&dl!==null&&dl<0&&!isDone?{background:'var(--red-l)'}:{}}>
                  <td>
                    <div style={{fontWeight:600}}>{d.claims?.patient_name||'—'}</div>
                    <div style={{fontSize:11,color:'var(--ink-4)'}}>{d.claims?.dos?fmtDate(d.claims.dos):''}</div>
                  </td>
                  <td>
                    <span style={{fontFamily:'monospace',fontSize:12,fontWeight:600,color:'var(--ink)'}}>{d.reason_code||'—'}</span>
                    <div style={{fontSize:11,color:'var(--ink-4)',marginTop:2,maxWidth:180}}>{d.reason_desc||''}</div>
                  </td>
                  <td>{d.category ? <span className={`badge ${catColor[d.category]||'b-gray'}`} style={{fontSize:10}}>{d.category}</span> : '—'}</td>
                  <td style={{fontSize:12}}>{d.denial_date?fmtDate(d.denial_date):'—'}</td>
                  <td style={{fontSize:12}}>{d.appeal_deadline?fmtDate(d.appeal_deadline):'—'}</td>
                  <td><span className={`badge ${appealColor[d.appeal_status]||'b-gray'}`}>{d.appeal_status||'Not Started'}</span></td>
                  <td>
                    {isDone ? <span style={{fontSize:11,color:'var(--ink-4)'}}>—</span>
                    : dl===null ? '—'
                    : <span className={`badge ${deadlineClass}`}>{dl<0?`${Math.abs(dl)}d overdue`:`${dl}d`}</span>}
                  </td>
                  <td><div style={{display:'flex',gap:5}}><button className="btn btn-secondary btn-sm" onClick={()=>openEdit(d)}>Edit</button><button className="btn btn-danger btn-sm" onClick={()=>handleDelete(d.id)}>✕</button></div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="overlay open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div><h3>{form.id?'Edit Denial':'Log Denial'}</h3><div className="mh-sub">Track denial reason, appeal status, and deadline</div></div>
              <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg"><label>Linked Claim (optional)</label>
                  <select value={form.claim_id||''} onChange={e=>setForm(f=>({...f,claim_id:e.target.value}))}>
                    <option value="">— Unlinked —</option>
                    {claims.map(c=><option key={c.id} value={c.id}>{c.patient_name} — {c.dos?fmtDate(c.dos):''} (#{c.claim_num||'no #'})</option>)}
                  </select>
                </div>
                <div className="fg"><label>Denial Date *</label><input type="date" value={form.denial_date||''} onChange={e=>handleDenialDateChange(e.target.value)} /></div>
                <div className="fg"><label>Reason Code</label>
                  <select value={form.reason_code||''} onChange={e=>handleCodeSelect(e.target.value)}>
                    <option value="">— Select code —</option>
                    {DENIAL_CODES.map(d=><option key={d.code} value={d.code}>{d.code} — {d.desc}</option>)}
                    <option value="OTHER">Other (enter manually)</option>
                  </select>
                </div>
                <div className="fg"><label>Category</label>
                  <select value={form.category||''} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    <option value="">—</option>
                    {['Authorization','Coding','Eligibility','Timely Filing','Coordination','Information','Patient Resp','Prior Payer','Other'].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fg full"><label>Reason Description</label><input value={form.reason_desc||''} onChange={e=>setForm(f=>({...f,reason_desc:e.target.value}))} placeholder="Description of denial reason" /></div>
                <div className="fg"><label>Appeal Deadline</label><input type="date" value={form.appeal_deadline||''} onChange={e=>setForm(f=>({...f,appeal_deadline:e.target.value}))} /></div>
                <div className="fg"><label>Appeal Status</label>
                  <select value={form.appeal_status||'Not Started'} onChange={e=>setForm(f=>({...f,appeal_status:e.target.value}))}>
                    {['Not Started','In Progress','Won','Lost','Written Off'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="fg full"><label>Appeal Notes</label><textarea value={form.appeal_notes||''} onChange={e=>setForm(f=>({...f,appeal_notes:e.target.value}))} rows={3} placeholder="Document steps taken, attachments sent, contacts made…" /></div>
              </div>
              <div style={{marginTop:14}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:.5,textTransform:'uppercase',color:'var(--ink-4)',marginBottom:8}}>Common Denial Codes Reference</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {DENIAL_CODES.map(d=>(
                    <button key={d.code} className="btn btn-ghost btn-sm" style={{fontFamily:'monospace',fontSize:11}} onClick={()=>handleCodeSelect(d.code)} title={d.desc}>{d.code}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?<><span className="spinner"/>Saving…</>:'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE ANALYTICS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function RevenueAnalytics({ db }) {
  const { providers, payers, claims = [], payments = [] } = db
  const [period, setPeriod] = useState('month') // month | quarter | year | all

  function getWindowStart() {
    const now = new Date()
    if (period==='month') { const d=new Date(now); d.setDate(1); return d }
    if (period==='quarter') { const d=new Date(now); d.setMonth(Math.floor(d.getMonth()/3)*3,1); return d }
    if (period==='year') { return new Date(now.getFullYear(),0,1) }
    return new Date('2000-01-01')
  }

  const windowStart = getWindowStart()
  const inPeriod = c => !c.dos || new Date(c.dos) >= windowStart

  const periodClaims = claims.filter(inPeriod)
  const totalBilled = periodClaims.reduce((s,c)=>s+Number(c.billed_amount||0),0)
  const totalPaid = periodClaims.reduce((s,c)=>s+Number(c.paid_amount||0),0)
  const totalDenied = periodClaims.filter(c=>c.status==='Denied').reduce((s,c)=>s+Number(c.billed_amount||0),0)
  const totalAR = periodClaims.filter(c=>!['Paid','Written Off'].includes(c.status)).reduce((s,c)=>s+Number(c.billed_amount||0)-Number(c.paid_amount||0),0)
  const collRate = totalBilled > 0 ? (totalPaid/totalBilled*100) : 0

  // By Provider
  const byProvider = {}
  periodClaims.forEach(c => {
    const key = c.prov_id || 'unknown'
    if (!byProvider[key]) byProvider[key] = { billed:0, paid:0, count:0, denied:0 }
    byProvider[key].billed += Number(c.billed_amount||0)
    byProvider[key].paid += Number(c.paid_amount||0)
    byProvider[key].count++
    if (c.status==='Denied') byProvider[key].denied++
  })

  // By Payer
  const byPayer = {}
  periodClaims.forEach(c => {
    const key = c.payer_id || 'unknown'
    if (!byPayer[key]) byPayer[key] = { billed:0, paid:0, count:0 }
    byPayer[key].billed += Number(c.billed_amount||0)
    byPayer[key].paid += Number(c.paid_amount||0)
    byPayer[key].count++
  })

  // Monthly trend (last 6 months)
  const months = []
  for (let i=5;i>=0;i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth()-i)
    const label = d.toLocaleDateString('en-US',{month:'short',year:'2-digit'})
    const start = new Date(d)
    const end = new Date(d.getFullYear(), d.getMonth()+1, 1)
    const mc = claims.filter(c => c.dos && new Date(c.dos)>=start && new Date(c.dos)<end)
    months.push({
      label,
      billed: mc.reduce((s,c)=>s+Number(c.billed_amount||0),0),
      paid: mc.reduce((s,c)=>s+Number(c.paid_amount||0),0),
    })
  }
  const maxMonthVal = Math.max(...months.map(m=>m.billed), 1)

  const PROV_COLORS = ['#1a6ef5','#16a34a','#d97706','#7c3aed','#0891b2','#dc2626']

  return (
    <div className="page">
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <div style={{flex:1,fontFamily:'Poppins,sans-serif',fontSize:18,color:'var(--ink)'}}>Revenue Overview</div>
        <div style={{display:'flex',gap:4,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:4}}>
          {[['month','This Month'],['quarter','This Quarter'],['year','This Year'],['all','All Time']].map(([v,l])=>(
            <button key={v} className={`btn btn-sm ${period===v?'btn-primary':'btn-ghost'}`} style={{fontSize:11}} onClick={()=>setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Billed</div><div className="kpi-value" style={{fontSize:24}}>{fmtMoney(totalBilled)}</div><div className="kpi-sub">{periodClaims.length} claims</div></div>
        <div className="kpi kpi-teal"><div className="kpi-label">Collected</div><div className="kpi-value" style={{fontSize:24}}>{fmtMoney(totalPaid)}</div><div className="kpi-sub">{collRate.toFixed(1)}% collection rate</div></div>
        <div className="kpi kpi-amber"><div className="kpi-label">Outstanding A/R</div><div className="kpi-value" style={{fontSize:24}}>{fmtMoney(totalAR)}</div></div>
        <div className="kpi kpi-red"><div className="kpi-label">Denied</div><div className="kpi-value" style={{fontSize:24}}>{fmtMoney(totalDenied)}</div></div>
      </div>

      {/* Collection Rate Bar */}
      <div className="card mb-20">
        <div className="card-header"><h3>Collection Rate</h3><span className="ch-meta">{collRate.toFixed(1)}% of billed collected</span></div>
        <div className="card-body">
          <div style={{height:12,background:'var(--border-2)',borderRadius:6,overflow:'hidden',marginBottom:8}}>
            <div style={{height:'100%',width:`${Math.min(collRate,100)}%`,background: collRate>=85?'var(--green)':collRate>=70?'var(--amber)':'var(--red)',borderRadius:6,transition:'width .4s'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--ink-4)'}}>
            <span>0%</span><span style={{color:collRate>=85?'var(--green)':collRate>=70?'var(--amber)':'var(--red)',fontWeight:600}}>{collRate.toFixed(1)}%</span><span>100%</span>
          </div>
          <div style={{marginTop:10,fontSize:12,color:'var(--ink-3)'}}>
            Industry benchmark for mental health practices: <strong>75–85%</strong>. {collRate>=85?'✅ Above benchmark!':collRate>=75?'🟡 Within benchmark.':'⚠️ Below benchmark — review denial patterns.'}
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="card mb-20">
        <div className="card-header"><h3>Monthly Billing Trend</h3><span className="ch-meta">Last 6 months</span></div>
        <div className="card-body">
          {months.every(m=>m.billed===0) ? (
            <div className="empty-state" style={{padding:24}}><div className="ei">📊</div><p>No claim data yet — add claims to see trends</p></div>
          ) : (
            <div style={{display:'flex',alignItems:'flex-end',gap:8,height:140,paddingBottom:24,position:'relative'}}>
              {months.map((m,i) => (
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                  <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:110}}>
                    <div style={{flex:1,background:'#dbeafe',borderRadius:'4px 4px 0 0',height:`${(m.billed/maxMonthVal)*100}%`,minHeight:2,position:'relative'}} title={`Billed: ${fmtMoney(m.billed)}`}/>
                    <div style={{flex:1,background:'#16a34a',borderRadius:'4px 4px 0 0',height:`${(m.paid/maxMonthVal)*100}%`,minHeight:m.paid>0?2:0}} title={`Paid: ${fmtMoney(m.paid)}`}/>
                  </div>
                  <div style={{fontSize:9,color:'var(--ink-4)',whiteSpace:'nowrap'}}>{m.label}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{display:'flex',gap:16,marginTop:4}}>
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}><div style={{width:10,height:10,background:'#dbeafe',borderRadius:2}}/><span>Billed</span></div>
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}><div style={{width:10,height:10,background:'#16a34a',borderRadius:2}}/><span>Collected</span></div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* By Provider */}
        <div className="card">
          <div className="card-header"><h3>Revenue by Provider</h3></div>
          <div className="card-body">
            {Object.keys(byProvider).length === 0 ? (
              <div className="empty-state" style={{padding:16}}><p>No data yet</p></div>
            ) : Object.entries(byProvider).sort((a,b)=>b[1].billed-a[1].billed).map(([provId, data], i) => (
              <div key={provId} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink)'}}>{pNameShort(providers,provId)||'Unknown'}</div>
                  <div style={{fontSize:12,color:'var(--ink-3)'}}>{fmtMoney(data.paid)} / {fmtMoney(data.billed)}</div>
                </div>
                <div style={{height:7,background:'var(--border-2)',borderRadius:4,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${data.billed>0?(data.paid/data.billed*100):0}%`,background:PROV_COLORS[i%PROV_COLORS.length],borderRadius:4}}/>
                </div>
                <div style={{fontSize:10,color:'var(--ink-4)',marginTop:2}}>{data.count} claims · {data.denied} denied</div>
              </div>
            ))}
          </div>
        </div>

        {/* By Payer */}
        <div className="card">
          <div className="card-header"><h3>Revenue by Payer</h3></div>
          <div className="card-body">
            {Object.keys(byPayer).length === 0 ? (
              <div className="empty-state" style={{padding:16}}><p>No data yet</p></div>
            ) : Object.entries(byPayer).sort((a,b)=>b[1].paid-a[1].paid).map(([payerId, data], i) => (
              <div key={payerId} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontSize:12.5,fontWeight:600}}>{payName(payers,payerId)||'Unknown'}</div>
                  <div style={{fontSize:12,color:'var(--ink-3)'}}>{data.billed>0?(data.paid/data.billed*100).toFixed(0):0}% collected</div>
                </div>
                <div style={{height:7,background:'var(--border-2)',borderRadius:4,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${data.billed>0?(data.paid/data.billed*100):0}%`,background:PROV_COLORS[(i+2)%PROV_COLORS.length],borderRadius:4}}/>
                </div>
                <div style={{fontSize:10,color:'var(--ink-4)',marginTop:2}}>{data.count} claims · {fmtMoney(data.paid)} paid</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-12" style={{marginTop:16}}>
        <div className="card-header"><h3>SimplePractice Import Guide</h3></div>
        <div className="card-body">
          <div style={{fontSize:13,color:'var(--ink-3)',lineHeight:1.7}}>
            Since SimplePractice doesn't offer a direct API integration, revenue data must be imported manually. Here's the recommended workflow:
          </div>
          <ol style={{marginTop:12,paddingLeft:20,fontSize:13,color:'var(--ink-3)',lineHeight:2}}>
            <li>In SimplePractice, go to <strong>Reports → Billing</strong></li>
            <li>Export to CSV for the desired date range</li>
            <li>Enter each claim in the <strong>Claims Tracker</strong> (or use the upcoming CSV import feature)</li>
            <li>Update payment status when EOBs / ERAs are received from payers</li>
            <li>Log any denials in the <strong>Denial Log</strong> with the reason code from the ERA</li>
          </ol>
          <div style={{marginTop:12,padding:'10px 14px',background:'var(--blue-l)',border:'1px solid var(--blue-b)',borderRadius:'var(--r-md)',fontSize:12,color:'var(--blue)'}}>
            💡 <strong>Future:</strong> CSV batch import for SimplePractice billing exports is planned. Until then, entering claims manually ensures accurate A/R aging and denial tracking.
          </div>
        </div>
      </div>
    </div>
  )
}
