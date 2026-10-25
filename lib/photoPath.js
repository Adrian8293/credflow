/**
 * lib/photoPath.js — turns whatever is stored in providers.avatar_url into a storage path.
 * Old rows hold the full public web address of the photo; new rows hold just "providerId/avatar.jpg".
 * A trailing "#stamp" (added after an upload so the screen refetches) is ignored.
 */
export const PHOTO_BUCKET = 'provider-photos'

export function photoStoragePath(value) {
  if (!value) return null
  const v = String(value).split('#')[0].split('?')[0]
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/provider-photos\/(.+)$/)
  if (m) return decodeURIComponent(m[1])
  if (/^https?:\/\//i.test(v)) return null          // some other web address: leave it alone
  return v.replace(/^\/+/, '') || null
}
