-- Migration 013: legal entities (groups), locations, payer contracts, and optional links from enrollments.
-- Free; safe to re-run. Run migration 012 first, and run this BEFORE deploying the matching app version.
-- Credentialing data only: do not store patient information here. Store only the LAST 4 of an EIN.
create table if not exists legal_entities (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  entity_type      text not null default 'LLC' check (entity_type in ('LLC','PLLC','PC','MSO','Other')),
  state_of_formation text,
  ein_last4        text check (ein_last4 is null or ein_last4 ~ '^[0-9]{4}$'),
  type2_npi        text check (type2_npi is null or type2_npi ~ '^[0-9]{10}$'),
  holds_or_coa     boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now()
);

create table if not exists entity_locations (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references legal_entities(id) on delete cascade,
  name       text not null,
  address    text,
  city       text,
  state      text,
  zip        text,
  taxonomy   text,
  created_at timestamptz not null default now()
);

create table if not exists payer_contracts (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid not null references legal_entities(id) on delete cascade,
  payer_id              uuid not null references payers(id) on delete cascade,
  state                 text,
  product_line          text,
  contract_no           text,
  contract_effective    date,
  term_date             date,
  delegated_credentialing boolean not null default false,
  roster_cadence        text,
  associate_policy      text,
  notes                 text,
  created_at            timestamptz not null default now()
);
create index if not exists payer_contracts_entity_idx on payer_contracts(entity_id);
create index if not exists entity_locations_entity_idx on entity_locations(entity_id);

alter table enrollments add column if not exists entity_id uuid references legal_entities(id) on delete set null;
alter table enrollments add column if not exists contract_id uuid references payer_contracts(id) on delete set null;
create index if not exists enrollments_entity_idx on enrollments(entity_id) where entity_id is not null;

do $$ declare t text; begin
  foreach t in array array['legal_entities','entity_locations','payer_contracts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_full_access on %I', t);
    execute format('create policy auth_full_access on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
