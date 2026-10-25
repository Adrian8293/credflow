/**
 * AvatarImg — a provider photo from the private `provider-photos` bucket.
 * Asks Supabase for a one-hour link (cached while the page is open). If that fails — for example before
 * migration 027 is run — it falls back to the stored address, so photos keep working either way.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { photoStoragePath, PHOTO_BUCKET } from '../../lib/photoPath'

const cache = new Map()   // src -> { url, at }
const TTL_MS = 50 * 60 * 1000

async function resolveUrl(src) {
  const hit = cache.get(src)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url
  const path = photoStoragePath(src)
  if (!path) return src
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return /^https?:/i.test(src) ? src : null
  cache.set(src, { url: data.signedUrl, at: Date.now() })
  return data.signedUrl
}

export function AvatarImg({ src, alt = '', ...rest }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (src) resolveUrl(src).then(u => { if (live) setUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [src])
  if (!url) return null
  return <img src={url} alt={alt} {...rest} />
}
