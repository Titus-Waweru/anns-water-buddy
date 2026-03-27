
-- Add reward, consequence, and period fields to targets table
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS reward text DEFAULT '';
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS consequence text DEFAULT '';
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS period text NOT NULL DEFAULT 'monthly';
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS expected_profit numeric NOT NULL DEFAULT 0;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS actual_profit numeric NOT NULL DEFAULT 0;
