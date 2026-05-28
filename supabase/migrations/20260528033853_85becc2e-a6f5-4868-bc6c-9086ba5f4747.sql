
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS correlation_id text;
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON public.payments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_correlation_idx ON public.payments (correlation_id);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
