
CREATE TABLE public.subscription_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL DEFAULT 1000,
  purpose text NOT NULL DEFAULT 'DATABASE RENEWALS',
  last_payment_date timestamp with time zone,
  next_due_date timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'active',
  payment_reference text,
  grace_period_days integer NOT NULL DEFAULT 7,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subscription viewable by authenticated" ON public.subscription_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Subscription insertable by superadmin" ON public.subscription_records FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Subscription updatable by superadmin" ON public.subscription_records FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Subscription deletable by superadmin" ON public.subscription_records FOR DELETE TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
