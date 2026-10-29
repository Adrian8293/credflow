# Code review: stage74–78 drop-in

**Date:** 28 October 2026  
**Commit:** `3a85f9d9` (`stage74-78_dropin`)  
**Branch:** `main` (clean working tree; no uncommitted changes)  
**Scope:** Bugs, behavioral regressions, security, and missing tests in this commit only. No code was changed as part of this audit.

The drop-in adds a mandatory completion check (note + “anything still pending?”), application ownership (`enrollments.assignee_id`), inbox “Mine”, a production Content-Security-Policy, and a teal rebrand.

---

## Findings

Ordered by severity.

### High

#### 1. Saving a new task as Done drops the completion note after migration 033

**Location:** `hooks/useTaskActions.js` (approx. lines 28–32)

`handleSaveTask` runs the completion dialog, then only attaches `completionNote` if that field already exists on the form or the existing row:

```js
const completed = completion ? {
  notes: appendCompletionNote(taskForm.notes, completion.note, todayStr()),
  ...('completionNote' in taskForm || (before && 'completionNote' in before)
    ? { completionNote: completion.note }
    : {}),
} : {}
```

A **new** task from `openTaskModal` is `{ priority, status, cat, assigneeId }` — no `completionNote`. TaskModal still offers **Done**. After migration 033, `tasks_require_completion` rejects an `INSERT` of Done without a ≥5-character note. The user already filled the dialog; the save then fails with a check-constraint error.

`handleMarkDone` uses the same feature-detect (`sendNote: !!t && 'completionNote' in t`). That is safe for rows loaded after 033 (`completion_note` comes back even when null). It is not safe for create-as-Done.

Sibling tasks that already carry `completionNote` are not used as a feature-detect, unlike `db.staff` elsewhere.

**Fix direction:** If any loaded task (or the schema) has `completionNote`, always send `completionNote: completion.note` when completing — including new tasks.

---

#### 2. “Unassigned” on a new application is overwritten on save

**Location:** `hooks/useEnrollmentActions.js` (approx. lines 23–26)

```js
const ownerless = !editingEnrollmentId && db.staff && !enrollForm.assigneeId
const form = ownerless
  ? { ...enrollForm, assigneeId: db.providers.find(p => p.id === enrollForm.provId)?.assigneeId || '' }
  : enrollForm
```

`openEnrollModal` already defaults owner from the provider. If the user then picks **Unassigned**, `assigneeId` is `''`, `ownerless` is true, and save copies the provider’s owner again. You cannot create an unassigned application for an owned provider. The empty `<option value="">Unassigned</option>` in EnrollModal is misleading.

**Fix direction:** Apply the provider-owner default only when opening the modal (already done). Do not re-apply it on save when the user chose Unassigned.

---

### Medium

#### 3. Closing an application can skip the completion check

**Locations:** `hooks/useEnrollmentActions.js` (`handleBulkStage`, `handleSaveEnrollment`); `lib/db.js` (`bulkSetStage`); `features/enrollments/EnrollModal.jsx`

Single-row `handleStageChange` asks for a note and a pending follow-up before Active / Approved / Denied. Two other paths do not:

- **`handleBulkStage`** patches `{ stage }` only. No note, no follow-up task, no extra audit text.
- **EnrollModal save** can set stage to Approved / Active / Denied via the stage `<select>` and `handleSaveEnrollment`, which never calls `requestCompletion`.

Enrollment completion is **UI-only** (no database trigger, unlike tasks). Bulk move and modal save are working bypasses of the new “nothing is closed until you say what was done” rule.

---

#### 4. CAQH follow-up tasks drop the application owner

**Location:** `hooks/useEnrollmentActions.js` (`handleCaqhAuthorized`, approx. line 144)

Stage-change follow-ups copy `assigneeId` when present. CAQH authorization does not:

```js
await saveFollowUp(completion, {
  provId: enr.provId,
  payId: enr.payId,
  task: 'CAQH authorization',
}, { setDb, toast })
```

Those follow-ups land unassigned, so they miss “Mine” inbox and owner filters.

---

### Low

#### 5. Missing tests for the save paths that actually hit the database

Covered well: `validateCompletion`, `followUpTask`, mapper feature-detect, inbox “Mine”, CSP string, RLS SQL cases for 033/034.

Not covered:

- `upsertTask` / `handleSaveTask` sending `completion_note` on create-as-Done
- Unassigned enrollment remaining `null` on insert
- Bulk / modal stage change vs `CLOSING_STAGES`

The unit tests would not catch findings 1–3.

---

#### 6. `CompletionCheck` does not remount when a second request replaces the first

**Location:** `hooks/useCompletion.js`; `components/Layout.jsx`

`useCompletion` cancels the previous promise and swaps `config`, but Layout renders `<CompletionCheck config={...} />` with no `key`. Internal `note` / `answer` / `due` state survives. Rare (overlapping Done clicks), but the dialog can submit answers from the previous item.

---

#### 7. Applications pagination does not reset on level filter

**Location:** `features/enrollments/ApplicationsPage.jsx` (approx. line 159)

Selection clears on `fLevel`; page-reset deps are `[search, fStage, fProv, subtab, fOwner]` and omit `fLevel`. Changing Individual / Group can leave you on an empty page 2.

---

## Security (this diff)

CSP, `Cross-Origin-Opener-Policy: same-origin`, and API `Cache-Control: no-store` are a net improvement.

Residual risk (not new holes from this drop-in):

- `script-src 'unsafe-inline'` is documented; XSS can still talk to `'self'` and `https://*.supabase.co`.
- `img-src` includes `https://www.google.com` (broader than favicon hosts).
- Task completion is enforced in Postgres; enrollment / roster / alert completion is not.

`members_release_tasks` (SECURITY DEFINER) in migration 034 correctly extends the existing release function to enrollments and keeps `search_path = public`.

---

## What looks solid

- Trigger 033: legacy Done rows stay valid, reopen clears completion fields, error code `23514` (so the offline queue does not treat it as “already applied”), `completed_by` from `auth.uid()`.
- Column feature-detect on mappers so 033/034 can roll out after the app.
- Inbox “Mine” precedence (task → enrollment → provider) matches `tests/inboxMine.test.mjs`.
- Follow-up save failure does not roll back the completion (`saveFollowUp`).
- RLS harness cases added for completion notes and application owner.

---

## Suggested fix order

1. Always send `completion_note` when completing a task after 033 is detected (finding 1).
2. Stop overwriting explicit Unassigned on enrollment create (finding 2).
3. Run closing stages through the completion check on bulk and modal save, or refuse those stages there (finding 3).
4. Pass `assigneeId` into CAQH `saveFollowUp` (finding 4).
5. Add tests for those four paths; remount `CompletionCheck` with a key; include `fLevel` in pagination reset deps.
