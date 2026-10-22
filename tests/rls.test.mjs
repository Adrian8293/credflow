// Runs every migration against a real Postgres engine (PGlite, in-process, free) and then the permission test script
// supabase-rls-test.sql, so a change to a migration or policy that opens a hole fails CI before it reaches Supabase.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('permissions and tenant isolation hold against the real schema', { timeout: 120000 }, async () => {
  const db = new PGlite({ extensions: { uuid_ossp } })
  await db.exec(fs.readFileSync(path.join(root, 'tests/rls/stub.sql'), 'utf8'))   // minimal stand-in for Supabase's auth/storage
  const files = ['supabase-schema.sql', ...fs.readdirSync(root).filter(f => /^supabase-migration-0\d\d.*\.sql$/.test(f)).sort()]
  for (const f of files) await db.exec(fs.readFileSync(path.join(root, f), 'utf8'))
  let report = ''
  try { await db.exec(fs.readFileSync(path.join(root, 'supabase-rls-test.sql'), 'utf8')) } catch (e) { report = e.message }
  assert.match(report, /LACENTRA RLS TEST REPORT/, 'the script should end with its report')
  assert.match(report, /\b0\s+FAILED/, report)
})
