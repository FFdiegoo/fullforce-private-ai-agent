/*
  # Emergency Schema Migration Script
  
  ## WARNING: Only use this if the verification script finds non-compliant objects!
  
  This script provides templates for migrating custom objects from restricted schemas
  to the public schema. Customize as needed based on verification results.
*/

-- ============================================================================
-- EMERGENCY MIGRATION TEMPLATES (Only use if needed!)
-- ============================================================================

-- Template: Move custom table from auth schema to public
-- ALTER TABLE auth.your_custom_table SET SCHEMA public;

-- Template: Move custom function from auth schema to public  
-- ALTER FUNCTION auth.your_custom_function() SET SCHEMA public;

-- Template: Move custom view from auth schema to public
-- ALTER VIEW auth.your_custom_view SET SCHEMA public;

-- ============================================================================
-- UPDATE APPLICATION CODE REFERENCES
-- ============================================================================

-- After moving objects, update any code references:
-- OLD: SELECT * FROM auth.your_custom_table;
-- NEW: SELECT * FROM public.your_custom_table;
-- OR:  SELECT * FROM your_custom_table; (public is default)

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify no custom objects remain in restricted schemas
SELECT 
  schemaname,
  tablename,
  'TABLE' as object_type
FROM pg_tables 
WHERE schemaname IN ('auth', 'storage', 'realtime')
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT IN (
    'users', 'sessions', 'refresh_tokens', 'instances', 'audit_log_entries',
    'identities', 'mfa_factors', 'mfa_challenges', 'mfa_amr_claims',
    'sso_providers', 'sso_domains', 'saml_providers', 'saml_relay_states',
    'flow_state', 'one_time_tokens', 'buckets', 'objects', 'migrations',
    'subscription', 'schema_migrations'
  );

-- Should return 0 rows if migration is complete