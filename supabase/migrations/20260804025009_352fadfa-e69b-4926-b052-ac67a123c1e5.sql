-- 1. Idempotency marker so a sale's stock can never be deducted twice
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS inventory_applied boolean NOT NULL DEFAULT false;

UPDATE public.sales SET inventory_applied = true WHERE payment_status = 'PAID' AND inventory_applied = false;

CREATE OR REPLACE FUNCTION public.sales_mark_inventory_applied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Sales created already PAID are settled by the client flow that inserted them.
  IF NEW.payment_status = 'PAID' THEN
    NEW.inventory_applied := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_mark_inventory_applied ON public.sales;
CREATE TRIGGER trg_sales_mark_inventory_applied
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sales_mark_inventory_applied();

-- 2. Atomic, idempotent settlement of a pending sale
CREATE OR REPLACE FUNCTION public.finalize_sale_payment(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_item RECORD;
  v_item_count integer := 0;
  v_points integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF v_sale.inventory_applied THEN
    UPDATE public.sales SET payment_status = 'PAID' WHERE id = p_sale_id AND payment_status <> 'PAID';
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'sale_id', p_sale_id);
  END IF;

  SELECT count(*) INTO v_item_count FROM public.sale_items WHERE sale_id = p_sale_id;

  IF v_item_count > 0 THEN
    FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id LOOP
      UPDATE public.products
        SET quantity = GREATEST(0, quantity - v_item.quantity)
        WHERE id = v_item.product_id;
      INSERT INTO public.inventory_logs (product_id, product_name, type, quantity, reference, branch_id, date)
      VALUES (v_item.product_id, v_item.product_name, 'OUT', v_item.quantity,
              'Sale to ' || COALESCE(v_sale.customer_name, 'Walk-in'), v_sale.branch_id, COALESCE(v_sale.date, now()));
    END LOOP;
  ELSE
    UPDATE public.products
      SET quantity = GREATEST(0, quantity - v_sale.quantity)
      WHERE id = v_sale.product_id;
    INSERT INTO public.inventory_logs (product_id, product_name, type, quantity, reference, branch_id, date)
    VALUES (v_sale.product_id, v_sale.product_name, 'OUT', v_sale.quantity,
            'Sale to ' || COALESCE(v_sale.customer_name, 'Walk-in'), v_sale.branch_id, COALESCE(v_sale.date, now()));
  END IF;

  IF v_sale.payment_mode = 'Credit' AND v_sale.customer_id IS NOT NULL THEN
    UPDATE public.customers
      SET credit_balance = credit_balance + v_sale.final_amount
      WHERE id = v_sale.customer_id;
  END IF;

  IF v_sale.customer_id IS NOT NULL THEN
    v_points := floor(COALESCE(v_sale.final_amount, 0) / 100)::int;
    IF v_points > 0 THEN
      INSERT INTO public.loyalty_points (customer_id, sale_id, points, description)
      VALUES (v_sale.customer_id, v_sale.id, v_points, 'Sale ' || left(v_sale.id::text, 8));
      UPDATE public.customers
        SET loyalty_points = COALESCE(loyalty_points, 0) + v_points
        WHERE id = v_sale.customer_id;
    END IF;
  END IF;

  UPDATE public.sales
    SET payment_status = 'PAID', inventory_applied = true
    WHERE id = p_sale_id;

  RETURN jsonb_build_object('ok', true, 'already_finalized', false, 'sale_id', p_sale_id, 'loyalty_points', v_points);
END;
$$;

