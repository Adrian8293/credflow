create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create table auth.users (id uuid primary key, email text, aud text default 'authenticated', role text default 'authenticated', created_at timestamptz default now(), raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'sub')),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb,'{}'::jsonb) $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
create publication supabase_realtime;
grant usage on schema auth, storage, public to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
create extension if not exists "uuid-ossp";
-- mirror Supabase: new objects in public are granted to the API roles by default
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text, factor_type text);
