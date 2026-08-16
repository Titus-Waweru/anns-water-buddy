# DATABASE MIGRATION DOCUMENTATION
## Wonder Aqua LTD Management System — Production Database Reference

**Status:** Documentation / inspection only. No schema, data, policy, function or configuration was modified while producing this document.
**Generated:** 16 August 2026 (UTC), directly from the live production database via read-only introspection queries.
**Target audience:** an engineer migrating this system to an independently managed PostgreSQL / Supabase instance without changing business logic.

---

## 0. Executive summary

| Item | Value |
|---|---|
| Engine | PostgreSQL (Supabase managed), connection pooled |
| Application schema | `public` (29 tables, 2 views, 18 functions, 14 triggers, 1 sequence, 6 enums) |
| Identity | Supabase GoTrue (`auth` schema) — `auth.users` is referenced by 20+ foreign keys |
| Storage | Supabase Storage — 1 private bucket, 1 object |
| Serverless logic | Supabase Edge Functions (Deno) + Vercel serverless routes under `api/` |
| Security model | RLS enabled on **every** table in `public`, roles held in `public.user_roles`, checked with `has_role()` / `is_admin()` SECURITY DEFINER helpers |
| Extensions in use | `pgcrypto`, `uuid-ossp`, `pg_net`, `pg_cron`, `pg_stat_statements`, `supabase_vault`, `plpgsql` |
| Scheduled jobs | none currently registered in `cron.job` (reconciliation is invoked externally) |

Complete machine-readable DDL for the `public` schema is included next to this file as **`docs/schema_public.sql`** (produced with `pg_dump --schema-only --no-owner --no-privileges -n public`). That file is the authoritative source for exact recreation; the sections below explain it.

---

## 1. Domain model and relationships

### 1.1 Core entity map

```text
auth.users ──1:1── profiles                (approval workflow: pending/approved/rejected)
auth.users ──1:N── user_roles              (superadmin | supervisor | cashier | stock_manager)
auth.users ──1:N── user_branch_assignments ──N:1── branches      (many-to-many user↔branch)

branches ──1:N── products ──N:1── bottle_specifications
branches ──1:N── customers, suppliers(global), assets, vouchers, targets, announcements
branches ──1:N── sales, sale_items, purchases, inventory_logs, payments
branches ──1:N── raw_bottle_inventory (UNIQUE branch+spec → effectively 1:1 per pair)
branches ──1:N── production_records, cash_submissions, cash_reconciliations
branches ──1:N── stock_transfers (twice: from_branch_id, to_branch_id)

customers ──1:N── sales
customers ──1:N── loyalty_points
customers ──1:N── credit_payments

sales ──1:N── sale_items                   (multi-item cart; legacy single-product columns kept on sales)
sales ──1:N── payments                     (retries create additional payment rows per sale)
sales ──1:N── loyalty_points

products ──1:N── sale_items, inventory_logs, purchases, stock_adjustments, stock_transfers
bottle_specifications ──1:N── raw_bottle_inventory, raw_bottle_inventory_logs,
                              production_records, purchases(raw bottles), products
```

### 1.2 Relationship cardinality notes

* **One-to-one:** `profiles.user_id` (UNIQUE) ↔ `auth.users.id`; `raw_bottle_inventory (branch_id, bottle_specification_id)` UNIQUE — one stock row per branch/spec pair.
* **One-to-many:** everything branch-scoped; `sales → sale_items`; `sales → payments`; `customers → credit_payments`.
* **Many-to-many:** users ↔ branches through `user_branch_assignments`; users ↔ roles through `user_roles` (UNIQUE `(user_id, role)`).
* **Self-referencing / dual FK:** `stock_transfers` references `branches` twice, with a CHECK forbidding `from_branch_id = to_branch_id`.

### 1.3 Cascade behaviour (must be reproduced exactly)

| Behaviour | Relationships |
|---|---|
| `ON DELETE CASCADE` | `profiles.user_id`, `inventory_logs.product_id`, `loyalty_points.customer_id`, `credit_payments.customer_id`, `sale_items.sale_id`, `stock_adjustments.product_id`, `stock_adjustments.requested_by`, `raw_bottle_inventory.branch_id`, `raw_bottle_inventory_logs.branch_id`, `cash_reconciliations.branch_id`, `cash_reconciliations.cashier_id`, `user_roles.user_id`, `user_branch_assignments.user_id`, `user_branch_assignments.branch_id`, `targets.user_id` |
| `ON DELETE SET NULL` | all `branch_id` columns on sales/products/customers/purchases/inventory_logs/sale_items/targets/announcements, `sales.customer_id`, `sales.recorded_by`, `loyalty_points.sale_id`, `purchases.supplier_id`, `purchases.recorded_by`, `products.bottle_specification_id`, `announcements.created_by`, `cash_reconciliations.approved_by`, `stock_adjustments.approved_by`, `raw_bottle_inventory_logs.purchase_id`, `raw_bottle_inventory_logs.recorded_by` |
| `ON DELETE RESTRICT` | `sales.product_id`, `sale_items.product_id`, `purchases.product_id`, `purchases.raw_bottle_specification_id`, `production_records.finished_product_id`, `production_records.raw_bottle_specification_id`, `raw_bottle_inventory.bottle_specification_id`, `raw_bottle_inventory_logs.bottle_specification_id` |
| `NO ACTION` (default) | all `stock_transfers` FKs, `assets.branch_id`, `cash_submissions.branch_id`, `credit_payments.branch_id`/`recorded_by`, `vouchers.branch_id` |

No `ON UPDATE` rules are defined anywhere (all default `NO ACTION`); primary keys are immutable UUIDs.

### 1.4 Idempotency / duplicate-prevention constraints (business critical)

These exist because of a production duplicate-entry incident and **must** be recreated:

* `payments.message_reference` — UNIQUE. The only link between STK push and the bank callback.
* `sales.idempotency_key` — unique index (partial, where not null); blocks double-submitted checkouts.
* `products` — unique index on `(branch_id, lower(name))`; blocks duplicate product creation per branch.
* `stock_transfers.transfer_number` — UNIQUE.
* `user_roles (user_id, role)`, `bottle_specifications (category, bottle_size)`, `system_settings.setting_key`, `raw_bottle_inventory (branch_id, bottle_specification_id)`.

---

## 2. Payment architecture (end-to-end)

### 2.1 Flow

```text
1. Cashier builds cart (src/pages/Sales.tsx) and chooses payment mode.
   Cash / Credit  → sales row inserted with payment_status = 'PAID'
                    (BEFORE INSERT trigger trg_sales_mark_inventory_applied sets inventory_applied = true;
                     the client applies stock/credit inline)
   Mpesa          → sales row inserted with payment_status = 'PENDING', inventory_applied = false,
                    stable idempotency_key generated client-side.

2. Frontend invokes Edge Function `mpesa-stk-push`
   → generates MessageReference + X-Correlation-Id
   → INSERT INTO payments (provider='coop', sale_id, message_reference, correlation_id,
                            status='PENDING', amount, phone_number, attempt_count …)
   → 45-second in-flight duplicate guard on the same sale
   → OAuth token (client_credentials, form-encoded) then STK request,
     routed through the AWS reverse proxy (COOP_PROXY_BASE_URL, header X-Proxy-Secret)
     because Co-op whitelists a fixed egress IP.

3. Terminal outcome arrives by any of three paths:
   a. Callback   → Edge Function `mpesa-callback` (verify_jwt = false) matched on MessageReference
   b. Polling    → Edge Function `mpesa-transaction-status` (3-minute grace for code -13)
   c. Sweeper    → Edge Function `mpesa-reconcile` (expires stragglers after 60 minutes)
   All three classify the result with `_shared/mpesa-shared.ts::classifyResult`
   (SUCCESS, USER_CANCELLED 1032, USER_TIMEOUT 1037, USER_INSUFFICIENT_FUNDS 1,
    USER_ACCOUNT_ISSUE 2035/-8, REFERENCE_NOT_FOUND -13, PROVIDER_*, UPSTREAM_*, EXPIRED_NO_RESPONSE)
   and store status, result_code, result_description, error_category, raw_payload, completed_at.

4. Settlement — `settleSale()` in _shared/mpesa-shared.ts:
   PAID  → rpc finalize_sale_payment(p_sale_id)   [atomic + idempotent]
   FAILED / CANCELLED / EXPIRED → UPDATE sales SET payment_status = … WHERE payment_status <> 'PAID'
                                  (never touches stock)

5. Manual fallback (STK failed / customer paid by other means):
   rpc record_manual_mpesa_payment(...) — validates reference ^[A-Z0-9-]{6,50}$,
   rejects a reference already used on another sale, upserts the payment row as
   MPESA_MANUAL/SUCCESS, cancels sibling PENDING payments for the sale, then calls
   finalize_sale_payment in the same transaction.
```

### 2.2 `finalize_sale_payment(p_sale_id)` — the single settlement point

Idempotent via `sales.inventory_applied`. On first successful call it:
1. Locks the sale (`FOR UPDATE`).
2. Deducts stock per `sale_items` (or the legacy single-product columns when there are no items) using `GREATEST(0, quantity - qty)`.
3. Writes one `inventory_logs` `OUT` row per line.
4. Adds `final_amount` to `customers.credit_balance` for Credit sales.
5. Awards loyalty: `floor(final_amount / 100)` points → `loyalty_points` row + `customers.loyalty_points` increment.
6. Sets `sales.payment_status = 'PAID'`, `inventory_applied = true`.

If called again it simply re-asserts `PAID` and returns `already_finalized = true`. **Any migration must preserve this function verbatim** — the frontend (`DataContext.finalizeSale`), the callback, the poller, the reconciler and manual entry all depend on it.

### 2.3 Objects involved in payments

| Object | Type | Role |
|---|---|---|
| `sales` | table | order header, `payment_status`, `inventory_applied`, `idempotency_key` |
| `sale_items` | table | cart lines used by finalization |
| `payments` | table | one row per STK/manual attempt; UNIQUE `message_reference`; `correlation_id`, `error_category`, `attempt_count`, `raw_request`, `raw_payload`, `completed_at` |
| `payment_deletions_audit` | table | audit trail for removed payment rows |
| `payment_health_daily`, `payment_failure_reasons` | views | monitoring surfaces on `/app/payments-trace` |
| `finalize_sale_payment` | function | atomic settlement |
| `record_manual_mpesa_payment` | function | manual reference settlement |
| `sales_mark_inventory_applied` | trigger fn | marks sales created already-PAID as applied |
| `update_updated_at_column` | trigger fn | `payments`, `sales`-adjacent tables timestamps |

### 2.4 Payment status vocabulary

