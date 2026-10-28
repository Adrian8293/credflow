# Lacentra permissions

Every row below is enforced by the database (row-level security and functions), not just by hiding buttons.
`supabase-rls-test.sql` (run it in the Supabase SQL editor) and `npm test` (the same script against your migrations,
run in CI) test each role on providers, payers, groups, the audit log, roster maps, the portal functions and member
administration. The Owner/Admin columns for the rest, and the "always true" lines, follow from the same policies and
function code rather than a separate test. ✓ = allowed, ✗ = refused, "own" = only their own record.

| What | Owner | Admin | Credentialer | Viewer | Clinic staff | Provider |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Read providers, enrollments, payers, groups, tasks, audit log | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Add / edit / delete those records | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Assign a task to a colleague (owner, admin or credentialer only; the database refuses anyone else, or anyone from another organization) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Assign a provider to a colleague (same rule as tasks; enforced by the database) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| See the list of people tasks can be assigned to | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Add an audit log entry | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit or delete an audit log entry | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Delete a provider (soft delete, with its enrollments and documents) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Save a payer's roster column map | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Read exclusion screening checks | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Record an exclusion check | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Delete a mistaken exclusion check (never edit) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Use the provider portal | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Send a document through the portal | ✗ | ✗ | ✗ | ✗ | any provider in the org | own |
| Confirm directory details (gender, languages, new patients, telehealth) | ✗ | ✗ | ✗ | ✗ | ✗ | own |
| See the member list, change roles, remove members | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Create, change or remove an Owner | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

Always true, for every role: nobody can see or change another organization's data, a signed-out visitor can read
nothing, and the last owner of an organization cannot be removed or demoted.

## Also covered by the automated tests (added in Stage 64)
- Files in the `documents` and `provider-photos` storage buckets: own organization reads, other organizations and
  provider accounts see nothing, the browser cannot upload to `documents` (uploads go through the server), only staff
  delete, and the photo bucket is private.
- The `settings` table, document requests, invitations (owner/admin only) and extra-state licenses.
- One NPI per organization (a second organization may still hold the same NPI).
- Two-factor enforcement: an enrolled user's password-only session sees nothing, their two-factor session does.
- `tests/apiRoutes.test.mjs` fails if a public API route has no check of its own, or if `proxy.js` is renamed.

## Not covered by the automated tests
- What your live Supabase project actually contains (the tests run against the migration files, not your database).
- The behaviour of each `/api/*` route beyond the guard check above (they check the signed-in user in code).

Add a case to `supabase-rls-test.sql` whenever a table, policy or privileged function is added.
