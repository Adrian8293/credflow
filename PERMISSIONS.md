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
| Add an audit log entry | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit or delete an audit log entry | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Delete a provider (soft delete, with its enrollments and documents) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Save a payer's roster column map | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Use the provider portal | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Send a document through the portal | ✗ | ✗ | ✗ | ✗ | any provider in the org | own |
| Confirm directory details (gender, languages, new patients, telehealth) | ✗ | ✗ | ✗ | ✗ | ✗ | own |
| See the member list, change roles, remove members | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Create, change or remove an Owner | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

Always true, for every role: nobody can see or change another organization's data, a signed-out visitor can read
nothing, and the last owner of an organization cannot be removed or demoted.

## Not yet covered by the automated tests
- Files in the `documents` storage bucket (policies depend on how paths are named).
- The `settings` table, invitations, and the `/api/*` routes (they check the signed-in user in code).
- Two-factor enforcement (`mfa_ok()`), which needs real sign-in sessions.

Add a case to `supabase-rls-test.sql` whenever a table, policy or privileged function is added.