* `payments.status`: `PENDING`, `SUCCESS`, `FAILED`, `CANCELLED`, `EXPIRED`.
* `sales.payment_status`: `PENDING`, `PAID`, `FAILED`, `CANCELLED`.
* Reporting truth is centralised in `src/lib/paymentStatus.ts`: only `PAID`/`SUCCESS`/`COMPLETED` (or NULL for legacy rows) count as revenue.

---

## 3. Application dependency map

| Module / file | Tables | Functions / RPCs |
|---|---|---|
| `src/context/DataContext.tsx` (global data layer) | products, customers, suppliers, sales, sale_items, purchases, inventory_logs, branches | `finalize_sale_payment` |
| `src/pages/Sales.tsx` (POS) | sales, sale_items, products, customers, payments | `finalize_sale_payment`, `record_manual_mpesa_payment` |
| Edge fn `mpesa-stk-push` | payments, sales | — (writes directly, service role) |
| Edge fn `mpesa-callback` (`verify_jwt=false`) | payments, sales | `finalize_sale_payment` via `settleSale` |
| Edge fn `mpesa-transaction-status` (`verify_jwt=false`) | payments, sales | `finalize_sale_payment` |
| Edge fn `mpesa-reconcile` (`verify_jwt=false`) | payments, sales | `finalize_sale_payment` |
| Edge fn `mpesa-proxy-verify`, `mpesa-egress-check` | — | network diagnostics only |
| Vercel routes `api/mpesa-callback.js`, `api/mpesa-manual-entry.js`, `api/lib/payment-finalizer.js` | payments, sales | `finalize_sale_payment` |
| `src/pages/PaymentsTrace.tsx` (admin) | payments, sales | reads `payment_health_daily`, `payment_failure_reasons` |
| `src/pages/Inventory.tsx` | products, inventory_logs, stock_adjustments, bottle_specifications | — |
| `src/pages/Production.tsx` | production_records, raw_bottle_inventory, raw_bottle_inventory_logs, products, inventory_logs | `record_bottle_production` |
| `src/pages/RawBottleInventory.tsx` | raw_bottle_inventory, raw_bottle_inventory_logs, purchases | `record_raw_bottle_purchase` |
| `src/pages/Purchases.tsx` | purchases, products, suppliers, inventory_logs | `record_raw_bottle_purchase` |
| `src/pages/StockTransfer.tsx` | stock_transfers, products, branches, inventory_logs | `create_stock_transfer`, `receive_stock_transfer`, `cancel_stock_transfer`, `next_stock_transfer_number` (+ sequence) |
| `src/pages/Customers.tsx` + `CustomerSearch.tsx` | customers, credit_payments, loyalty_points, sales | `record_manual_mpesa_payment` (credit settlement path) |
| `src/components/SaleReceipt.tsx`, `InvoicePDF.tsx` | sales, sale_items, customers, profiles, branches | — |
| `src/pages/Reports.tsx`, `src/lib/reportExport.ts` | sales, sale_items, products, purchases, vouchers, inventory_logs, customers, production_records | — (filters with `paymentStatus.ts`) |
| `src/pages/Dashboard.tsx` | sales, products, customers, targets, announcements | `get_active_announcements` |
| `src/pages/Teams.tsx` (staff) | profiles, user_roles, user_branch_assignments | `has_role`, `is_admin`, `get_user_roles` |
| `src/pages/Branches.tsx` | branches, user_branch_assignments | `set_factory_branch` |
| `src/pages/Vouchers.tsx`, `Assets.tsx` (expenses/assets) | vouchers, assets | — |
| `src/pages/CashSubmission.tsx`, `CashReconciliation.tsx` (M-banking reconciliation) | cash_submissions, cash_reconciliations, sales, payments | `is_admin` |
| `src/pages/Targets.tsx` | targets, sales | — |
| `src/pages/Announcements.tsx` | announcements | `get_active_announcements` |
| `src/pages/SubscriptionSettings.tsx`, `useSubscription.ts` | subscription_records, system_settings | — |
| `src/pages/SystemControl.tsx` | system_settings, all branch data (reset) | `is_admin` |
| `src/context/AuthContext.tsx` | profiles, user_roles, user_branch_assignments | `get_user_roles`, `has_role`, `is_admin` |
| Edge fn `send-otp-email` | profiles | — |
| `src/lib/offlineDb.ts` / `useOfflineSync.ts` | queues writes for customers & single-product sales | replays through the same tables |

---

## 4. Security model

* **RLS is enabled on all 29 public tables.** Full policy text per table is in Appendix A.
* **Roles are never stored on `profiles`.** They live in `public.user_roles` (`app_role` enum) and are read through SECURITY DEFINER helpers `has_role(uuid, app_role)`, `is_admin(uuid)` (superadmin ∪ supervisor) and `get_user_roles(uuid)`, which avoids recursive RLS.
* **Branch isolation** is enforced by policies that join `user_branch_assignments` for non-admin users.
* **Authentication dependencies:** every write policy assumes a GoTrue JWT (`auth.uid()`); `handle_new_user()` (AFTER INSERT on `auth.users`) creates the profile; `handle_superadmin_assignment()` auto-approves and grants `superadmin` to the owner email. Both triggers live on `auth.users` and are **not** covered by a `public`-schema dump — recreate them manually.
* **Publicly readable (anon):** nothing operational. All business tables require `authenticated`; approval-gated data additionally requires an approved profile or a role check.
* **Admin-only tables:** `system_settings`, `subscription_records`, `payment_deletions_audit`, plus admin-only commands on `branches`, `user_roles`, `announcements`, `targets`, `stock_adjustments` approvals.
* **Append-only tables** (no UPDATE and/or DELETE policy at all): `inventory_logs`, `loyalty_points`, `sale_items`, `purchases`, `payment_deletions_audit`, `production_records` (no UPDATE), `vouchers` (no UPDATE), `sales`/`profiles`/`cash_*`/`stock_adjustments`/`raw_bottle_*` (no DELETE). `stock_transfers` is read-only from the API and only mutated through its SECURITY DEFINER RPCs.
* **Grants:** every table carries explicit `GRANT`s to `authenticated` and `service_role` (see per-table Grants lines). PostgREST cannot see a table without them.

---

## 5. Storage

| Bucket | Visibility | Objects | Used by |
|---|---|---|---|
| `database_export_11_07_26` | private | 1 | one-off database export archive; **no runtime application dependency** |

No storage RLS policies are defined beyond Supabase defaults, and the application never reads or writes storage at runtime (receipts and reports are generated client-side with `jspdf` / `xlsx`). Migrating the bucket is optional and only preserves the historical export file.

---

## 6. What must be recreated in the new database

Recreate in this exact order:

1. **Extensions:** `pgcrypto`, `uuid-ossp` (in `extensions`), `pg_net`, `pg_cron`, `pg_stat_statements`, `supabase_vault`. Only `pgcrypto`/`uuid-ossp` are functionally required (`gen_random_uuid()` defaults).
2. **Enums:** `adjustment_type`, `app_role`, `approval_status`, `discount_type`, `payment_mode`, `reconciliation_status` — value order matters.
3. **Sequence:** `stock_transfer_number_seq` (restore `last_value` after data import).
4. **Tables** with identical column order, types, defaults, nullability, then **GRANTs**, then `ENABLE ROW LEVEL SECURITY`, then **policies** — in that order, per Lovable/Supabase requirements.
5. **Constraints and indexes**, including the four idempotency uniques in §1.4.
6. **Functions** (all 18, verbatim, keeping `SECURITY DEFINER` and `SET search_path = public`).
7. **Triggers** — 14 in `public`, plus the two on `auth.users` (`on_auth_user_created`, `on_auth_user_created_superadmin`).
8. **Views:** `payment_health_daily`, `payment_failure_reasons`.
9. **Auth users** — export/import `auth.users` (and `auth.identities`) preserving `id`, or all `recorded_by` / `created_by` / `user_id` references break.
10. **Edge functions and their secrets** (§8) with the same `verify_jwt = false` settings from `supabase/config.toml` for `mpesa-callback`, `mpesa-reconcile`, `mpesa-transaction-status`, `mpesa-egress-check`, `mpesa-proxy-verify`.
11. **External wiring:** Co-op Bank must whitelist the new callback URL and the AWS proxy must keep the whitelisted egress IP `13.62.244.124`.

Nothing in the business logic needs to change: the application talks only to tables, views and the RPCs listed above.

---

## 7. Data migration procedure (safe, ID-preserving)

**Principle: schema first, then data in FK order, with `session_replication_role = replica` to avoid trigger side effects.** Never let `finalize_sale_payment`-style logic run during import — importing raw rows must not re-deduct stock or re-award loyalty.

### 7.1 Freeze and export

```bash
# 1. Put the app in read-only mode (disable new sales in the UI / pause POS use).
# 2. Wait for every PENDING payment to reach a terminal state, or accept them as PENDING.
psql "$OLD_DB_URL" -c "select status, count(*) from payments group by 1;"

# 3. Full logical backup (schema + data + auth), custom format
pg_dump "$OLD_DB_URL" -Fc -f wonderaqua_full_$(date +%F).dump

# 4. Readable schema-only reference
pg_dump "$OLD_DB_URL" --schema-only --no-owner --no-privileges -n public -f schema_public.sql

# 5. Data-only per-schema exports
pg_dump "$OLD_DB_URL" --data-only --no-owner -n public -f data_public.sql
pg_dump "$OLD_DB_URL" --data-only --no-owner -n auth -t auth.users -t auth.identities -f data_auth.sql

# 6. Storage (optional): download bucket objects via the Storage API, keep object paths.
```

### 7.2 Import order (respects foreign keys)

```text
auth.users, auth.identities
→ branches, bottle_specifications, suppliers, system_settings, subscription_records
→ profiles, user_roles, user_branch_assignments
→ products, customers, assets, announcements, targets
→ purchases, raw_bottle_inventory, raw_bottle_inventory_logs, production_records
→ sales, sale_items, payments, payment_deletions_audit
→ inventory_logs, loyalty_points, credit_payments
→ stock_adjustments, stock_transfers, vouchers, cash_submissions, cash_reconciliations
```

```bash
psql "$NEW_DB_URL" -c "set session_replication_role = replica;" -f data_public.sql
psql "$NEW_DB_URL" -c "select setval('public.stock_transfer_number_seq', (select coalesce(max(split_part(transfer_number,'-',3)::bigint),0) from public.stock_transfers), true);"
psql "$NEW_DB_URL" -c "set session_replication_role = origin;"
```

Everything is UUID-keyed with explicit `created_at`/`updated_at` values, so a straight `COPY`/`INSERT` preserves IDs, timestamps, relationships, payment history, sales history, inventory history, customer records, production history, loyalty balances (`customers.loyalty_points` + `loyalty_points` ledger) and credit balances (`customers.credit_balance` + `credit_payments` ledger). Do **not** recompute balances after import — the stored aggregates are authoritative.

### 7.3 Post-import repair checks

