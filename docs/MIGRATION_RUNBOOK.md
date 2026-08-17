# Wonder Aqua — Step-by-Step Migration Runbook (Move to a New Database)

Companion to `DATABASE_MIGRATION_DOCUMENTATION.md` (full schema reference) and
`docs/schema_public.sql` (exact DDL dump).

Plan for a **90-minute maintenance window**. Nothing here is destructive to the
old database — it stays intact as the rollback target.

---

## Phase 0 — Prepare (day before, no downtime)

1. Create the new Postgres/Supabase project. Note down:
   - `NEW_DB_URL` = `postgresql://postgres:<pwd>@<host>:5432/postgres`
   - New project URL, anon/publishable key, project id, service role key.
2. Install tooling on your machine: `psql`, `pg_dump`, `pg_restore` (v17+),
   and the Supabase CLI if the new DB is Supabase.
3. Export the OLD connection string as `OLD_DB_URL` (from your current
   backend settings — Database → Connection string, "URI", session mode).
4. Verify both:
   ```bash
   psql "$OLD_DB_URL" -c "select count(*) from public.sales;"
   psql "$NEW_DB_URL" -c "select version();"
   ```

---

## Phase 1 — Freeze writes (start of window)

1. Turn on the kill-switch in the app: **System Control → disable operations**
   (blocks new sales/production).
2. Disable the reconcile cron on the OLD database so no background job mutates
   rows mid-copy:
   ```sql
   select cron.unschedule(jobid) from cron.job where jobname ilike '%mpesa%';
   ```
3. Wait 2 minutes, then confirm no PENDING payment is mid-flight:
   ```sql
   select count(*) from public.payments
   where status='PENDING' and created_at > now() - interval '10 minutes';
   ```
   If > 0, wait for them to settle or expire before continuing.

---

## Phase 2 — Take the backups

```bash
mkdir -p ~/wonderaqua-migration && cd ~/wonderaqua-migration

# 2a. Schema only (structure, functions, triggers, RLS, grants)
pg_dump "$OLD_DB_URL" --schema-only --no-owner --no-privileges \
  --schema=public -f schema.sql

# 2b. Grants/policies are included above; also dump auth users separately
pg_dump "$OLD_DB_URL" --data-only --no-owner \
  --table=auth.users --table=auth.identities -f auth_data.sql

# 2c. Public data only (preserves IDs and timestamps)
pg_dump "$OLD_DB_URL" --data-only --no-owner --disable-triggers \
  --schema=public -f public_data.sql

# 2d. Safety net: full custom-format dump
pg_dump "$OLD_DB_URL" -Fc -f full_backup.dump
```

Check the files are non-trivial: `ls -lh *.sql *.dump`.

---

## Phase 3 — Build the new database structure

Run in this exact order.

1. **Extensions** (as superuser on the new DB):
   ```sql
   create extension if not exists pgcrypto;
   create extension if not exists "uuid-ossp";
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   ```
2. **Schema**:
   ```bash
   psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f schema.sql
   ```
   This creates: 6 enums, 31 tables, sequences, 2 views, indexes, constraints,
   18 functions/RPCs, 14 public triggers, RLS enablement, 115 policies.
3. **Verify structure before loading data**:
   ```sql
   select count(*) from information_schema.tables where table_schema='public';   -- 31 (+2 views)
   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public';                                                    -- 18
   select count(*) from pg_policies where schemaname='public';                    -- 115
   ```

---

## Phase 4 — Move the users (auth)

Order matters: users must exist before `public.profiles`/`user_roles` FKs load.

1. Load `auth_data.sql` into the new project's `auth` schema:
   ```bash
   psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f auth_data.sql
   ```
   *(If the new provider blocks direct `auth.users` inserts, use its user-import
   API/CSV instead — keep the same UUIDs, that is the only hard requirement.)*
2. Recreate the two auth triggers (they are not in the public dump):
   ```sql
   create trigger on_auth_user_created after insert on auth.users
     for each row execute function public.handle_new_user();
   create trigger on_auth_user_created_superadmin after insert on auth.users
     for each row execute function public.handle_superadmin_assignment();
   ```
3. Confirm: `select count(*) from auth.users;` matches the old count.

---

## Phase 5 — Load the data

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f public_data.sql
```

`--disable-triggers` keeps `updated_at` and inventory triggers from firing and
rewriting historical rows. If your role cannot disable triggers, do it manually:

```sql
-- before load
alter table public.sales disable trigger all;   -- repeat per table, or:
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I disable trigger all', t.tablename);
  end loop; end $$;
