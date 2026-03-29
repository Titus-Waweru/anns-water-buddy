
-- Production records table
CREATE TABLE public.production_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bales INTEGER NOT NULL DEFAULT 0,
  total_bottles INTEGER NOT NULL DEFAULT 0,
  faulty_bottles INTEGER NOT NULL DEFAULT 0,
  good_bottles INTEGER NOT NULL DEFAULT 0,
  economy_bottles INTEGER NOT NULL DEFAULT 0,
  executive_bottles INTEGER NOT NULL DEFAULT 0,
  economy_packs INTEGER NOT NULL DEFAULT 0,
  executive_packs INTEGER NOT NULL DEFAULT 0,
  loose_bottles INTEGER NOT NULL DEFAULT 0,
  economy_allocation NUMERIC NOT NULL DEFAULT 50,
  expected_revenue NUMERIC NOT NULL DEFAULT 0,
  branch_id UUID REFERENCES public.branches(id),
  recorded_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Production records viewable by authenticated" ON public.production_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Production records insertable by admins and stock managers" ON public.production_records FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'stock_manager'::app_role));
CREATE POLICY "Production records deletable by admins" ON public.production_records FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- System settings table (for M-Pesa creds, pricing config, countdown, etc.)
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL DEFAULT '',
  is_encrypted BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System settings viewable by admins" ON public.system_settings FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "System settings insertable by superadmin" ON public.system_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "System settings updatable by superadmin" ON public.system_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "System settings deletable by superadmin" ON public.system_settings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
