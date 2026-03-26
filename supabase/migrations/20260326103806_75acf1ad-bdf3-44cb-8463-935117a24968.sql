
-- Cash submissions table for cashier end-of-shift
CREATE TABLE public.cash_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL,
  branch_id uuid REFERENCES public.branches(id),
  shift_date date NOT NULL DEFAULT CURRENT_DATE,
  cash_amount numeric NOT NULL DEFAULT 0,
  mpesa_amount numeric NOT NULL DEFAULT 0,
  credit_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  validated_by uuid,
  validated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cash submissions viewable by authenticated" ON public.cash_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cash submissions insertable by authenticated" ON public.cash_submissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update cash submissions" ON public.cash_submissions FOR UPDATE TO authenticated USING (is_admin(auth.uid()));

-- Assets table
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'equipment',
  value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  branch_id uuid REFERENCES public.branches(id),
  acquired_date date DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assets viewable by authenticated" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Assets insertable by admins" ON public.assets FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Assets updatable by admins" ON public.assets FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Assets deletable by admins" ON public.assets FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Vouchers table
CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number text NOT NULL,
  purpose text NOT NULL,
  category text NOT NULL DEFAULT 'misc',
  amount numeric NOT NULL DEFAULT 0,
  branch_id uuid REFERENCES public.branches(id),
  recorded_by uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX vouchers_number_unique ON public.vouchers (voucher_number);

CREATE POLICY "Vouchers viewable by authenticated" ON public.vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Vouchers insertable by admins" ON public.vouchers FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Vouchers deletable by admins" ON public.vouchers FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Add batch fields to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bales integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS packs integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS faulty_bottles integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bottles_per_bale integer NOT NULL DEFAULT 90;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bottles_per_pack integer NOT NULL DEFAULT 12;
