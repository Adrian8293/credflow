import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import EnrollmentKanban from '../components/EnrollmentKanban'
import {
  WorkflowDashboard,
  WorkflowProviderCard,
  WorkflowTasks,
  WorkflowDocuments,
  ProviderCommandCenter,
  ReadinessRing,
  NextActionBanner,
  ProviderReadinessBar,
  EnrollmentStageBar,
  SLABadge,
  providerReadiness,
} from '../components/WorkflowOverhaul'
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

// ─── KANBAN COLUMNS ───────────────────────────────────────────────────────────
const KANBAN_COLUMNS = [
  { id:'submitted', label:'Submitted', stages:['Application Submitted'], color:'#2563eb', icon:'📨' },
  { id:'in_progress', label:'In Progress', stages:['Awaiting CAQH','Pending Verification','Under Review'], color:'#d97706', icon:'⚙️' },
  { id:'followup', label:'Follow-up Needed', stages:['Additional Info Requested'], color:'#dc2626', icon:'🔔' },
  { id:'approved', label:'Approved', stages:['Approved – Awaiting Contract','Contracted – Pending Effective Date','Active'], color:'#10b981', icon:'✅' },
  { id:'rejected', label:'Rejected', stages:['Denied'], color:'#6b7280', icon:'❌' },
]