```sql
-- orphan detection (all must return 0)
select count(*) from sale_items si left join sales s on s.id=si.sale_id where s.id is null;
select count(*) from payments p left join sales s on s.id=p.sale_id where p.sale_id is not null and s.id is null;
select count(*) from loyalty_points l left join customers c on c.id=l.customer_id where c.id is null;

-- balance parity between old and new
select coalesce(sum(credit_balance),0), coalesce(sum(loyalty_points),0) from customers;
select payment_status, count(*), coalesce(sum(final_amount),0) from sales group by 1 order by 1;
```

---

## 8. Environment variables and external dependencies

**No secret values are reproduced here — only names.**

### Frontend (Vite, build-time)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (anon), `VITE_SUPABASE_PROJECT_ID`.

### Server / Edge functions
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEYS`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`.

### Payments / integrations
`COOP_CONFIG_JSON` (Co-op Bank Postman collection: base URLs + Basic auth), `COOP_OPERATOR_CODE`, `COOP_PROXY_BASE_URL`, `COOP_PROXY_SECRET`, `RESEND_API_KEY` (OTP email), `LOVABLE_API_KEY` (AI gateway).

### External services
| Dependency | Purpose | Migration action |
|---|---|---|
| Co-operative Bank OpenAPI (STK push, transaction status) | live payments | re-register callback URL of the new project; keep credentials |
| AWS reverse proxy at the whitelisted IP `13.62.244.124` (nginx, `X-Proxy-Secret`) | fixed egress for the bank whitelist | keep unchanged; only the calling function's base URL changes |
| Resend | OTP / transactional email | re-point sender domain if project changes |
| Supabase GoTrue | authentication | export users, keep UUIDs |
| Supabase Storage | historical export bucket | optional copy |
| Vercel | SPA hosting + `api/*` serverless payment routes | update project env vars |

---

## 9. Post-migration verification checklist

**Structure**
- [ ] 29 tables, 2 views, 18 functions, 14 public triggers, 2 `auth.users` triggers, 6 enums, 1 sequence present.
- [ ] `select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;` returns 0 rows.
- [ ] Policy count per table matches Appendix A.
- [ ] `GRANT`s to `authenticated` / `service_role` exist on every table (PostgREST returns rows, not `permission denied`).
- [ ] All uniques from §1.4 exist (`payments.message_reference`, `sales.idempotency_key`, `products(branch_id, lower(name))`, `stock_transfers.transfer_number`).

**Data**
- [ ] Row counts match the snapshot in Appendix K for every table.
- [ ] `max(created_at)` per table matches the source.
- [ ] Sum of `sales.final_amount` grouped by `payment_status` matches.
- [ ] `customers.credit_balance` and `customers.loyalty_points` totals match.
- [ ] Zero orphans from the queries in §7.3.

**Behaviour (run on a staging copy, never on live money)**
- [ ] Sign in as each role: superadmin, supervisor, cashier, stock_manager — menu and branch visibility match production.
- [ ] A cashier sees only their branch's products, sales and customers.
- [ ] Create a Cash sale → stock decreases by exactly the quantity, one `inventory_logs` OUT row, receipt prints with cashier name.
- [ ] Create an Mpesa sale → sale stays `PENDING`, no stock movement, one `payments` row with a unique `message_reference` and a `correlation_id`.
- [ ] Simulate the callback → sale flips to `PAID`, stock deducted once, loyalty points awarded once.
- [ ] Call `finalize_sale_payment` a second time on the same sale → returns `already_finalized = true`, no double deduction.
- [ ] Manual M-Pesa entry with a 6–50 char reference settles the sale; re-using the same reference on another sale is rejected.
- [ ] Credit sale increases `customers.credit_balance`; a credit payment reduces it and writes `credit_payments`.
- [ ] Production run consumes raw bottles and creates finished stock atomically; insufficient stock raises the expected error.
- [ ] Stock transfer create → receive moves quantity between branches and writes both inventory logs; non-assigned user is rejected.
- [ ] Reports/Dashboard totals exclude PENDING/FAILED sales and match production for the same date range.
- [ ] `/app/payments-trace` renders `payment_health_daily` and `payment_failure_reasons`.
- [ ] New user signup creates a `profiles` row in `pending` status; owner email auto-becomes superadmin.
- [ ] Offline queue replays a queued customer/sale after reconnect.

---

## 10. Rollback plan

1. **Do not decommission the current database.** Keep it running and writable until the new one has passed §9 for a full business day.
2. **Cutover is DNS/config-only:** the app selects its backend purely through `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (frontend) and the function secrets (backend). Rolling back = restoring the previous env values and redeploying the frontend and edge functions.
3. **Freeze window:** perform the cutover during a POS-closed window so no writes land on the old database after the final export. Record the exact cutover timestamp.
4. **If testing fails:**
   - Repoint env vars back to the old project and redeploy (typically < 10 minutes).
   - Re-register the old callback URL with Co-op Bank and re-point `COOP_PROXY_BASE_URL` consumers.
   - Any sales recorded on the new database during the trial must be re-entered manually or back-filled with an ID-preserving `pg_dump --data-only --table=…` of just the affected tables in the order of §7.2.
5. **Backups:** retain `wonderaqua_full_<date>.dump` off-platform for at least 90 days; verify it restores into a scratch database *before* cutover (`pg_restore --list` plus a full restore test).
6. **Point-in-time recovery** on the old project remains the last resort for accidental writes during the trial period.

---

## Appendices — verbatim database introspection

Everything below was generated directly from the live database. Appendix H contains the complete source of every function, so no business logic has to be guessed.

## A. Table-by-table schema

### `announcements`
Rows at documentation time: **4** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| title | text | NO | - |
| message | text | NO | - |
| priority | text | NO | 'Normal'::text |
| target_type | text | NO | 'All Users'::text |
| target_branch_id | uuid | YES | - |
| created_by | uuid | NO | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| expires_at | timestamptz | YES | - |
| is_active | bool | NO | true |

Constraints:

```
announcements_priority_check (c): CHECK ((priority = ANY (ARRAY['Normal'::text, 'Important'::text, 'Critical'::text])))
announcements_target_type_check (c): CHECK ((target_type = ANY (ARRAY['All Users'::text, 'Branch'::text])))
announcements_created_by_fkey (f): FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
announcements_target_branch_id_fkey (f): FOREIGN KEY (target_branch_id) REFERENCES branches(id) ON DELETE SET NULL
announcements_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX announcements_pkey ON public.announcements USING btree (id)
CREATE INDEX idx_announcements_active ON public.announcements USING btree (is_active, expires_at)
CREATE INDEX idx_announcements_created_by ON public.announcements USING btree (created_by)
CREATE INDEX idx_announcements_priority ON public.announcements USING btree (priority, created_at DESC)
CREATE INDEX idx_announcements_target_branch ON public.announcements USING btree (target_branch_id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Announcements deletable by admins and own creators | DELETE | {authenticated} | (is_admin(auth.uid()) OR (has_role(auth.uid(), 'supervisor'::app_role) AND (created_by = auth.uid()))) | - |
| Announcements insertable by admins and supervisors | INSERT | {authenticated} | - | (is_admin(auth.uid()) OR has_role(auth.uid(), 'supervisor'::app_role)) |
| Announcements updatable by admins and own creators | UPDATE | {authenticated} | (is_admin(auth.uid()) OR (has_role(auth.uid(), 'supervisor'::app_role) AND (created_by = auth.uid()))) | (is_admin(auth.uid()) OR (has_role(auth.uid(), 'supervisor'::app_role) AND (created_by = auth.uid()))) |
| Announcements viewable by authenticated | SELECT | {authenticated} | ((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now())) AND ((target_type = 'All Users'::text) OR ((target_type = 'Branch'::text) AND (target_branch_id IN ( SELECT ub.branch_id    FROM user_branch_assignments ub   WHERE (ub.user_id = auth.uid())))))) | - |

### `assets`
Rows at documentation time: **0** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | - |
| description | text | YES | - |
| category | text | NO | 'equipment'::text |
| value | numeric | NO | 0 |
| status | text | NO | 'active'::text |
| branch_id | uuid | YES | - |
| acquired_date | date | YES | CURRENT_DATE |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
assets_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id)
assets_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX assets_pkey ON public.assets USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Assets deletable by admins | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Assets insertable by admins | INSERT | {authenticated} | - | is_admin(auth.uid()) |
| Assets updatable by admins | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Assets viewable by authenticated | SELECT | {authenticated} | true | - |

### `bottle_specifications`
Rows at documentation time: **4** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| category | text | NO | - |
| bottle_size | text | NO | - |
| display_name | text | NO | - |
| bottles_per_bale | int4 | YES | - |
| is_active | bool | NO | true |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
bottle_specifications_bottle_size_check (c): CHECK ((bottle_size = ANY (ARRAY['1L'::text, '500ml'::text])))
bottle_specifications_bottles_per_bale_check (c): CHECK (((bottles_per_bale IS NULL) OR (bottles_per_bale > 0)))
bottle_specifications_category_check (c): CHECK ((category = ANY (ARRAY['executive'::text, 'economy'::text])))
bottle_specifications_pkey (p): PRIMARY KEY (id)
bottle_specifications_category_bottle_size_key (u): UNIQUE (category, bottle_size)
```

Indexes:

```
CREATE UNIQUE INDEX bottle_specifications_category_bottle_size_key ON public.bottle_specifications USING btree (category, bottle_size)
CREATE UNIQUE INDEX bottle_specifications_pkey ON public.bottle_specifications USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins manage bottle specifications | ALL | {authenticated} | is_admin(auth.uid()) | is_admin(auth.uid()) |
| Bottle specifications viewable by authenticated | SELECT | {authenticated} | true | - |
| Bottle specs insertable by admins | INSERT | {authenticated} | - | is_admin(auth.uid()) |
| Bottle specs updatable by admins | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Bottle specs viewable by authenticated | SELECT | {authenticated} | true | - |

### `branches`
Rows at documentation time: **4** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | - |
| location | text | YES | - |
| phone | text | YES | - |
| is_active | bool | NO | true |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| is_factory | bool | NO | false |

Constraints:

