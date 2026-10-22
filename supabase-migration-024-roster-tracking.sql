-- Migration 024: remember when each payer's roster was last sent, so Lacentra can remind you when the next one is due.
-- Free; safe to re-run. Run BEFORE deploying the matching app version. (Needs migration 013.)
ALTER TABLE payer_contracts ADD COLUMN IF NOT EXISTS last_roster_sent date;
