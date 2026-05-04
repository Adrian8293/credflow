-- CredFlow — Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ─── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Providers ─────────────────────────────────────────────────────────────────
create table if not exists providers (
  id           uuid primary key default uuid_generate_v4(),
  fname        text not null,
  lname        text not null,
  cred         text,
  spec         text,
  status       text default 'Active',
  email        text,
  phone        text,
  focus        text,
  taxonomy_code text,
  taxonomy_desc text,
  npi          text,
  caqh         text,
  caqh_attest  date,
  caqh_due     date,
  medicaid     text,
  ptan         text,
  license      text,
  license_exp  date,
  mal_carrier  text,
  mal_policy   text,
  mal_exp      date,
  dea          text,
  dea_exp      date,
  recred       date,
  supervisor   text,
  sup_exp      date,
  notes        text,
  created_at   timestamptz default now()
);

-- ─── Payers ────────────────────────────────────────────────────────────────────
create table if not exists payers (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  payer_id   text,
  type       text,
  phone      text,
  email      text,
  portal     text,
  timeline   text,
  notes      text,
  created_at timestamptz default now()
);

-- ─── Enrollments ───────────────────────────────────────────────────────────────
create table if not exists enrollments (
  id         uuid primary key default uuid_generate_v4(),
  prov_id    uuid references providers(id) on delete cascade,
  pay_id     uuid references payers(id) on delete set null,
  stage      text default 'Not Started',
  submitted  date,
  effective  date,
  recred     date,
  eft        text default 'Not Set Up',
  era        text default 'Not Set Up',
  followup   date,
  contract   text default 'No',
  notes      text,
  created_at timestamptz default now()
);

-- ─── Documents ─────────────────────────────────────────────────────────────────
create table if not exists documents (
  id         uuid primary key default uuid_generate_v4(),
  prov_id    uuid references providers(id) on delete cascade,
  type       text,
  issuer     text,
  number     text,
  issue      date,
  exp        date,
  notes      text,
  created_at timestamptz default now()
);

-- ─── Tasks ─────────────────────────────────────────────────────────────────────
create table if not exists tasks (
  id         uuid primary key default uuid_generate_v4(),
  task       text not null,
  due        date,
  priority   text default 'Medium',
  status     text default 'Open',
  cat        text,
  prov_id    uuid references providers(id) on delete set null,
  pay_id     uuid references payers(id) on delete set null,
  notes      text,
  created_at timestamptz default now()
);

-- ─── Audit Log ─────────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id      uuid primary key default uuid_generate_v4(),
  type    text,
  action  text,
  detail  text,
  entity  text,
  ts      timestamptz default now()
);

-- ─── Settings (single row, id=1) ───────────────────────────────────────────────
create table if not exists settings (
  id          integer primary key default 1,
  practice    text,
  address     text,
  phone       text,
  email       text,
  alert_days  integer default 90,
  caqh_days   integer default 30
);

-- Seed the single settings row
insert into settings (id) values (1) on conflict do nothing;

-- ─── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists providers_lname_idx on providers(lname);
create index if not exists enrollments_prov_id_idx on enrollments(prov_id);
create index if not exists enrollments_pay_id_idx on enrollments(pay_id);
create index if not exists enrollments_stage_idx on enrollments(stage);
create index if not exists documents_prov_id_idx on documents(prov_id);
create index if not exists documents_exp_idx on documents(exp);
create index if not exists tasks_due_idx on tasks(due);
create index if not exists tasks_status_idx on tasks(status);
create index if not exists audit_log_ts_idx on audit_log(ts desc);

-- ─── Row Level Security (enable when you add user-based multi-tenancy) ─────────
-- Uncomment these when you want per-user data isolation:
--
-- alter table providers enable row level security;
-- alter table payers enable row level security;
-- alter table enrollments enable row level security;
-- alter table documents enable row level security;
-- alter table tasks enable row level security;
-- alter table audit_log enable row level security;
-- alter table settings enable row level security;
--
-- create policy "Authenticated users can access all data"
--   on providers for all
--   to authenticated
--   using (true);
-- (repeat for each table)

-- ─── Realtime ──────────────────────────────────────────────────────────────────
-- Enable realtime for live updates (Dashboard → Database → Replication)
-- Or run:
-- alter publication supabase_realtime add table providers;
-- alter publication supabase_realtime add table payers;
-- alter publication supabase_realtime add table enrollments;
-- alter publication supabase_realtime add table documents;
-- alter publication supabase_realtime add table tasks;
