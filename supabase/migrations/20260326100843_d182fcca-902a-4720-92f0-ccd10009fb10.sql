
-- Add email, address, and customer_type columns to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'regular';

-- Add unique constraint on phone to prevent duplicates (only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON public.customers (phone) WHERE phone IS NOT NULL AND phone != '';

-- Add unique constraint on email to prevent duplicates (only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique ON public.customers (email) WHERE email IS NOT NULL AND email != '';