```
branches_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX branches_one_factory_idx ON public.branches USING btree (is_factory) WHERE is_factory
CREATE UNIQUE INDEX branches_pkey ON public.branches USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can delete branches | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Admins can insert branches | INSERT | {authenticated} | - | is_admin(auth.uid()) |
| Admins can update branches | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Branches viewable by authenticated | SELECT | {authenticated} | true | - |

### `cash_reconciliations`
Rows at documentation time: **1** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| branch_id | uuid | NO | - |
| cashier_id | uuid | NO | - |
| shift | text | NO | - |
| reconciliation_date | date | NO | CURRENT_DATE |
| expected_data | jsonb | NO | '{}'::jsonb |
| expected_total | numeric | NO | 0 |
| actual_data | jsonb | NO | '{}'::jsonb |
| actual_total | numeric | NO | 0 |
| difference | numeric | NO | 0 |
| status | text | NO | - |
| transaction_charges | numeric | NO | 0 |
| remarks | text | YES | - |
| approval_status | reconciliation_status | NO | 'Pending'::reconciliation_status |
| approved_by | uuid | YES | - |
| approved_at | timestamptz | YES | - |
| rejection_reason | text | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
cash_reconciliations_shift_check (c): CHECK ((shift = ANY (ARRAY['Morning'::text, 'Evening'::text])))
cash_reconciliations_status_check (c): CHECK ((status = ANY (ARRAY['BALANCED'::text, 'SURPLUS'::text, 'DEFICIT'::text])))
cash_reconciliations_approved_by_fkey (f): FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL
cash_reconciliations_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
cash_reconciliations_cashier_id_fkey (f): FOREIGN KEY (cashier_id) REFERENCES auth.users(id) ON DELETE CASCADE
cash_reconciliations_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX cash_reconciliations_pkey ON public.cash_reconciliations USING btree (id)
CREATE INDEX idx_cash_reconciliations_branch ON public.cash_reconciliations USING btree (branch_id)
CREATE INDEX idx_cash_reconciliations_date ON public.cash_reconciliations USING btree (reconciliation_date DESC)
CREATE INDEX idx_cash_reconciliations_shift ON public.cash_reconciliations USING btree (shift)
CREATE INDEX idx_cash_reconciliations_status ON public.cash_reconciliations USING btree (approval_status)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Cashiers can insert reconciliations | INSERT | {authenticated} | - | ((auth.uid() = cashier_id) AND (EXISTS ( SELECT 1    FROM user_roles   WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['cashier'::app_role, 'supervisor'::app_role, 'superadmin'::app_role])))))) |
| Reconciliations viewable by authenticated | SELECT | {authenticated} | true | - |
| Supervisors and admins can update (approve/reject) | UPDATE | {authenticated} | is_admin(auth.uid()) | - |

### `cash_submissions`
Rows at documentation time: **0** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| cashier_id | uuid | NO | - |
| branch_id | uuid | YES | - |
| shift_date | date | NO | CURRENT_DATE |
| cash_amount | numeric | NO | 0 |
| mpesa_amount | numeric | NO | 0 |
| credit_amount | numeric | NO | 0 |
| total_amount | numeric | NO | 0 |
| notes | text | YES | - |
| status | text | NO | 'pending'::text |
| validated_by | uuid | YES | - |
| validated_at | timestamptz | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
cash_submissions_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id)
cash_submissions_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX cash_submissions_pkey ON public.cash_submissions USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can update cash submissions | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Admins can view all cash submissions | SELECT | {public} | is_admin(auth.uid()) | - |
| Cash submissions insertable by authenticated | INSERT | {authenticated} | - | true |
| Users can view cash submissions in their branches | SELECT | {public} | (branch_id IN ( SELECT user_branch_assignments.branch_id    FROM user_branch_assignments   WHERE (user_branch_assignments.user_id = auth.uid()))) | - |

### `credit_payments`
Rows at documentation time: **12** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| customer_id | uuid | NO | - |
| amount | numeric | NO | - |
| payment_mode | text | NO | 'Cash'::text |
| mpesa_receipt | text | YES | - |
| notes | text | YES | - |
| recorded_by | uuid | YES | - |
| branch_id | uuid | YES | - |
| balance_after | numeric | NO | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
credit_payments_amount_check (c): CHECK ((amount > (0)::numeric))
credit_payments_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id)
credit_payments_customer_id_fkey (f): FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
credit_payments_recorded_by_fkey (f): FOREIGN KEY (recorded_by) REFERENCES auth.users(id)
credit_payments_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX credit_payments_pkey ON public.credit_payments USING btree (id)
CREATE INDEX idx_credit_payments_customer ON public.credit_payments USING btree (customer_id, created_at DESC)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can delete credit payments | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Admins can update credit payments | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Authenticated users can insert credit payments | INSERT | {authenticated} | - | (auth.uid() IS NOT NULL) |
| Authenticated users can view credit payments | SELECT | {authenticated} | true | - |

### `customers`
Rows at documentation time: **116** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | - |
| phone | text | YES | - |
| notes | text | YES | - |
| credit_balance | numeric | NO | 0 |
| loyalty_points | int4 | NO | 0 |
| branch_id | uuid | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| email | text | YES | - |
| address | text | YES | - |
| customer_type | text | NO | 'regular'::text |

Constraints:

```
customers_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
customers_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX customers_email_unique ON public.customers USING btree (email) WHERE ((email IS NOT NULL) AND (email <> ''::text))
CREATE UNIQUE INDEX customers_phone_unique ON public.customers USING btree (phone) WHERE ((phone IS NOT NULL) AND (phone <> ''::text))
CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can view all customers | SELECT | {public} | is_admin(auth.uid()) | - |
| Customers deletable by admins | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Customers insertable by authenticated | INSERT | {authenticated} | - | true |
| Customers updatable by authenticated | UPDATE | {authenticated} | true | - |
| Users can view customers in their branches | SELECT | {public} | (branch_id IN ( SELECT user_branch_assignments.branch_id    FROM user_branch_assignments   WHERE (user_branch_assignments.user_id = auth.uid()))) | - |

### `inventory_logs`
Rows at documentation time: **1616** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| product_id | uuid | NO | - |
| product_name | text | NO | - |
| type | text | NO | - |
| quantity | int4 | NO | - |
| reference | text | YES | - |
| branch_id | uuid | YES | - |
| date | timestamptz | NO | now() |
| created_at | timestamptz | NO | now() |

Constraints:

```
inventory_logs_type_check (c): CHECK ((type = ANY (ARRAY['IN'::text, 'OUT'::text])))
inventory_logs_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
inventory_logs_product_id_fkey (f): FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
inventory_logs_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX inventory_logs_pkey ON public.inventory_logs USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Inventory logs insertable by authenticated | INSERT | {authenticated} | - | true |
| Inventory logs viewable by authenticated | SELECT | {authenticated} | true | - |

### `loyalty_points`
Rows at documentation time: **52** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| customer_id | uuid | NO | - |
| sale_id | uuid | YES | - |
| points | int4 | NO | - |
| description | text | YES | - |
| created_at | timestamptz | NO | now() |

Constraints:

```
loyalty_points_customer_id_fkey (f): FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
loyalty_points_sale_id_fkey (f): FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
loyalty_points_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX loyalty_points_pkey ON public.loyalty_points USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Loyalty points insertable by authenticated | INSERT | {authenticated} | - | true |
| Loyalty points viewable by authenticated | SELECT | {authenticated} | true | - |

### `payment_deletions_audit`
Rows at documentation time: **22** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| payment_id | uuid | NO | - |
| message_reference | text | YES | - |
| correlation_id | text | YES | - |
| sale_id | uuid | YES | - |
| amount | numeric | YES | - |
| status | text | YES | - |
| deleted_by | uuid | YES | - |
| deleted_at | timestamptz | NO | now() |
| snapshot | jsonb | YES | - |

Constraints:

```
payment_deletions_audit_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX payment_deletions_audit_pkey ON public.payment_deletions_audit USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Audit insertable by superadmin | INSERT | {authenticated} | - | (has_role(auth.uid(), 'superadmin'::app_role) AND (deleted_by = auth.uid())) |
| Audit viewable by superadmin | SELECT | {authenticated} | has_role(auth.uid(), 'superadmin'::app_role) | - |

### `payment_failure_reasons`
Rows at documentation time: **?** · RLS: **?**
| Column | Type | Nullable | Default |
|---|---|---|---|
| error_category | text | YES | - |
| occurrences | int8 | YES | - |
| last_7_days | int8 | YES | - |
| last_24_hours | int8 | YES | - |
| last_seen | timestamptz | YES | - |
| latest_description | text | YES | - |

### `payment_health_daily`
Rows at documentation time: **?** · RLS: **?**
| Column | Type | Nullable | Default |
|---|---|---|---|
| day | date | YES | - |
| total_attempts | int8 | YES | - |
| successful | int8 | YES | - |
| failed | int8 | YES | - |
| still_pending | int8 | YES | - |
| success_rate | numeric | YES | - |
| provider_failure_rate | numeric | YES | - |
| avg_completion_seconds | numeric | YES | - |
| max_completion_seconds | numeric | YES | - |
| retried_attempts | int8 | YES | - |
| retried_successful | int8 | YES | - |

### `payments`
Rows at documentation time: **1167** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| provider | text | NO | 'coop'::text |
| amount | numeric | NO | 0 |
| phone_number | text | NO | - |
| message_reference | text | NO | - |
| transaction_currency | text | NO | 'KES'::text |
| status | text | NO | 'PENDING'::text |
| transaction_date | timestamptz | YES | - |
| result_code | text | YES | - |
| result_description | text | YES | - |
| sale_id | uuid | YES | - |
| narration | text | YES | - |
| operator_code | text | YES | - |
| raw_request | jsonb | YES | - |
| raw_payload | jsonb | YES | - |
| initiated_by | uuid | YES | - |
| branch_id | uuid | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| correlation_id | text | YES | - |
| payment_method | text | YES | - |
| payment_source | text | YES | - |
| mpesa_receipt | text | YES | - |
| payment_time | timestamptz | YES | - |
| notes | text | YES | - |
| entered_by | uuid | YES | - |
| error_category | text | YES | - |
| attempt_count | int4 | NO | 1 |
| last_attempt_at | timestamptz | YES | - |
| completed_at | timestamptz | YES | - |

Constraints:

```
payments_pkey (p): PRIMARY KEY (id)
payments_message_reference_key (u): UNIQUE (message_reference)
```

Indexes:

```
CREATE INDEX idx_payments_sale_id ON public.payments USING btree (sale_id)
CREATE INDEX payments_category_created_idx ON public.payments USING btree (error_category, created_at DESC)
CREATE INDEX payments_correlation_idx ON public.payments USING btree (correlation_id)
CREATE UNIQUE INDEX payments_manual_mpesa_receipt_unique ON public.payments USING btree (mpesa_receipt) WHERE ((payment_method = 'MPESA_MANUAL'::text) AND (mpesa_receipt IS NOT NULL))
CREATE UNIQUE INDEX payments_message_reference_key ON public.payments USING btree (message_reference)
CREATE INDEX payments_pending_recovery_idx ON public.payments USING btree (created_at) WHERE (status = 'PENDING'::text)
CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id)
CREATE INDEX payments_sale_status_idx ON public.payments USING btree (sale_id, status)
CREATE INDEX payments_status_created_idx ON public.payments USING btree (status, created_at DESC)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Payments cancellable when pending | UPDATE | {authenticated} | (status = 'PENDING'::text) | (status = ANY (ARRAY['PENDING'::text, 'CANCELLED'::text])) |
| Payments deletable by superadmin | DELETE | {authenticated} | has_role(auth.uid(), 'superadmin'::app_role) | - |
| Payments insertable by service role | INSERT | {service_role} | - | true |
| Payments updatable by service role | UPDATE | {service_role} | true | - |
| Payments viewable by authenticated | SELECT | {authenticated} | true | - |