-- ... load ...
-- after load: same loop with ENABLE
```

Then **reset every sequence** (otherwise the first insert collides):

```sql
do $$ declare r record; begin
  for r in select schemaname, sequencename from pg_sequences where schemaname='public'
  loop
    execute format('select setval(%L, greatest(coalesce((select last_value from %I.%I),1),1))',
                   r.schemaname||'.'||r.sequencename, r.schemaname, r.sequencename);
  end loop; end $$;

-- transfer numbers specifically
select setval('public.stock_transfer_number_seq',
  greatest((select count(*) from public.stock_transfers), 1));
```

---

## Phase 6 — Grants and RLS sanity

`pg_dump --no-privileges` strips GRANTs, so re-apply them:

```sql
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
-- anon: only the tables your policies actually allow anonymous reads on
```

Verify RLS is on everywhere:

```sql
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;  -- expect 0 rows
```

---

## Phase 7 — Storage, secrets, edge functions

1. **Storage**: create the bucket `database_export_11_07_26` (private), then copy
   objects with the storage API or CLI.
2. **Secrets** — set all of these on the new backend (values unchanged):
   - Mandatory: `COOP_CONFIG_JSON`, `COOP_OPERATOR_CODE`, `COOP_PROXY_BASE_URL`,
     `COOP_PROXY_SECRET`, `RESEND_API_KEY`
   - Auto-provided by the platform: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
3. **Deploy the 9 edge functions** from `supabase/functions/`:
   `mpesa-stk-push`, `mpesa-callback`, `mpesa-transaction-status`,
   `mpesa-reconcile`, `mpesa-manual-entry`, `mpesa-proxy-verify`,
   `mpesa-egress-check`, `send-otp-email`, `_shared`.
   Keep `supabase/config.toml` `verify_jwt = false` entries as-is.
4. **Re-schedule the reconcile cron** on the new DB:
   ```sql
   select cron.schedule('mpesa-reconcile', '*/2 * * * *', $$
     select net.http_post(
       url := 'https://<new-project>.functions.supabase.co/mpesa-reconcile',
       headers := '{"Content-Type":"application/json"}'::jsonb) $$);
   ```

---

## Phase 8 — Point the app at the new database

Update the frontend env values (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`) to the new project,
then rebuild and redeploy.

**Bank-side change:** give Co-op the new callback URL
`https://<new-project>.functions.supabase.co/mpesa-callback` and confirm the AWS
proxy (`13.62.244.124`) still fronts outbound traffic. Payments will fail until
the bank has whitelisted/updated the callback.

---

## Phase 9 — Verification checklist

Row counts must match old vs new:

```sql
select 'sales', count(*) from sales
union all select 'payments', count(*) from payments
union all select 'products', count(*) from products
union all select 'customers', count(*) from customers
union all select 'inventory_logs', count(*) from inventory_logs
union all select 'profiles', count(*) from profiles
union all select 'user_roles', count(*) from user_roles;
```

Functional smoke test, in order:

- [ ] Log in as the superadmin (`tituswaweru631@gmail.com`) — role resolves.
- [ ] Log in as a branch cashier — sees only their branch (RLS working).
- [ ] Dashboard totals match the old system for the last 30 days.
- [ ] Create a cash sale → stock drops, inventory log written, receipt prints.
- [ ] Create an M-Pesa sale → STK prompt arrives on the test phone.
- [ ] Callback settles the sale to PAID (check Payments Trace page).
- [ ] Manual M-Pesa code entry settles a PENDING sale.
- [ ] Record a production run → raw bottles consumed, finished stock created.
- [ ] Stock transfer create → receive at destination branch.
- [ ] Reports: export one PDF and one Excel, totals match.
- [ ] OTP email arrives (Resend key working).

---

## Phase 10 — Go live / rollback

**Go live:** re-enable operations in System Control, monitor Payments Trace for
30 minutes, watch success rate on the health view.

**Rollback (any failure in Phase 8–9):**
1. Revert the frontend env values to the old project and redeploy.
2. Re-enable the reconcile cron on the OLD database (Phase 1 step 2, reversed).
3. Re-enable operations. The old database was never written to, so no data loss.
4. Point the bank callback URL back to the old function URL.

Keep the old database read-only but alive for **at least 30 days** before
decommissioning.

---

## Common failures and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `permission denied for table X` | GRANTs missing | Re-run Phase 6 |
| `duplicate key value violates unique constraint` on first insert | sequence not reset | Re-run the setval loop |
| FK violation loading `profiles` | auth users not imported first | Do Phase 4 before Phase 5 |
| Empty dashboards but data present | RLS policies loaded, roles not | Check `user_roles` rows imported |
| STK push returns 403 | new egress IP not whitelisted | Keep routing via the AWS proxy |
| Callback never lands | bank still posting to old URL | Update callback URL with Co-op |
