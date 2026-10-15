-- Migration 012: per-enrollment billing/date fields, associate billing mode, and per-payer enrollment model.
-- Free; safe to re-run. Run BEFORE deploying the matching app version (the app always sends these columns).
alter table enrollments add column if not exists state text;
alter table enrollments add column if not exists product_line text;
alter table enrollments add column if not exists payer_provider_id text;
alter table enrollments add column if not exists billable_from date;
alter table enrollments add column if not exists roster_effective date;
alter table enrollments add column if not exists term_date date;
alter table enrollments add column if not exists associate_mode text;

alter table payers add column if not exists enrollment_model text not null default 'Individual + Group';

do $$ begin
  alter table enrollments add constraint enrollments_product_chk
    check (product_line is null or product_line in ('Commercial','Medicaid','Medicare','Medicare Advantage','Exchange','Other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table enrollments add constraint enrollments_assoc_mode_chk
    check (associate_mode is null or associate_mode in
      ('Roster under group','Supervisor bills','Incident-to with modifier','Own enrollment under agency/supervisor','Not allowed','Unverified'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table payers add constraint payers_enrollment_model_chk
    check (enrollment_model in ('Individual only','Group only','Individual + Group'));
exception when duplicate_object then null; end $$;

create index if not exists enrollments_term_idx on enrollments(term_date) where term_date is not null;
