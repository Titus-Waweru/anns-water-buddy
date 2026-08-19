-- ============================================================
-- WONDER AQUA — STEP 4 of 4 : GRANTS, SEQUENCES, VERIFICATION
-- Run LAST, after all data parts have loaded.
-- ============================================================

-- 1. Data API access (without these the app gets "permission denied")
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

-- 2. Reset every sequence so the first new insert does not collide
DO $$
DECLARE r record; last_val bigint;
BEGIN
  FOR r IN SELECT schemaname, sequencename FROM pg_sequences WHERE schemaname = 'public'
  LOOP
    EXECUTE format('SELECT last_value FROM %I.%I', r.schemaname, r.sequencename) INTO last_val;
    EXECUTE format('SELECT setval(%L, GREATEST(%s, 1))',
                   r.schemaname || '.' || r.sequencename, COALESCE(last_val, 1));
  END LOOP;
END $$;

SELECT setval('public.stock_transfer_number_seq',
              GREATEST((SELECT count(*) FROM public.stock_transfers), 1));

-- 3. Row Level Security must be on everywhere (expect 0 rows)
SELECT c.relname AS table_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- 4. Structure counts — compare against the source database
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS policies,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public') AS functions;

-- 5. Row counts — must match the source database
SELECT 'auth.users' AS name, count(*) FROM auth.users
UNION ALL SELECT 'profiles',       count(*) FROM public.profiles
UNION ALL SELECT 'user_roles',     count(*) FROM public.user_roles
UNION ALL SELECT 'branches',       count(*) FROM public.branches
UNION ALL SELECT 'products',       count(*) FROM public.products
UNION ALL SELECT 'customers',      count(*) FROM public.customers
UNION ALL SELECT 'sales',          count(*) FROM public.sales
UNION ALL SELECT 'sale_items',     count(*) FROM public.sale_items
UNION ALL SELECT 'payments',       count(*) FROM public.payments
UNION ALL SELECT 'inventory_logs', count(*) FROM public.inventory_logs
ORDER BY 1;

-- 6. OPTIONAL — re-schedule the M-Pesa reconciler on the new project.
--    Replace <NEW_PROJECT_REF> before running.
-- SELECT cron.schedule('mpesa-reconcile', '*/2 * * * *', $$
--   SELECT net.http_post(
--     url := 'https://<NEW_PROJECT_REF>.functions.supabase.co/mpesa-reconcile',
--     headers := '{"Content-Type":"application/json"}'::jsonb) $$);
