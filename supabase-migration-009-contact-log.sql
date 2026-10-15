-- Migration 009: Enrollment contact log (calls, emails, portal messages, reference numbers).
-- Free: one table, no extensions. Safe to re-run.
create table if not exists enrollment_contacts (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  contacted_at  date not null default current_date,
  method        text not null default 'Phone'
                check (method in ('Phone','Email','Portal','Fax','Mail','Other')),
  contact_name  text,
  reference_no  text,
  summary       text not null,
  next_followup date,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists enrollment_contacts_enr_idx
  on enrollment_contacts(enrollment_id, contacted_at desc);

alter table enrollment_contacts enable row level security;
drop policy if exists auth_full_access on enrollment_contacts;
create policy auth_full_access on enrollment_contacts
  for all to authenticated using (true) with check (true);
-- NOTE: do not enter patient information in this log (credentialing data only).
