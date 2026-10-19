// GET /api/features — which optional features are switched on in this deployment (booleans only, no secrets).
// Requires sign-in like every other /api route (proxy.js). The UI uses it to describe things truthfully.
import { features, } from '../../lib/features'
import { storesPersonal } from '../../lib/opcaMinimize'

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  res.setHeader('Cache-Control', 'private, max-age=300')
  return res.status(200).json({ ai: features.ai(), emailDigest: features.emailDigest(), opcaStoresPersonal: storesPersonal() })
}
