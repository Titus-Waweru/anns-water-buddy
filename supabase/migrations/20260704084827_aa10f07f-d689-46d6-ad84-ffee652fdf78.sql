
-- Allow authenticated users to cancel their own PENDING payments and sales
CREATE POLICY "Payments cancellable when pending"
ON public.payments FOR UPDATE
TO authenticated
USING (status = 'PENDING')
WITH CHECK (status IN ('PENDING','CANCELLED'));

CREATE POLICY "Sales cancellable when payment pending"
ON public.sales FOR UPDATE
TO authenticated
USING (payment_status = 'PENDING')
WITH CHECK (true);

-- Superadmins can permanently delete payment trace records
CREATE POLICY "Payments deletable by superadmin"
ON public.payments FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));

-- Audit trail for payment deletions
CREATE TABLE IF NOT EXISTS public.payment_deletions_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  message_reference text,
  correlation_id text,
  sale_id uuid,
  amount numeric,
  status text,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb
);
GRANT SELECT, INSERT ON public.payment_deletions_audit TO authenticated;
GRANT ALL ON public.payment_deletions_audit TO service_role;
ALTER TABLE public.payment_deletions_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit viewable by superadmin"
ON public.payment_deletions_audit FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Audit insertable by superadmin"
ON public.payment_deletions_audit FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin') AND deleted_by = auth.uid());