// ─── PAYER REQUIREMENTS ───────────────────────────────────────────────────────
// states: array of state abbreviations where this payer operates. 'ALL' = nationwide.
// type: 'National','Regional','Medicaid','Medicare','Military','Marketplace'
const PAYER_REQUIREMENTS = {
  // ── NATIONAL PAYERS ───────────────────────────────────────────────────────
  'Aetna': {
    states: 'ALL', type: 'National',
    requirements: ['CAQH Profile (must be current)', 'Aetna Provider Application', 'W-9 Form', 'Current CV/Resume', 'Copy of License', 'Malpractice Insurance Certificate', 'DEA Certificate (if applicable)', 'NPI Type 1 & Type 2'],
    submission: 'Availity Provider Enrollment portal',
    portalUrl: 'https://www.availity.com',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'CAQH must be attested within last 120 days. Requires both Type 1 and Type 2 NPI. Group enrollment separate from individual.',
    specialNotes: ['CAQH attestation required', 'Portal: Availity', 'Group & individual enrollment both required'],
    color: '#C8102E',
  },
  'UnitedHealthcare': {
    states: 'ALL', type: 'National',
    requirements: ['CAQH Profile', 'UHC Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume', 'Revalidation Form (if revalidating)'],
    submission: 'Provider Express portal (providerexpress.com)',
    portalUrl: 'https://www.providerexpress.com',
    timeline: '60–120 days',
    revalidation: 'Every 3 years (required)',
    notes: 'UHC requires mandatory revalidation every 3 years. Optum manages behavioral health credentialing. Separate enrollment for Optum/Behavioral Health.',
    specialNotes: ['Revalidation every 3 years mandatory', 'Behavioral health via Optum', 'Longest credentialing timeline'],
    color: '#006699',
  },
  'Cigna / Evernorth': {
    states: 'ALL', type: 'National',
    requirements: ['CAQH Profile', 'Cigna Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Cigna for Health Care Professionals portal',
    portalUrl: 'https://cignaforhcp.cigna.com',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Mental health providers may need to contact Evernorth separately. CAQH must be complete and attested.',
    specialNotes: ['Mental health may route through Evernorth', 'Portal submission required', 'CAQH attestation required'],
    color: '#004B87',
  },
  'Humana': {
    states: 'ALL', type: 'National',
    requirements: ['CAQH Profile', 'Humana Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Humana Provider Portal',
    portalUrl: 'https://www.humana.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Submit via Availity or Humana Provider Portal. Behavioral health may route through Humana Behavioral Health.',
    specialNotes: ['Availity or direct portal', 'Behavioral health may be separate', 'CAQH required'],
    color: '#006F44',
  },
  'Anthem / Elevance Health': {
    states: ['CA','CO','CT','GA','IN','KY','ME','MO','NV','NH','NY','OH','VA','WI'], type: 'National',
    requirements: ['CAQH Profile', 'Anthem Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Anthem provider portal',
    portalUrl: 'https://www.anthem.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Anthem operates as Elevance Health nationally. Behavioral health credentialing through Beacon Health Options in some markets.',
    specialNotes: ['Now operating as Elevance Health', 'Beacon Health Options for behavioral health', 'Availity submission preferred'],
    color: '#0079C1',
  },
  'Molina Healthcare': {
    states: ['CA','FL','ID','IL','KY','MI','MS','NE','NM','NY','OH','OR','SC','TX','UT','VA','WA','WI'], type: 'Medicaid',
    requirements: ['Molina Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Medicaid Provider Agreement', 'Background Check'],
    submission: 'Molina Provider Services (phone or portal)',
    portalUrl: 'https://www.molinahealthcare.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Medicaid-focused managed care organization. Background check required. State Medicaid enrollment often required first.',
    specialNotes: ['State Medicaid enrollment recommended first', 'Background check required', 'MCO for Medicaid population'],
    color: '#007DC3',
  },
  'Medicare (PECOS)': {
    states: 'ALL', type: 'Medicare',
    requirements: ['Medicare Enrollment Application (CMS-855)', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'PECOS Enrollment', 'Background Check'],
    submission: 'PECOS (Provider Enrollment Chain and Ownership System)',
    portalUrl: 'https://pecos.cms.hhs.gov',
    timeline: '60–90 days',
    revalidation: 'Every 5 years',
    notes: 'Medicare enrollment through PECOS. Most providers must complete PECOS enrollment. Opt-out available for certain providers. MAC assignment depends on provider state.',
    specialNotes: ['PECOS enrollment required', 'CMS-855 application form', 'Opt-out option available'],
    color: '#1B3A6B',
  },
  'TRICARE': {
    states: 'ALL', type: 'Military',
    requirements: ['TRICARE Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume', 'Board Certification preferred'],
    submission: 'Humana Military (TRICARE East) or TriWest (West)',
    portalUrl: 'https://www.tricare.mil/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Military health program. East region: Humana Military. West region: TriWest Healthcare Alliance.',
    specialNotes: ['East: Humana Military | West: TriWest', 'Separate from commercial enrollment', 'Military health program'],
    color: '#003087',
  },
  'Oscar Health': {
    states: ['AZ','CA','CO','FL','GA','IL','KS','MI','MO','NJ','NY','OH','OK','OR','PA','TN','TX','VA'], type: 'Marketplace',
    requirements: ['Oscar Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CAQH Profile', 'CV/Resume'],
    submission: 'Oscar Provider Relations portal',
    portalUrl: 'https://www.hioscar.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Newer national payer with growing presence. Technology-forward approach. Direct portal submission.',
    specialNotes: ['Growing multi-state presence', 'Tech-forward portal', 'Check panel status before applying'],
    color: '#EF4923',
  },
  'Kaiser Permanente': {
    states: ['CA','CO','GA','HI','MD','OR','VA','WA','DC'], type: 'Regional',
    requirements: ['Kaiser Application (invitation only)', 'CAQH Profile', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Board Certification (if applicable)'],
    submission: 'Kaiser Provider Network Relations (invitation required)',
    portalUrl: 'https://providers.kaiserpermanente.org',
    timeline: '90–120 days',
    revalidation: 'Every 2 years',
    notes: 'INVITATION ONLY network. Providers must be invited to join. Closed panel in many markets.',
    specialNotes: ['Invitation only — closed panel', 'Board certification may be required', 'Revalidation every 2 years'],
    color: '#003781',
  },
  'Centene / WellCare': {
    states: ['AZ','AR','CA','FL','GA','IL','IN','KS','KY','LA','MA','MI','MN','MS','MO','NE','NV','NJ','NM','NY','NC','OH','OR','PA','SC','TN','TX','UT','VA','WA','WI'], type: 'Medicaid',
    requirements: ['CAQH Profile', 'Centene Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Medicaid Agreement'],
    submission: 'Centene Provider Portal or state-specific subsidiary portal',
    portalUrl: 'https://www.centene.com/providers.html',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Centene operates through state subsidiaries (WellCare, Ambetter, Peach State, etc.). Enrollment is state-specific.',
    specialNotes: ['Operates via state subsidiaries', 'Contact local plan for enrollment', 'Medicaid & Marketplace products'],
    color: '#006B3C',
  },
  'Magellan Health': {
    states: 'ALL', type: 'National',
    requirements: ['CAQH Profile', 'Magellan Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'Magellan Provider Portal',
    portalUrl: 'https://www.magellanprovider.com',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Behavioral health managed care organization. Primarily credentialing behavioral health and substance use disorder providers.',
    specialNotes: ['Behavioral health specialty payer', 'CAQH required', 'Focus on mental health & SUD providers'],
    color: '#00528C',
  },
  'Beacon Health Options': {
    states: 'ALL', type: 'National',
    requirements: ['CAQH Profile', 'Beacon Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'Beacon Provider Relations portal',
    portalUrl: 'https://www.beaconhealthoptions.com/providers',
    timeline: '45–60 days',
    revalidation: 'Every 3 years',
    notes: 'Behavioral health carve-out for Anthem in many states. Also manages behavioral health for various state Medicaid programs.',
    specialNotes: ['Behavioral health carve-out for Anthem', 'Manages state Medicaid BH in some states', 'CAQH required'],
    color: '#0060A9',
  },
  'Optum / UBH': {
    states: 'ALL', type: 'National',
    requirements: ['CAQH Profile', 'Optum Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Provider Express portal',
    portalUrl: 'https://www.providerexpress.com',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Behavioral health arm of UnitedHealth Group. Credential separately from UHC medical. Manages behavioral health for many employer plans.',
    specialNotes: ['Behavioral health arm of UHC', 'Separate from UHC medical enrollment', 'Use Provider Express portal'],
    color: '#E87722',
  },

  // ── OREGON ────────────────────────────────────────────────────────────────
  'BCBS Oregon (Regence)': {
    states: ['OR','WA','ID','UT'], type: 'Regional',
    requirements: ['CAQH Profile', 'Regence Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'OHA Participation (recommended)', 'NPI Type 1'],
    submission: 'Regence Provider Portal or paper application',
    portalUrl: 'https://www.regence.com/providers',
    timeline: '45–60 days',
    revalidation: 'Every 3 years',
    notes: 'OHA/Medicaid participation often required first for behavioral health. Contact Provider Relations for behavioral health contracts.',
    specialNotes: ['OHA participation recommended first', 'Behavioral health contracts handled separately'],
    color: '#00539F',
  },
  'OHP / Medicaid (OHA)': {
    states: ['OR'], type: 'Medicaid',
    requirements: ['DMAP Enrollment Form', 'W-9 Form', 'Oregon License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check Authorization', 'Medicaid Provider Agreement'],
    submission: 'Oregon DMAP Online Enrollment System',
    portalUrl: 'https://www.oregon.gov/oha/hsd/ohp',
    timeline: '45–60 days',
    revalidation: 'Every 5 years',
    notes: 'Oregon Health Plan enrollment through DMAP. Required for most Medicaid-accepting practices. Supervising provider must also be enrolled.',
    specialNotes: ['Supervisor must be enrolled if applicable', 'Background check required', 'DMAP system enrollment'],
    color: '#006400',
  },
  'Providence Health Plan': {
    states: ['OR','WA'], type: 'Regional',
    requirements: ['Providence Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume', 'CAQH Profile'],
    submission: 'Providence Provider Relations (phone/email/portal)',
    portalUrl: 'https://www.providence.org/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Strong presence in Oregon and Washington. Contact Provider Relations directly for application packets.',
    specialNotes: ['Oregon/Pacific NW regional payer', 'Direct contact with Provider Relations recommended'],
    color: '#0061A1',
  },
  'Moda Health': {
    states: ['OR','AK'], type: 'Regional',
    requirements: ['Moda Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CAQH Profile', 'CV/Resume'],
    submission: 'Moda Provider Portal or paper application',
    portalUrl: 'https://www.modahealth.com/medical/provider',
    timeline: '30–60 days',
    revalidation: 'Every 3 years',
    notes: 'Oregon-based regional payer. Behavioral health credentialing through Moda directly. Often faster than national payers.',
    specialNotes: ['Oregon regional payer', 'Faster timeline than nationals', 'Behavioral health credentialed directly'],
    color: '#C41E3A',
  },
  'PacificSource Health Plans': {
    states: ['OR','ID','MT'], type: 'Regional',
    requirements: ['PacificSource Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'PacificSource Provider Relations',
    portalUrl: 'https://www.pacificsource.com/providers',
    timeline: '30–60 days',
    revalidation: 'Every 3 years',
    notes: 'Northwest regional payer covering Oregon, Idaho, and Montana. Direct application process.',
    specialNotes: ['Northwest regional payer', 'Direct application process'],
    color: '#0033A0',
  },
  'OHSU Health Plan': {
    states: ['OR'], type: 'Regional',
    requirements: ['OHSU Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CAQH Profile'],
    submission: 'OHSU Health Plan Provider Relations',
    portalUrl: 'https://www.ohsu.edu/health',
    timeline: '30–60 days',
    revalidation: 'Every 3 years',
    notes: 'Oregon Health & Science University health plan. Academic medical center affiliated plan.',
    specialNotes: ['Academic medical center affiliated', 'Oregon only', 'Direct Provider Relations contact'],
    color: '#007030',
  },

  // ── CALIFORNIA ────────────────────────────────────────────────────────────
  'Blue Shield of California': {
    states: ['CA'], type: 'Regional',
    requirements: ['CAQH Profile', 'Blue Shield Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Blue Shield Provider Portal',
    portalUrl: 'https://www.blueshieldca.com/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'California-only nonprofit plan. CAQH required. Behavioral health may route through Magellan.',
    specialNotes: ['California only', 'Behavioral health via Magellan in some cases', 'CAQH required'],
    color: '#005EB8',
  },
  'Health Net (CA)': {
    states: ['CA','AZ','OR','WA'], type: 'Regional',
    requirements: ['CAQH Profile', 'Health Net Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'Availity or Health Net Provider Portal',
    portalUrl: 'https://www.healthnet.com/content/healthnet/en_us/providers.html',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Major California plan, also manages TRICARE West. Centene subsidiary.',
    specialNotes: ['Centene subsidiary', 'Also manages TRICARE West', 'CAQH required'],
    color: '#009A44',
  },
  'L.A. Care Health Plan': {
    states: ['CA'], type: 'Medicaid',
    requirements: ['L.A. Care Provider Application', 'W-9 Form', 'California License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Medi-Cal Agreement', 'Background Check'],
    submission: 'L.A. Care Provider Relations',
    portalUrl: 'https://www.lacare.org/providers',
    timeline: '45–60 days',
    revalidation: 'Every 3 years',
    notes: 'Public plan serving Los Angeles County Medi-Cal population. One of the largest publicly operated health plans in the US.',
    specialNotes: ['Los Angeles County only', 'Medi-Cal managed care', 'Medi-Cal enrollment required first'],
    color: '#003087',
  },
  'Inland Empire Health Plan (IEHP)': {
    states: ['CA'], type: 'Medicaid',
    requirements: ['IEHP Provider Application', 'W-9 Form', 'California License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Medi-Cal Agreement'],
    submission: 'IEHP Provider Relations',
    portalUrl: 'https://www.iehp.org/en/providers',
    timeline: '45–60 days',
    revalidation: 'Every 3 years',
    notes: 'Serves Riverside and San Bernardino counties. Medi-Cal and Medicare managed care.',
    specialNotes: ['Inland Empire (Riverside/San Bernardino) only', 'Medi-Cal managed care', 'Medi-Cal enrollment required'],
    color: '#007A4D',
  },

  // ── WASHINGTON ────────────────────────────────────────────────────────────
  'Premera Blue Cross (WA)': {
    states: ['WA','AK'], type: 'Regional',
    requirements: ['CAQH Profile', 'Premera Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'Premera Provider Portal or Availity',
    portalUrl: 'https://www.premera.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Washington and Alaska regional payer. Largest health plan in Washington state.',
    specialNotes: ['WA/AK regional payer', 'CAQH required', 'Direct portal or Availity'],
    color: '#0054A6',
  },
  'Washington Apple Health (Medicaid)': {
    states: ['WA'], type: 'Medicaid',
    requirements: ['WA Medicaid Provider Enrollment Application', 'W-9 Form', 'Washington License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'Provider Agreement'],
    submission: 'Washington ProviderOne system',
    portalUrl: 'https://www.hca.wa.gov/billers-providers-partners',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Washington State Medicaid through HCA. Enrollment via ProviderOne portal. Managed care plans require separate enrollment after.',
    specialNotes: ['ProviderOne enrollment required', 'Separate MCO enrollments required', 'Background check required'],
    color: '#00843D',
  },
  'Coordinated Care (WA)': {
    states: ['WA'], type: 'Medicaid',
    requirements: ['CAQH Profile', 'Coordinated Care Application', 'W-9 Form', 'Washington License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Apple Health enrollment required'],
    submission: 'Coordinated Care Provider Relations',
    portalUrl: 'https://www.coordinatedcarehealth.com/providers',
    timeline: '30–45 days',
    revalidation: 'Every 3 years',
    notes: 'Centene subsidiary providing Medicaid managed care in Washington. Apple Health (Medicaid) enrollment required first.',
    specialNotes: ['Centene subsidiary', 'Apple Health enrollment required first', 'Medicaid managed care WA'],
    color: '#005BAB',
  },

  // ── TEXAS ─────────────────────────────────────────────────────────────────
  'BCBS of Texas': {
    states: ['TX'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS TX Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or BCBS TX provider portal',
    portalUrl: 'https://www.bcbstx.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health plan in Texas. HCSC subsidiary. Behavioral health managed separately.',
    specialNotes: ['Texas only', 'HCSC subsidiary', 'Availity preferred submission'],
    color: '#00539F',
  },
  'Texas Medicaid (TMHP)': {
    states: ['TX'], type: 'Medicaid',
    requirements: ['TMHP Enrollment Application', 'W-9 Form', 'Texas License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'Medicaid Provider Agreement'],
    submission: 'Texas Medicaid & Healthcare Partnership (TMHP) portal',
    portalUrl: 'https://www.tmhp.com',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Texas Medicaid enrollment through TMHP. Required before enrolling in Texas Medicaid MCOs.',
    specialNotes: ['TMHP enrollment first', 'Required for all TX Medicaid MCOs', 'Background check required'],
    color: '#B5121B',
  },

  // ── FLORIDA ───────────────────────────────────────────────────────────────
  'Florida Blue (BCBS FL)': {
    states: ['FL'], type: 'Regional',
    requirements: ['CAQH Profile', 'Florida Blue Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Florida Blue provider portal',
    portalUrl: 'https://www.floridablue.com/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health insurer in Florida. Independent BCBS plan. CAQH required.',
    specialNotes: ['Florida only', 'Largest FL insurer', 'Availity submission preferred'],
    color: '#003087',
  },
  'Florida Medicaid (AHCA)': {
    states: ['FL'], type: 'Medicaid',
    requirements: ['FL Medicaid Enrollment Application', 'W-9 Form', 'Florida License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'Medicaid Provider Agreement'],
    submission: 'Florida AHCA Medicaid portal',
    portalUrl: 'https://ahca.myflorida.com/medicaid',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Florida Medicaid enrollment through AHCA. Required before enrolling in Florida Medicaid managed care plans.',
    specialNotes: ['AHCA enrollment first', 'Background check required', 'Required before FL MCO enrollment'],
    color: '#FF6600',
  },
  'Sunshine Health (FL)': {
    states: ['FL'], type: 'Medicaid',
    requirements: ['Sunshine Health Application', 'W-9 Form', 'Florida License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'FL Medicaid enrollment required'],
    submission: 'Sunshine Health Provider Relations',
    portalUrl: 'https://www.sunshinehealth.com/providers.html',
    timeline: '30–45 days',
    revalidation: 'Every 3 years',
    notes: 'Centene subsidiary providing Medicaid managed care in Florida. FL Medicaid enrollment through AHCA required first.',
    specialNotes: ['Centene subsidiary', 'FL Medicaid enrollment required first', 'Medicaid managed care FL'],
    color: '#F7A800',
  },

  // ── NEW YORK ──────────────────────────────────────────────────────────────
  'Empire BCBS (NY)': {
    states: ['NY'], type: 'Regional',
    requirements: ['CAQH Profile', 'Empire BCBS Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Empire BCBS provider portal',
    portalUrl: 'https://www.empireblue.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Anthem subsidiary serving New York. CAQH required. Behavioral health through Beacon.',
    specialNotes: ['Anthem/Elevance subsidiary in NY', 'Behavioral health via Beacon', 'CAQH required'],
    color: '#0079C1',
  },
  'New York Medicaid (eMedNY)': {
    states: ['NY'], type: 'Medicaid',
    requirements: ['NY Medicaid Provider Enrollment', 'W-9 Form', 'New York License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'Medicaid Provider Agreement'],
    submission: 'eMedNY Provider Enrollment Portal',
    portalUrl: 'https://www.emedny.org',
    timeline: '45–75 days',
    revalidation: 'Every 5 years',
    notes: 'New York Medicaid enrollment via eMedNY. Required before enrolling in NY Medicaid managed care plans.',
    specialNotes: ['eMedNY portal enrollment', 'Background check required', 'Required before NY MCO enrollment'],
    color: '#003366',
  },
  'EmblemHealth (NY)': {
    states: ['NY'], type: 'Regional',
    requirements: ['CAQH Profile', 'EmblemHealth Provider Application', 'W-9 Form', 'New York License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'EmblemHealth Provider Relations',
    portalUrl: 'https://www.emblemhealth.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'New York-based nonprofit health plan (GHI + HIP merger). Major presence in NYC metro area.',
    specialNotes: ['NYC metro focus', 'GHI + HIP merger', 'Nonprofit plan'],
    color: '#007AC2',
  },
  'Fidelis Care (NY)': {
    states: ['NY'], type: 'Medicaid',
    requirements: ['Fidelis Provider Application', 'W-9 Form', 'New York License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'NY Medicaid enrollment required'],
    submission: 'Fidelis Care Provider Relations',
    portalUrl: 'https://www.fideliscare.org/en-us/Providers',
    timeline: '30–45 days',
    revalidation: 'Every 3 years',
    notes: 'Centene subsidiary in New York. Medicaid managed care across New York State.',
    specialNotes: ['Centene subsidiary in NY', 'NY Medicaid enrollment required first', 'Statewide Medicaid managed care'],
    color: '#E4002B',
  },

  // ── ILLINOIS ──────────────────────────────────────────────────────────────
  'BCBS of Illinois': {
    states: ['IL'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS IL Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or BCBS IL provider portal',
    portalUrl: 'https://www.bcbsil.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'HCSC subsidiary. Largest health insurer in Illinois.',
    specialNotes: ['HCSC subsidiary', 'Availity submission preferred', 'CAQH required'],
    color: '#00539F',
  },
  'Illinois Medicaid (HFS)': {
    states: ['IL'], type: 'Medicaid',
    requirements: ['HFS Provider Enrollment Application', 'W-9 Form', 'Illinois License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'IL Provider Agreement'],
    submission: 'Illinois HFS IMPACT enrollment system',
    portalUrl: 'https://www.illinois.gov/hfs/MedicalProviders',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Illinois Medicaid enrollment via HFS IMPACT system. Required before enrolling in IL Medicaid managed care plans.',
    specialNotes: ['IMPACT system enrollment', 'Background check required', 'Required before IL MCO enrollment'],
    color: '#003A70',
  },

  // ── PENNSYLVANIA ──────────────────────────────────────────────────────────
  'Independence Blue Cross (PA)': {
    states: ['PA'], type: 'Regional',
    requirements: ['CAQH Profile', 'IBC Provider Application', 'W-9 Form', 'Pennsylvania License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or IBC provider portal',
    portalUrl: 'https://www.ibx.com/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Southeastern Pennsylvania BlueCross plan. Major presence in Philadelphia metro area.',
    specialNotes: ['Southeastern PA / Philadelphia focus', 'CAQH required', 'Availity preferred'],
    color: '#003082',
  },
  'UPMC Health Plan (PA)': {
    states: ['PA','WV'], type: 'Regional',
    requirements: ['CAQH Profile', 'UPMC Health Plan Application', 'W-9 Form', 'PA/WV License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'UPMC Health Plan Provider Relations',
    portalUrl: 'https://www.upmchealthplan.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Academic medical center affiliated plan in western Pennsylvania.',
    specialNotes: ['Academic medical center affiliated', 'Western PA / WV focus', 'CAQH required'],
    color: '#002F6C',
  },
  'Highmark BCBS (PA)': {
    states: ['PA','WV','DE'], type: 'Regional',
    requirements: ['CAQH Profile', 'Highmark Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Highmark provider portal',
    portalUrl: 'https://www.highmarkprovider.com',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health insurer in western Pennsylvania. Also covers West Virginia and Delaware.',
    specialNotes: ['Western PA / WV / DE', 'CAQH required', 'Availity preferred'],
    color: '#005EB8',
  },
  'PA Medicaid (PROMISe)': {
    states: ['PA'], type: 'Medicaid',
    requirements: ['PROMISe Enrollment Application', 'W-9 Form', 'Pennsylvania License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'PA Provider Agreement'],
    submission: 'Pennsylvania PROMISe provider enrollment portal',
    portalUrl: 'https://www.dhs.pa.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Pennsylvania Medicaid via PROMISe system. Required before enrolling in PA Medicaid managed care.',
    specialNotes: ['PROMISe portal enrollment', 'Background check required', 'Required before PA MCO enrollment'],
    color: '#4A0E8F',
  },

  // ── OHIO ──────────────────────────────────────────────────────────────────
  'Medical Mutual of Ohio': {
    states: ['OH'], type: 'Regional',
    requirements: ['Medical Mutual Provider Application', 'W-9 Form', 'Ohio License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CAQH Profile', 'CV/Resume'],
    submission: 'Medical Mutual Provider Relations',
    portalUrl: 'https://www.medmutual.com/For-Providers.aspx',
    timeline: '45–60 days',
    revalidation: 'Every 3 years',
    notes: 'Largest Ohio-based health insurer. Direct enrollment through Provider Relations.',
    specialNotes: ['Ohio regional payer', 'Direct enrollment', 'CAQH preferred'],
    color: '#D52B1E',
  },
  'Ohio Medicaid (ODM)': {
    states: ['OH'], type: 'Medicaid',
    requirements: ['OH Medicaid Enrollment Application', 'W-9 Form', 'Ohio License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'OH Provider Agreement'],
    submission: 'Ohio Department of Medicaid enrollment portal',
    portalUrl: 'https://medicaid.ohio.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Ohio Medicaid enrollment. Required before enrolling in Ohio Medicaid managed care plans.',
    specialNotes: ['ODM enrollment first', 'Required before OH MCO enrollment', 'Background check required'],
    color: '#C8102E',
  },
  'CareSource': {
    states: ['OH','GA','IN','KY','WV','NC'], type: 'Medicaid',
    requirements: ['CareSource Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'State Medicaid enrollment required', 'CAQH Profile'],
    submission: 'CareSource Provider Portal',
    portalUrl: 'https://www.caresource.com/providers',
    timeline: '30–45 days',
    revalidation: 'Every 3 years',
    notes: 'Multi-state Medicaid managed care organization. State Medicaid enrollment required before CareSource enrollment.',
    specialNotes: ['Multi-state Medicaid MCO', 'State Medicaid enrollment required first', 'Operates in OH, GA, IN, KY, WV, NC'],
    color: '#009A44',
  },

  // ── MICHIGAN ──────────────────────────────────────────────────────────────
  'BCBS of Michigan': {
    states: ['MI'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS MI Provider Application', 'W-9 Form', 'Michigan License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'BCBS MI provider portal or Availity',
    portalUrl: 'https://www.bcbsm.com/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health insurer in Michigan. Independent BCBS plan. CAQH required.',
    specialNotes: ['Michigan only', 'Largest MI insurer', 'CAQH required'],
    color: '#00539F',
  },
  'Priority Health (MI)': {
    states: ['MI'], type: 'Regional',
    requirements: ['Priority Health Provider Application', 'W-9 Form', 'Michigan License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CAQH Profile', 'CV/Resume'],
    submission: 'Priority Health Provider Relations',
    portalUrl: 'https://www.priorityhealth.com/provider',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Michigan nonprofit health plan. Strong presence in West Michigan.',
    specialNotes: ['Michigan regional payer', 'Nonprofit plan', 'CAQH required'],
    color: '#00B140',
  },
  'Michigan Medicaid (MDHHS)': {
    states: ['MI'], type: 'Medicaid',
    requirements: ['MI Medicaid Enrollment Application', 'W-9 Form', 'Michigan License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'MI Provider Agreement'],
    submission: 'Michigan MDHHS online enrollment',
    portalUrl: 'https://www.michigan.gov/mdhhs',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Michigan Medicaid enrollment via MDHHS. Required before enrolling in MI Medicaid MCOs.',
    specialNotes: ['MDHHS enrollment first', 'Required before MI MCO enrollment', 'Background check required'],
    color: '#00A3E0',
  },

  // ── GEORGIA ───────────────────────────────────────────────────────────────
  'BCBS of Georgia': {
    states: ['GA'], type: 'Regional',
    requirements: ['CAQH Profile', 'Anthem/BCBS GA Provider Application', 'W-9 Form', 'Georgia License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Anthem GA provider portal',
    portalUrl: 'https://www.bcbsga.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Anthem subsidiary in Georgia. Uses Anthem enrollment infrastructure.',
    specialNotes: ['Anthem subsidiary in GA', 'Availity preferred', 'CAQH required'],
    color: '#0079C1',
  },
  'Georgia Medicaid (DCH)': {
    states: ['GA'], type: 'Medicaid',
    requirements: ['GA Medicaid Enrollment Application', 'W-9 Form', 'Georgia License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'GA Provider Agreement'],
    submission: 'Georgia MMIS portal',
    portalUrl: 'https://dch.georgia.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Georgia Medicaid via DCH. Enrollment required before Georgia Medicaid MCO enrollment.',
    specialNotes: ['DCH enrollment first', 'Required before GA MCO enrollment', 'Background check required'],
    color: '#B5121B',
  },
  'Peach State Health Management (GA)': {
    states: ['GA'], type: 'Medicaid',
    requirements: ['Peach State Provider Application', 'W-9 Form', 'Georgia License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'GA Medicaid enrollment required'],
    submission: 'Peach State Provider Relations',
    portalUrl: 'https://www.pshpgeorgia.com/providers.html',
    timeline: '30–45 days',
    revalidation: 'Every 3 years',
    notes: 'Centene subsidiary in Georgia providing Medicaid managed care. GA Medicaid enrollment required first.',
    specialNotes: ['Centene subsidiary in GA', 'GA Medicaid enrollment required first', 'Medicaid managed care GA'],
    color: '#E8A900',
  },

  // ── NORTH CAROLINA ────────────────────────────────────────────────────────
  'BCBS of North Carolina': {
    states: ['NC'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS NC Provider Application', 'W-9 Form', 'NC License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or BCBS NC provider portal',
    portalUrl: 'https://www.bcbsnc.com/assets/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Independent BCBS plan in North Carolina. Largest NC insurer. CAQH required.',
    specialNotes: ['NC only', 'Largest NC insurer', 'CAQH required'],
    color: '#004990',
  },
  'NC Medicaid (DHHS)': {
    states: ['NC'], type: 'Medicaid',
    requirements: ['NC Medicaid Enrollment Application', 'W-9 Form', 'NC License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'NC Provider Agreement'],
    submission: 'NC Medicaid Direct enrollment portal',
    portalUrl: 'https://medicaid.ncdhhs.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'NC Medicaid via DHHS. NC has transitioned to PHP model. PHP enrollment required after state enrollment.',
    specialNotes: ['DHHS enrollment first', 'NC PHP enrollment required', 'Background check required'],
    color: '#CC0000',
  },

  // ── VIRGINIA ──────────────────────────────────────────────────────────────
  'Anthem BCBS Virginia': {
    states: ['VA'], type: 'Regional',
    requirements: ['CAQH Profile', 'Anthem VA Provider Application', 'W-9 Form', 'Virginia License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Anthem VA provider portal',
    portalUrl: 'https://www.anthem.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Anthem/Elevance Health subsidiary in Virginia. CAQH required.',
    specialNotes: ['Anthem/Elevance in VA', 'CAQH required', 'Availity preferred'],
    color: '#0079C1',
  },
  'Virginia Medicaid (DMAS)': {
    states: ['VA'], type: 'Medicaid',
    requirements: ['VA Medicaid Enrollment Application', 'W-9 Form', 'Virginia License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'VA Provider Agreement'],
    submission: 'Virginia DMAS enrollment portal',
    portalUrl: 'https://www.dmas.virginia.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Virginia Medicaid enrollment via DMAS. CCC Plus managed care enrollment required after for dual eligibles.',
    specialNotes: ['DMAS enrollment first', 'CCC Plus MCO enrollment may be required', 'Background check required'],
    color: '#003366',
  },

  // ── ARIZONA ───────────────────────────────────────────────────────────────
  'BCBS of Arizona': {
    states: ['AZ'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS AZ Provider Application', 'W-9 Form', 'Arizona License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or BCBS AZ provider portal',
    portalUrl: 'https://www.azblue.com/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Independent BCBS plan in Arizona. CAQH required.',
    specialNotes: ['AZ only', 'CAQH required', 'Availity preferred'],
    color: '#003A70',
  },
  'Arizona Medicaid (AHCCCS)': {
    states: ['AZ'], type: 'Medicaid',
    requirements: ['AHCCCS Enrollment Application', 'W-9 Form', 'Arizona License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'AZ Provider Agreement'],
    submission: 'AHCCCS online enrollment portal',
    portalUrl: 'https://www.azahcccs.gov/PlansandProviders',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Arizona Health Care Cost Containment System (AHCCCS) is AZ Medicaid. Enrollment required before AZ Medicaid MCO enrollment.',
    specialNotes: ['AHCCCS enrollment first', 'Required before AZ MCO enrollment', 'Background check required'],
    color: '#8B0000',
  },

  // ── COLORADO ──────────────────────────────────────────────────────────────
  'Rocky Mountain Health Plans (CO)': {
    states: ['CO'], type: 'Regional',
    requirements: ['Rocky Mountain Provider Application', 'W-9 Form', 'Colorado License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CAQH Profile', 'CV/Resume'],
    submission: 'Rocky Mountain Provider Relations or UHC portal',
    portalUrl: 'https://www.rmhp.org/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Western Colorado regional plan, now a UnitedHealthcare subsidiary.',
    specialNotes: ['Western CO regional plan', 'UHC subsidiary', 'CAQH required'],
    color: '#00843D',
  },
  'Colorado Medicaid (HCPF)': {
    states: ['CO'], type: 'Medicaid',
    requirements: ['CO Medicaid Enrollment Application', 'W-9 Form', 'Colorado License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'CO Provider Agreement'],
    submission: 'Colorado HCPF provider enrollment portal',
    portalUrl: 'https://hcpf.colorado.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Colorado Medicaid via HCPF. Colorado has both fee-for-service and managed care Medicaid.',
    specialNotes: ['HCPF enrollment first', 'Background check required', 'Fee-for-service and managed care options'],
    color: '#1E4D8C',
  },

  // ── MASSACHUSETTS ─────────────────────────────────────────────────────────
  'BCBS of Massachusetts': {
    states: ['MA'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS MA Provider Application', 'W-9 Form', 'Massachusetts License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or BCBS MA provider portal',
    portalUrl: 'https://www.bluecrossma.org/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health insurer in Massachusetts. Independent BCBS plan. CAQH required.',
    specialNotes: ['MA only', 'Largest MA insurer', 'CAQH required'],
    color: '#003087',
  },
  'Tufts Health Plan (MA/RI/NH)': {
    states: ['MA','RI','NH'], type: 'Regional',
    requirements: ['CAQH Profile', 'Tufts Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'Tufts Provider Relations or Availity',
    portalUrl: 'https://www.tuftshealthplan.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Nonprofit plan serving New England. Now part of Point32Health (Harvard Pilgrim merger).',
    specialNotes: ['Part of Point32Health', 'New England regional plan', 'CAQH required'],
    color: '#005EB8',
  },
  'MassHealth (MA Medicaid)': {
    states: ['MA'], type: 'Medicaid',
    requirements: ['MassHealth Enrollment Application', 'W-9 Form', 'Massachusetts License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'MA Provider Agreement'],
    submission: 'MassHealth enrollment portal',
    portalUrl: 'https://www.mass.gov/masshealth-provider-enrollment',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Massachusetts Medicaid. Strong behavioral health coverage. Enrollment required before ACO/MCO enrollment.',
    specialNotes: ['MassHealth enrollment first', 'Background check required', 'Strong BH coverage'],
    color: '#003A6C',
  },

  // ── MINNESOTA ─────────────────────────────────────────────────────────────
  'HealthPartners (MN/WI)': {
    states: ['MN','WI'], type: 'Regional',
    requirements: ['CAQH Profile', 'HealthPartners Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'HealthPartners Provider Relations',
    portalUrl: 'https://www.healthpartners.com/providers',
    timeline: '45–60 days',
    revalidation: 'Every 3 years',
    notes: 'Nonprofit Minnesota health plan and medical group. Strong Twin Cities presence.',
    specialNotes: ['MN/WI regional plan', 'Nonprofit', 'CAQH preferred'],
    color: '#007A53',
  },
  'UCare (MN)': {
    states: ['MN'], type: 'Medicaid',
    requirements: ['UCare Provider Application', 'W-9 Form', 'Minnesota License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'MN Medicaid enrollment required', 'CAQH Profile'],
    submission: 'UCare Provider Relations',
    portalUrl: 'https://www.ucare.org/providers',
    timeline: '30–45 days',
    revalidation: 'Every 3 years',
    notes: 'Minnesota nonprofit health plan serving Medicare and Medicaid populations.',
    specialNotes: ['Minnesota Medicaid managed care', 'Nonprofit plan', 'MN Medicaid enrollment required first'],
    color: '#0060A9',
  },
  'Minnesota Medicaid (DHS)': {
    states: ['MN'], type: 'Medicaid',
    requirements: ['MN Medicaid Enrollment Application', 'W-9 Form', 'Minnesota License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'MN Provider Agreement'],
    submission: 'Minnesota DHS provider enrollment portal',
    portalUrl: 'https://mn.gov/dhs/partners-and-providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Minnesota Medicaid (Medical Assistance). Enrollment via DHS portal.',
    specialNotes: ['DHS enrollment first', 'Background check required', 'Required before MN MCO enrollment'],
    color: '#003865',
  },

  // ── TENNESSEE ─────────────────────────────────────────────────────────────
  'BCBS of Tennessee': {
    states: ['TN'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS TN Provider Application', 'W-9 Form', 'Tennessee License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or BCBS TN provider portal',
    portalUrl: 'https://www.bcbst.com/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Independent BCBS plan in Tennessee. CAQH required.',
    specialNotes: ['TN only', 'CAQH required', 'Availity preferred'],
    color: '#00539F',
  },
  'Tennessee Medicaid (TennCare)': {
    states: ['TN'], type: 'Medicaid',
    requirements: ['TennCare Provider Enrollment', 'W-9 Form', 'Tennessee License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'TN Provider Agreement'],
    submission: 'TennCare Solutions enrollment portal',
    portalUrl: 'https://www.tn.gov/tenncare/providers.html',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Tennessee Medicaid managed care through TennCare. All TennCare is managed care.',
    specialNotes: ['All TennCare is managed care', 'MCO enrollment required', 'Background check required'],
    color: '#006E51',
  },

  // ── INDIANA ───────────────────────────────────────────────────────────────
  'Anthem BCBS Indiana': {
    states: ['IN'], type: 'Regional',
    requirements: ['CAQH Profile', 'Anthem IN Provider Application', 'W-9 Form', 'Indiana License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Anthem IN provider portal',
    portalUrl: 'https://www.anthem.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Anthem/Elevance subsidiary in Indiana. CAQH required.',
    specialNotes: ['Anthem/Elevance in IN', 'CAQH required', 'Availity preferred'],
    color: '#0079C1',
  },
  'Indiana Medicaid (OMPP)': {
    states: ['IN'], type: 'Medicaid',
    requirements: ['IN Medicaid Enrollment Application', 'W-9 Form', 'Indiana License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'IN Provider Agreement'],
    submission: 'Indiana OMPP enrollment portal',
    portalUrl: 'https://www.in.gov/medicaid/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Indiana Medicaid. Enrollment required before Hoosier Healthwise MCO enrollment.',
    specialNotes: ['OMPP enrollment first', 'Background check required', 'Required before Hoosier Healthwise MCO enrollment'],
    color: '#B5121B',
  },

  // ── MARYLAND / DC ─────────────────────────────────────────────────────────
  'CareFirst BCBS (MD/DC/VA)': {
    states: ['MD','DC','VA'], type: 'Regional',
    requirements: ['CAQH Profile', 'CareFirst Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or CareFirst provider portal',
    portalUrl: 'https://provider.carefirst.com',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health insurer in the DC metro region serving Maryland, DC, and northern Virginia.',
    specialNotes: ['MD/DC/VA regional plan', 'CAQH required', 'Availity preferred'],
    color: '#003087',
  },
  'Maryland Medicaid (MDH)': {
    states: ['MD'], type: 'Medicaid',
    requirements: ['MD Medicaid Enrollment Application', 'W-9 Form', 'Maryland License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'MD Provider Agreement'],
    submission: 'Maryland MDH MMIS provider enrollment',
    portalUrl: 'https://mmcp.health.maryland.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Maryland Medicaid via MDH. HealthChoice managed care program for most Medicaid beneficiaries.',
    specialNotes: ['MDH enrollment first', 'HealthChoice MCO enrollment required', 'Background check required'],
    color: '#CC0000',
  },
  'DC Medicaid (DHCF)': {
    states: ['DC'], type: 'Medicaid',
    requirements: ['DC Medicaid Enrollment Application', 'W-9 Form', 'DC License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'DC Provider Agreement'],
    submission: 'DC DHCF Medicaid provider enrollment portal',
    portalUrl: 'https://dhcf.dc.gov/service/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'DC Medicaid via DHCF. Managed care through AmeriHealth Caritas DC, MedStar Family Choice, and Trusted Health Plan.',
    specialNotes: ['DHCF enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#003087',
  },

  // ── NEW JERSEY ────────────────────────────────────────────────────────────
  'Horizon BCBS New Jersey': {
    states: ['NJ'], type: 'Regional',
    requirements: ['CAQH Profile', 'Horizon BCBS NJ Provider Application', 'W-9 Form', 'NJ License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Horizon BCBS NJ provider portal',
    portalUrl: 'https://www.horizonblue.com/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health insurer in New Jersey. Independent BCBS plan. CAQH required.',
    specialNotes: ['NJ only', 'Largest NJ insurer', 'CAQH required'],
    color: '#003087',
  },
  'New Jersey Medicaid (FamilyCare)': {
    states: ['NJ'], type: 'Medicaid',
    requirements: ['NJ Medicaid Enrollment Application', 'W-9 Form', 'NJ License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'NJ Provider Agreement'],
    submission: 'NJ FamilyCare provider enrollment portal',
    portalUrl: 'https://www.njfamilycare.org/providers.aspx',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'New Jersey Medicaid (NJ FamilyCare). Managed care through Aetna Better Health NJ, Horizon NJ Health, and others.',
    specialNotes: ['NJ FamilyCare enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#CC0000',
  },

  // ── CONNECTICUT ────────────────────────────────────────────────────────────
  'Anthem BCBS Connecticut': {
    states: ['CT'], type: 'Regional',
    requirements: ['CAQH Profile', 'Anthem CT Provider Application', 'W-9 Form', 'Connecticut License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Anthem CT provider portal',
    portalUrl: 'https://www.anthem.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Anthem/Elevance subsidiary in Connecticut. Largest commercial insurer in CT.',
    specialNotes: ['Anthem/Elevance in CT', 'CAQH required', 'Availity preferred'],
    color: '#0079C1',
  },
  'Connecticut Medicaid (HUSKY)': {
    states: ['CT'], type: 'Medicaid',
    requirements: ['CT Medicaid Enrollment Application', 'W-9 Form', 'Connecticut License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'CT Provider Agreement'],
    submission: 'Connecticut HUSKY Health provider enrollment',
    portalUrl: 'https://www.huskyhealthct.org/providers.html',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Connecticut Medicaid via HUSKY Health. Managed care through various MCOs.',
    specialNotes: ['HUSKY enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#003087',
  },

  // ── HAWAII ────────────────────────────────────────────────────────────────
  'HMSA (BCBS Hawaii)': {
    states: ['HI'], type: 'Regional',
    requirements: ['CAQH Profile', 'HMSA Provider Application', 'W-9 Form', 'Hawaii License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'HMSA Provider Relations',
    portalUrl: 'https://www.hmsa.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health insurer in Hawaii. BCBS licensee. Direct enrollment process.',
    specialNotes: ['Hawaii only', 'Largest HI insurer', 'CAQH required'],
    color: '#00539F',
  },
  'AlohaCare (HI)': {
    states: ['HI'], type: 'Medicaid',
    requirements: ['AlohaCare Provider Application', 'W-9 Form', 'Hawaii License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Hawaii Medicaid enrollment required'],
    submission: 'AlohaCare Provider Relations',
    portalUrl: 'https://www.alohacare.org/providers',
    timeline: '30–45 days',
    revalidation: 'Every 3 years',
    notes: 'Hawaii Medicaid managed care plan. QUEST Integration program.',
    specialNotes: ['Hawaii Medicaid MCO', 'QUEST Integration program', 'State Medicaid enrollment required first'],
    color: '#009A44',
  },

  // ── NEVADA ────────────────────────────────────────────────────────────────
  'Nevada Medicaid (DHCFP)': {
    states: ['NV'], type: 'Medicaid',
    requirements: ['NV Medicaid Enrollment Application', 'W-9 Form', 'Nevada License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'NV Provider Agreement'],
    submission: 'Nevada DHCFP enrollment portal',
    portalUrl: 'https://dhcfp.nv.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Nevada Medicaid via DHCFP. Enrollment required before Nevada Medicaid MCO enrollment.',
    specialNotes: ['DHCFP enrollment first', 'Background check required', 'Required before NV MCO enrollment'],
    color: '#003399',
  },

  // ── UTAH ──────────────────────────────────────────────────────────────────
  'SelectHealth (UT/ID/NV)': {
    states: ['UT','ID','NV'], type: 'Regional',
    requirements: ['CAQH Profile', 'SelectHealth Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'SelectHealth Provider Relations',
    portalUrl: 'https://selecthealth.org/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Intermountain Healthcare affiliated plan. Dominant in Utah market.',
    specialNotes: ['Intermountain affiliated', 'Dominant Utah plan', 'CAQH required'],
    color: '#007DC3',
  },
  'Utah Medicaid (DHHS)': {
    states: ['UT'], type: 'Medicaid',
    requirements: ['UT Medicaid Enrollment Application', 'W-9 Form', 'Utah License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'UT Provider Agreement'],
    submission: 'Utah DHHS Medicaid provider enrollment',
    portalUrl: 'https://medicaid.utah.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Utah Medicaid via DHHS.',
    specialNotes: ['DHHS enrollment', 'Background check required', 'PCN program for adults'],
    color: '#B5121B',
  },

  // ── IDAHO ─────────────────────────────────────────────────────────────────
  'Idaho Medicaid (DHW)': {
    states: ['ID'], type: 'Medicaid',
    requirements: ['ID Medicaid Enrollment Application', 'W-9 Form', 'Idaho License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'ID Provider Agreement'],
    submission: 'Idaho DHW Medicaid provider enrollment portal',
    portalUrl: 'https://www.idmedicaid.com',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Idaho Medicaid enrollment via DHW. Idaho has expanded Medicaid under ACA.',
    specialNotes: ['DHW enrollment', 'Background check required', 'Medicaid expansion state'],
    color: '#B5121B',
  },

  // ── MONTANA ───────────────────────────────────────────────────────────────
  'Montana Medicaid (DPHHS)': {
    states: ['MT'], type: 'Medicaid',
    requirements: ['MT Medicaid Enrollment Application', 'W-9 Form', 'Montana License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'MT Provider Agreement'],
    submission: 'Montana DPHHS provider enrollment',
    portalUrl: 'https://dphhs.mt.gov/MontanaHealthcarePrograms/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Montana Medicaid via DPHHS. Mostly fee-for-service.',
    specialNotes: ['DPHHS enrollment', 'Background check required', 'Mostly fee-for-service'],
    color: '#6E3E0E',
  },

  // ── NEW MEXICO ────────────────────────────────────────────────────────────
  'New Mexico Medicaid (HSD)': {
    states: ['NM'], type: 'Medicaid',
    requirements: ['NM Medicaid Enrollment Application', 'W-9 Form', 'New Mexico License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'NM Provider Agreement'],
    submission: 'NM HSD Medicaid provider enrollment portal',
    portalUrl: 'https://www.hsd.state.nm.us/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'New Mexico Medicaid via HSD. Centennial Care is NM managed care Medicaid.',
    specialNotes: ['HSD enrollment first', 'Centennial Care MCO enrollment required', 'Background check required'],
    color: '#00843D',
  },

  // ── ALASKA ────────────────────────────────────────────────────────────────
  'Alaska Medicaid (DHSS)': {
    states: ['AK'], type: 'Medicaid',
    requirements: ['AK Medicaid Enrollment Application', 'W-9 Form', 'Alaska License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'AK Provider Agreement'],
    submission: 'Alaska DHSS Medicaid provider enrollment',
    portalUrl: 'https://health.alaska.gov/medicaid/pages/providers.aspx',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Alaska Medicaid is mostly fee-for-service with limited managed care.',
    specialNotes: ['Mostly fee-for-service Medicaid', 'Direct state enrollment', 'Background check required'],
    color: '#003865',
  },

  // ── KENTUCKY ──────────────────────────────────────────────────────────────
  'Anthem BCBS Kentucky': {
    states: ['KY'], type: 'Regional',
    requirements: ['CAQH Profile', 'Anthem KY Provider Application', 'W-9 Form', 'Kentucky License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Anthem KY provider portal',
    portalUrl: 'https://www.anthem.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Anthem/Elevance subsidiary in Kentucky. CAQH required.',
    specialNotes: ['Anthem/Elevance in KY', 'CAQH required', 'Availity preferred'],
    color: '#0079C1',
  },
  'Kentucky Medicaid (DMS)': {
    states: ['KY'], type: 'Medicaid',
    requirements: ['KY Medicaid Enrollment Application', 'W-9 Form', 'Kentucky License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'KY Provider Agreement'],
    submission: 'Kentucky DMS KYMMIS provider enrollment',
    portalUrl: 'https://chfs.ky.gov/agencies/dms/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Kentucky Medicaid via DMS. Managed care through CareSource KY, Humana Medicaid KY, and others.',
    specialNotes: ['DMS enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#003087',
  },

  // ── SOUTH CAROLINA ────────────────────────────────────────────────────────
  'BlueCross BlueShield of SC': {
    states: ['SC'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS SC Provider Application', 'W-9 Form', 'SC License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or BCBS SC provider portal',
    portalUrl: 'https://www.southcarolinablues.com/providers',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Independent BCBS plan in South Carolina. CAQH required.',
    specialNotes: ['SC only', 'CAQH required', 'Availity preferred'],
    color: '#004990',
  },
  'SC Medicaid (SCDHHS)': {
    states: ['SC'], type: 'Medicaid',
    requirements: ['SC Medicaid Enrollment Application', 'W-9 Form', 'SC License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'SC Provider Agreement'],
    submission: 'SCDHHS provider enrollment portal',
    portalUrl: 'https://www.scdhhs.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'South Carolina Medicaid via SCDHHS.',
    specialNotes: ['SCDHHS enrollment first', 'Background check required', 'Healthy Connections managed care'],
    color: '#003087',
  },

  // ── MISSOURI ──────────────────────────────────────────────────────────────
  'Anthem BCBS Missouri': {
    states: ['MO'], type: 'Regional',
    requirements: ['CAQH Profile', 'Anthem MO Provider Application', 'W-9 Form', 'Missouri License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1 & Type 2', 'CV/Resume'],
    submission: 'Availity or Anthem MO provider portal',
    portalUrl: 'https://www.anthem.com/provider',
    timeline: '60–90 days',
    revalidation: 'Every 3 years',
    notes: 'Anthem/Elevance Health subsidiary in Missouri.',
    specialNotes: ['Anthem/Elevance in MO', 'CAQH required', 'Availity preferred'],
    color: '#0079C1',
  },
  'Missouri Medicaid (MO HealthNet)': {
    states: ['MO'], type: 'Medicaid',
    requirements: ['MO Medicaid Enrollment Application', 'W-9 Form', 'Missouri License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'MO Provider Agreement'],
    submission: 'Missouri MHD MMAC provider enrollment portal',
    portalUrl: 'https://mydss.mo.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Missouri Medicaid (MO HealthNet) via MHD. Managed care through Aetna Better Health MO, Home State Health, and others.',
    specialNotes: ['MHD enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#003087',
  },

  // ── REMAINING STATES ──────────────────────────────────────────────────────
  'Iowa Medicaid (IME)': {
    states: ['IA'], type: 'Medicaid',
    requirements: ['IA Medicaid Enrollment Application', 'W-9 Form', 'Iowa License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'IA Provider Agreement'],
    submission: 'Iowa Medicaid Enterprise enrollment portal',
    portalUrl: 'https://www.iowamedicalmanagement.com',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Iowa Medicaid enrollment via IME. Managed care through Iowa Total Care (Centene), Amerigroup IA, and others.',
    specialNotes: ['IME enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#003366',
  },
  'Kansas Medicaid (KanCare)': {
    states: ['KS'], type: 'Medicaid',
    requirements: ['KS Medicaid Enrollment Application', 'W-9 Form', 'Kansas License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'KS Provider Agreement'],
    submission: 'KanCare provider enrollment portal',
    portalUrl: 'https://www.kancare.ks.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Kansas Medicaid is fully managed care through KanCare.',
    specialNotes: ['Fully managed care Medicaid', 'MCO enrollment required', 'Background check required'],
    color: '#003865',
  },
  'Nebraska Medicaid (DHHS)': {
    states: ['NE'], type: 'Medicaid',
    requirements: ['NE Medicaid Enrollment Application', 'W-9 Form', 'Nebraska License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'NE Provider Agreement'],
    submission: 'Nebraska DHHS Medicaid provider enrollment',
    portalUrl: 'https://dhhs.ne.gov/medicaid/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Nebraska Medicaid enrollment via DHHS. Heritage Health managed care for most beneficiaries.',
    specialNotes: ['DHHS enrollment first', 'Heritage Health MCO', 'Background check required'],
    color: '#D52B1E',
  },
  'Louisiana Medicaid (LDH)': {
    states: ['LA'], type: 'Medicaid',
    requirements: ['LA Medicaid Enrollment Application', 'W-9 Form', 'Louisiana License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'LA Provider Agreement'],
    submission: 'Louisiana Medicaid Enrollment portal',
    portalUrl: 'https://ldh.la.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Louisiana Medicaid via LDH. Managed care through Aetna Better Health LA, AmeriHealth Caritas LA, and others.',
    specialNotes: ['LDH enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#8B0000',
  },
  'Mississippi Medicaid (DOM)': {
    states: ['MS'], type: 'Medicaid',
    requirements: ['MS Medicaid Enrollment Application', 'W-9 Form', 'Mississippi License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'MS Provider Agreement'],
    submission: 'Mississippi DOM provider enrollment',
    portalUrl: 'https://medicaid.ms.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Mississippi Medicaid via DOM. Mississippi has not expanded Medicaid.',
    specialNotes: ['DOM enrollment', 'Background check required', 'Has not expanded Medicaid'],
    color: '#003087',
  },
  'Arkansas Medicaid (DHS)': {
    states: ['AR'], type: 'Medicaid',
    requirements: ['AR Medicaid Enrollment Application', 'W-9 Form', 'Arkansas License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'AR Provider Agreement'],
    submission: 'Arkansas DHS Medicaid provider enrollment',
    portalUrl: 'https://www.medicaid.state.ar.us/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Arkansas Medicaid via DHS. Medicaid expansion state.',
    specialNotes: ['DHS enrollment', 'Background check required', 'Medicaid expansion state'],
    color: '#B5121B',
  },
  'Alabama Medicaid (AMCO)': {
    states: ['AL'], type: 'Medicaid',
    requirements: ['AL Medicaid Enrollment Application', 'W-9 Form', 'Alabama License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'AL Provider Agreement'],
    submission: 'Alabama Medicaid Agency provider enrollment',
    portalUrl: 'https://www.medicaid.alabama.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Alabama Medicaid via AMCO. Alabama has not expanded Medicaid.',
    specialNotes: ['AMCO enrollment', 'Background check required', 'Has not expanded Medicaid'],
    color: '#B5121B',
  },
  'Oklahoma Medicaid (SoonerCare)': {
    states: ['OK'], type: 'Medicaid',
    requirements: ['SoonerCare Enrollment Application', 'W-9 Form', 'Oklahoma License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'OK Provider Agreement'],
    submission: 'Oklahoma OHCA SoonerCare provider enrollment',
    portalUrl: 'https://www.okhca.org/providers.aspx',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Oklahoma Medicaid (SoonerCare) via OHCA. Medicaid expansion state (2021).',
    specialNotes: ['OHCA enrollment', 'Background check required', 'Medicaid expansion state (2021)'],
    color: '#B5121B',
  },
  'WV Medicaid (BMS)': {
    states: ['WV'], type: 'Medicaid',
    requirements: ['WV Medicaid Enrollment Application', 'W-9 Form', 'WV License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'WV Provider Agreement'],
    submission: 'West Virginia BMS provider enrollment portal',
    portalUrl: 'https://dhhr.wv.gov/bms/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'West Virginia Medicaid via BMS. Managed care through WV Family Health, The Health Plan, and others.',
    specialNotes: ['BMS enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#003865',
  },
  'Maine Medicaid (MaineCare)': {
    states: ['ME'], type: 'Medicaid',
    requirements: ['MaineCare Enrollment Application', 'W-9 Form', 'Maine License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'ME Provider Agreement'],
    submission: 'Maine DHHS MaineCare provider enrollment',
    portalUrl: 'https://www.maine.gov/dhhs/oms/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Maine Medicaid enrollment via DHHS. Medicaid expansion state.',
    specialNotes: ['DHHS enrollment', 'Background check required', 'Medicaid expansion state'],
    color: '#003087',
  },
  'New Hampshire Medicaid (DHHS)': {
    states: ['NH'], type: 'Medicaid',
    requirements: ['NH Medicaid Enrollment Application', 'W-9 Form', 'NH License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'NH Provider Agreement'],
    submission: 'New Hampshire DHHS Medicaid enrollment',
    portalUrl: 'https://www.dhhs.nh.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'New Hampshire Medicaid via DHHS. Managed care through NH Medicaid Care Management MCOs.',
    specialNotes: ['DHHS enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#003087',
  },
  'Vermont Medicaid (Green Mountain Care)': {
    states: ['VT'], type: 'Medicaid',
    requirements: ['VT Medicaid Enrollment Application', 'W-9 Form', 'Vermont License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'VT Provider Agreement'],
    submission: 'Vermont DVHA Medicaid provider enrollment',
    portalUrl: 'https://dvha.vermont.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Vermont Medicaid (Green Mountain Care) via DVHA. Mostly fee-for-service with ACO model.',
    specialNotes: ['DVHA enrollment', 'Background check required', 'ACO model'],
    color: '#00843D',
  },
  'RI Medicaid (EOHHS)': {
    states: ['RI'], type: 'Medicaid',
    requirements: ['RI Medicaid Enrollment Application', 'W-9 Form', 'Rhode Island License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'RI Provider Agreement'],
    submission: 'Rhode Island EOHHS provider enrollment portal',
    portalUrl: 'https://www.eohhs.ri.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Rhode Island Medicaid via EOHHS.',
    specialNotes: ['EOHHS enrollment', 'Background check required', 'MCO enrollment required'],
    color: '#003087',
  },
  'Delaware Medicaid (DHSS)': {
    states: ['DE'], type: 'Medicaid',
    requirements: ['DE Medicaid Enrollment Application', 'W-9 Form', 'Delaware License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'DE Provider Agreement'],
    submission: 'Delaware DHSS Medicaid provider enrollment',
    portalUrl: 'https://www.dhss.delaware.gov/dhss/dmma/providers.html',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Delaware Medicaid via DHSS. Managed care through Highmark DE, Aetna Better Health DE, and Molina DE.',
    specialNotes: ['DHSS enrollment first', 'Background check required', 'MCO enrollment required'],
    color: '#003087',
  },
  'North Dakota Medicaid (DHS)': {
    states: ['ND'], type: 'Medicaid',
    requirements: ['ND Medicaid Enrollment Application', 'W-9 Form', 'ND License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'ND Provider Agreement'],
    submission: 'North Dakota DHS Medicaid provider enrollment',
    portalUrl: 'https://www.hhs.nd.gov/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'North Dakota Medicaid via DHS. Mostly fee-for-service Medicaid.',
    specialNotes: ['DHS enrollment', 'Background check required', 'Mostly fee-for-service'],
    color: '#003865',
  },
  'South Dakota Medicaid (DSS)': {
    states: ['SD'], type: 'Medicaid',
    requirements: ['SD Medicaid Enrollment Application', 'W-9 Form', 'SD License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'SD Provider Agreement'],
    submission: 'South Dakota DSS Medicaid provider enrollment',
    portalUrl: 'https://dss.sd.gov/medicaid/providers.aspx',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'South Dakota Medicaid via DSS. Medicaid expansion state (2022).',
    specialNotes: ['DSS enrollment', 'Background check required', 'Medicaid expansion state (2022)'],
    color: '#003865',
  },
  'Wyoming Medicaid (WYDOH)': {
    states: ['WY'], type: 'Medicaid',
    requirements: ['WY Medicaid Enrollment Application', 'W-9 Form', 'Wyoming License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'Background Check', 'WY Provider Agreement'],
    submission: 'Wyoming WYDOH Medicaid provider enrollment',
    portalUrl: 'https://health.wyo.gov/healthcarefin/medicaid/providers',
    timeline: '30–60 days',
    revalidation: 'Every 5 years',
    notes: 'Wyoming Medicaid is fee-for-service. Wyoming has not expanded Medicaid.',
    specialNotes: ['Fee-for-service Medicaid', 'Has not expanded Medicaid', 'Background check required'],
    color: '#003865',
  },
  'BCBS of North Dakota (Sanford)': {
    states: ['ND','SD','MN'], type: 'Regional',
    requirements: ['CAQH Profile', 'BCBS ND Provider Application', 'W-9 Form', 'License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'Availity or BCBS ND provider portal',
    portalUrl: 'https://www.bcbsnd.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Largest health insurer in North Dakota. Affiliated with Sanford Health.',
    specialNotes: ['ND/SD/MN regional plan', 'Sanford Health affiliated', 'CAQH required'],
    color: '#00539F',
  },
  'Premera Blue Cross Alaska': {
    states: ['AK'], type: 'Regional',
    requirements: ['CAQH Profile', 'Premera AK Provider Application', 'W-9 Form', 'Alaska License Copy', 'Malpractice Insurance Certificate', 'NPI Type 1', 'CV/Resume'],
    submission: 'Premera Provider Portal',
    portalUrl: 'https://www.premera.com/providers',
    timeline: '45–75 days',
    revalidation: 'Every 3 years',
    notes: 'Premera Blue Cross serves both Washington and Alaska markets.',
    specialNotes: ['AK/WA regional payer', 'CAQH required', 'Direct portal or Availity'],
    color: '#0054A6',
  },
}

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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@500;600;700&display=swap');

:root {
  --navy:#0A1628; --navy-2:#0F1E38; --navy-3:#152544; --navy-4:#1C2E52;
  --navy-hover:rgba(255,255,255,0.05); --navy-border:rgba(255,255,255,0.06);
  --sidebar-text:rgba(255,255,255,0.52); --sidebar-active:#ffffff; --sidebar-accent:#3B82F6;
  --primary:#2563EB; --primary-h:#1d4ed8; --primary-l:#EFF6FF; --primary-ll:#dbeafe;
  --accent:#10b981; --accent-l:#ecfdf5;
  --green:#10B981; --green-l:#ECFDF5; --green-b:#6ee7b7; --green-d:#059669;
  --red:#EF4444;   --red-l:#FEF2F2;   --red-b:#fca5a5;   --red-d:#DC2626;
  --amber:#F59E0B; --amber-l:#FFFBEB; --amber-b:#fcd34d;  --amber-d:#D97706;
  --blue:#2563EB;  --blue-l:#EFF6FF;  --blue-b:#93c5fd;
  --teal:#06B6D4;  --teal-l:#ECFEFF;  --teal-b:#67e8f9;
  --purple:#8B5CF6;--purple-l:#F5F3FF;--purple-b:#c4b5fd;
  --gold:#D97706;  --gold-l:#FFFBEB;  --gold-b:#fbbf24;
  --cyan:#0EA5E9;  --cyan-l:#F0F9FF;  --cyan-b:#7dd3fc;
  --rose:#F43F5E;  --rose-l:#FFF1F2;  --rose-b:#fda4af;
  --bg:#F0F4F9; --surface:#FFFFFF; --surface-2:#F8FAFC; --surface-3:#F1F5F9;
  --border:#E2E8F0; --border-2:#F1F5F9; --border-3:#CBD5E1;
  --ink:#0F172A; --ink-2:#1E293B; --ink-3:#475569; --ink-4:#94A3B8; --ink-5:#CBD5E1;
  --shadow-xs:0 1px 2px rgba(0,0,0,.04);
  --shadow-sm:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
  --shadow:0 4px 8px rgba(0,0,0,.06),0 2px 4px rgba(0,0,0,.04);
  --shadow-md:0 8px 20px rgba(0,0,0,.08),0 3px 8px rgba(0,0,0,.05);
  --shadow-lg:0 16px 32px rgba(0,0,0,.1),0 6px 16px rgba(0,0,0,.06);
  --shadow-xl:0 24px 48px rgba(0,0,0,.14),0 8px 24px rgba(0,0,0,.08);
  --r:6px; --r-md:8px; --r-lg:12px; --r-xl:16px; --r-2xl:24px;
  --t:0.14s ease; --t-slow:0.22s ease;
}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:14px;}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;}
a{text-decoration:none;color:inherit;}
.app-root{display:flex;min-height:100vh;}

/* SIDEBAR */
.sidebar{width:248px;height:100vh;background:linear-gradient(180deg,var(--navy) 0%,var(--navy-2) 100%);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;border-right:1px solid var(--navy-border);}
.sb-logo{padding:22px 18px 16px;border-bottom:1px solid var(--navy-border);flex-shrink:0;}
.sb-logo-mark{display:flex;align-items:center;gap:11px;}
.sb-logo-icon{width:38px;height:38px;background:linear-gradient(135deg,var(--primary) 0%,#1d4ed8 100%);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;color:white;flex-shrink:0;box-shadow:0 4px 16px rgba(37,99,235,.45);}
.sb-logo h1{font-family:'Poppins',sans-serif;font-size:16px;font-weight:700;color:#fff;line-height:1.1;letter-spacing:-0.3px;}
.sb-logo h1 span{color:var(--sidebar-accent);}
.sb-logo-sub{font-size:9.5px;color:rgba(255,255,255,0.32);font-weight:500;letter-spacing:0.6px;margin-top:2px;}
.sb-nav{padding:12px 10px 0;flex:1;overflow:hidden;display:flex;flex-direction:column;}
.sb-nav-groups{flex:1;overflow:hidden;}
.sb-group{margin-bottom:2px;}
.sb-group-header{display:flex;align-items:center;justify-content:space-between;padding:5px 8px 4px;cursor:pointer;border-radius:var(--r);transition:background var(--t);}
.sb-group-header:hover{background:var(--navy-hover);}
.sb-group-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(148,163,184,0.5);}
.sb-group-arrow{font-size:7px;color:rgba(255,255,255,0.18);transition:transform var(--t);}
.sb-group.open .sb-group-arrow{transform:rotate(180deg);}
.sb-group-items{overflow:hidden;max-height:0;transition:max-height 0.26s cubic-bezier(.4,0,.2,1);}
.sb-group.open .sb-group-items{max-height:600px;}
.sb-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:var(--r-md);cursor:pointer;color:var(--sidebar-text);font-size:12.5px;font-weight:400;transition:all var(--t);margin-bottom:1px;user-select:none;position:relative;border-left:3px solid transparent;}
.sb-item:hover{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.85);border-left-color:rgba(255,255,255,0.1);}
.sb-item.active{background:rgba(37,99,235,0.22);color:#fff;font-weight:500;border-left-color:var(--sidebar-accent);}
.sb-badge{margin-left:auto;background:var(--red);color:white;font-size:9px;font-weight:700;border-radius:20px;padding:1px 6px;min-width:18px;text-align:center;line-height:1.8;}
.sb-badge.amber{background:var(--amber-d);}
.sb-footer{padding:14px;border-top:1px solid var(--navy-border);flex-shrink:0;background:rgba(0,0,0,0.1);}
.sb-user{display:flex;align-items:center;gap:9px;}
.sb-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary) 0%,#6366f1 100%);border:2px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;font-size:12px;color:white;font-weight:700;flex-shrink:0;}
.sb-user-info{flex:1;min-width:0;}
.sb-user-name{font-size:11.5px;font-weight:600;color:rgba(255,255,255,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sb-user-email{font-size:10px;color:rgba(255,255,255,0.38);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
.sb-signout{background:none;border:none;color:rgba(255,255,255,0.28);font-size:10px;cursor:pointer;padding:0;font-family:inherit;transition:color var(--t);display:block;margin-top:1px;}
.sb-signout:hover{color:rgba(255,255,255,0.65);}

/* MAIN */
.main{margin-left:248px;flex:1;display:flex;flex-direction:column;min-height:100vh;}

/* TOPBAR */
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:0 28px;height:60px;display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:100;}
.topbar-left{flex:1;display:flex;flex-direction:column;justify-content:center;}
.topbar-crumb{font-size:10.5px;color:var(--ink-4);font-weight:500;letter-spacing:0.2px;line-height:1;}
.topbar-title{font-family:'Poppins',sans-serif;font-size:17px;font-weight:600;color:var(--ink);letter-spacing:-0.2px;line-height:1.3;}
.topbar-actions{display:flex;gap:10px;align-items:center;margin-left:auto;}
.topbar-search-wrap{position:relative;display:flex;align-items:center;}
.topbar-search-wrap input{width:220px;padding:7px 38px 7px 34px;border:1.5px solid var(--border);border-radius:999px;font-family:'Inter',sans-serif;font-size:12.5px;color:var(--ink);background:var(--surface-2);outline:none;transition:all var(--t);}
.topbar-search-wrap input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(37,99,235,.1);background:var(--surface);width:260px;}
.topbar-search-wrap input::placeholder{color:var(--ink-4);}
.topbar-search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--ink-4);}
.topbar-search-kbd{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:var(--surface-3);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:9.5px;color:var(--ink-4);}
.topbar-icon-btn{position:relative;width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all var(--t);color:var(--ink-3);}
.topbar-icon-btn:hover{background:var(--surface-2);color:var(--ink);}
.topbar-notif-dot{position:absolute;top:7px;right:7px;width:7px;height:7px;border-radius:50%;background:var(--red);border:2px solid var(--surface);}
.topbar-notif-badge{position:absolute;top:3px;right:3px;min-width:16px;height:16px;border-radius:10px;background:var(--red);border:2px solid var(--surface);font-size:8.5px;font-weight:700;color:white;display:flex;align-items:center;justify-content:center;padding:0 3px;}
.topbar-user-btn{display:flex;align-items:center;gap:8px;padding:5px 10px 5px 6px;border-radius:999px;border:1.5px solid var(--border);background:var(--surface);cursor:pointer;transition:all var(--t);}
.topbar-user-btn:hover{background:var(--surface-2);border-color:var(--border-3);}
.topbar-user-avatar{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--primary) 0%,#6366f1 100%);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;}
.topbar-user-name{font-size:12.5px;font-weight:600;color:var(--ink);}
.topbar-user-role{font-size:10px;color:var(--ink-4);line-height:1;}
.topbar-caret{color:var(--ink-4);}
.user-dropdown{position:absolute;top:calc(100% + 8px);right:0;width:210px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);z-index:300;overflow:hidden;animation:menuIn .14s ease;}
@keyframes menuIn{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
.user-dropdown-header{padding:12px 14px;border-bottom:1px solid var(--border-2);background:var(--surface-2);}
.user-dropdown-name{font-size:13px;font-weight:600;color:var(--ink);}
.user-dropdown-email{font-size:11px;color:var(--ink-4);margin-top:1px;word-break:break-all;}
.user-dropdown-item{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:12.5px;color:var(--ink-2);cursor:pointer;transition:background var(--t);}
.user-dropdown-item:hover{background:var(--surface-2);}
.user-dropdown-item svg{color:var(--ink-4);flex-shrink:0;}
.user-dropdown-divider{border:none;border-top:1px solid var(--border-2);margin:4px 0;}
.user-dropdown-item.danger{color:var(--red-d);}
.user-dropdown-item.danger svg{color:var(--red-d);}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--r-md);font-family:'Inter',sans-serif;font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;transition:all var(--t);white-space:nowrap;line-height:1;}
.btn:disabled{opacity:.45;cursor:not-allowed;}
.btn-primary{background:var(--primary);color:white;border-color:var(--primary);box-shadow:0 1px 2px rgba(37,99,235,.25);}
.btn-primary:hover:not(:disabled){background:var(--primary-h);transform:translateY(-1px);box-shadow:0 4px 12px rgba(37,99,235,.35);}
.btn-primary:active:not(:disabled){transform:none;}
.btn-secondary{background:var(--surface);color:var(--ink-2);border-color:var(--border);box-shadow:var(--shadow-xs);}
.btn-secondary:hover:not(:disabled){background:var(--surface-2);border-color:var(--border-3);}
.btn-ghost{background:transparent;color:var(--ink-3);border-color:transparent;}
.btn-ghost:hover:not(:disabled){background:var(--surface-2);color:var(--ink);}
.btn-danger{background:var(--red-l);color:var(--red-d);border-color:var(--red-b);}
.btn-danger:hover:not(:disabled){background:#fee2e2;}
.btn-sm{padding:5px 12px;font-size:12px;border-radius:var(--r);}
.btn-green{background:var(--green-l);color:var(--green-d);border-color:var(--green-b);}
.btn-green:hover:not(:disabled){background:#dcfce7;}
.btn-navy{background:var(--navy);color:white;border-color:var(--navy);}
.btn-navy:hover:not(:disabled){background:var(--navy-3);}

/* PAGES */
.pages{padding:28px 32px;}
.page{animation:pageIn .2s ease;}
@keyframes pageIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

/* CARDS */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);overflow:hidden;}
.card-header{padding:18px 22px 14px;border-bottom:1px solid var(--border-2);display:flex;align-items:center;gap:10px;}
.card-header h3{font-family:'Poppins',sans-serif;font-size:14.5px;font-weight:600;color:var(--ink);letter-spacing:-0.1px;flex:1;}
.ch-meta{font-size:11.5px;color:var(--ink-4);}
.card-body{padding:20px 22px;}

/* KPI */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:16px;margin-bottom:24px;}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:22px 22px 18px;box-shadow:var(--shadow-sm);position:relative;overflow:hidden;transition:all var(--t-slow);cursor:default;}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:var(--kpi-color,var(--primary));}
.kpi:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);}
.kpi-icon-wrap{width:44px;height:44px;border-radius:var(--r-lg);background:var(--kpi-bg,var(--primary-l));display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:14px;}
.kpi-icon{font-size:20px;}
.kpi-label{font-size:10px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--ink-4);margin-bottom:6px;}
.kpi-value{font-family:'Poppins',sans-serif;font-size:32px;font-weight:700;line-height:1;color:var(--ink);margin-bottom:5px;letter-spacing:-1px;}
.kpi-sub{font-size:11px;color:var(--ink-4);}
.kpi.kpi-red{--kpi-color:var(--red);--kpi-bg:var(--red-l);}
.kpi.kpi-amber{--kpi-color:var(--amber-d);--kpi-bg:var(--amber-l);}
.kpi.kpi-blue{--kpi-color:var(--blue);--kpi-bg:var(--blue-l);}
.kpi.kpi-teal{--kpi-color:var(--teal);--kpi-bg:var(--teal-l);}
.kpi.kpi-purple{--kpi-color:var(--purple);--kpi-bg:var(--purple-l);}
.kpi.kpi-green{--kpi-color:var(--green-d);--kpi-bg:var(--green-l);}
.kpi.kpi-cyan{--kpi-color:var(--cyan);--kpi-bg:var(--cyan-l);}

/* TABLE */
.tbl-wrap{border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);}
table{width:100%;border-collapse:collapse;background:var(--surface);}
thead th{padding:12px 16px;text-align:left;font-size:10.5px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;color:var(--ink-4);background:var(--surface-2);border-bottom:1px solid var(--border);white-space:nowrap;user-select:none;cursor:pointer;transition:background var(--t);}
thead th:hover{background:#eef2f8;color:var(--ink-2);}
thead th.sort-asc::after{content:' ↑';color:var(--primary);}
thead th.sort-desc::after{content:' ↓';color:var(--primary);}
thead th.no-sort{cursor:default;}
thead th.no-sort:hover{background:var(--surface-2);color:var(--ink-4);}
tbody td{padding:13px 16px;border-bottom:1px solid var(--border-2);font-size:13px;vertical-align:middle;}
tbody tr:last-child td{border-bottom:none;}
tbody tr{transition:background var(--t);}
tbody tr:hover{background:var(--primary-l);}

/* BADGES */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;line-height:1.5;}
.badge-dot::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor;}
.b-green{background:var(--green-l);color:var(--green-d);border:1px solid var(--green-b);}
.b-red{background:var(--red-l);color:var(--red-d);border:1px solid var(--red-b);}
.b-amber{background:var(--amber-l);color:var(--amber-d);border:1px solid var(--amber-b);}
.b-blue{background:var(--blue-l);color:var(--primary-h);border:1px solid var(--blue-b);}
.b-teal{background:var(--teal-l);color:#0e7490;border:1px solid var(--teal-b);}
.b-purple{background:var(--purple-l);color:#7c3aed;border:1px solid var(--purple-b);}
.b-gold{background:var(--gold-l);color:var(--gold);border:1px solid var(--gold-b);}
.b-gray{background:var(--surface-2);color:var(--ink-3);border:1px solid var(--border);}

/* TOOLBAR */
.toolbar{display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap;}
.search-box{position:relative;}
.search-box input{padding:8px 12px 8px 36px;border:1.5px solid var(--border);border-radius:var(--r-md);font-family:'Inter',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;width:240px;transition:border-color var(--t),box-shadow var(--t);}
.search-box input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(37,99,235,.1);}
.search-box .si{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--ink-4);font-size:14px;pointer-events:none;}
.filter-select{padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-family:'Inter',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;cursor:pointer;transition:border-color var(--t);}
.filter-select:focus{border-color:var(--primary);}
.toolbar-right{margin-left:auto;display:flex;gap:8px;}

/* FORMS */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.form-grid .full{grid-column:1/-1;}
.fg{display:flex;flex-direction:column;gap:5px;}
.fg label{font-size:11.5px;font-weight:600;color:var(--ink-3);letter-spacing:0.1px;}
.fg input,.fg select,.fg textarea{padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-family:'Inter',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color var(--t),box-shadow var(--t);}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(37,99,235,.1);}
.fg textarea{resize:vertical;min-height:72px;line-height:1.55;}
.field-note{font-size:11px;color:var(--ink-4);margin-top:2px;}
.section-divider{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--primary);background:var(--primary-l);border-top:1px solid var(--primary-ll);border-bottom:1px solid var(--primary-ll);padding:8px 14px;grid-column:1/-1;margin-top:8px;}

/* MODAL */
.overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.7);backdrop-filter:blur(6px);z-index:500;align-items:center;justify-content:center;padding:24px;}
.overlay.open{display:flex;}
.modal{background:var(--surface);border-radius:var(--r-xl);box-shadow:var(--shadow-xl);width:100%;max-width:620px;max-height:90vh;overflow-y:auto;animation:modalIn .2s ease;border:1px solid var(--border);}
.modal-lg{max-width:800px;}
@keyframes modalIn{from{opacity:0;transform:scale(.95);}to{opacity:1;transform:none;}}
.modal-header{padding:22px 24px 18px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:12px;position:sticky;top:0;background:var(--surface);z-index:2;border-radius:var(--r-xl) var(--r-xl) 0 0;}
.modal-header h3{font-family:'Poppins',sans-serif;font-size:17px;font-weight:600;flex:1;letter-spacing:-0.2px;color:var(--ink);}
.mh-sub{font-size:12px;color:var(--ink-4);margin-top:3px;}
.modal-close{background:var(--surface-2);border:1px solid var(--border);font-size:13px;cursor:pointer;color:var(--ink-3);border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all var(--t);}
.modal-close:hover{background:var(--red-l);border-color:var(--red-b);color:var(--red-d);}
.modal-body{padding:22px 24px;}
.modal-footer{padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:var(--surface-2);border-radius:0 0 var(--r-xl) var(--r-xl);}

/* TABS */
.tabs{display:flex;border-bottom:2px solid var(--border);margin-bottom:20px;gap:1px;}
.tab{padding:10px 18px;cursor:pointer;font-size:13px;font-weight:500;color:var(--ink-4);border-bottom:3px solid transparent;margin-bottom:-2px;transition:all var(--t);white-space:nowrap;border-radius:var(--r) var(--r) 0 0;}
.tab:hover{color:var(--ink-2);background:var(--surface-2);}
.tab.active{color:var(--primary);border-bottom-color:var(--primary);background:var(--primary-l);}

/* PROVIDER CARDS */
.prov-card{display:grid;grid-template-columns:auto 1fr auto;align-items:start;gap:16px;padding:18px 22px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);margin-bottom:12px;cursor:pointer;transition:all var(--t-slow);box-shadow:var(--shadow-sm);}
.prov-card:hover{border-color:var(--primary);box-shadow:var(--shadow-md);transform:translateY(-2px);}
.prov-avatar{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:18px;color:white;flex-shrink:0;box-shadow:0 4px 14px rgba(0,0,0,.18);overflow:hidden;}
.prov-name{font-size:15px;font-weight:600;color:var(--ink);margin-bottom:3px;font-family:'Poppins',sans-serif;}
.prov-title{font-size:12px;color:var(--ink-3);margin-bottom:9px;}
.prov-chips{display:flex;gap:6px;flex-wrap:wrap;}
.prov-actions{display:flex;flex-direction:column;gap:7px;align-items:flex-end;}

/* WORKFLOW STEPS */
.workflow-steps{display:flex;align-items:center;overflow-x:auto;padding:4px 0;}
.ws{display:flex;flex-direction:column;align-items:center;flex-shrink:0;min-width:72px;position:relative;}
.ws:not(:last-child)::after{content:'';position:absolute;left:50%;top:14px;width:100%;height:2px;background:var(--border-2);z-index:0;}
.ws.done:not(:last-child)::after{background:var(--primary);}
.ws-dot{width:28px;height:28px;border-radius:50%;border:2px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--ink-4);z-index:1;position:relative;transition:all var(--t);}
.ws.done .ws-dot{background:var(--primary);border-color:var(--primary);color:white;}
.ws.active .ws-dot{border-color:var(--primary);color:var(--primary);box-shadow:0 0 0 4px rgba(37,99,235,.15);}
.ws-label{font-size:9.5px;color:var(--ink-4);margin-top:5px;text-align:center;max-width:68px;line-height:1.3;}
.ws.done .ws-label,.ws.active .ws-label{color:var(--primary);font-weight:600;}

/* ALERTS */
.alert-item{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:var(--r-lg);margin-bottom:8px;}
.alert-item.al-red{background:var(--red-l);border-left:4px solid var(--red);}
.alert-item.al-amber{background:var(--amber-l);border-left:4px solid var(--amber-d);}
.alert-item.al-blue{background:var(--blue-l);border-left:4px solid var(--blue);}
.al-icon{font-size:15px;flex-shrink:0;margin-top:1px;}
.al-body{flex:1;}
.al-title{font-weight:600;color:var(--ink);margin-bottom:2px;}
.al-sub{color:var(--ink-3);font-size:11.5px;}

/* MISC UTILITIES */
.stat-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-2);font-size:13px;}
.stat-row:last-child{border-bottom:none;}
.stat-row-label{color:var(--ink-3);}
.stat-row-value{font-weight:600;color:var(--ink);}
.donut-wrap{display:flex;align-items:center;gap:24px;}
.donut-legend{flex:1;}
.donut-legend-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;}
.donut-legend-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;}
.report-card{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-lg);padding:18px 20px;cursor:pointer;transition:all var(--t);}
.report-card:hover{background:var(--primary-l);border-color:var(--primary);box-shadow:var(--shadow);}
.report-card h4{font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;}
.report-card p{font-size:12px;color:var(--ink-3);}
.npi-result-box{border-radius:var(--r-md);padding:12px 14px;margin-top:8px;}
.nr-name{font-size:14px;font-weight:700;color:var(--ink);margin-bottom:2px;}
.nr-detail{font-size:12px;color:var(--ink-3);}
.audit-entry{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-2);}
.audit-entry:last-child{border-bottom:none;}
.audit-dot{width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:5px;}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
.mb-12{margin-bottom:12px;}.mb-16{margin-bottom:16px;}.mb-20{margin-bottom:20px;}.mt-12{margin-top:12px;}
.text-muted{color:var(--ink-4);font-size:12px;}
.text-sm{font-size:12.5px;}.text-xs{font-size:11.5px;}.font-500{font-weight:500;}
.info-chip{display:inline-flex;align-items:center;gap:4px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11.5px;color:var(--ink-3);}
.empty-state{text-align:center;padding:56px 20px;color:var(--ink-4);}
.ei{font-size:42px;margin-bottom:14px;opacity:.55;}
.empty-state h4{font-size:15px;color:var(--ink-3);margin-bottom:6px;font-weight:600;}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;}
.spinner-lg{display:inline-block;width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
.loading-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px;}
.loading-screen p{color:var(--ink-4);font-size:13px;}
.sort-pill-row{display:flex;gap:5px;align-items:center;margin-left:6px;}
.sort-pill{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--ink-3);transition:all var(--t);}
.sort-pill:hover{border-color:var(--primary);color:var(--primary);}
.sort-pill.active{background:var(--primary);border-color:var(--primary);color:white;}

/* TOASTS */
.toast-wrap{position:fixed;bottom:22px;right:22px;z-index:9999;display:flex;flex-direction:column;gap:9px;pointer-events:none;}
.toast{background:var(--navy);color:white;padding:13px 18px;border-radius:var(--r-lg);font-size:13px;box-shadow:var(--shadow-lg);animation:toastIn .22s ease;display:flex;align-items:center;gap:10px;min-width:250px;pointer-events:auto;border:1px solid rgba(255,255,255,0.07);}
@keyframes toastIn{from{opacity:0;transform:translateY(12px) scale(.95);}to{opacity:1;transform:none;}}
.toast-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}
.t-success .toast-icon{background:var(--green);}
.t-error .toast-icon{background:var(--red-d);}
.t-warn .toast-icon{background:var(--amber-d);}
.t-info .toast-icon{background:var(--blue);}

/* GLOBAL SEARCH */
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes slideDown{from{opacity:0;transform:translateY(-14px);}to{opacity:1;transform:none;}}
.gsearch-overlay{position:fixed;inset:0;background:rgba(15,23,42,.7);backdrop-filter:blur(8px);z-index:800;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;animation:fadeIn .15s ease;}
.gsearch-box{background:var(--surface);border-radius:var(--r-xl);box-shadow:var(--shadow-xl);width:100%;max-width:640px;overflow:hidden;animation:slideDown .18s ease;border:1px solid var(--border);}
.gsearch-input-wrap{display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border);}
.gsearch-icon{font-size:18px;color:var(--ink-4);flex-shrink:0;}
.gsearch-input{flex:1;border:none;outline:none;font-family:'Inter',sans-serif;font-size:16px;color:var(--ink);background:transparent;}
.gsearch-input::placeholder{color:var(--ink-4);}
.gsearch-kbd{background:var(--surface-2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;font-size:11px;color:var(--ink-4);white-space:nowrap;}
.gsearch-results{max-height:460px;overflow-y:auto;}
.gsearch-section{padding:8px 0 4px;}
.gsearch-section-label{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--ink-4);padding:4px 22px 6px;}
.gsearch-item{display:flex;align-items:center;gap:12px;padding:10px 22px;cursor:pointer;transition:background var(--t);}
.gsearch-item:hover,.gsearch-item.focused{background:var(--primary-l);}
.gsearch-item-icon{width:34px;height:34px;border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.gsearch-item-main{flex:1;min-width:0;}
.gsearch-item-title{font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gsearch-item-sub{font-size:11.5px;color:var(--ink-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gsearch-item-tag{flex-shrink:0;}
.gsearch-empty{text-align:center;padding:40px 20px;color:var(--ink-4);font-size:13px;}
.gsearch-footer{padding:12px 22px;border-top:1px solid var(--border);display:flex;gap:16px;align-items:center;background:var(--surface-2);}
.gsearch-hint{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-4);}
.topbar-search-btn-OLD{display:none;}
.progress-bar{height:8px;background:var(--border-2);border-radius:4px;overflow:hidden;}
.progress-fill{height:100%;border-radius:4px;transition:width .4s ease;}

/* PHOTO UPLOAD */
.photo-upload-wrap{display:flex;align-items:center;gap:18px;margin-bottom:22px;padding:18px;background:var(--surface-2);border:1.5px dashed var(--border-3);border-radius:var(--r-xl);}
.photo-preview{width:76px;height:76px;border-radius:16px;border:2px solid var(--border);flex-shrink:0;background:var(--primary-l);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:28px;color:var(--primary);overflow:hidden;}
.photo-preview img{width:100%;height:100%;object-fit:cover;}
.photo-actions{flex:1;}
.photo-label{font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px;}
.photo-sub{font-size:11.5px;color:var(--ink-4);margin-bottom:10px;}
.photo-btns{display:flex;gap:8px;flex-wrap:wrap;}
.photo-upload-input{display:none;}

/* PSYCHOLOGY TODAY */
.pt-status-bar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:var(--r-lg);margin-bottom:12px;}
.pt-status-bar.pt-active{background:#e8f5e9;border:1px solid #a5d6a7;}
.pt-status-bar.pt-none{background:var(--surface-2);border:1px solid var(--border);}
.pt-status-bar.pt-inactive{background:var(--amber-l);border:1px solid var(--amber-b);}
.pt-icon{font-size:20px;flex-shrink:0;}
.pt-body{flex:1;}
.pt-title{font-size:13px;font-weight:600;color:var(--ink);}
.pt-sub{font-size:11.5px;color:var(--ink-3);}
.pt-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:18px 20px;margin-bottom:10px;display:flex;align-items:center;gap:14px;transition:all var(--t);}
.pt-card:hover{border-color:var(--primary);box-shadow:var(--shadow-md);}
.pt-card-avatar{width:48px;height:48px;border-radius:12px;flex-shrink:0;background:var(--primary-l);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:17px;color:var(--primary);overflow:hidden;}
.pt-card-avatar img{width:100%;height:100%;object-fit:cover;}
.pt-missing{background:var(--amber-l);border:1.5px dashed var(--amber-b);}

/* PROVIDER LOOKUP */
.lookup-result-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:18px 22px;margin-bottom:12px;display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:start;box-shadow:var(--shadow-sm);transition:all var(--t);}
.lookup-result-card:hover{border-color:var(--primary);box-shadow:var(--shadow-md);}
.lookup-avatar{width:46px;height:46px;border-radius:12px;background:var(--primary-l);border:1px solid var(--blue-b);display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:17px;color:var(--primary);flex-shrink:0;}
.lookup-name{font-size:15px;font-weight:700;color:var(--ink);margin-bottom:3px;font-family:'Poppins',sans-serif;}
.lookup-meta{font-size:12px;color:var(--ink-3);margin-bottom:6px;}
.lookup-chips{display:flex;gap:5px;flex-wrap:wrap;}
.lookup-actions{display:flex;flex-direction:column;gap:6px;align-items:flex-end;}
.lookup-count{font-size:12px;color:var(--ink-4);margin-bottom:12px;font-style:italic;}
.lookup-tabs{display:flex;gap:2px;margin-bottom:22px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-xl);padding:4px;}
.lookup-tab{flex:1;padding:8px 14px;border-radius:var(--r-lg);cursor:pointer;font-size:13px;font-weight:500;color:var(--ink-4);text-align:center;transition:all var(--t);}
.lookup-tab:hover{color:var(--ink);}
.lookup-tab.active{background:var(--surface);color:var(--primary);box-shadow:var(--shadow-sm);border:1px solid var(--border);}
.verif-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:20px 22px;margin-bottom:12px;display:flex;align-items:flex-start;gap:18px;box-shadow:var(--shadow-sm);transition:all var(--t);}
.verif-card:hover{border-color:var(--primary);box-shadow:var(--shadow-md);}
.verif-icon{width:44px;height:44px;border-radius:var(--r-lg);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
.verif-body{flex:1;}
.verif-title{font-size:14px;font-weight:700;color:var(--ink);margin-bottom:5px;}
.verif-desc{font-size:12.5px;color:var(--ink-3);margin-bottom:10px;line-height:1.55;}
.verif-note{font-size:11.5px;color:var(--ink-4);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:8px 12px;margin-top:8px;}

/* IMPORT */
.import-preview{background:var(--primary-l);border:1px solid #c3d9fd;border-radius:var(--r-lg);padding:16px 18px;margin-top:10px;}
.import-preview-title{font-size:11px;font-weight:700;color:var(--primary);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;}
.import-row{display:flex;gap:8px;font-size:12.5px;padding:4px 0;border-bottom:1px solid #d0e6fc;}
.import-row:last-child{border-bottom:none;}
.import-label{color:var(--ink-4);width:130px;flex-shrink:0;}
.import-val{color:var(--ink);font-weight:500;}

/* KANBAN */
.kanban-board{display:flex;gap:14px;overflow-x:auto;padding-bottom:12px;align-items:flex-start;min-height:60vh;}
.kanban-col{flex:0 0 265px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-xl);display:flex;flex-direction:column;max-height:calc(100vh - 180px);}
.kanban-col-header{padding:14px 16px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;border-radius:var(--r-xl) var(--r-xl) 0 0;}
.kanban-col-title{font-size:12.5px;font-weight:700;color:var(--ink-2);flex:1;}
.kanban-col-count{background:var(--surface);border:1px solid var(--border);border-radius:20px;font-size:11px;font-weight:700;color:var(--ink-3);padding:2px 9px;}
.kanban-col-accent{width:3px;height:20px;border-radius:2px;flex-shrink:0;}
.kanban-cards{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;}
.kanban-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:13px 15px;cursor:pointer;transition:all var(--t);box-shadow:var(--shadow-sm);}
.kanban-card:hover{border-color:var(--primary);box-shadow:var(--shadow-md);transform:translateY(-2px);}
.kanban-card-prov{font-size:13px;font-weight:600;color:var(--ink);margin-bottom:2px;}
.kanban-card-payer{font-size:11.5px;color:var(--ink-3);margin-bottom:8px;}
.kanban-card-meta{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
.kanban-card-fu{font-size:10.5px;color:var(--red-d);font-weight:600;margin-top:5px;padding:3px 7px;background:var(--red-l);border-radius:4px;display:inline-flex;align-items:center;gap:4px;}
.kanban-empty{text-align:center;padding:28px 12px;color:var(--ink-4);font-size:12px;opacity:.7;}

/* MISSING DOCS */
.missing-doc-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--r-lg);margin-bottom:8px;background:var(--red-l);border-left:4px solid var(--red);}
.missing-doc-row.warn{background:var(--amber-l);border-left-color:var(--amber-d);}
.missing-doc-icon{font-size:16px;flex-shrink:0;}
.missing-doc-body{flex:1;}
.missing-doc-title{font-size:13px;font-weight:600;color:var(--ink);}
.missing-doc-sub{font-size:11.5px;color:var(--ink-3);}
.missing-doc-badge{flex-shrink:0;}

/* PAYER REQUIREMENTS */
.payer-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;max-height:400px;overflow-y:auto;padding:2px;}
.payer-pick-btn{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1.5px solid var(--border);border-radius:var(--r-lg);background:var(--surface);cursor:pointer;transition:all var(--t);text-align:left;}
.payer-pick-btn:hover{border-color:var(--primary);background:var(--primary-l);}
.payer-pick-btn.selected{border-color:var(--primary);background:var(--primary-l);box-shadow:0 0 0 3px rgba(37,99,235,.12);}
.payer-pick-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
.payer-pick-name{font-size:13px;font-weight:600;color:var(--ink);line-height:1.3;}
.payer-pick-type{font-size:11px;color:var(--ink-4);}
.payer-pick-custom{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1.5px dashed var(--border-3);border-radius:var(--r-lg);background:var(--surface-2);cursor:pointer;transition:all var(--t);}
.payer-pick-custom:hover{border-color:var(--primary);background:var(--primary-l);}
.guideline-box{background:var(--primary-l);border:1px solid #c3d9fd;border-radius:var(--r-lg);padding:14px 16px;margin-bottom:16px;}
.guideline-box-title{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--primary);margin-bottom:10px;}
.guideline-item{display:flex;align-items:flex-start;gap:6px;font-size:12px;color:var(--ink-2);padding:2.5px 0;}
.guideline-item::before{content:'✓';color:var(--primary);font-weight:700;flex-shrink:0;}
.guideline-warn{background:var(--amber-l);border:1px solid var(--amber-b);border-radius:var(--r-md);padding:8px 10px;font-size:11.5px;color:var(--amber-d);font-weight:500;margin-top:8px;}
.modal-step-indicator{display:flex;align-items:center;gap:0;margin-bottom:20px;}
.msi-step{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--ink-4);}
.msi-step.active{color:var(--primary);}
.msi-step.done{color:var(--green-d);}
.msi-num{width:22px;height:22px;border-radius:50%;border:2px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}
.msi-line{flex:1;height:2px;background:var(--border);margin:0 8px;min-width:20px;}
.msi-line.done{background:var(--green-d);}
.payer-req-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px;}
.payer-req-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);overflow:hidden;box-shadow:var(--shadow-sm);transition:all var(--t);}
.payer-req-card:hover{box-shadow:var(--shadow-md);transform:translateY(-1px);}
.payer-req-header{padding:16px 18px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;}
.payer-req-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;}
.payer-req-name{font-size:14.5px;font-weight:700;color:var(--ink);flex:1;}
.payer-req-body{padding:14px 18px;}
.payer-req-section{margin-bottom:12px;}
.payer-req-section-label{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--ink-4);margin-bottom:6px;}
.payer-req-item{display:flex;align-items:flex-start;gap:6px;font-size:12px;color:var(--ink-2);padding:2px 0;}
.payer-req-item::before{content:'•';color:var(--primary);font-weight:700;flex-shrink:0;margin-top:1px;}
.payer-req-note{font-size:11.5px;color:var(--ink-4);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:8px 12px;line-height:1.55;}
.payer-req-special{display:flex;align-items:flex-start;gap:6px;font-size:11.5px;color:var(--amber-d);background:var(--amber-l);border:1px solid var(--amber-b);border-radius:var(--r);padding:4px 8px;margin-bottom:4px;font-weight:500;}
.payer-req-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.payer-req-chip{display:inline-flex;align-items:center;gap:4px;background:var(--primary-l);border:1px solid #c3d9fd;border-radius:5px;padding:3px 8px;font-size:11px;color:var(--primary);font-weight:500;}
.payer-req-expanded{display:none;}.payer-req-card.expanded .payer-req-expanded{display:block;}
.payer-req-toggle{background:none;border:none;font-size:11.5px;color:var(--primary);cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;padding:0;margin-top:4px;transition:color var(--t);}
.payer-req-toggle:hover{color:var(--primary-h);}

@media(max-width:960px){.sidebar{width:200px;}.main{margin-left:200px;}.kpi-grid{grid-template-columns:repeat(2,1fr);}.form-grid,.grid-2,.grid-3{grid-template-columns:1fr;}.form-grid .full{grid-column:1;}}
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
    return {onClick:()=>toggleSort(key),className:sortKey===key?('sort-'+sortDir):'',children:label,style:{cursor:'pointer'}}
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

    // ── Duplicate detection (skip when editing an existing provider) ───────────
    if (!editingId.provider) {
      const fname = provForm.fname.trim().toLowerCase()
      const lname = provForm.lname.trim().toLowerCase()
      const npi   = provForm.npi?.trim()

      const duplicate = db.providers.find(p => {
        // NPI match is definitive (NPIs are unique per provider)
        if (npi && p.npi && p.npi === npi) return true
        // Name match as fallback (case-insensitive)
        const sameName = p.fname.trim().toLowerCase() === fname &&
                         p.lname.trim().toLowerCase() === lname
        return sameName
      })

      if (duplicate) {
        toast(
          `Duplicate: ${duplicate.fname} ${duplicate.lname}${duplicate.cred ? ', ' + duplicate.cred : ''} is already on file.`,
          'error'
        )
        return
      }
    }

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

      // ── Use npiMapper for richer, taxonomy-aware data ──────────────────────
      const { mapNpiResponse, npiCardToProviderDefaults } = await import('../lib/npiMapper')
      const card = mapNpiResponse(data)
      if (!card) { setNpiResult({ error: 'No provider found for this NPI.' }); return }

      // addr string for the result box
      const addr = [card.address, card.city, card.state, card.zip].filter(Boolean).join(', ')
      setNpiResult({ ...card, addr, npi: npiInput })

      // Pre-fill form with mapped defaults (only fills empty fields)
      const defaults = npiCardToProviderDefaults(card)
      setProvForm(f => ({
        ...f,
        ...Object.fromEntries(
          Object.entries(defaults).filter(([k, v]) => v && !f[k])
        ),
        npi: npiInput,
      }))

      await addAudit('Provider', 'NPI Lookup', `NPI ${npiInput} → ${card.fname} ${card.lname} (${card.taxonomyDesc})`, '')
      toast('NPI data loaded!', 'success')
    } catch(e) { setNpiResult({ error: e.message || 'Could not reach NPI registry.' }) }
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
          <Topbar page={page} setPage={setPage} openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} openDocModal={openDocModal} openTaskModal={openTaskModal} exportJSON={exportJSON} saving={saving} onOpenSearch={()=>setGlobalSearchOpen(true)} alertCount={alertCount} user={user} signOut={signOut} />

          {loading ? (
            <div className="loading-screen">
              <div className="spinner-lg"></div>
              <div style={{ marginTop:16, color:'#5a6e5a' }}>Loading your data…</div>
            </div>
          ) : (
            <div className="pages">
              {page === 'dashboard' && <WorkflowDashboard db={db} setPage={setPage} openEnrollModal={openEnrollModal} />}
              {page === 'alerts' && <Alerts db={db} />}
              {page === 'providers' && <Providers db={db} search={provSearch} setSearch={setProvSearch} fStatus={provFStatus} setFStatus={setProvFStatus} fSpec={provFSpec} setFSpec={setProvFSpec} openProvDetail={openProvDetail} editProvider={editProvider} setPage={setPage} setProvForm={setProvForm} setEditingId={setEditingId} setNpiInput={setNpiInput} setNpiResult={setNpiResult} />}
              {page === 'provider-lookup' && <ProviderLookup db={db} setPage={setPage} setProvForm={setProvForm} setEditingId={setEditingId} setNpiInput={setNpiInput} setNpiResult={setNpiResult} />}
              {page === 'add-provider' && <AddProvider db={db} provForm={provForm} setProvForm={setProvForm} editingId={editingId} setEditingId={setEditingId} npiInput={npiInput} setNpiInput={setNpiInput} npiResult={npiResult} setNpiResult={setNpiResult} npiLoading={npiLoading} lookupNPI={lookupNPI} handleSaveProvider={handleSaveProvider} handleDeleteProvider={handleDeleteProvider} handlePhotoUpload={handlePhotoUpload} handleDeletePhoto={handleDeletePhoto} photoUploading={photoUploading} setPage={setPage} saving={saving} />}
              {page === 'pipeline' && <PayerHub db={db} initialTab="pipeline" openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} search={enrSearch} setSearch={setEnrSearch} fStage={enrFStage} setFStage={setEnrFStage} fProv={enrFProv} setFProv={setEnrFProv} handleDeleteEnrollment={handleDeleteEnrollment} paySearch={paySearch} setPaySearch={setPaySearch} payFType={payFType} setPayFType={setPayFType} handleDeletePayer={handleDeletePayer} />}
              {page === 'enrollments' && <PayerHub db={db} initialTab="enrollments" openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} search={enrSearch} setSearch={setEnrSearch} fStage={enrFStage} setFStage={setEnrFStage} fProv={enrFProv} setFProv={setEnrFProv} handleDeleteEnrollment={handleDeleteEnrollment} paySearch={paySearch} setPaySearch={setPaySearch} payFType={payFType} setPayFType={setPayFType} handleDeletePayer={handleDeletePayer} />}
              {page === 'payers' && <PayerHub db={db} initialTab="directory" openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} search={enrSearch} setSearch={setEnrSearch} fStage={enrFStage} setFStage={setEnrFStage} fProv={enrFProv} setFProv={setEnrFProv} handleDeleteEnrollment={handleDeleteEnrollment} paySearch={paySearch} setPaySearch={setPaySearch} payFType={payFType} setPayFType={setPayFType} handleDeletePayer={handleDeletePayer} />}
              {page === 'payer-requirements' && <PayerHub db={db} initialTab="library" openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} search={enrSearch} setSearch={setEnrSearch} fStage={enrFStage} setFStage={setEnrFStage} fProv={enrFProv} setFProv={setEnrFProv} handleDeleteEnrollment={handleDeleteEnrollment} paySearch={paySearch} setPaySearch={setPaySearch} payFType={payFType} setPayFType={setPayFType} handleDeletePayer={handleDeletePayer} />}
              {page === 'payer-hub' && <PayerHub db={db} initialTab="directory" openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} search={enrSearch} setSearch={setEnrSearch} fStage={enrFStage} setFStage={setEnrFStage} fProv={enrFProv} setFProv={setEnrFProv} handleDeleteEnrollment={handleDeleteEnrollment} paySearch={paySearch} setPaySearch={setPaySearch} payFType={payFType} setPayFType={setPayFType} handleDeletePayer={handleDeletePayer} />}
              {page === 'missing-docs' && <MissingDocuments db={db} />}
              {page === 'documents' && <WorkflowDocuments db={db} openDocModal={openDocModal} handleDeleteDocument={handleDeleteDocument} />}
              {page === 'workflows' && <WorkflowTasks db={db} openTaskModal={openTaskModal} handleMarkDone={handleMarkDone} handleDeleteTask={handleDeleteTask} />}
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
        {modal === 'provDetail' && provDetail && <ProvDetailModal prov={provDetail} db={db} tab={provDetailTab} setTab={setProvDetailTab} onClose={()=>setModal(null)} editProvider={editProvider} openEnrollModal={openEnrollModal} toast={toast} />}

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

  const NAV_ICONS = {
    dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    alerts: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    providers: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    'add-provider': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
    'provider-lookup': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    pipeline: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/></svg>,
    enrollments: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    payers: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    'payer-hub': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    'payer-requirements': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    'missing-docs': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    documents: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
    workflows: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    'psychology-today': <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
    eligibility: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    claims: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    denials: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
    revenue: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    reports: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><bar-chart/><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    audit: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    settings: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:.75}}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>,
  }

  const navItem = (pg, label, badge, badgeClass) => (
    <div className={`sb-item ${page===pg?'active':''}`} onClick={() => setPage(pg)}>
      {NAV_ICONS[pg] || <span style={{width:15,flexShrink:0}}/>}
      <span style={{marginLeft:8}}>{label}</span>
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
          <div><h1>Cred<span>Flow</span></h1><div style={{fontSize:9.5,color:'rgba(255,255,255,0.4)',fontWeight:500,letterSpacing:'0.5px',marginTop:1}}>Credentialing Suite</div></div>
        </div>
      </div>
      <div className="sb-nav">
        <div className="sb-nav-groups">
          <Group id="overview" label="Overview">
            {navItem('dashboard','Dashboard')}
            {navItem('alerts','Alerts', alertCount)}
          </Group>
          <Group id="providers" label="Providers">
            {navItem('providers','Providers')}
            {navItem('provider-lookup','NPI Lookup')}
          </Group>
          <Group id="enrollments" label="Enrollments">
            {navItem('payer-hub','Payer Hub', pendingEnroll, 'amber')}
          </Group>
          <Group id="compliance" label="Compliance">
            {navItem('missing-docs','Missing Documents')}
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

function Topbar({ page, setPage, openEnrollModal, openPayerModal, openDocModal, openTaskModal, exportJSON, saving, onOpenSearch, alertCount, user, signOut }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const userMenuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const titles = { dashboard:'Dashboard', alerts:'Alerts', providers:'Providers', 'add-provider':'Add Provider', 'provider-lookup':'NPI Lookup', 'psychology-today':'Psychology Today', enrollments:'Payer Hub', pipeline:'Payer Hub', 'payer-requirements':'Payer Hub', payers:'Payer Hub', 'payer-hub':'Payer Hub', documents:'Documents & Expiry', workflows:'Workflows & Tasks', reports:'Reports & Analytics', audit:'Audit Trail', settings:'Settings', eligibility:'Eligibility Verification', claims:'Claims Tracker', denials:'Denial Log', revenue:'Revenue Analytics' }
  function topCTA() {
    if (page==='payer-hub') return // handled inside PayerHub tabs
    if (page==='enrollments') openEnrollModal()
    else if (page==='payers') openPayerModal()
    else if (page==='documents') openDocModal()
    else if (page==='workflows') openTaskModal()
  }
  const ctaLabel = page==='documents'?'＋ Add Document':page==='workflows'?'＋ New Task':null
  const emailInitial = (user?.email||'A')[0].toUpperCase()
  const displayEmail = user?.email || 'admin@credflow.io'
  const displayName = 'Admin User'

  return (
    <div className="topbar">
      {/* LEFT: breadcrumb + page title */}
      <div className="topbar-left">
        <span className="topbar-crumb">Home &rsaquo; {titles[page]||page}</span>
        <span className="topbar-title">{titles[page]||page}</span>
      </div>

      {/* RIGHT: CTA, search, bell, user */}
      <div className="topbar-actions">
        {ctaLabel && <button className="btn btn-primary btn-sm" onClick={topCTA}>{ctaLabel}</button>}

        {/* Search bar */}
        <div className="topbar-search-wrap" onClick={onOpenSearch} style={{cursor:'pointer'}}>
          <span className="topbar-search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            readOnly
            value={searchVal}
            placeholder="Search anything..."
            style={{cursor:'pointer'}}
            onFocus={onOpenSearch}
          />
          <span className="topbar-search-kbd">⌘K</span>
        </div>

        {/* Notification bell */}
        <div className="topbar-icon-btn" title="Alerts & Notifications" onClick={() => setPage('alerts')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          {alertCount > 0 && <span className="topbar-notif-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
        </div>

        {/* User / Admin button */}
        <div style={{position:'relative'}} ref={userMenuRef}>
          <div className="topbar-user-btn" onClick={() => setUserMenuOpen(o => !o)}>
            <div className="topbar-user-avatar">{emailInitial}</div>
            <div style={{display:'flex',flexDirection:'column',lineHeight:1.2}}>
              <span className="topbar-user-name">{displayName}</span>
              <span className="topbar-user-role">Administrator</span>
            </div>
            <svg className="topbar-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {userMenuOpen && (
            <div className="user-dropdown">
              <div className="user-dropdown-header">
                <div className="user-dropdown-name">{displayName}</div>
                <div className="user-dropdown-email">{displayEmail}</div>
              </div>
              <div className="user-dropdown-item" onClick={() => { setPage('settings'); setUserMenuOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>
                Settings
              </div>
              <div className="user-dropdown-item" onClick={() => { setPage('audit'); setUserMenuOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Audit Log
              </div>
              <div className="user-dropdown-item" onClick={() => { exportJSON(); setUserMenuOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Data
              </div>
              <hr className="user-dropdown-divider" />
              <div className="user-dropdown-item danger" onClick={() => { setUserMenuOpen(false); if(signOut) signOut() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </div>
            </div>
          )}
        </div>
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
  const [sortBy, setSortBy] = useState('name')
  const filtered = db.providers.filter(p => {
    const txt = `${p.fname} ${p.lname} ${p.cred} ${p.npi} ${p.focus} ${p.spec} ${p.email||''} ${p.phone||''} ${p.license||''} ${p.medicaid||''} ${p.caqh||''} ${p.dea||''} ${p.supervisor||''} ${p.notes||''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase())) && (!fStatus || (p.status||'').trim()===fStatus) && (!fSpec || (p.spec||'').trim().toLowerCase()===fSpec.toLowerCase())
  })
  const list = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return `${a.lname} ${a.fname}`.localeCompare(`${b.lname} ${b.fname}`)
    if (sortBy === 'spec') return (a.spec||'').localeCompare(b.spec||'')
    if (sortBy === 'status') return (a.status||'').localeCompare(b.status||'')
    if (sortBy === 'license') { const da=daysUntil(a.licenseExp), db2=daysUntil(b.licenseExp); return (da??99999)-(db2??99999) }
    if (sortBy === 'panels') { const pa=db.enrollments.filter(e=>e.provId===a.id&&e.stage==='Active').length; const pb=db.enrollments.filter(e=>e.provId===b.id&&e.stage==='Active').length; return pb-pa }
    if (sortBy === 'readiness') { return providerReadiness(a) - providerReadiness(b) }
    return 0
  })
  return <div className="page">
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, NPI, license, specialty…" style={{width:280}} /></div>
      <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="">All Statuses</option><option>Active</option><option>Pending</option><option>Inactive</option></select>
      <select className="filter-select" value={fSpec} onChange={e=>setFSpec(e.target.value)}><option value="">All Specialties</option><option>Mental Health</option><option>Massage Therapy</option><option>Naturopathic</option><option>Chiropractic</option><option>Acupuncture</option></select>
      <select className="filter-select" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{minWidth:140}}>
        <option value="name">Sort: A–Z Name</option>
        <option value="spec">Sort: Specialty</option>
        <option value="status">Sort: Status</option>
        <option value="license">Sort: License Expiry</option>
        <option value="panels">Sort: Active Panels</option>
        <option value="readiness">Sort: Readiness ↑</option>
      </select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>{setProvForm({});setEditingId(e=>({...e,provider:null}));setNpiInput('');setNpiResult(null);setPage('add-provider')}}>＋ Add Provider</button></div>
    </div>
    {!list.length ? <div className="empty-state"><div className="ei">👤</div><h4>No providers found</h4></div> : list.map(p => (
      <WorkflowProviderCard
        key={p.id}
        prov={p}
        db={db}
        onOpen={openProvDetail}
        onEdit={editProvider}
        onEnroll={null}
      />
    ))}
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

          {provForm.spec === 'Mental Health' && <>
          <div className="section-divider">Psychology Today Profile <span style={{fontSize:10,fontWeight:500,marginLeft:8,color:'var(--purple)',background:'var(--purple-l)',border:'1px solid var(--purple-b)',padding:'2px 7px',borderRadius:20}}>Mental Health Only</span></div>
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
          </>}

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

// ─── PAYER HUB ─────────────────────────────────────────────────────────────────
// Unified 4-tab hub: Directory | Enrollments | Pipeline | Library
function PayerHub({ db, initialTab, openEnrollModal, openPayerModal, search, setSearch, fStage, setFStage, fProv, setFProv, handleDeleteEnrollment, paySearch, setPaySearch, payFType, setPayFType, handleDeletePayer }) {
  const [tab, setTab] = useState(initialTab || 'directory')

  const TABS = [
    { id:'directory',   label:'🗂 Directory',   hint:'Your practice\'s payers' },
    { id:'enrollments', label:'📋 Enrollments', hint:'Enrollment table' },
    { id:'pipeline',    label:'📊 Pipeline',    hint:'Kanban board' },
    { id:'library',     label:'🌐 Library',     hint:'National payer library' },
  ]

  return (
    <div className="page" style={{paddingTop:0}}>
      {/* Tab bar */}
      <div style={{display:'flex',gap:4,marginBottom:22,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:'var(--r-xl)',padding:5,position:'sticky',top:60,zIndex:50,backdropFilter:'blur(8px)'}}>
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex:1, padding:'9px 14px', border:'none', borderRadius:'var(--r-lg)', cursor:'pointer',
              fontSize:13, fontWeight: tab===t.id ? 600 : 400,
              background: tab===t.id ? 'var(--surface)' : 'transparent',
              color: tab===t.id ? 'var(--primary)' : 'var(--ink-3)',
              boxShadow: tab===t.id ? 'var(--shadow-sm)' : 'none',
              transition:'all var(--t)',
              borderTop: tab===t.id ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab: Directory (practice's enrolled payers) */}
      {tab === 'directory' && (
        <PayersTab db={db} search={paySearch} setSearch={setPaySearch} fType={payFType} setFType={setPayFType} openPayerModal={openPayerModal} handleDeletePayer={handleDeletePayer} />
      )}

      {/* Tab: Enrollments */}
      {tab === 'enrollments' && (
        <EnrollmentsTab db={db} search={search} setSearch={setSearch} fStage={fStage} setFStage={setFStage} fProv={fProv} setFProv={setFProv} openEnrollModal={openEnrollModal} handleDeleteEnrollment={handleDeleteEnrollment} />
      )}

      {/* Tab: Pipeline (Kanban) */}
      {tab === 'pipeline' && (
        <KanbanPipeline db={db} openEnrollModal={openEnrollModal} />
      )}

      {/* Tab: Library (national payer reference) */}
      {tab === 'library' && (
        <PayerRequirements db={db} />
      )}
    </div>
  )
}

// Extracted sub-tab components (so PayerHub can render them without the outer <div className="page">)
function PayersTab({ db, search, setSearch, fType, setFType, openPayerModal, handleDeletePayer }) {
  const rawPayers = db.payers.filter(p => `${p.name} ${p.payerId} ${p.type}`.toLowerCase().includes((search||'').toLowerCase()) && (!fType||p.type===fType))
  const {sorted:list, thProps} = useSorted(rawPayers, 'name')
  return <>
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
  </>
}

function EnrollmentsTab({ db, search, setSearch, fStage, setFStage, fProv, setFProv, openEnrollModal, handleDeleteEnrollment }) {
  const filtered = db.enrollments.filter(e => {
    const txt = `${pName(db.providers,e.provId)} ${payName(db.payers,e.payId)} ${e.stage} ${e.notes}`.toLowerCase()
    return (!(search)||txt.includes(search.toLowerCase())) && (!fStage||e.stage===fStage) && (!fProv||e.provId===fProv)
  })
  const {sorted:list, thProps} = useSorted(filtered, 'stage')
  return <>
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
  </>
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

// ─── PAYER CATALOG ─────────────────────────────────────────────────────────────
const PAYER_CATALOG = [
  { name:'Aetna', payerId:'60054', type:'Commercial', phone:'1-800-872-3862', portal:'https://www.availity.com', timeline:'60–90 days', color:'#C8102E',
    notes:'Submit via Availity. CAQH must be attested within last 120 days. Group and individual enrollment both required.',
    guidelines:['Complete CAQH profile (attested within 120 days)','Submit application via Availity portal','Include NPI Type 1 and Type 2','Provide current CV/Resume','Attach copy of state license','Attach malpractice insurance certificate','Include W-9 form','DEA certificate if prescribing'],
    warn:'Group enrollment is separate from individual — submit both if billing under a group NPI.' },
  { name:'BCBS Oregon (Regence)', payerId:'00550', type:'Commercial', phone:'1-800-452-7278', portal:'https://www.regence.com/providers', timeline:'45–60 days', color:'#00539F',
    notes:'OHA/Medicaid participation often recommended first for behavioral health. Contact Provider Relations for behavioral health contracts.',
    guidelines:['Complete CAQH profile','Submit Regence provider application (paper or portal)','Include state license copy','Include malpractice insurance certificate','Include W-9 form','NPI Type 1 required','CV/Resume required'],
    warn:'For behavioral health: OHA enrollment is recommended before applying to Regence.' },
  { name:'OHP / Medicaid (OHA)', payerId:'OROHP', type:'Medicaid', phone:'1-800-273-0557', portal:'https://www.oregon.gov/oha/hsd/ohp', timeline:'45–60 days', color:'#2d6a4f',
    notes:'Oregon Health Plan enrollment through DMAP. Supervising provider must also be enrolled if applicable.',
    guidelines:['Complete DMAP enrollment form (via OHA portal)','Provide Oregon license copy','Include malpractice insurance certificate','W-9 form required','NPI Type 1 required','Background check authorization','Medicaid Provider Agreement','Supervising provider must be enrolled separately'],
    warn:'Associates/interns under supervision: the supervising clinician must be enrolled in OHP first.' },
  { name:'Cigna / Evernorth', payerId:'62308', type:'Commercial', phone:'1-800-735-1459', portal:'https://cignaforhcp.cigna.com', timeline:'60–90 days', color:'#004B87',
    notes:'Submit via Cigna for Health Care Professionals portal. Mental health providers may route through Evernorth. CAQH must be complete.',
    guidelines:['Complete CAQH profile','Submit via Cigna for Health Care Professionals portal','NPI Type 1 and Type 2','Current CV/Resume','State license copy','Malpractice insurance certificate','W-9 form','DEA if prescribing'],
    warn:'Mental health and substance use providers: contact Evernorth Behavioral Health separately for network participation.' },
  { name:'UnitedHealthcare / Optum', payerId:'87726', type:'Commercial', phone:'1-877-842-3210', portal:'https://www.providerexpress.com', timeline:'60–120 days', color:'#006699',
    notes:'Mandatory revalidation every 3 years — failure results in termination. Behavioral health credentialing through Optum/Provider Express.',
    guidelines:['Complete CAQH profile','Submit via Provider Express (providerexpress.com)','NPI Type 1 and Type 2','Current CV/Resume','State license copy','Malpractice insurance certificate','W-9 form','Revalidation form if revalidating'],
    warn:'⚠ Revalidation every 3 years is MANDATORY. Missing the revalidation window results in automatic termination from the network.' },
  { name:'Providence Health Plan', payerId:'93029', type:'Commercial', phone:'1-800-891-2803', portal:'https://www.providence.org/providers', timeline:'45–75 days', color:'#0061A1',
    notes:'Oregon-specific payer with strong Portland metro presence. Contact Provider Relations directly for application packets.',
    guidelines:['Submit Providence provider application','Include state license copy','Include malpractice insurance certificate','W-9 form','NPI Type 1','CV/Resume','CAQH profile','Contact Provider Relations for application packet'],
    warn:null },
  { name:'Moda Health', payerId:'MODA1', type:'Commercial', phone:'1-855-718-1768', portal:'https://www.modahealth.com/medical/provider', timeline:'30–60 days', color:'#C41E3A',
    notes:'Oregon-based regional payer. Behavioral health credentialing handled directly by Moda. Often faster than national payers.',
    guidelines:['Submit Moda provider application (portal or paper)','State license copy','Malpractice insurance certificate','W-9 form','NPI Type 1','CAQH profile','CV/Resume'],
    warn:null },
  { name:'PacificSource Health Plans', payerId:'93015', type:'Commercial', phone:'1-888-977-9299', portal:'https://www.pacificsource.com/providers', timeline:'30–60 days', color:'#0033A0',
    notes:'Northwest regional payer covering Oregon, Idaho, and Montana. Direct application process.',
    guidelines:['Submit PacificSource provider application','State license copy','Malpractice insurance certificate','W-9 form','NPI Type 1','CV/Resume','Contact Provider Relations for current application form'],
    warn:null },
  { name:'Kaiser Permanente', payerId:'94456', type:'Commercial', phone:'1-800-813-2000', portal:'https://providers.kaiserpermanente.org', timeline:'90–120 days', color:'#003781',
    notes:'INVITATION ONLY — closed panel in most markets. Contact Network Relations to inquire about open panels.',
    guidelines:['Receive invitation from Kaiser Network Relations','Complete Kaiser credentialing application','CAQH profile required','Board certification may be required','State license copy','Malpractice insurance certificate','W-9 form','NPI Type 1'],
    warn:'⚠ Kaiser is an invitation-only, closed panel network. Do not apply without first confirming an open panel with Network Relations.' },
  { name:'Humana', payerId:'61101', type:'Commercial', phone:'1-800-626-2741', portal:'https://www.humana.com/provider', timeline:'60–90 days', color:'#006F44',
    notes:'Submit via Availity or Humana Provider Portal. Behavioral health may route through Humana Behavioral Health.',
    guidelines:['Complete CAQH profile','Submit via Availity or Humana provider portal','NPI Type 1 and Type 2','State license copy','Malpractice insurance certificate','W-9 form','CV/Resume'],
    warn:'Behavioral health providers: confirm whether enrollment routes through Humana Behavioral Health or main credentialing.' },
  { name:'Anthem / Elevance Health', payerId:'00530', type:'Commercial', phone:'1-800-676-2583', portal:'https://www.anthem.com/provider', timeline:'60–90 days', color:'#0079C1',
    notes:'Operates as Elevance Health nationally. Behavioral health credentialing through Beacon Health Options in some markets.',
    guidelines:['Complete CAQH profile','Submit via Availity or Anthem provider portal','NPI Type 1 and Type 2','State license copy','Malpractice insurance certificate','W-9 form','CV/Resume'],
    warn:'Behavioral health providers: Beacon Health Options manages behavioral health credentialing in some Anthem markets — verify routing.' },
  { name:'Molina Healthcare', payerId:'MOLIN', type:'Medicaid', phone:'1-888-665-4621', portal:'https://www.molinahealthcare.com/providers', timeline:'45–75 days', color:'#007DC3',
    notes:'Medicaid-focused MCO. OHP enrollment often required first. Background check required.',
    guidelines:['Enroll in OHP/Medicaid first (recommended)','Complete Molina provider application','W-9 form','State license copy','Malpractice insurance certificate','NPI Type 1','Medicaid Provider Agreement','Background check authorization'],
    warn:'OHP/DMAP enrollment is strongly recommended before applying to Molina, as Molina serves the OHP population.' },
  { name:'Medicare (Novitas/CGS)', payerId:'MDCR1', type:'Medicare', phone:'1-855-252-8782', portal:'https://pecos.cms.hhs.gov', timeline:'60–90 days', color:'#1B3A6B',
    notes:'Medicare enrollment through PECOS. CMS-855 application required. Opt-out available for some provider types.',
    guidelines:['Enroll via PECOS (pecos.cms.hhs.gov)','Complete CMS-855 application form','State license copy','Malpractice insurance certificate','NPI Type 1','W-9 form','Background check authorization','Assign/reassign benefits if billing under group'],
    warn:'Providers who do not accept Medicare must formally opt-out via CMS. Failing to enroll or opt-out may result in claims issues.' },
  { name:'Medicare Advantage (various)', payerId:'', type:'Medicare Advantage', phone:'', portal:'', timeline:'60–90 days', color:'#374151',
    notes:'Each Medicare Advantage plan credentials separately. Common MA plans in Oregon: UHC MA, Aetna MA, Humana MA, Kaiser MA.',
    guidelines:['Enroll in Medicare (Part B) first via PECOS','Apply to each MA plan separately','CAQH profile generally required','State license copy','Malpractice insurance certificate','NPI Type 1','W-9 form'],
    warn:'Medicare Advantage credentialing is separate from traditional Medicare — you must apply to each MA plan individually.' },
  { name:'TRICARE (West – Health Net)', payerId:'TRIC1', type:'Commercial', phone:'1-844-866-9378', portal:'https://www.tricare.mil/providers', timeline:'60–90 days', color:'#003087',
    notes:'Oregon is in the TRICARE West region, managed by Health Net Federal Services.',
    guidelines:['Submit TRICARE application via Health Net Federal Services','State license copy','Malpractice insurance certificate','NPI Type 1','W-9 form','CV/Resume','Board certification preferred'],
    warn:'Oregon is TRICARE West — contact Health Net Federal Services, not Humana Military (which manages TRICARE East).' },
  { name:'Oscar Health', payerId:'OSCAR', type:'Commercial', phone:'1-855-672-2788', portal:'https://www.hioscar.com/providers', timeline:'45–75 days', color:'#EF4923',
    notes:'Growing Oregon presence. Technology-forward submission process. Check panel availability before applying.',
    guidelines:['Submit application via Oscar provider portal','State license copy','Malpractice insurance certificate','NPI Type 1','CAQH profile','W-9 form','CV/Resume'],
    warn:'Confirm open panels in your area before applying — Oscar is still expanding its Oregon network.' },
  { name:'First Choice Health', payerId:'FCHP1', type:'Commercial', phone:'1-800-231-6935', portal:'https://www.fchn.com/providers', timeline:'30–60 days', color:'#008080',
    notes:'Pacific Northwest regional network. Often used as a leased network by other payers in the region.',
    guidelines:['Submit First Choice Health application','State license copy','Malpractice insurance certificate','NPI Type 1','W-9 form','CV/Resume'],
    warn:null },
  { name:'Multiplan / PHCS', payerId:'MPLAN', type:'Commercial', phone:'1-800-950-7040', portal:'https://www.multiplan.com/providers', timeline:'30–45 days', color:'#6B21A8',
    notes:'Leased network accessed by many self-funded employer plans. Joining Multiplan expands reach significantly.',
    guidelines:['Submit Multiplan network application','State license copy','Malpractice insurance certificate','NPI Type 1','W-9 form','CV/Resume','Current CAQH profile'],
    warn:null },
]

function PayerModal({ payerForm, setPayerForm, editingId, handleSavePayer, onClose, saving }) {
  const [step, setStep] = useState(editingId.payer ? 2 : 1)
  const [pickerSearch, setPickerSearch] = useState('')
  const [selectedCatalog, setSelectedCatalog] = useState(null)
  const f = k => payerForm[k] ?? ''
  const set = (k, v) => setPayerForm(prev => ({ ...prev, [k]: v }))

  function pickPayer(catalog) {
    setSelectedCatalog(catalog)
    setPayerForm({
      name: catalog.name,
      payerId: catalog.payerId,
      type: catalog.type,
      phone: catalog.phone,
      portal: catalog.portal,
      timeline: catalog.timeline,
      notes: catalog.notes,
      email: '',
    })
    setStep(2)
  }

  function pickCustom() {
    setSelectedCatalog(null)
    setPayerForm({ type:'Commercial', timeline:'60–90 days' })
    setStep(2)
  }

  const filteredCatalog = PAYER_CATALOG.filter(p =>
    p.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    p.type.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  const guidelines = selectedCatalog || (editingId.payer ? PAYER_CATALOG.find(p => p.name === payerForm.name) : null)

  return (
    <Modal title={editingId.payer ? 'Edit Payer' : (step === 1 ? 'Add Payer — Choose Payer' : 'Add Payer — Details')} onClose={onClose}
      lg={step === 1}
      footer={
        step === 1
          ? <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          : <>
              {!editingId.payer && <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>}
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePayer} disabled={saving}>{saving ? 'Saving…' : 'Save Payer'}</button>
            </>
      }>

      {step === 1 && (
        <>
          {!editingId.payer && (
            <div className="modal-step-indicator" style={{ marginBottom:16 }}>
              <div className="msi-step active"><div className="msi-num">1</div><span>Choose Payer</span></div>
              <div className="msi-line" />
              <div className="msi-step"><div className="msi-num">2</div><span>Review & Save</span></div>
            </div>
          )}
          <div style={{ marginBottom:12 }}>
            <div className="search-box" style={{ marginBottom:12 }}>
              <span className="si">🔍</span>
              <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                placeholder="Search payers…" style={{ width:'100%' }} autoFocus />
            </div>
          </div>
          <div className="payer-picker-grid">
            {filteredCatalog.map(p => (
              <button key={p.name} className="payer-pick-btn" onClick={() => pickPayer(p)}>
                <div className="payer-pick-dot" style={{ background: p.color }} />
                <div>
                  <div className="payer-pick-name">{p.name}</div>
                  <div className="payer-pick-type">{p.type} · {p.timeline}</div>
                </div>
              </button>
            ))}
            <button className="payer-pick-custom" onClick={pickCustom}>
              <div style={{ fontSize:18, opacity:.5 }}>＋</div>
              <div>
                <div className="payer-pick-name" style={{ color:'var(--ink-3)' }}>Custom / Unlisted</div>
                <div className="payer-pick-type">Enter details manually</div>
              </div>
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {!editingId.payer && (
            <div className="modal-step-indicator">
              <div className="msi-step done"><div className="msi-num">✓</div><span>Choose Payer</span></div>
              <div className="msi-line done" />
              <div className="msi-step active"><div className="msi-num">2</div><span>Review & Save</span></div>
            </div>
          )}

          {guidelines && (
            <div className="guideline-box">
              <div className="guideline-box-title">📋 Credentialing Guidelines — {guidelines.name}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 16px', marginBottom: guidelines.warn ? 8 : 0 }}>
                {guidelines.guidelines.map((g, i) => (
                  <div key={i} className="guideline-item">{g}</div>
                ))}
              </div>
              {guidelines.warn && <div className="guideline-warn">⚡ {guidelines.warn}</div>}
            </div>
          )}

          <div className="form-grid">
            <div className="fg full"><label>Payer Name *</label>
              <input type="text" value={f('name')} onChange={e => set('name', e.target.value)} placeholder="Payer name" />
            </div>
            <div className="fg"><label>Payer ID / EDI ID</label>
              <input type="text" value={f('payerId')} onChange={e => set('payerId', e.target.value)} placeholder="60054" />
            </div>
            <div className="fg"><label>Type</label>
              <select value={f('type')} onChange={e => set('type', e.target.value)}>
                <option>Commercial</option><option>Medicaid</option><option>Medicare</option>
                <option>Medicare Advantage</option><option>EAP</option><option>Other</option>
              </select>
            </div>
            <div className="fg"><label>Provider Relations Phone</label>
              <input type="tel" value={f('phone')} onChange={e => set('phone', e.target.value)} />
            </div>
            <div className="fg"><label>Credentialing Email</label>
              <input type="email" value={f('email')} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="fg"><label>Provider Portal URL</label>
              <input type="text" value={f('portal')} onChange={e => set('portal', e.target.value)} placeholder="https://…" />
            </div>
            <div className="fg"><label>Avg. Credentialing Timeline</label>
              <select value={f('timeline')} onChange={e => set('timeline', e.target.value)}>
                <option>30–45 days</option><option>45–60 days</option><option>60–90 days</option>
                <option>90–120 days</option><option>120+ days</option>
              </select>
            </div>
            <div className="fg full"><label>Notes</label>
              <textarea value={f('notes')} onChange={e => set('notes', e.target.value)} placeholder="Submission requirements, contacts, special instructions…" />
            </div>
          </div>
        </>
      )}
    </Modal>
  )
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

function ProvDetailModal({ prov, db, tab, setTab, onClose, editProvider, openEnrollModal, toast }) {
  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-lg" style={{ maxWidth: 860, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h3>Provider Command Center</h3>
            <div className="mh-sub">{prov.spec} · {prov.status}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <ProviderCommandCenter
            prov={prov}
            db={db}
            onClose={onClose}
            onEdit={(id) => { onClose(); editProvider(id) }}
            openEnrollModal={openEnrollModal}
            toast={toast}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════════════════


// ─── KANBAN PIPELINE ───────────────────────────────────────────────────────────
function KanbanPipeline({ db, openEnrollModal }) {
  const [filterProv, setFilterProv] = useState('')
  const filtered = db.enrollments.filter(e => !filterProv || e.provId === filterProv)
  return (
    <div className="page">
      <div className="toolbar" style={{ marginBottom:18 }}>
        <select className="filter-select" value={filterProv} onChange={e=>setFilterProv(e.target.value)}>
          <option value="">All Providers</option>
          {db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
        </select>
        <div className="toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={()=>openEnrollModal()}>＋ New Enrollment</button>
        </div>
      </div>
      <EnrollmentKanban
        enrollments={db.enrollments}
        providers={db.providers}
        payers={db.payers}
        onStageChange={async (enrollmentId, newStage) => {
          const enr = db.enrollments.find(e => e.id === enrollmentId)
          if (!enr) return
          const updated = { ...enr, stage: newStage }
          const prov  = db.providers.find(p => p.id === enr.provId)
          const payer = db.payers.find(p => p.id === enr.payId)
          const saved = await upsertEnrollment(updated, prov ? `${prov.fname} ${prov.lname}` : '', payer?.name || '')
          setDb(prev => ({ ...prev, enrollments: prev.enrollments.map(e => e.id === saved.id ? saved : e) }))
          toast(`Moved to ${newStage}`, 'success')
        }}
        onOpen={(enr) => openEnrollModal(enr.id)}
      />
    </div>
  )
}

// ─── MISSING DOCUMENTS DETECTION ───────────────────────────────────────────────
const REQUIRED_DOCS = [
  { key: 'license', field: 'licenseExp', label: 'State License', severity: 'error' },
  { key: 'malpractice', field: 'malExp', label: 'Malpractice Insurance', severity: 'error' },
  { key: 'w9', field: null, label: 'W-9 Form', checkFn: (p, docs) => docs.some(d => d.provId === p.id && d.type === 'W-9'), severity: 'error' },
  { key: 'caqh', field: 'caqh', label: 'CAQH Number on File', checkFn: (p) => !!p.caqh, severity: 'warn' },
  { key: 'caqhAttest', field: 'caqhDue', label: 'CAQH Attestation Due', severity: 'warn' },
  { key: 'dea', field: null, label: 'DEA Certificate', checkFn: (p) => !p.dea || !!p.deaExp, severity: 'warn', skipIf: (p) => !p.dea },
  { key: 'npi', field: null, label: 'NPI Number', checkFn: (p) => !!p.npi, severity: 'error' },
  { key: 'recred', field: 'recred', label: 'Recredentialing Date Set', severity: 'warn' },
  { key: 'supAgreement', field: null, label: 'Supervision Agreement', checkFn: (p, docs) => !p.supervisor || docs.some(d => d.provId === p.id && d.type === 'Supervision Agreement'), severity: 'warn', skipIf: (p) => !p.supervisor },
]

function MissingDocuments({ db }) {
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterProv, setFilterProv] = useState('')

  const issues = []
  db.providers.filter(p => p.status === 'Active').forEach(prov => {
    REQUIRED_DOCS.forEach(req => {
      if (req.skipIf && req.skipIf(prov)) return
      let missing = false
      if (req.checkFn) {
        missing = !req.checkFn(prov, db.documents)
      } else if (req.field) {
        const val = prov[req.field]
        if (!val) { missing = true }
        else {
          const days = daysUntil(val)
          if (days !== null && days < 0) missing = true
        }
      }
      if (missing) issues.push({ prov, label: req.label, severity: req.severity, key: req.key })
    })
    // Also flag expired documents from the documents table
    db.documents.filter(d => d.provId === prov.id).forEach(doc => {
      const days = daysUntil(doc.exp)
      if (days !== null && days < 0) {
        issues.push({ prov, label: `${doc.type} EXPIRED`, severity: 'error', key: `doc-${doc.id}`, detail: `Expired ${Math.abs(days)} days ago` })
      } else if (days !== null && days <= 30) {
        issues.push({ prov, label: `${doc.type} expiring soon`, severity: 'warn', key: `doc-exp-${doc.id}`, detail: `${days} days remaining` })
      }
    })
  })

  const filtered = issues.filter(i =>
    (!filterSeverity || i.severity === filterSeverity) &&
    (!filterProv || i.prov.id === filterProv)
  )
  const errors = filtered.filter(i => i.severity === 'error')
  const warns = filtered.filter(i => i.severity === 'warn')

  return (
    <div className="page">
      <div className="toolbar" style={{ marginBottom:18 }}>
        <select className="filter-select" value={filterSeverity} onChange={e=>setFilterSeverity(e.target.value)}>
          <option value="">All Issues</option>
          <option value="error">Critical Only</option>
          <option value="warn">Warnings Only</option>
        </select>
        <select className="filter-select" value={filterProv} onChange={e=>setFilterProv(e.target.value)}>
          <option value="">All Providers</option>
          {db.providers.filter(p=>p.status==='Active').map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
        </select>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {errors.length > 0 && <span className="badge b-red">⚠ {errors.length} Critical</span>}
          {warns.length > 0 && <span className="badge b-amber">! {warns.length} Warnings</span>}
          {filtered.length === 0 && <span className="badge b-green">✅ All Clear</span>}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="ei">✅</div><h4>No issues found</h4><p>All required documents are on file and current.</p></div>
      ) : (
        <>
          {errors.length > 0 && (
            <div className="mb-20">
              <div className="text-xs font-500" style={{ letterSpacing:'.6px', textTransform:'uppercase', color:'var(--red)', marginBottom:10 }}>🔴 Critical — Missing or Expired ({errors.length})</div>
              {errors.map((issue, i) => (
                <div key={i} className="missing-doc-row">
                  <div className="missing-doc-icon">❌</div>
                  <div className="missing-doc-body">
                    <div className="missing-doc-title">{issue.prov.fname} {issue.prov.lname}{issue.prov.cred ? `, ${issue.prov.cred}` : ''}</div>
                    <div className="missing-doc-sub">{issue.label}{issue.detail ? ` · ${issue.detail}` : ''}</div>
                  </div>
                  <div className="missing-doc-badge"><span className="badge b-red">Action Required</span></div>
                </div>
              ))}
            </div>
          )}
          {warns.length > 0 && (
            <div>
              <div className="text-xs font-500" style={{ letterSpacing:'.6px', textTransform:'uppercase', color:'var(--amber)', marginBottom:10 }}>🟡 Warnings — Review Recommended ({warns.length})</div>
              {warns.map((issue, i) => (
                <div key={i} className="missing-doc-row warn">
                  <div className="missing-doc-icon">⚠️</div>
                  <div className="missing-doc-body">
                    <div className="missing-doc-title">{issue.prov.fname} {issue.prov.lname}{issue.prov.cred ? `, ${issue.prov.cred}` : ''}</div>
                    <div className="missing-doc-sub">{issue.label}{issue.detail ? ` · ${issue.detail}` : ''}</div>
                  </div>
                  <div className="missing-doc-badge"><span className="badge b-amber">Review</span></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── PAYER REQUIREMENTS ─────────────────────────────────────────────────────────
function PayerRequirements({ db }) {
  const [search, setSearch] = useState('')
  const [fState, setFState] = useState('')
  const [fType, setFType] = useState('')
  const [expanded, setExpanded] = useState({})
  const toggle = name => setExpanded(e => ({ ...e, [name]: !e[name] }))

  const US_STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
    ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','DC'],['FL','Florida'],
    ['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],
    ['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],
    ['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
    ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],
    ['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],
    ['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],
    ['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
    ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ]

  const TYPE_BADGE = {
    'National': 'b-blue', 'Regional': 'b-teal', 'Medicaid': 'b-green',
    'Medicare': 'b-purple', 'Military': 'b-gray', 'Marketplace': 'b-amber',
  }

  const allPayers = Object.keys(PAYER_REQUIREMENTS)

  const filtered = allPayers.filter(name => {
    const req = PAYER_REQUIREMENTS[name]
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || (req.notes||'').toLowerCase().includes(search.toLowerCase())
    const matchState = !fState || req.states === 'ALL' || (Array.isArray(req.states) && req.states.includes(fState))
    const matchType = !fType || req.type === fType
    return matchSearch && matchState && matchType
  })

  const nationalCount = filtered.filter(n => PAYER_REQUIREMENTS[n].states === 'ALL').length
  const stateCount = filtered.filter(n => PAYER_REQUIREMENTS[n].states !== 'ALL').length

  return (
    <div className="page">
      {/* Header info banner */}
      <div style={{background:'var(--primary-l)',border:'1px solid var(--primary-ll)',borderRadius:'var(--r-lg)',padding:'12px 16px',marginBottom:16,fontSize:13,color:'var(--primary)',display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:18}}>🗂️</span>
        <div>
          <strong>National Payer Library</strong> — {Object.keys(PAYER_REQUIREMENTS).length} payers across all 50 US states + DC.
          Filter by state to see which payers operate in that market.
        </div>
        <span className="badge b-blue" style={{marginLeft:'auto',flexShrink:0}}>{filtered.length} shown</span>
      </div>

      <div className="toolbar" style={{ marginBottom:18, flexWrap:'wrap', gap:8 }}>
        <div className="search-box">
          <span className="si">🔍</span>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search payers, notes…" style={{width:220}} />
        </div>

        {/* State filter */}
        <select className="filter-select" value={fState} onChange={e=>setFState(e.target.value)} style={{minWidth:170}}>
          <option value="">🌎 All States</option>
          {US_STATES.map(([abbr, name]) => (
            <option key={abbr} value={abbr}>{abbr} — {name}</option>
          ))}
        </select>

        {/* Type filter */}
        <select className="filter-select" value={fType} onChange={e=>setFType(e.target.value)}>
          <option value="">All Types</option>
          <option value="National">National</option>
          <option value="Regional">Regional</option>
          <option value="Medicaid">Medicaid</option>
          <option value="Medicare">Medicare</option>
          <option value="Military">Military</option>
          <option value="Marketplace">Marketplace</option>
        </select>

        {(fState || fType || search) && (
          <button className="btn btn-ghost btn-sm" onClick={()=>{setFState('');setFType('');setSearch('')}}>✕ Clear filters</button>
        )}

        <div style={{marginLeft:'auto',display:'flex',gap:10,fontSize:12,color:'var(--ink-4)',alignItems:'center'}}>
          {fState && <span className="badge b-blue">{nationalCount} national + {stateCount} state-specific</span>}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="ei">🔍</div>
          <h4>No payers found</h4>
          <p>Try adjusting your filters or clearing the state/type selection.</p>
        </div>
      )}

      <div className="payer-req-grid">
        {filtered.map(name => {
          const req = PAYER_REQUIREMENTS[name]
          const isExp = expanded[name]
          const stateList = req.states === 'ALL' ? null : req.states
          return (
            <div key={name} className={`payer-req-card ${isExp ? 'expanded' : ''}`}>
              <div className="payer-req-header">
                <div className="payer-req-dot" style={{ background: req.color }} />
                <div className="payer-req-name">{name}</div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                  <span className={`badge ${TYPE_BADGE[req.type]||'b-gray'}`} style={{ fontSize:'10px' }}>{req.type}</span>
                  <span className="badge b-blue" style={{ fontSize:'10px' }}>{req.timeline}</span>
                </div>
              </div>
              <div className="payer-req-body">
                {/* States served */}
                <div style={{marginBottom:8}}>
                  {req.states === 'ALL'
                    ? <span style={{fontSize:11,color:'var(--ink-3)',background:'var(--surface-2)',padding:'2px 8px',borderRadius:20,border:'1px solid var(--border)'}}>🌎 Nationwide</span>
                    : <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                        {stateList.slice(0,12).map(s => (
                          <span key={s} style={{
                            fontSize:10,fontWeight:600,padding:'1px 5px',borderRadius:4,
                            background: fState===s ? 'var(--primary)' : 'var(--surface-2)',
                            color: fState===s ? 'white' : 'var(--ink-3)',
                            border:'1px solid var(--border)',cursor:'pointer'
                          }} onClick={()=>setFState(s===fState?'':s)}>{s}</span>
                        ))}
                        {stateList.length > 12 && <span style={{fontSize:10,color:'var(--ink-4)',padding:'1px 4px'}}>+{stateList.length-12} more</span>}
                      </div>
                  }
                </div>

                <div className="payer-req-meta">
                  <span className="payer-req-chip">🔄 {req.revalidation}</span>
                  {req.portalUrl && <a href={req.portalUrl} target="_blank" rel="noreferrer" className="payer-req-chip" style={{ color:'var(--primary)', textDecoration:'none' }}>🔗 Portal ↗</a>}
                </div>
                {req.specialNotes.map((n, i) => (
                  <div key={i} className="payer-req-special">⚡ {n}</div>
                ))}
                <div className="payer-req-section" style={{ marginTop:10 }}>
                  <div className="payer-req-section-label">Submission Method</div>
                  <div style={{ fontSize:'12.5px', color:'var(--ink-2)' }}>{req.submission}</div>
                </div>
                <div className="payer-req-expanded">
                  <div className="payer-req-section">
                    <div className="payer-req-section-label">Required Documents</div>
                    {req.requirements.map((r, i) => (
                      <div key={i} className="payer-req-item">{r}</div>
                    ))}
                  </div>
                  <div className="payer-req-section">
                    <div className="payer-req-section-label">Notes</div>
                    <div className="payer-req-note">{req.notes}</div>
                  </div>
                </div>
                <button className="payer-req-toggle" onClick={() => toggle(name)}>
                  {isExp ? '▲ Show less' : '▼ Show requirements & notes'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
    else if (item.type === 'payer') { setPage('payer-hub') }
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
  // PT is exclusively for mental health providers
  const listed = mentalHealthProvs.filter(p => p.ptStatus === 'Active')
  const inactive = mentalHealthProvs.filter(p => p.ptStatus === 'Inactive')
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
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'var(--purple-l)',border:'1px solid var(--purple-b)',borderRadius:'var(--r-lg)',marginBottom:18}}>
        <span style={{fontSize:20}}>🧠</span>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:'#5b21b6'}}>Mental Health Providers — Marketing Tool</div>
          <div style={{fontSize:12,color:'var(--ink-3)',marginTop:2}}>Psychology Today directory management is exclusive to Mental Health specialty providers. Non-mental health providers are not tracked here.</div>
        </div>
        <span className="badge b-purple" style={{flexShrink:0}}>Mental Health Only</span>
      </div>
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
              <div className="kpi-sub">of {mentalHealthProvs.length} mental health providers</div>
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
                <a href="https://www.psychologytoday.com/us/therapists/positive-inner-self-llc-beaverton-or/751449" target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">Search PT Directory ↗</a>
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
                {mentalHealthProvs.map(p => (
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
