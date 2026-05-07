
-- Drop legacy M-Pesa table
DROP TABLE IF EXISTS public.mpesa_transactions CASCADE;

-- Create unified payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'coop',
  amount NUMERIC NOT NULL DEFAULT 0,
  phone_number TEXT NOT NULL,
  message_reference TEXT NOT NULL UNIQUE,
  transaction_currency TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'PENDING',
  transaction_date TIMESTAMPTZ,
  result_code TEXT,
  result_description TEXT,
  sale_id UUID,
  narration TEXT,
  operator_code TEXT,
  raw_request JSONB,
  raw_payload JSONB,
  initiated_by UUID,
  branch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_message_reference ON public.payments(message_reference);
CREATE INDEX idx_payments_sale_id ON public.payments(sale_id);
CREATE INDEX idx_payments_status ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payments viewable by authenticated"
  ON public.payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Payments insertable by service role"
  ON public.payments FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Payments updatable by service role"
  ON public.payments FOR UPDATE
  TO service_role
  USING (true);

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add payment_status to sales (default PAID for backward compat)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'PAID';

-- Allow service role to update sales (needed for callback to mark as PAID)
DROP POLICY IF EXISTS "Sales updatable by service role" ON public.sales;
CREATE POLICY "Sales updatable by service role"
  ON public.sales FOR UPDATE
  TO service_role
  USING (true);
