/**
 * compressImage — shrink phone photos of documents before they are uploaded.
 *
 * A phone photo is typically 3–8 MB; a readable copy of a license needs well under 1 MB. This keeps the
 * file legible (long side capped at 2200 px, JPEG quality 0.82) and cuts storage use by roughly 80–90%.
 *
 * Only JPEG / PNG / WebP images above ~400 KB are touched. PDFs, Word files and TIFFs are returned unchanged.
 * If anything goes wrong (old browser, unreadable image, result not smaller) the ORIGINAL file is returned,
 * so compression can never block an upload.
 */
const MAX_SIDE = 2200
const QUALITY = 0.82
const MIN_BYTES = 400 * 1024
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function compressImage(file) {
  try {
    if (!file || typeof document === 'undefined') return file
    if (!OK_TYPES.includes(file.type) || file.size < MIN_BYTES) return file

    const url = URL.createObjectURL(file)
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    }).finally(() => URL.revokeObjectURL(url))

    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'                 // PNGs with transparency would otherwise turn black as JPEG
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size * 0.9) return file   // not worth it

    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
