-- M-Banking Reconciliation Module
-- Stores cashier reconciliation records comparing expected vs actual money

-- Status enum for reconciliation workflow
CREATE TYPE public.reconciliation_status AS ENUM ('Pending', 'Approved', 'Rejected');

CREATE TABLE public.cash_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift TEXT NOT NULL CHECK (shift IN ('Morning', 'Evening')),
  reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Expected values (SNAPSHOTTED at submission time — never recalculated)
  -- JSONB structure: { "Cash": 0, "Mpesa": 0, "KCB": 0, "COOP": 0, "Equity": 0, "Family": 0 }
  -- JSONB allows any payment method without schema changes
  expected_data JSONB NOT NULL DEFAULT '{}',
  expected_total NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Actual values (cashier enters)
  actual_data JSONB NOT NULL DEFAULT '{}',
  actual_total NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Calculations
  difference NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('BALANCED', 'SURPLUS', 'DEFICIT')),

  -- Meta
  transaction_charges NUMERIC(10,2) NOT NULL DEFAULT 0,
  remarks TEXT,

  -- Workflow
  approval_status reconciliation_status NOT NULL DEFAULT 'Pending',
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cash_reconciliations_date ON public.cash_reconciliations(reconciliation_date DESC);
CREATE INDEX idx_cash_reconciliations_branch ON public.cash_reconciliations(branch_id);
CREATE INDEX idx_cash_reconciliations_shift ON public.cash_reconciliations(shift);
CREATE INDEX idx_cash_reconciliations_status ON public.cash_reconciliations(approval_status);

-- RLS
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reconciliations viewable by authenticated"
  ON public.cash_reconciliations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cashiers can insert reconciliations"
  ON public.cash_reconciliations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = cashier_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('cashier', 'supervisor', 'superadmin')
    )
  );

CREATE POLICY "Supervisors and admins can update (approve/reject)"
  ON public.cash_reconciliations FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_cash_reconciliations_updated_at
  BEFORE UPDATE ON public.cash_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
