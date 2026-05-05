// ─── RCM CONSTANTS ──────────────────────────────────────────────────────────

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


export { DENIAL_CODES, AGING_BUCKETS, getAgingBucket, fmtMoney }
