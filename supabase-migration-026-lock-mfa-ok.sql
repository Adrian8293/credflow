-- Migration 026: stop the signed-out role from calling mfa_ok().
-- Found by supabase-rls-test.sql. Supabase grants EXECUTE on new functions to "anon" by default, and migration 017 only
-- revoked it from PUBLIC. mfa_ok() reveals nothing useful to a signed-out caller, so this is low severity, but a
-- signed-out visitor should not be able to call any privileged function at all.
-- Free; safe to re-run.
REVOKE ALL ON FUNCTION public.mfa_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_ok() TO authenticated;
