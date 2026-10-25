-- Migration 028 — where an enrollment's dates came from, and when they were last confirmed
-- Safe to re-run. Run in the Supabase SQL editor.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS dates_source      text;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS dates_verified_on date;
