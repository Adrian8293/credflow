-- ─── Migration 004: Settings — Notification & Security Toggles ────────────────
-- Adds notification and security toggle columns to the settings table.
-- All columns default to true (on) except those that default to false (off).
-- Safe to re-run: uses add column IF NOT EXISTS throughout.
--
-- Run in Supabase Dashboard → SQL Editor → New query.
-- ──────────────────────────────────────────────────────────────────────────────

-- Notification toggles
alter table settings
  add column if not exists email_expiry         boolean not null default true,
  add column if not exists task_reminders       boolean not null default true,
  add column if not exists doc_expiry           boolean not null default true,
  add column if not exists enable_audit_log     boolean not null default true,
  add column if not exists caqh_reminders       boolean not null default true,
  add column if not exists app_status_alerts    boolean not null default true,
  add column if not exists weekly_digest        boolean not null default true,
  add column if not exists onboarding_checklist boolean not null default true;

-- Security toggles
alter table settings
  add column if not exists two_factor      boolean not null default false,
  add column if not exists session_timeout boolean not null default true,
  add column if not exists ip_allowlist    boolean not null default false;

-- ─── Verify ───────────────────────────────────────────────────────────────────
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'settings'
-- order by ordinal_position;
-- ──────────────────────────────────────────────────────────────────────────────
