-- Raw Bottle Inventory Foundation
-- Seeds the bottle specifications table and ensures RLS policies exist
-- for the already-existing raw bottle inventory tables.

-- 1. BOTTLE SPECIFICATIONS TABLE
-- Stores the four bottle specifications with configurable bottles-per-bale.
CREATE TABLE IF NOT EXISTS public.bottle_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bottles_per_bale INTEGER NOT NULL DEFAULT 90,
  is_executive BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bottle_specifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bottle specs viewable by authenticated"
  ON public.bottle_specifications FOR SELECT TO authenticated USING (true);

CREATE POLICY "Bottle specs insertable by admins"
  ON public.bottle_specifications FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Bottle specs updatable by admins"
  ON public.bottle_specifications FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_bottle_specifications_updated_at
  BEFORE UPDATE ON public.bottle_specifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the four default bottle specifications
INSERT INTO public.bottle_specifications (category, bottle_size, display_name, bottles_per_bale, is_active) VALUES
  ('executive', '1L', 'Executive 1L', 90, true),
  ('executive', '500ml', 'Executive 500ml', 145, true),
  ('economy', '1L', 'Economy 1L', 90, true),
  ('economy', '500ml', 'Economy 500ml', 145, true)
ON CONFLICT (category, bottle_size) DO NOTHING;
