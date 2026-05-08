import { requireAuth } from '../../lib/supabase-server'
import { enforceRateLimit } from '../../lib/api-middleware'

export default async function handler(req, res) {
  if (!enforceRateLimit(req, res, { max: 30, windowMs: 60_000, keyPrefix: 'npi:' })) return

  // Auth guard — prevent open proxy abuse
  const user = await requireAuth(req, res)
  if (!user) return

  const { number } = req.query;

  if (!number) {
    return res.status(400).json({ error: "Missing NPI number" });
  }

  try {
    const response = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(number)}&version=2.1`
    );

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Could not reach NPI registry" });
  }
}
