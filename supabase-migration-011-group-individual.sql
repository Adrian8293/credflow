-- Migration 011: group vs individual enrollment + separate effective dates. Free; safe to re-run.
alter table enrollments add column if not exists level text not null default 'Individual';
alter table enrollments add column if not exists group_name text;
alter table enrollments add column if not exists group_npi text;
alter table enrollments add column if not exists credentialing_effective date;
alter table enrollments add column if not exists contract_effective date;

do $$ begin
  alter table enrollments add constraint enrollments_level_chk check (level in ('Individual','Group'));
exception when duplicate_object then null; end $$;

create index if not exists enrollments_group_idx on enrollments(group_name) where group_name is not null;
-- Existing rows become 'Individual' automatically. No unique index is added because existing
-- data may already contain repeats; the app warns on duplicates instead.
