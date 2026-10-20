/**
 * Offline-tolerant saves.
 *
 * When a save fails because the connection dropped (or the device is offline), the change is kept on this
 * device and sent automatically when the connection is back. The screen behaves as if the save worked.
 *
 * Rules that keep this safe:
 *  - Only network failures are queued. Real server answers (permission denied, invalid data) are shown at once.
 *  - New records get their ID on the device first, so a retry can never create a duplicate.
 *  - Changes are sent in the order they were made. While anything is waiting, new saves line up behind it.
 *  - Deleting records is never queued; it needs a live connection.
 *  - A change the server rejects when it is finally sent stays in a "needs attention" list (it is never lost silently).
 *  - The queue belongs to the signed-in user (stored per user id) and only that user's session replays it.
 * Trade-off: if someone else edits the same record before the queue is sent, the later arrival wins.
 */
import { supabase } from './supabase'

const REG = {}                       // op name -> raw function that talks to the server
const listeners = new Set()
let flushing = false
let timer = null
let cachedUid = null

const keyFor = (u) => `lc_queue_v1:${u}`
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

export const newId = () => {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID() } catch { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function isNetworkError(e) {
  if (!e) return false
  if (typeof TypeError !== 'undefined' && e instanceof TypeError) return true
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|econnreset/i.test(String(e.message || e))
}

async function uid() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    cachedUid = session?.user?.id || null
  } catch { /* keep the cached value */ }
  return cachedUid
}

function readQ(u) {
  if (!u) return []
  try { return JSON.parse(localStorage.getItem(keyFor(u)) || '[]') } catch { return [] }
}
function writeQ(u, items) {
  try {
    if (items.length) localStorage.setItem(keyFor(u), JSON.stringify(items)); else localStorage.removeItem(keyFor(u))
  } catch { /* storage full or unavailable */ }
  notify()
}

function notify() { listeners.forEach(l => { try { l(getQueueStatus()) } catch { /* ignore */ } }) }

export function getQueueStatus() {
  const items = cachedUid ? readQ(cachedUid) : []
  const failed = items.filter(i => i.error)
  return { pending: items.length - failed.length, failed: failed.length, failedItems: failed.map(i => ({ qid: i.qid, label: i.label, error: i.error, ts: i.ts })) }
}
export function subscribeQueue(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export function registerOp(name, fn) { REG[name] = fn }

export async function enqueueOp(name, args, label) {
  const u = await uid()
  if (!u) throw new Error('You are signed out. Please sign in again.')
  const items = readQ(u)
  items.push({ qid: newId(), fn: name, args, label: label || name, ts: Date.now() })
  writeQ(u, items)
  scheduleFlush(online() ? 1500 : 20000)
}

function scheduleFlush(ms) {
  if (typeof window === 'undefined') return
  clearTimeout(timer)
  timer = setTimeout(() => { flushQueue() }, ms)
}

/** Sends waiting changes, oldest first. Stops at the first connection failure; parks server-rejected ones. */
export async function flushQueue() {
  if (flushing || !online()) return
  const u = await uid()
  if (!u) return
  flushing = true
  try {
    for (const it of readQ(u).filter(i => !i.error)) {
      const fn = REG[it.fn]
      let outcome = 'done'
      let message = ''
      try {
        if (!fn) throw Object.assign(new Error('This kind of change is no longer supported.'), { code: 'unsupported' })
        await fn(...it.args)
      } catch (e) {
        if (isNetworkError(e)) { outcome = 'stop' }
        else if (e?.code === '23505') { outcome = 'done' }               // already applied earlier
        else { outcome = 'failed'; message = e?.message || 'The server did not accept this change.' }
      }
      if (outcome === 'stop') break
      const fresh = readQ(u)                                              // the queue may have grown meanwhile
      writeQ(u, outcome === 'done'
        ? fresh.filter(x => x.qid !== it.qid)
        : fresh.map(x => x.qid === it.qid ? { ...x, error: message } : x))
    }
  } finally {
    flushing = false
    const left = cachedUid ? readQ(cachedUid).filter(i => !i.error).length : 0
    if (left > 0) scheduleFlush(20000)
    notify()
  }
}

export async function retryFailed() {
  const u = await uid()
  if (!u) return
  writeQ(u, readQ(u).map(({ error, ...rest }) => rest))
  flushQueue()
}
export async function discardFailed() {
  const u = await uid()
  if (!u) return
  writeQ(u, readQ(u).filter(i => !i.error))
}

/** Call once after sign-in: loads the waiting changes and starts sending them. */
export async function initQueue() {
  await uid()
  notify()
  if (typeof window !== 'undefined' && !initQueue.bound) {
    initQueue.bound = true
    window.addEventListener('online', () => flushQueue())
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushQueue() })
  }
  flushQueue()
}

/**
 * Wraps a server write so it survives a dropped connection.
 *   prepare(args)   -> args with IDs filled in for new records (so a retry is harmless)
 *   optimistic(args)-> what to hand back to the screen when the change is queued
 *   label(args)     -> short text shown in the "needs attention" list
 */
export function queueable(name, rawFn, { prepare, optimistic, label } = {}) {
  registerOp(name, rawFn)
  return async function queued(...args) {
    const prepared = prepare ? prepare(args) : args
    const text = label ? label(prepared) : name
    const u = await uid()
    // Something is already waiting: line up behind it to keep the order.
    if (u && readQ(u).some(i => !i.error) || !online()) {
      await enqueueOp(name, prepared, text)
      return optimistic ? optimistic(prepared) : undefined
    }
    try {
      return await rawFn(...prepared)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      await enqueueOp(name, prepared, text)
      return optimistic ? optimistic(prepared) : undefined
    }
  }
}
