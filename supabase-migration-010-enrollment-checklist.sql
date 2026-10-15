-- Migration 010: manual tick-offs for per-payer enrollment checklists. Free; safe to re-run.
create table if not exists enrollment_checklist (
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  item_key      text not null,
  done          boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (enrollment_id, item_key)
);
alter table enrollment_checklist enable row level security;
drop policy if exists auth_full_access on enrollment_checklist;
create policy auth_full_access on enrollment_checklist
  for all to authenticated using (true) with check (true);
