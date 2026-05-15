
CREATE UNIQUE INDEX IF NOT EXISTS payments_message_reference_unique
  ON public.payments (message_reference);

CREATE UNIQUE INDEX IF NOT EXISTS products_name_branch_unique
  ON public.products (branch_id, lower(name));

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS sales_idempotency_key_unique
  ON public.sales (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
