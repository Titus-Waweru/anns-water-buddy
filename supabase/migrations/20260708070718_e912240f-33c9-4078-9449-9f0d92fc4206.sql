ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_source text,
  ADD COLUMN IF NOT EXISTS mpesa_receipt text,
  ADD COLUMN IF NOT EXISTS payment_time timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS entered_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS payments_manual_mpesa_receipt_unique
  ON public.payments (mpesa_receipt)
  WHERE payment_method = 'MPESA_MANUAL' AND mpesa_receipt IS NOT NULL;

UPDATE public.payments
SET payment_method = COALESCE(payment_method, 'MPESA_STK'),
    payment_source = COALESCE(payment_source, 'STK Push')
WHERE payment_method IS NULL;