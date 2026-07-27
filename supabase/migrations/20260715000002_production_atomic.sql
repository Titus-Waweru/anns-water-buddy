-- Production Atomic Transaction
-- Wraps the production stock changes in a single atomic database function
-- to ensure inventory consistency.

CREATE OR REPLACE FUNCTION public.process_production(
  p_specification_id UUID,
  p_product_id UUID,
  p_branch_id UUID,
  p_quantity_processed INTEGER,
  p_faulty_bottles INTEGER,
  p_good_bottles INTEGER,
  p_bales INTEGER,
  p_spec_name TEXT,
  p_prod_name TEXT,
  p_recorded_by UUID,
  p_notes TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_record RECORD;
  v_product_record RECORD;
  v_new_raw_qty INTEGER;
  v_new_prod_qty INTEGER;
  v_avg_cost NUMERIC;
  v_production_id UUID;
BEGIN
  -- Lock and read raw_bottle_inventory for this spec + branch
  SELECT * INTO v_inv_record
  FROM public.raw_bottle_inventory
  WHERE bottle_specification_id = p_specification_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No raw inventory found for specification % in branch %', p_specification_id, p_branch_id;
  END IF;

  IF v_inv_record.quantity < p_quantity_processed THEN
    RAISE EXCEPTION 'Insufficient raw inventory. Available: %, Required: %', v_inv_record.quantity, p_quantity_processed;
  END IF;

  -- Lock and read product
  SELECT * INTO v_product_record
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_product_id;
  END IF;

  -- Calculate new quantities
  v_new_raw_qty := v_inv_record.quantity - p_quantity_processed;
  v_new_prod_qty := v_product_record.quantity + p_good_bottles;
  v_avg_cost := v_inv_record.average_cost;

  -- 1. Deduct from raw_bottle_inventory
  UPDATE public.raw_bottle_inventory
  SET quantity = v_new_raw_qty
  WHERE id = v_inv_record.id;

  -- 2. Add good bottles to finished product
  UPDATE public.products
  SET quantity = v_new_prod_qty
  WHERE id = p_product_id;

  -- 3. Record raw bottle inventory log (OUT)
  INSERT INTO public.raw_bottle_inventory_logs (
    specification_id,
    specification_name,
    type,
    quantity,
    bales,
    cost_per_bottle,
    total_cost,
    reference,
    branch_id,
    recorded_by,
    date
  ) VALUES (
    p_specification_id,
    p_spec_name,
    'OUT',
    p_quantity_processed,
    p_bales,
    v_avg_cost,
    v_avg_cost * p_quantity_processed,
    'Production - ' || p_prod_name,
    p_branch_id,
    p_recorded_by,
    now()
  );

  -- 4. Record finished product inventory log (IN)
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
    p_prod_name,
    'IN',
    p_good_bottles,
    'Production from ' || p_spec_name,
    p_branch_id,
    now()
  );

  -- 5. Save production record
  INSERT INTO public.production_records (
    production_date,
    specification_id,
    product_id,
    bales,
    total_bottles,
    faulty_bottles,
    good_bottles,
    economy_bottles,
    executive_bottles,
    economy_packs,
    executive_packs,
    loose_bottles,
    economy_allocation,
    expected_revenue,
    branch_id,
    recorded_by,
    notes
  ) VALUES (
    CURRENT_DATE,
    p_specification_id,
    p_product_id,
    p_bales,
    p_quantity_processed,
    p_faulty_bottles,
    p_good_bottles,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    p_branch_id,
    p_recorded_by,
    p_notes
  )
  RETURNING id INTO v_production_id;

  RETURN v_production_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.process_production TO authenticated;