### `production_records`
Rows at documentation time: **0** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| production_date | date | NO | CURRENT_DATE |
| bales | int4 | NO | 0 |
| total_bottles | int4 | NO | 0 |
| faulty_bottles | int4 | NO | 0 |
| good_bottles | int4 | NO | 0 |
| economy_bottles | int4 | NO | 0 |
| executive_bottles | int4 | NO | 0 |
| economy_packs | int4 | NO | 0 |
| executive_packs | int4 | NO | 0 |
| loose_bottles | int4 | NO | 0 |
| economy_allocation | numeric | NO | 50 |
| expected_revenue | numeric | NO | 0 |
| branch_id | uuid | YES | - |
| recorded_by | uuid | NO | - |
| notes | text | YES | - |
| created_at | timestamptz | NO | now() |
| raw_bottle_specification_id | uuid | YES | - |
| finished_product_id | uuid | YES | - |
| raw_bottles_consumed | int4 | YES | - |
| good_bottles_created | int4 | YES | - |

Constraints:

```
production_records_qty_valid (c): CHECK (((total_bottles >= 0) AND (faulty_bottles >= 0) AND (good_bottles >= 0) AND (faulty_bottles <= total_bottles)))
production_records_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id)
production_records_finished_product_id_fkey (f): FOREIGN KEY (finished_product_id) REFERENCES products(id) ON DELETE RESTRICT
production_records_raw_bottle_specification_id_fkey (f): FOREIGN KEY (raw_bottle_specification_id) REFERENCES bottle_specifications(id) ON DELETE RESTRICT
production_records_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX production_records_pkey ON public.production_records USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Production records deletable by admins | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Production records insertable by admins and stock managers | INSERT | {authenticated} | - | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) |
| Production records viewable by authenticated | SELECT | {authenticated} | true | - |

### `products`
Rows at documentation time: **86** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | - |
| bottle_size | text | NO | - |
| buying_price | numeric | NO | 0 |
| selling_price | numeric | NO | 0 |
| quantity | int4 | NO | 0 |
| low_stock_threshold | int4 | NO | 5 |
| branch_id | uuid | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| bales | int4 | NO | 0 |
| packs | int4 | NO | 0 |
| faulty_bottles | int4 | NO | 0 |
| bottles_per_bale | int4 | NO | 90 |
| bottles_per_pack | int4 | NO | 12 |
| bottle_specification_id | uuid | YES | - |

Constraints:

```
products_bottle_specification_id_fkey (f): FOREIGN KEY (bottle_specification_id) REFERENCES bottle_specifications(id) ON DELETE SET NULL
products_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
products_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX products_name_branch_unique ON public.products USING btree (branch_id, lower(name))
CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Products deletable by admins | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Products insertable by admins and stock managers | INSERT | {authenticated} | - | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) |
| Products updatable by admins and stock managers | UPDATE | {authenticated} | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) | - |
| Products viewable by authenticated | SELECT | {authenticated} | true | - |

### `profiles`
Rows at documentation time: **9** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| full_name | text | NO | - |
| phone | text | YES | - |
| status | approval_status | NO | 'pending'::approval_status |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
profiles_user_id_fkey (f): FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
profiles_pkey (p): PRIMARY KEY (id)
profiles_user_id_key (u): UNIQUE (user_id)
```

Indexes:

```
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)
CREATE UNIQUE INDEX profiles_user_id_key ON public.profiles USING btree (user_id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can update any profile | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Admins can view all profiles | SELECT | {public} | is_admin(auth.uid()) | - |
| Users can insert own profile | INSERT | {authenticated} | - | (auth.uid() = user_id) |
| Users can update own profile | UPDATE | {authenticated} | (auth.uid() = user_id) | - |
| Users can view their own profile | SELECT | {public} | (auth.uid() = user_id) | - |

### `purchases`
Rows at documentation time: **0** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| supplier_id | uuid | YES | - |
| supplier_name | text | NO | - |
| product_id | uuid | YES | - |
| product_name | text | NO | - |
| quantity | int4 | NO | - |
| buying_price | numeric | NO | - |
| total_cost | numeric | NO | - |
| payment_mode | payment_mode | NO | 'Cash'::payment_mode |
| branch_id | uuid | YES | - |
| recorded_by | uuid | YES | - |
| date | timestamptz | NO | now() |
| created_at | timestamptz | NO | now() |
| raw_bottle_specification_id | uuid | YES | - |
| purchase_unit | text | YES | - |
| bales_purchased | int4 | YES | - |
| bottles_received | int4 | YES | - |

Constraints:

```
purchases_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
purchases_product_id_fkey (f): FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
purchases_raw_bottle_specification_id_fkey (f): FOREIGN KEY (raw_bottle_specification_id) REFERENCES bottle_specifications(id) ON DELETE RESTRICT
purchases_recorded_by_fkey (f): FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL
purchases_supplier_id_fkey (f): FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
purchases_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX purchases_pkey ON public.purchases USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can view all purchases | SELECT | {public} | is_admin(auth.uid()) | - |
| Purchases insertable by admins and stock managers | INSERT | {authenticated} | - | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) |
| Users can view purchases in their branches | SELECT | {public} | (branch_id IN ( SELECT user_branch_assignments.branch_id    FROM user_branch_assignments   WHERE (user_branch_assignments.user_id = auth.uid()))) | - |

### `raw_bottle_inventory`
Rows at documentation time: **2** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| branch_id | uuid | NO | - |
| bottle_specification_id | uuid | NO | - |
| quantity_bottles | int4 | NO | 0 |
| updated_at | timestamptz | NO | now() |

Constraints:

```
raw_bottle_inventory_qty_nonneg (c): CHECK ((quantity_bottles >= 0))
raw_bottle_inventory_quantity_bottles_check (c): CHECK ((quantity_bottles >= 0))
raw_bottle_inventory_bottle_specification_id_fkey (f): FOREIGN KEY (bottle_specification_id) REFERENCES bottle_specifications(id) ON DELETE RESTRICT
raw_bottle_inventory_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
raw_bottle_inventory_pkey (p): PRIMARY KEY (id)
raw_bottle_inventory_branch_id_bottle_specification_id_key (u): UNIQUE (branch_id, bottle_specification_id)
```

Indexes:

```
CREATE UNIQUE INDEX raw_bottle_inventory_branch_id_bottle_specification_id_key ON public.raw_bottle_inventory USING btree (branch_id, bottle_specification_id)
CREATE UNIQUE INDEX raw_bottle_inventory_pkey ON public.raw_bottle_inventory USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Raw bottle inventory viewable by authenticated | SELECT | {authenticated} | true | - |
| raw_bottle_inventory_insertable_by_admins_and_stock_managers | INSERT | {authenticated} | - | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) |
| raw_bottle_inventory_updatable_by_admins_and_stock_managers | UPDATE | {authenticated} | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) |

### `raw_bottle_inventory_logs`
Rows at documentation time: **3** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| branch_id | uuid | NO | - |
| bottle_specification_id | uuid | NO | - |
| movement_type | text | NO | - |
| quantity_bottles | int4 | NO | - |
| reference | text | YES | - |
| purchase_id | uuid | YES | - |
| production_record_id | uuid | YES | - |
| recorded_by | uuid | YES | - |
| created_at | timestamptz | NO | now() |

Constraints:

