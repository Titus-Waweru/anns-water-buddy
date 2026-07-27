-- Stock Transfers for Factory → Branch Distribution
-- Tracks movement of finished products between branches

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  source_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  destination_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  transferred_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock transfers viewable by authenticated"
  ON public.stock_transfers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Stock transfers insertable by admins and stock managers"
  ON public.stock_transfers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::app_role));

CREATE INDEX idx_stock_transfers_source ON public.stock_transfers(source_branch_id, created_at DESC);
CREATE INDEX idx_stock_transfers_destination ON public.stock_transfers(destination_branch_id, created_at DESC);

-- Atomic function to process a stock transfer
CREATE OR REPLACE FUNCTION public.process_stock_transfer(
  p_product_id UUID,
  p_product_name TEXT,
  p_quantity INTEGER,
  p_source_branch_id UUID,
  p_destination_branch_id UUID,
  p_transferred_by UUID,
  p_notes TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_product RECORD;
  v_dest_product RECORD;
  v_transfer_id UUID;
BEGIN
  -- Validate source and destination are different
  IF p_source_branch_id = p_destination_branch_id THEN
    RAISE EXCEPTION 'Source and destination branches cannot be the same';
  END IF;

  -- Lock and read source product
  SELECT * INTO v_source_product
  FROM public.products
  WHERE id = p_product_id
    AND branch_id = p_source_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found in source branch';
  END IF;

  IF v_source_product.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock in source branch. Available: %, Required: %', v_source_product.quantity, p_quantity;
  END IF;

  -- Lock and read/create destination product
  SELECT * INTO v_dest_product
  FROM public.products
  WHERE name = p_product_name
    AND branch_id = p_destination_branch_id
  FOR UPDATE;

  -- 1. Reduce source branch stock
  UPDATE public.products
  SET quantity = v_source_product.quantity - p_quantity
  WHERE id = v_source_product.id;

  -- 2. Increase destination branch stock (upsert by name + branch_id)
  IF v_dest_product.id IS NOT NULL THEN
    UPDATE public.products
    SET quantity = v_dest_product.quantity + p_quantity
    WHERE id = v_dest_product.id;
  ELSE
    INSERT INTO public.products (
      name,
      bottle_size,
      buying_price,
      selling_price,
      quantity,
      low_stock_threshold,
      branch_id
    ) VALUES (
      v_source_product.name,
      v_source_product.bottle_size,
      v_source_product.buying_price,
      v_source_product.selling_price,
      p_quantity,
      v_source_product.low_stock_threshold,
      p_destination_branch_id
    );
  END IF;

  -- 3. Record OUT movement for source branch
  INSERT INTO public.inventory_logs (
    product_id,
    product_name,
    type,
    quantity,
    reference,
    branch_id,
    date
  ) VALUES (
    p_product_id,
    p_product_name,
    'OUT',
    p_quantity,
    'Transfer to branch',
    p_source_branch_id,
    now()
  );

  -- 4. Record IN movement for destination branch
  INSERT INTO public.inventory_logs (
    product_id,
    product_name,
    type,
    quantity,
    reference,
    branch_id,
    date
  ) VALUES (
    p_product_id,
    p_product_name,
    'IN',
    p_quantity,
    'Transfer from factory',
    p_destination_branch_id,
    now()
  );

  -- 5. Save transfer record
  INSERT INTO public.stock_transfers (
    product_id,
    product_name,
    quantity,
    source_branch_id,
    destination_branch_id,
    transferred_by,
    notes
  ) VALUES (
    p_product_id,
    p_product_name,
    p_quantity,
    p_source_branch_id,
    p_destination_branch_id,
    p_transferred_by,
    p_notes
  )
  RETURNING id INTO v_transfer_id;

  RETURN v_transfer_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.process_stock_transfer TO authenticated;