-- 3. Manual M-Pesa entry: single atomic transaction
CREATE OR REPLACE FUNCTION public.record_manual_mpesa_payment(
  p_sale_id uuid,
  p_mpesa_receipt text,
  p_phone_number text,
  p_amount numeric,
  p_payment_time timestamptz DEFAULT now(),
  p_notes text DEFAULT NULL,
  p_message_reference text DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_sale public.sales%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_ref text;
  v_payment_id uuid;
  v_finalize jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_code := upper(trim(COALESCE(p_mpesa_receipt, '')));
  IF v_code !~ '^[A-Z0-9]{10}$' THEN
    RAISE EXCEPTION 'Enter a valid 10-character M-Pesa transaction code';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF COALESCE(trim(p_phone_number), '') = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  -- Duplicate guard: same receipt may only ever settle one sale
  SELECT * INTO v_existing
  FROM public.payments
  WHERE payment_method = 'MPESA_MANUAL' AND mpesa_receipt = v_code
  LIMIT 1;

  IF FOUND AND v_existing.sale_id IS DISTINCT FROM p_sale_id THEN
    RAISE EXCEPTION 'That M-Pesa transaction code has already been recorded for another sale';
  END IF;

  IF FOUND THEN
    v_payment_id := v_existing.id;
    UPDATE public.payments
      SET status = 'SUCCESS', amount = p_amount, phone_number = trim(p_phone_number),
          payment_time = p_payment_time, transaction_date = p_payment_time,
          notes = p_notes, updated_at = now()
      WHERE id = v_payment_id;
  ELSE
    -- Reuse the pending STK payment row when one exists, otherwise create a fresh row
    IF p_message_reference IS NOT NULL THEN
      SELECT * INTO v_existing FROM public.payments WHERE message_reference = p_message_reference LIMIT 1;
    END IF;

    IF FOUND AND p_message_reference IS NOT NULL THEN
      v_payment_id := v_existing.id;
      UPDATE public.payments
        SET status = 'SUCCESS', payment_method = 'MPESA_MANUAL', payment_source = 'Manual Entry',
            mpesa_receipt = v_code, amount = p_amount, phone_number = trim(p_phone_number),
            payment_time = p_payment_time, transaction_date = p_payment_time,
            result_code = '0', result_description = 'Manual M-Pesa entry',
            notes = p_notes, entered_by = auth.uid(), sale_id = p_sale_id, updated_at = now()
        WHERE id = v_payment_id;
    ELSE
      v_ref := 'MANUAL-' || upper(left(p_sale_id::text, 8)) || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
      INSERT INTO public.payments (
        provider, sale_id, message_reference, transaction_currency, initiated_by, branch_id,
        narration, status, payment_method, payment_source, mpesa_receipt, amount, phone_number,
        payment_time, transaction_date, result_code, result_description, notes, entered_by
      ) VALUES (
        'coop', p_sale_id, v_ref, 'KES', auth.uid(), COALESCE(p_branch_id, v_sale.branch_id),
        'Manual M-Pesa ' || v_code, 'SUCCESS', 'MPESA_MANUAL', 'Manual Entry', v_code, p_amount,
        trim(p_phone_number), p_payment_time, p_payment_time, '0', 'Manual M-Pesa entry', p_notes, auth.uid()
      )
      RETURNING id INTO v_payment_id;
    END IF;
  END IF;

  -- Resolve any other outstanding attempts against this sale
  UPDATE public.payments
    SET status = 'CANCELLED',
        result_description = COALESCE(result_description, '') || ' | Superseded by manual M-Pesa entry',
        updated_at = now()
    WHERE sale_id = p_sale_id AND id <> v_payment_id AND status = 'PENDING';

  v_finalize := public.finalize_sale_payment(p_sale_id);

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'mpesa_receipt', v_code, 'finalize', v_finalize);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_sale_payment(uuid) FROM public;
REVOKE ALL ON FUNCTION public.record_manual_mpesa_payment(uuid, text, text, numeric, timestamptz, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_sale_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_mpesa_payment(uuid, text, text, numeric, timestamptz, text, text, uuid) TO authenticated;

-- 4. Remove the broken legacy production function (references columns that do not exist).
DROP FUNCTION IF EXISTS public.process_production(uuid, uuid, uuid, integer, integer, integer, integer, text, text, uuid, text);

-- 5. Production integrity guards
ALTER TABLE public.raw_bottle_inventory
  DROP CONSTRAINT IF EXISTS raw_bottle_inventory_qty_nonneg;
ALTER TABLE public.raw_bottle_inventory
  ADD CONSTRAINT raw_bottle_inventory_qty_nonneg CHECK (quantity_bottles >= 0);

ALTER TABLE public.production_records
  DROP CONSTRAINT IF EXISTS production_records_qty_valid;
ALTER TABLE public.production_records
  ADD CONSTRAINT production_records_qty_valid CHECK (
    total_bottles >= 0 AND faulty_bottles >= 0 AND good_bottles >= 0 AND faulty_bottles <= total_bottles
  );