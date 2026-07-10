
CREATE TABLE public.credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL DEFAULT 'Cash',
  mpesa_receipt TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  branch_id UUID REFERENCES public.branches(id),
  balance_after NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_payments TO authenticated;
GRANT ALL ON public.credit_payments TO service_role;

ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view credit payments"
  ON public.credit_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert credit payments"
  ON public.credit_payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update credit payments"
  ON public.credit_payments FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete credit payments"
  ON public.credit_payments FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_credit_payments_customer ON public.credit_payments(customer_id, created_at DESC);

CREATE TRIGGER update_credit_payments_updated_at
  BEFORE UPDATE ON public.credit_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
