-- 1. Tracking columns (all nullable / defaulted — fully backward compatible)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS error_category text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. Backfill categories for existing history
UPDATE public.payments SET error_category = CASE
  WHEN status = 'SUCCESS' THEN 'SUCCESS'
  WHEN result_code = '1032' THEN 'USER_CANCELLED'
  WHEN result_code = '1037' THEN 'USER_TIMEOUT'
  WHEN result_code = '1' THEN 'USER_INSUFFICIENT_FUNDS'
  WHEN result_code IN ('2035','-8') THEN 'USER_ACCOUNT_ISSUE'
  WHEN result_code = '-13' THEN 'REFERENCE_NOT_FOUND'
  WHEN result_code IN ('1025','2029') THEN 'PROVIDER_ERROR'
  WHEN result_code = '2001' THEN 'PROVIDER_CONFIG'
  WHEN result_code IN ('401','403') THEN 'UPSTREAM_AUTH'
  WHEN result_code IN ('500','502','503','504') THEN 'UPSTREAM_UNAVAILABLE'
  WHEN result_description ILIKE '%debit account authorization%' THEN 'USER_ACCOUNT_ISSUE'
  WHEN result_code = '404' THEN 'PROVIDER_ERROR'
  WHEN status = 'CANCELLED' THEN 'USER_CANCELLED'
  WHEN status = 'PENDING' THEN NULL
  ELSE 'UNKNOWN'
END
WHERE error_category IS NULL;

UPDATE public.payments SET completed_at = updated_at
WHERE completed_at IS NULL AND status <> 'PENDING';

-- 3. Index hygiene: two unique indexes + one plain index all covered message_reference
DROP INDEX IF EXISTS public.idx_payments_message_reference;
DROP INDEX IF EXISTS public.payments_message_reference_unique;
DROP INDEX IF EXISTS public.idx_payments_status;

CREATE INDEX IF NOT EXISTS payments_pending_recovery_idx
  ON public.payments (created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS payments_sale_status_idx
  ON public.payments (sale_id, status);
CREATE INDEX IF NOT EXISTS payments_category_created_idx
  ON public.payments (error_category, created_at DESC);

-- 4. Monitoring views (RLS of the caller applies)
CREATE OR REPLACE VIEW public.payment_health_daily
WITH (security_invoker = on) AS
SELECT
  date_trunc('day', created_at)::date AS day,
  count(*) AS total_attempts,
  count(*) FILTER (WHERE status = 'SUCCESS') AS successful,
  count(*) FILTER (WHERE status IN ('FAILED','CANCELLED')) AS failed,
  count(*) FILTER (WHERE status = 'PENDING') AS still_pending,
  round(100.0 * count(*) FILTER (WHERE status = 'SUCCESS') / NULLIF(count(*), 0), 2) AS success_rate,
  round(100.0 * count(*) FILTER (WHERE error_category LIKE 'UPSTREAM%' OR error_category IN ('PROVIDER_ERROR','PROVIDER_CONFIG')) / NULLIF(count(*), 0), 2) AS provider_failure_rate,
  round(avg(EXTRACT(epoch FROM (COALESCE(completed_at, updated_at) - created_at)))
        FILTER (WHERE status = 'SUCCESS')::numeric, 1) AS avg_completion_seconds,
  round(max(EXTRACT(epoch FROM (COALESCE(completed_at, updated_at) - created_at)))
        FILTER (WHERE status = 'SUCCESS')::numeric, 1) AS max_completion_seconds,
  count(*) FILTER (WHERE attempt_count > 1) AS retried_attempts,
  count(*) FILTER (WHERE attempt_count > 1 AND status = 'SUCCESS') AS retried_successful
FROM public.payments
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.payment_failure_reasons
WITH (security_invoker = on) AS
SELECT
  COALESCE(error_category, 'UNCATEGORISED') AS error_category,
  count(*) AS occurrences,
  count(*) FILTER (WHERE created_at > now() - interval '7 days') AS last_7_days,
  count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24_hours,
  max(created_at) AS last_seen,
  (array_agg(result_description ORDER BY created_at DESC))[1] AS latest_description
FROM public.payments
WHERE status <> 'SUCCESS'
GROUP BY 1
ORDER BY 2 DESC;

GRANT SELECT ON public.payment_health_daily TO authenticated;
GRANT SELECT ON public.payment_failure_reasons TO authenticated;
GRANT SELECT ON public.payment_health_daily TO service_role;
GRANT SELECT ON public.payment_failure_reasons TO service_role;