```
raw_bottle_inventory_logs_movement_type_check (c): CHECK ((movement_type = ANY (ARRAY['PURCHASE'::text, 'PRODUCTION_CONSUMPTION'::text, 'BREAKAGE'::text])))
raw_bottle_inventory_logs_quantity_bottles_check (c): CHECK ((quantity_bottles > 0))
raw_bottle_inventory_logs_bottle_specification_id_fkey (f): FOREIGN KEY (bottle_specification_id) REFERENCES bottle_specifications(id) ON DELETE RESTRICT
raw_bottle_inventory_logs_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
raw_bottle_inventory_logs_purchase_id_fkey (f): FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
raw_bottle_inventory_logs_recorded_by_fkey (f): FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL
raw_bottle_inventory_logs_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX raw_bottle_inventory_logs_pkey ON public.raw_bottle_inventory_logs USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Raw bottle logs viewable by authenticated | SELECT | {authenticated} | true | - |
| raw_bottle_inventory_logs_insertable_by_admins_and_stock_manage | INSERT | {authenticated} | - | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) |
| raw_bottle_inventory_logs_updatable_by_admins_and_stock_manager | UPDATE | {authenticated} | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) |

### `sale_items`
Rows at documentation time: **191** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| sale_id | uuid | NO | - |
| product_id | uuid | NO | - |
| product_name | text | NO | - |
| quantity | int4 | NO | - |
| selling_price | numeric | NO | - |
| buying_price | numeric | NO | - |
| total_amount | numeric | NO | - |
| discount_type | discount_type | YES | - |
| discount_value | numeric | NO | 0 |
| discount_amount | numeric | NO | 0 |
| profit | numeric | NO | - |
| branch_id | uuid | YES | - |
| created_at | timestamptz | NO | now() |

Constraints:

```
sale_items_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
sale_items_product_id_fkey (f): FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
sale_items_sale_id_fkey (f): FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
sale_items_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX sale_items_pkey ON public.sale_items USING btree (id)
CREATE INDEX sale_items_product_id_idx ON public.sale_items USING btree (product_id)
CREATE INDEX sale_items_sale_id_idx ON public.sale_items USING btree (sale_id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Sale items insertable by authenticated | INSERT | {authenticated} | - | true |
| Sale items viewable by authenticated | SELECT | {authenticated} | true | - |

### `sales`
Rows at documentation time: **1765** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| customer_id | uuid | YES | - |
| customer_name | text | YES | - |
| product_id | uuid | NO | - |
| product_name | text | NO | - |
| quantity | int4 | NO | - |
| selling_price | numeric | NO | - |
| buying_price | numeric | NO | - |
| discount_type | discount_type | YES | - |
| discount_value | numeric | NO | 0 |
| total_amount | numeric | NO | - |
| discount_amount | numeric | NO | 0 |
| final_amount | numeric | NO | - |
| profit | numeric | NO | - |
| payment_mode | payment_mode | NO | 'Cash'::payment_mode |
| branch_id | uuid | YES | - |
| recorded_by | uuid | YES | - |
| date | timestamptz | NO | now() |
| created_at | timestamptz | NO | now() |
| payment_status | text | NO | 'PAID'::text |
| idempotency_key | text | YES | - |
| inventory_applied | bool | NO | false |

Constraints:

```
sales_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
sales_customer_id_fkey (f): FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
sales_product_id_fkey (f): FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
sales_recorded_by_fkey (f): FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL
sales_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX sales_idempotency_key_unique ON public.sales USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)
CREATE UNIQUE INDEX sales_pkey ON public.sales USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can view all sales | SELECT | {public} | is_admin(auth.uid()) | - |
| Sales cancellable when payment pending | UPDATE | {authenticated} | (payment_status = 'PENDING'::text) | true |
| Sales insertable by authenticated | INSERT | {authenticated} | - | true |
| Sales updatable by service role | UPDATE | {service_role} | true | - |
| Users can view sales in their branches | SELECT | {public} | (branch_id IN ( SELECT user_branch_assignments.branch_id    FROM user_branch_assignments   WHERE (user_branch_assignments.user_id = auth.uid()))) | - |

### `stock_adjustments`
Rows at documentation time: **0** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| product_id | uuid | NO | - |
| product_name | text | NO | - |
| adjustment_type | adjustment_type | NO | - |
| quantity | int4 | NO | - |
| reason | text | YES | - |
| status | approval_status | NO | 'pending'::approval_status |
| requested_by | uuid | NO | - |
| approved_by | uuid | YES | - |
| branch_id | uuid | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
stock_adjustments_approved_by_fkey (f): FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL
stock_adjustments_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
stock_adjustments_product_id_fkey (f): FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
stock_adjustments_requested_by_fkey (f): FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE
stock_adjustments_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX stock_adjustments_pkey ON public.stock_adjustments USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can update stock adjustments | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Stock adjustments insertable by authenticated | INSERT | {authenticated} | - | true |
| Stock adjustments viewable by authenticated | SELECT | {authenticated} | true | - |

### `stock_transfers`
Rows at documentation time: **0** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| transfer_number | text | NO | next_stock_transfer_number() |
| transfer_date | date | NO | CURRENT_DATE |
| from_branch_id | uuid | NO | - |
| to_branch_id | uuid | NO | - |
| product_id | uuid | NO | - |
| product_name | text | NO | - |
| quantity | int4 | NO | - |
| remarks | text | YES | - |
| status | text | NO | 'PENDING'::text |
| created_by | uuid | NO | - |
| approved_by | uuid | YES | - |
| received_by | uuid | YES | - |
| received_at | timestamptz | YES | - |
| cancelled_by | uuid | YES | - |
| cancelled_at | timestamptz | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
stock_transfers_check (c): CHECK ((from_branch_id <> to_branch_id))
stock_transfers_quantity_check (c): CHECK ((quantity > 0))
stock_transfers_status_check (c): CHECK ((status = ANY (ARRAY['PENDING'::text, 'RECEIVED'::text, 'CANCELLED'::text])))
stock_transfers_approved_by_fkey (f): FOREIGN KEY (approved_by) REFERENCES auth.users(id)
stock_transfers_cancelled_by_fkey (f): FOREIGN KEY (cancelled_by) REFERENCES auth.users(id)
stock_transfers_created_by_fkey (f): FOREIGN KEY (created_by) REFERENCES auth.users(id)
stock_transfers_from_branch_id_fkey (f): FOREIGN KEY (from_branch_id) REFERENCES branches(id)
stock_transfers_product_id_fkey (f): FOREIGN KEY (product_id) REFERENCES products(id)
stock_transfers_received_by_fkey (f): FOREIGN KEY (received_by) REFERENCES auth.users(id)
stock_transfers_to_branch_id_fkey (f): FOREIGN KEY (to_branch_id) REFERENCES branches(id)
stock_transfers_pkey (p): PRIMARY KEY (id)
stock_transfers_transfer_number_key (u): UNIQUE (transfer_number)
```

Indexes:

```
CREATE INDEX stock_transfers_from_branch_idx ON public.stock_transfers USING btree (from_branch_id, created_at DESC)
CREATE UNIQUE INDEX stock_transfers_pkey ON public.stock_transfers USING btree (id)
CREATE INDEX stock_transfers_status_idx ON public.stock_transfers USING btree (status, created_at DESC)
CREATE INDEX stock_transfers_to_branch_idx ON public.stock_transfers USING btree (to_branch_id, created_at DESC)
CREATE UNIQUE INDEX stock_transfers_transfer_number_key ON public.stock_transfers USING btree (transfer_number)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Stock transfers viewable by authenticated | SELECT | {authenticated} | true | - |

### `subscription_records`
Rows at documentation time: **1** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| amount | numeric | NO | 1000 |
| purpose | text | NO | 'DATABASE RENEWALS'::text |
| last_payment_date | timestamptz | YES | - |
| next_due_date | timestamptz | NO | - |
| status | text | NO | 'active'::text |
| payment_reference | text | YES | - |
| grace_period_days | int4 | NO | 7 |
| billing_cycle | text | NO | 'monthly'::text |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
subscription_records_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX subscription_records_pkey ON public.subscription_records USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Subscription deletable by superadmin | DELETE | {authenticated} | has_role(auth.uid(), 'superadmin'::app_role) | - |
| Subscription insertable by superadmin | INSERT | {authenticated} | - | has_role(auth.uid(), 'superadmin'::app_role) |
| Subscription updatable by superadmin | UPDATE | {authenticated} | has_role(auth.uid(), 'superadmin'::app_role) | - |
| Subscription viewable by authenticated | SELECT | {authenticated} | true | - |

### `suppliers`
Rows at documentation time: **7** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | - |
| phone | text | YES | - |
| location | text | YES | - |
| notes | text | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
suppliers_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Suppliers deletable by admins | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Suppliers insertable by admins and stock managers | INSERT | {authenticated} | - | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) |
| Suppliers updatable by admins and stock managers | UPDATE | {authenticated} | (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role)) | - |
| Suppliers viewable by authenticated | SELECT | {authenticated} | true | - |

### `system_settings`
Rows at documentation time: **9** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| setting_key | text | NO | - |
| setting_value | text | NO | ''::text |
| is_encrypted | bool | NO | false |
| updated_by | uuid | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Constraints:

```
system_settings_pkey (p): PRIMARY KEY (id)
system_settings_setting_key_key (u): UNIQUE (setting_key)
```

Indexes:

```
CREATE UNIQUE INDEX system_settings_pkey ON public.system_settings USING btree (id)
CREATE UNIQUE INDEX system_settings_setting_key_key ON public.system_settings USING btree (setting_key)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| System settings deletable by superadmin | DELETE | {authenticated} | has_role(auth.uid(), 'superadmin'::app_role) | - |
| System settings insertable by superadmin | INSERT | {authenticated} | - | has_role(auth.uid(), 'superadmin'::app_role) |
| System settings updatable by superadmin | UPDATE | {authenticated} | has_role(auth.uid(), 'superadmin'::app_role) | - |
| System settings viewable by admins | SELECT | {authenticated} | is_admin(auth.uid()) | - |

### `targets`
Rows at documentation time: **0** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| target_type | text | NO | - |
| target_value | numeric | NO | - |
| current_value | numeric | NO | 0 |
| period_start | date | NO | - |
| period_end | date | NO | - |
| branch_id | uuid | YES | - |
| created_by | uuid | NO | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| reward | text | YES | ''::text |
| consequence | text | YES | ''::text |
| period | text | NO | 'monthly'::text |
| expected_profit | numeric | NO | 0 |
| actual_profit | numeric | NO | 0 |

Constraints:

```
targets_target_type_check (c): CHECK ((target_type = ANY (ARRAY['sales'::text, 'inventory'::text])))
targets_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
targets_created_by_fkey (f): FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
targets_user_id_fkey (f): FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
targets_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX targets_pkey ON public.targets USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can delete targets | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Admins can insert targets | INSERT | {authenticated} | - | is_admin(auth.uid()) |
| Admins can update targets | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Targets viewable by authenticated | SELECT | {authenticated} | true | - |

### `user_branch_assignments`
Rows at documentation time: **8** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| branch_id | uuid | NO | - |
| created_at | timestamptz | NO | now() |

Constraints:

```
user_branch_assignments_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
user_branch_assignments_user_id_fkey (f): FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
user_branch_assignments_pkey (p): PRIMARY KEY (id)
user_branch_assignments_user_id_branch_id_key (u): UNIQUE (user_id, branch_id)
```

Indexes:

```
CREATE UNIQUE INDEX user_branch_assignments_pkey ON public.user_branch_assignments USING btree (id)
CREATE UNIQUE INDEX user_branch_assignments_user_id_branch_id_key ON public.user_branch_assignments USING btree (user_id, branch_id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can delete branch assignments | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Admins can insert branch assignments | INSERT | {authenticated} | - | is_admin(auth.uid()) |
| Admins can update branch assignments | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Branch assignments viewable by authenticated | SELECT | {authenticated} | true | - |

### `user_roles`
Rows at documentation time: **9** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| role | app_role | NO | - |
| created_at | timestamptz | NO | now() |

Constraints:

```
user_roles_user_id_fkey (f): FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
user_roles_pkey (p): PRIMARY KEY (id)
user_roles_user_id_role_key (u): UNIQUE (user_id, role)
```

Indexes:

```
CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id)
CREATE UNIQUE INDEX user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can delete roles | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Admins can insert roles | INSERT | {authenticated} | - | is_admin(auth.uid()) |
| Admins can update roles | UPDATE | {authenticated} | is_admin(auth.uid()) | - |
| Roles viewable by authenticated | SELECT | {authenticated} | true | - |

### `vouchers`
Rows at documentation time: **0** · RLS: **ENABLED**
| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| voucher_number | text | NO | - |
| purpose | text | NO | - |
| category | text | NO | 'misc'::text |
| amount | numeric | NO | 0 |
| branch_id | uuid | YES | - |
| recorded_by | uuid | YES | - |
| date | date | NO | CURRENT_DATE |
| notes | text | YES | - |
| created_at | timestamptz | NO | now() |

Constraints:

```
vouchers_branch_id_fkey (f): FOREIGN KEY (branch_id) REFERENCES branches(id)
vouchers_pkey (p): PRIMARY KEY (id)
```

Indexes:

```
CREATE UNIQUE INDEX vouchers_number_unique ON public.vouchers USING btree (voucher_number)
CREATE UNIQUE INDEX vouchers_pkey ON public.vouchers USING btree (id)
```

RLS policies:

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Vouchers deletable by admins | DELETE | {authenticated} | is_admin(auth.uid()) | - |
| Vouchers insertable by admins | INSERT | {authenticated} | - | is_admin(auth.uid()) |
| Vouchers viewable by authenticated | SELECT | {authenticated} | true | - |


## B. Enum types

| Enum | Values |
|---|---|
| adjustment_type | increase, decrease |
| app_role | superadmin, supervisor, cashier, stock_manager |
| approval_status | pending, approved, rejected |
| discount_type | percentage, fixed |
| payment_mode | Cash, Mpesa, Credit |
| reconciliation_status | Pending, Approved, Rejected |


## C. Extensions

| Extension | Version | Schema |
|---|---|---|
| pg_cron | 1.6.4 | pg_catalog |
| pg_net | 0.20.0 | public |
| pg_stat_statements | 1.11 | extensions |
| pgcrypto | 1.3 | extensions |
| plpgsql | 1.0 | pg_catalog |
| supabase_vault | 0.3.1 | vault |
| uuid-ossp | 1.1 | extensions |


## D. Sequences

| Sequence | last_value |
|---|---|
| stock_transfer_number_seq | not yet used |


## E. Views

| View | Definition |
|---|---|
| payment_failure_reasons |  |
| payment_health_daily |  |


## F. Triggers (public schema)

| Table | Trigger | Definition |
|---|---|---|
| announcements | trg_announcements_updated_at | CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION update_announcements_updated_at() |
| bottle_specifications | update_bottle_specifications_updated_at | CREATE TRIGGER update_bottle_specifications_updated_at BEFORE UPDATE ON public.bottle_specifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| branches | update_branches_updated_at | CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| cash_reconciliations | update_cash_reconciliations_updated_at | CREATE TRIGGER update_cash_reconciliations_updated_at BEFORE UPDATE ON public.cash_reconciliations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| credit_payments | update_credit_payments_updated_at | CREATE TRIGGER update_credit_payments_updated_at BEFORE UPDATE ON public.credit_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| customers | update_customers_updated_at | CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| payments | update_payments_updated_at | CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| products | update_products_updated_at | CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| profiles | update_profiles_updated_at | CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| sales | trg_sales_mark_inventory_applied | CREATE TRIGGER trg_sales_mark_inventory_applied BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION sales_mark_inventory_applied() |
| stock_adjustments | update_stock_adjustments_updated_at | CREATE TRIGGER update_stock_adjustments_updated_at BEFORE UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| stock_transfers | update_stock_transfers_updated_at | CREATE TRIGGER update_stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| suppliers | update_suppliers_updated_at | CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| targets | update_targets_updated_at | CREATE TRIGGER update_targets_updated_at BEFORE UPDATE ON public.targets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |


## G. Triggers on auth.users (must be recreated manually)

| Table | Trigger | Definition |
|---|---|---|
| users | on_auth_user_created | CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user() |
| users | on_auth_user_created_superadmin | CREATE TRIGGER on_auth_user_created_superadmin AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_superadmin_assignment() |


## H. Functions / RPCs (full source)

```sql
CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(p_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_transfer public.stock_transfers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDING' THEN RAISE EXCEPTION 'Only pending transfers can be cancelled'; END IF;
  IF NOT public.is_admin(auth.uid()) AND v_transfer.created_by <> auth.uid() THEN RAISE EXCEPTION 'Only the creator or an admin can cancel this transfer'; END IF;
  UPDATE public.stock_transfers SET status = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now() WHERE id = p_transfer_id;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.create_stock_transfer(p_from_branch_id uuid, p_to_branch_id uuid, p_product_id uuid, p_quantity integer, p_remarks text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product_name text;
  v_transfer_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')) THEN
    RAISE EXCEPTION 'Not authorised to create stock transfers';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_from_branch_id IS NULL OR p_to_branch_id IS NULL OR p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Choose different branches and a valid quantity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_from_branch_id AND is_factory) THEN
    RAISE EXCEPTION 'Transfers must originate from the configured Factory branch';
  END IF;
  IF NOT public.is_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.user_branch_assignments
    WHERE user_id = auth.uid() AND branch_id = p_from_branch_id
  ) THEN
    RAISE EXCEPTION 'Stock Managers must be assigned to the Factory branch to create transfers';
  END IF;
  SELECT name INTO v_product_name FROM public.products WHERE id = p_product_id AND branch_id = p_from_branch_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'The selected product is not in Factory inventory';
  END IF;
  INSERT INTO public.stock_transfers (from_branch_id, to_branch_id, product_id, product_name, quantity, remarks, created_by)
  VALUES (p_from_branch_id, p_to_branch_id, p_product_id, v_product_name, p_quantity, NULLIF(trim(p_remarks), ''), auth.uid())
  RETURNING id INTO v_transfer_id;
  RETURN v_transfer_id;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.finalize_sale_payment(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_item RECORD;
  v_item_count integer := 0;
  v_points integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF v_sale.inventory_applied THEN
    UPDATE public.sales SET payment_status = 'PAID' WHERE id = p_sale_id AND payment_status <> 'PAID';
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'sale_id', p_sale_id);
  END IF;

  SELECT count(*) INTO v_item_count FROM public.sale_items WHERE sale_id = p_sale_id;

  IF v_item_count > 0 THEN
    FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id LOOP
      UPDATE public.products
        SET quantity = GREATEST(0, quantity - v_item.quantity)
        WHERE id = v_item.product_id;
      INSERT INTO public.inventory_logs (product_id, product_name, type, quantity, reference, branch_id, date)
      VALUES (v_item.product_id, v_item.product_name, 'OUT', v_item.quantity,
              'Sale to ' || COALESCE(v_sale.customer_name, 'Walk-in'), v_sale.branch_id, COALESCE(v_sale.date, now()));
    END LOOP;
  ELSE
    UPDATE public.products
      SET quantity = GREATEST(0, quantity - v_sale.quantity)
      WHERE id = v_sale.product_id;
    INSERT INTO public.inventory_logs (product_id, product_name, type, quantity, reference, branch_id, date)
    VALUES (v_sale.product_id, v_sale.product_name, 'OUT', v_sale.quantity,
            'Sale to ' || COALESCE(v_sale.customer_name, 'Walk-in'), v_sale.branch_id, COALESCE(v_sale.date, now()));
  END IF;

  IF v_sale.payment_mode = 'Credit' AND v_sale.customer_id IS NOT NULL THEN
    UPDATE public.customers
      SET credit_balance = credit_balance + v_sale.final_amount
      WHERE id = v_sale.customer_id;
  END IF;

  IF v_sale.customer_id IS NOT NULL THEN
    v_points := floor(COALESCE(v_sale.final_amount, 0) / 100)::int;
    IF v_points > 0 THEN
      INSERT INTO public.loyalty_points (customer_id, sale_id, points, description)
      VALUES (v_sale.customer_id, v_sale.id, v_points, 'Sale ' || left(v_sale.id::text, 8));
      UPDATE public.customers
        SET loyalty_points = COALESCE(loyalty_points, 0) + v_points
        WHERE id = v_sale.customer_id;
    END IF;
  END IF;

  UPDATE public.sales
    SET payment_status = 'PAID', inventory_applied = true
    WHERE id = p_sale_id;

  RETURN jsonb_build_object('ok', true, 'already_finalized', false, 'sale_id', p_sale_id, 'loyalty_points', v_points);
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.get_active_announcements()
 RETURNS SETOF announcements
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.*
  FROM public.announcements a
  WHERE a.is_active = true
    AND (a.expires_at IS NULL OR a.expires_at > now())
    AND (
      a.target_type = 'All Users'
      OR (
        a.target_type = 'Branch'
        AND a.target_branch_id IN (
          SELECT ub.branch_id FROM public.user_branch_assignments ub WHERE ub.user_id = auth.uid()
        )
      )
    )
  ORDER BY
    CASE a.priority
      WHEN 'Critical' THEN 0
      WHEN 'Important' THEN 1
      WHEN 'Normal' THEN 2
    END,
    a.created_at DESC;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
 RETURNS SETOF app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.handle_superadmin_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if the new user is the system owner
  IF NEW.email = 'tituswaweru631@gmail.com' THEN
    -- Auto-approve profile
    UPDATE public.profiles SET status = 'approved' WHERE user_id = NEW.id;
    
    -- Auto-assign superadmin role (if not already assigned)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'superadmin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin', 'supervisor')
  )
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.next_stock_transfer_number()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT 'TRF-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.stock_transfer_number_seq')::text, 6, '0');
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.receive_stock_transfer(p_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer public.stock_transfers%ROWTYPE;
  v_source public.products%ROWTYPE;
  v_destination_product_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDING' THEN RAISE EXCEPTION 'Only pending transfers can be received'; END IF;
  IF NOT public.is_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.user_branch_assignments
    WHERE user_id = auth.uid() AND branch_id = v_transfer.to_branch_id
  ) THEN
    RAISE EXCEPTION 'Only an assigned user at the destination branch can receive this transfer';
  END IF;
  SELECT * INTO v_source FROM public.products WHERE id = v_transfer.product_id FOR UPDATE;
  IF NOT FOUND OR v_source.branch_id <> v_transfer.from_branch_id THEN RAISE EXCEPTION 'Factory product no longer exists'; END IF;
  IF v_source.quantity < v_transfer.quantity THEN
    RAISE EXCEPTION 'Insufficient Factory stock. Available: %, transfer quantity: %', v_source.quantity, v_transfer.quantity;
  END IF;
  SELECT id INTO v_destination_product_id FROM public.products
  WHERE branch_id = v_transfer.to_branch_id AND name = v_source.name AND bottle_size = v_source.bottle_size
    AND bottle_specification_id IS NOT DISTINCT FROM v_source.bottle_specification_id
  LIMIT 1 FOR UPDATE;
  IF v_destination_product_id IS NULL THEN
    INSERT INTO public.products (name, bottle_size, buying_price, selling_price, quantity, low_stock_threshold, branch_id, bottle_specification_id)
    VALUES (v_source.name, v_source.bottle_size, v_source.buying_price, v_source.selling_price, 0, v_source.low_stock_threshold, v_transfer.to_branch_id, v_source.bottle_specification_id)
    RETURNING id INTO v_destination_product_id;
  END IF;
  UPDATE public.products SET quantity = quantity - v_transfer.quantity WHERE id = v_source.id;
  UPDATE public.products SET quantity = quantity + v_transfer.quantity WHERE id = v_destination_product_id;
  INSERT INTO public.inventory_logs (product_id, product_name, type, quantity, reference, branch_id, date)
  VALUES
    (v_source.id, v_source.name, 'OUT', v_transfer.quantity, 'Transfer ' || v_transfer.transfer_number || ' to branch', v_transfer.from_branch_id, now()),
    (v_destination_product_id, v_source.name, 'IN', v_transfer.quantity, 'Transfer ' || v_transfer.transfer_number || ' received from Factory', v_transfer.to_branch_id, now());
  UPDATE public.stock_transfers SET status = 'RECEIVED', received_by = auth.uid(), received_at = now() WHERE id = p_transfer_id;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.record_bottle_production(p_bottle_specification_id uuid, p_finished_product_id uuid, p_processed integer, p_faulty integer, p_branch_id uuid, p_recorded_by uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available integer;
  v_good integer;
  v_record_id uuid;
  v_product_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')) THEN
    RAISE EXCEPTION 'Not authorised to record production';
  END IF;
  IF p_branch_id IS NULL OR p_processed IS NULL OR p_processed < 1 OR p_faulty IS NULL OR p_faulty < 0 OR p_faulty > p_processed THEN
    RAISE EXCEPTION 'Invalid production quantities or branch';
  END IF;
  SELECT quantity_bottles INTO v_available FROM public.raw_bottle_inventory
    WHERE branch_id = p_branch_id AND bottle_specification_id = p_bottle_specification_id FOR UPDATE;
  IF COALESCE(v_available, 0) < p_processed THEN
    RAISE EXCEPTION 'Insufficient raw bottles. Available: %, requested: %', COALESCE(v_available, 0), p_processed;
  END IF;
  SELECT name INTO v_product_name FROM public.products
    WHERE id = p_finished_product_id AND branch_id = p_branch_id AND bottle_specification_id = p_bottle_specification_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Select a finished product mapped to the same bottle specification and branch';
  END IF;
  v_good := p_processed - p_faulty;
  UPDATE public.raw_bottle_inventory SET quantity_bottles = quantity_bottles - p_processed, updated_at = now()
    WHERE branch_id = p_branch_id AND bottle_specification_id = p_bottle_specification_id;
  INSERT INTO public.production_records (production_date, bales, total_bottles, faulty_bottles, good_bottles, economy_bottles, executive_bottles, economy_packs, executive_packs, loose_bottles, economy_allocation, expected_revenue, branch_id, recorded_by, notes, raw_bottle_specification_id, finished_product_id, raw_bottles_consumed, good_bottles_created)
  VALUES (CURRENT_DATE, 0, p_processed, p_faulty, v_good, 0, 0, 0, 0, 0, 0, 0, p_branch_id, p_recorded_by, p_notes, p_bottle_specification_id, p_finished_product_id, p_processed, v_good)
  RETURNING id INTO v_record_id;
  INSERT INTO public.raw_bottle_inventory_logs (branch_id, bottle_specification_id, movement_type, quantity_bottles, reference, production_record_id, recorded_by)
  VALUES (p_branch_id, p_bottle_specification_id, 'PRODUCTION_CONSUMPTION', p_processed, 'Production run', v_record_id, p_recorded_by);
  IF p_faulty > 0 THEN
    INSERT INTO public.raw_bottle_inventory_logs (branch_id, bottle_specification_id, movement_type, quantity_bottles, reference, production_record_id, recorded_by)
    VALUES (p_branch_id, p_bottle_specification_id, 'BREAKAGE', p_faulty, 'Faulty / broken bottles in production', v_record_id, p_recorded_by);
  END IF;
  UPDATE public.products SET quantity = quantity + v_good WHERE id = p_finished_product_id;
  INSERT INTO public.inventory_logs (product_id, product_name, type, quantity, reference, branch_id, date)
  VALUES (p_finished_product_id, v_product_name, 'IN', v_good, 'Production run: ' || v_record_id::text, p_branch_id, now());
  RETURN v_record_id;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.record_manual_mpesa_payment(p_sale_id uuid, p_mpesa_receipt text, p_phone_number text, p_amount numeric, p_payment_time timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text, p_message_reference text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
  v_sale public.sales%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_ref text;
  v_payment_id uuid;
  v_finalize jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_code := upper(trim(COALESCE(p_mpesa_receipt, '')));
  IF v_code !~ '^[A-Z0-9-]{6,50}$' THEN
    RAISE EXCEPTION 'Enter a valid payment reference (6-50 letters, numbers or hyphens)';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF COALESCE(trim(p_phone_number), '') = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  SELECT * INTO v_existing
  FROM public.payments
  WHERE payment_method = 'MPESA_MANUAL' AND mpesa_receipt = v_code
  LIMIT 1;

  IF FOUND AND v_existing.sale_id IS DISTINCT FROM p_sale_id THEN
    RAISE EXCEPTION 'That payment reference has already been recorded for another sale';
  END IF;

  IF FOUND THEN
    v_payment_id := v_existing.id;
    UPDATE public.payments
      SET status = 'SUCCESS', amount = p_amount, phone_number = trim(p_phone_number),
          payment_time = p_payment_time, transaction_date = p_payment_time,
          notes = p_notes, completed_at = COALESCE(completed_at, now()),
          error_category = 'SUCCESS', updated_at = now()
      WHERE id = v_payment_id;
  ELSE
    IF p_message_reference IS NOT NULL THEN
      SELECT * INTO v_existing FROM public.payments WHERE message_reference = p_message_reference LIMIT 1;
    END IF;

    IF FOUND AND p_message_reference IS NOT NULL THEN
      v_payment_id := v_existing.id;
      UPDATE public.payments
        SET status = 'SUCCESS', payment_method = 'MPESA_MANUAL', payment_source = 'Manual Entry',
            mpesa_receipt = v_code, amount = p_amount, phone_number = trim(p_phone_number),
            payment_time = p_payment_time, transaction_date = p_payment_time,
            result_code = '0', result_description = 'Manual M-Pesa entry',
            error_category = 'SUCCESS', completed_at = COALESCE(completed_at, now()),
            notes = p_notes, entered_by = auth.uid(), sale_id = p_sale_id, updated_at = now()
        WHERE id = v_payment_id;
    ELSE
      v_ref := 'MANUAL-' || upper(left(p_sale_id::text, 8)) || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
      INSERT INTO public.payments (
        provider, sale_id, message_reference, transaction_currency, initiated_by, branch_id,
        narration, status, payment_method, payment_source, mpesa_receipt, amount, phone_number,
        payment_time, transaction_date, result_code, result_description, notes, entered_by,
        error_category, completed_at
      ) VALUES (
        'coop', p_sale_id, v_ref, 'KES', auth.uid(), COALESCE(p_branch_id, v_sale.branch_id),
        'Manual M-Pesa ' || v_code, 'SUCCESS', 'MPESA_MANUAL', 'Manual Entry', v_code, p_amount,
        trim(p_phone_number), p_payment_time, p_payment_time, '0', 'Manual M-Pesa entry', p_notes, auth.uid(),
        'SUCCESS', now()
      )
      RETURNING id INTO v_payment_id;
    END IF;
  END IF;

  UPDATE public.payments
    SET status = 'CANCELLED',
        result_description = COALESCE(result_description, '') || ' | Superseded by manual M-Pesa entry',
        updated_at = now()
    WHERE sale_id = p_sale_id AND id <> v_payment_id AND status = 'PENDING';

  v_finalize := public.finalize_sale_payment(p_sale_id);

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'mpesa_receipt', v_code, 'finalize', v_finalize);
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.record_raw_bottle_purchase(p_supplier_id uuid, p_supplier_name text, p_bottle_specification_id uuid, p_bales integer, p_buying_price numeric, p_payment_mode payment_mode, p_branch_id uuid, p_recorded_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bottles_per_bale integer;
  v_bottles integer;
  v_purchase_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')) THEN
    RAISE EXCEPTION 'Not authorised to record raw bottle purchases';
  END IF;
  IF p_bales IS NULL OR p_bales < 1 OR p_buying_price IS NULL OR p_buying_price < 0 OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch, bale quantity, and buying price are required';
  END IF;
  SELECT bottles_per_bale INTO v_bottles_per_bale FROM public.bottle_specifications
    WHERE id = p_bottle_specification_id AND is_active = true;
  IF v_bottles_per_bale IS NULL THEN
    RAISE EXCEPTION 'Bottles per bale has not been configured for this bottle type';
  END IF;
  v_bottles := p_bales * v_bottles_per_bale;
  INSERT INTO public.purchases (supplier_id, supplier_name, product_id, product_name, quantity, buying_price, total_cost, payment_mode, branch_id, recorded_by, date, raw_bottle_specification_id, purchase_unit, bales_purchased, bottles_received)
  SELECT p_supplier_id, p_supplier_name, NULL, bs.display_name || ' empty bottles', p_bales, p_buying_price, p_bales * p_buying_price, p_payment_mode, p_branch_id, p_recorded_by, now(), bs.id, 'BALE', p_bales, v_bottles
  FROM public.bottle_specifications bs WHERE bs.id = p_bottle_specification_id
  RETURNING id INTO v_purchase_id;
  INSERT INTO public.raw_bottle_inventory (branch_id, bottle_specification_id, quantity_bottles)
  VALUES (p_branch_id, p_bottle_specification_id, v_bottles)
  ON CONFLICT (branch_id, bottle_specification_id)
  DO UPDATE SET quantity_bottles = public.raw_bottle_inventory.quantity_bottles + EXCLUDED.quantity_bottles, updated_at = now();
  INSERT INTO public.raw_bottle_inventory_logs (branch_id, bottle_specification_id, movement_type, quantity_bottles, reference, purchase_id, recorded_by)
  VALUES (p_branch_id, p_bottle_specification_id, 'PURCHASE', v_bottles, 'Raw bottle purchase', v_purchase_id, p_recorded_by);
  RETURN v_purchase_id;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.sales_mark_inventory_applied()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Sales created already PAID are settled by the client flow that inserted them.
  IF NEW.payment_status = 'PAID' THEN
    NEW.inventory_applied := true;
  END IF;
  RETURN NEW;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.set_factory_branch(p_branch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'Only a superadmin can set the factory branch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active) THEN
    RAISE EXCEPTION 'Choose an active branch';
  END IF;
  UPDATE public.branches SET is_factory = false WHERE is_factory = true;
  UPDATE public.branches SET is_factory = true WHERE id = p_branch_id;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.update_announcements_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
```


## I. Storage buckets

| Bucket id | Name | Visibility | Size limit | Created |
|---|---|---|---|---|
| database_export_11_07_26 | database_export_11_07_26 | private | - | 2026-07-11 06:46:18.212262+00 |


Object counts: database_export_11_07_26 = 1


## J. Storage RLS policies

| Table | Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|---|


## K. Row counts snapshot

| Table | Rows |
|---|---|
| announcements | 4 |
| assets | 0 |
| bottle_specifications | 4 |
| branches | 4 |
| cash_reconciliations | 1 |
| cash_submissions | 0 |
| credit_payments | 12 |
| customers | 116 |
| inventory_logs | 1616 |
| loyalty_points | 52 |
| payment_deletions_audit | 22 |
| payments | 1167 |
| production_records | 0 |
| products | 86 |
| profiles | 9 |
| purchases | 0 |
| raw_bottle_inventory | 2 |
| raw_bottle_inventory_logs | 3 |
| sale_items | 191 |
| sales | 1765 |
| stock_adjustments | 0 |
| stock_transfers | 0 |
| subscription_records | 1 |
| suppliers | 7 |
| system_settings | 9 |
| targets | 0 |
| user_branch_assignments | 8 |
| user_roles | 9 |
| vouchers | 0 |
