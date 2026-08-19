CREATE TABLE IF NOT EXISTS public.password_reset_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON public.password_reset_otps (lower(email), created_at DESC);

GRANT ALL ON public.password_reset_otps TO service_role;

ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;