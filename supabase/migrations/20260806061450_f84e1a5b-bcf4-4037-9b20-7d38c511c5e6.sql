CREATE OR REPLACE FUNCTION public.record_manual_mpesa_payment(p_sale_id uuid, p_mpesa_receipt text, p_phone_number text, p_amount numeric, p_payment_time timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text, p_message_reference text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_code !~ '^[A-Z0-9-]{6,50}$' THEN
    RAISE EXCEPTION 'Enter a valid payment reference (6-50 letters, numbers or hyphens)';
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

  SELECT * INTO v_existing
  FROM public.payments
  WHERE payment_method = 'MPESA_MANUAL' AND mpesa_receipt = v_code
  LIMIT 1;

  IF FOUND AND v_existing.sale_id IS DISTINCT FROM p_sale_id THEN
    RAISE EXCEPTION 'That payment reference has already been recorded for another sale';
  END IF;

  IF FOUND THEN
    v_payment_id := v_existing.id;
    UPDATE public.payments
      SET status = 'SUCCESS', amount = p_amount, phone_number = trim(p_phone_number),
          payment_time = p_payment_time, transaction_date = p_payment_time,
          notes = p_notes, completed_at = COALESCE(completed_at, now()),
          error_category = 'SUCCESS', updated_at = now()
      WHERE id = v_payment_id;
  ELSE
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
            error_category = 'SUCCESS', completed_at = COALESCE(completed_at, now()),
            notes = p_notes, entered_by = auth.uid(), sale_id = p_sale_id, updated_at = now()
        WHERE id = v_payment_id;
    ELSE
      v_ref := 'MANUAL-' || upper(left(p_sale_id::text, 8)) || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS');
      INSERT INTO public.payments (
        provider, sale_id, message_reference, transaction_currency, initiated_by, branch_id,
        narration, status, payment_method, payment_source, mpesa_receipt, amount, phone_number,
        payment_time, transaction_date, result_code, result_description, notes, entered_by,
        error_category, completed_at
      ) VALUES (
        'coop', p_sale_id, v_ref, 'KES', auth.uid(), COALESCE(p_branch_id, v_sale.branch_id),
        'Manual M-Pesa ' || v_code, 'SUCCESS', 'MPESA_MANUAL', 'Manual Entry', v_code, p_amount,
        trim(p_phone_number), p_payment_time, p_payment_time, '0', 'Manual M-Pesa entry', p_notes, auth.uid(),
        'SUCCESS', now()
      )
      RETURNING id INTO v_payment_id;
    END IF;
  END IF;

  UPDATE public.payments
    SET status = 'CANCELLED',
        result_description = COALESCE(result_description, '') || ' | Superseded by manual M-Pesa entry',
        updated_at = now()
    WHERE sale_id = p_sale_id AND id <> v_payment_id AND status = 'PENDING';

  v_finalize := public.finalize_sale_payment(p_sale_id);

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'mpesa_receipt', v_code, 'finalize', v_finalize);
END;
$function$;