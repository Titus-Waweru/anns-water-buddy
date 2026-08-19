# Wonder Aqua — Full Migration Bundle (copy/paste, no terminal needed)

Everything is already exported. You only paste SQL into your **new Supabase
project → SQL Editor** and press Run. Nothing here touches the current system.

## Run order

| # | File | Size | What it does |
|---|------|------|--------------|
| 1 | `01_structure.sql` | 109 KB | Extensions, 6 enums, 31 tables, 2 views, indexes, constraints, 18 functions/RPCs, 14 triggers, RLS + all 115 policies |
| 2 | `02_users.sql` | 21 KB | All 9 login accounts with the **same UUIDs and password hashes** (everyone signs in with their existing password) + the 2 `auth.users` triggers |
| 3 | `03_data_part01.sql` … `part05.sql` | ~2.6 MB | Every row of business data, IDs and timestamps preserved. Run parts **in order**, one at a time |
| 4 | `04_finalize.sql` | 3 KB | GRANTs, sequence resets, RLS check, and the verification queries |

Each file already sets `session_replication_role = replica` where needed, so
foreign keys and triggers won't fight the load order.

## Expected results after step 4

Structure: **31 tables · 115 policies · 18 functions**

| Table | Rows |
|---|---|
| auth.users | 9 |
| profiles | 9 |
| user_roles | 9 |
| branches | 4 |
| products | 86 |
| customers | 118 |
| sales | 1837 |
| sale_items | 199 |
| payments | 1225 |
| inventory_logs | 1679 |

If any number differs, re-run the data part that covers that table — every
insert is safe to repeat only on a clean load, so prefer starting that table
fresh rather than loading twice.

## After the SQL: 3 things left

1. **Point the app at the new project.** Update `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` to the new
   project's values, then redeploy.
2. **Set the secrets** on the new project (Edge Functions → Secrets), same
   values as today: `COOP_CONFIG_JSON`, `COOP_OPERATOR_CODE`,
   `COOP_PROXY_BASE_URL`, `COOP_PROXY_SECRET`, `RESEND_API_KEY`.
   `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` /
   `SUPABASE_DB_URL` are provided automatically.
3. **Deploy the 9 edge functions** from `supabase/functions/` and keep the
   `verify_jwt = false` entries in `supabase/config.toml`. Then give Co-op Bank
   the new callback URL:
   `https://<new-project-ref>.functions.supabase.co/mpesa-callback`
   and uncomment the cron block at the bottom of `04_finalize.sql`.

Storage: recreate the private bucket `database_export_11_07_26` if you still
need its contents.

## Smoke test before going live

- Superadmin signs in, role resolves
- A branch cashier sees only their branch (RLS working)
- Dashboard totals match the old system for the last 30 days
- Cash sale → stock drops, inventory log written, receipt prints
- M-Pesa sale → STK prompt arrives → callback settles it to PAID
- Manual M-Pesa code settles a PENDING sale
- Production run consumes raw bottles and creates finished stock
- One PDF and one Excel report export correctly

## Rollback

The current database is never written to. If anything fails, revert the three
`VITE_*` values, redeploy, and point the bank callback back — no data loss.

The phase-by-phase narrative version (with freeze window and troubleshooting
table) is in `docs/MIGRATION_RUNBOOK.md`.
