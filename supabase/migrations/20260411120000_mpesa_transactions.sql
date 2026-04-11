-- Create mpesa_transactions table to store M-PESA STK Push callbacks
CREATE TABLE public.mpesa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL,
  mpesa_receipt_number text NOT NULL UNIQUE,
  phone_number text NOT NULL,
  transaction_date timestamp with time zone NOT NULL,
  result_code integer NOT NULL DEFAULT 0,
  result_description text,
  merchant_request_id text,
  checkout_request_id text,
  raw_callback_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_mpesa_transactions_phone_number ON public.mpesa_transactions(phone_number);
CREATE INDEX idx_mpesa_transactions_receipt_number ON public.mpesa_transactions(mpesa_receipt_number);
CREATE INDEX idx_mpesa_transactions_transaction_date ON public.mpesa_transactions(transaction_date);
CREATE INDEX idx_mpesa_transactions_created_at ON public.mpesa_transactions(created_at);

-- Enable Row Level Security
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow read access to authenticated users
CREATE POLICY "mpesa_transactions_viewable_by_authenticated" 
  ON public.mpesa_transactions 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- RLS Policy: Allow insert for service role (from edge function)
CREATE POLICY "mpesa_transactions_insertable_by_service_role" 
  ON public.mpesa_transactions 
  FOR INSERT 
  TO service_role 
  WITH CHECK (true);

-- RLS Policy: Allow update for service role
CREATE POLICY "mpesa_transactions_updatable_by_service_role" 
  ON public.mpesa_transactions 
  FOR UPDATE 
  TO service_role 
  USING (true);
