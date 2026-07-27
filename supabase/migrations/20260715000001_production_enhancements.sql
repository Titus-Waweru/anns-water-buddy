-- Production Enhancements
-- Adds specification_id and product_id to production_records
-- to link production runs to bottle specifications and finished products.

ALTER TABLE public.production_records
  ADD COLUMN IF NOT EXISTS specification_id UUID REFERENCES public.bottle_specifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
