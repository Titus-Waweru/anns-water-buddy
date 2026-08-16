--
-- PostgreSQL database dump
--

\restrict 8RxRJyLa9ptNzJNPou0LQ5dhyRE3JFIaYsPieX7QgG7zbD1xUtXxgChvWYbQ8Vr

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: adjustment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.adjustment_type AS ENUM (
    'increase',
    'decrease'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'superadmin',
    'supervisor',
    'cashier',
    'stock_manager'
);


--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: discount_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.discount_type AS ENUM (
    'percentage',
    'fixed'
);


--
-- Name: payment_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_mode AS ENUM (
    'Cash',
    'Mpesa',
    'Credit'
);


--
-- Name: reconciliation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_status AS ENUM (
    'Pending',
    'Approved',
    'Rejected'
);


--
-- Name: cancel_stock_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_stock_transfer(p_transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_transfer public.stock_transfers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDING' THEN RAISE EXCEPTION 'Only pending transfers can be cancelled'; END IF;
  IF NOT public.is_admin(auth.uid()) AND v_transfer.created_by <> auth.uid() THEN RAISE EXCEPTION 'Only the creator or an admin can cancel this transfer'; END IF;
  UPDATE public.stock_transfers SET status = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now() WHERE id = p_transfer_id;
END;
$$;


--
-- Name: create_stock_transfer(uuid, uuid, uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_stock_transfer(p_from_branch_id uuid, p_to_branch_id uuid, p_product_id uuid, p_quantity integer, p_remarks text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_product_name text;
  v_transfer_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')) THEN
    RAISE EXCEPTION 'Not authorised to create stock transfers';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_from_branch_id IS NULL OR p_to_branch_id IS NULL OR p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Choose different branches and a valid quantity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_from_branch_id AND is_factory) THEN
    RAISE EXCEPTION 'Transfers must originate from the configured Factory branch';
  END IF;
  IF NOT public.is_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.user_branch_assignments
    WHERE user_id = auth.uid() AND branch_id = p_from_branch_id
  ) THEN
    RAISE EXCEPTION 'Stock Managers must be assigned to the Factory branch to create transfers';
  END IF;
  SELECT name INTO v_product_name FROM public.products WHERE id = p_product_id AND branch_id = p_from_branch_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'The selected product is not in Factory inventory';
  END IF;
  INSERT INTO public.stock_transfers (from_branch_id, to_branch_id, product_id, product_name, quantity, remarks, created_by)
  VALUES (p_from_branch_id, p_to_branch_id, p_product_id, v_product_name, p_quantity, NULLIF(trim(p_remarks), ''), auth.uid())
  RETURNING id INTO v_transfer_id;
  RETURN v_transfer_id;
END;
$$;


--
-- Name: finalize_sale_payment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_sale_payment(p_sale_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    priority text DEFAULT 'Normal'::text NOT NULL,
    target_type text DEFAULT 'All Users'::text NOT NULL,
    target_branch_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT announcements_priority_check CHECK ((priority = ANY (ARRAY['Normal'::text, 'Important'::text, 'Critical'::text]))),
    CONSTRAINT announcements_target_type_check CHECK ((target_type = ANY (ARRAY['All Users'::text, 'Branch'::text])))
);


--
-- Name: get_active_announcements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_announcements() RETURNS SETOF public.announcements
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT a.*
  FROM public.announcements a
  WHERE a.is_active = true
    AND (a.expires_at IS NULL OR a.expires_at > now())
    AND (
      a.target_type = 'All Users'
      OR (
        a.target_type = 'Branch'
        AND a.target_branch_id IN (
          SELECT ub.branch_id FROM public.user_branch_assignments ub WHERE ub.user_id = auth.uid()
        )
      )
    )
  ORDER BY
    CASE a.priority
      WHEN 'Critical' THEN 0
      WHEN 'Important' THEN 1
      WHEN 'Normal' THEN 2
    END,
    a.created_at DESC;
$$;


--
-- Name: get_user_roles(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_roles(_user_id uuid) RETURNS SETOF public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;


--
-- Name: handle_superadmin_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_superadmin_assignment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Check if the new user is the system owner
  IF NEW.email = 'tituswaweru631@gmail.com' THEN
    -- Auto-approve profile
    UPDATE public.profiles SET status = 'approved' WHERE user_id = NEW.id;
    
    -- Auto-assign superadmin role (if not already assigned)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'superadmin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin', 'supervisor')
  )
$$;


--
-- Name: next_stock_transfer_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_stock_transfer_number() RETURNS text
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  SELECT 'TRF-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.stock_transfer_number_seq')::text, 6, '0');
$$;


--
-- Name: receive_stock_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.receive_stock_transfer(p_transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_transfer public.stock_transfers%ROWTYPE;
  v_source public.products%ROWTYPE;
  v_destination_product_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDING' THEN RAISE EXCEPTION 'Only pending transfers can be received'; END IF;
  IF NOT public.is_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.user_branch_assignments
    WHERE user_id = auth.uid() AND branch_id = v_transfer.to_branch_id
  ) THEN
    RAISE EXCEPTION 'Only an assigned user at the destination branch can receive this transfer';
  END IF;
  SELECT * INTO v_source FROM public.products WHERE id = v_transfer.product_id FOR UPDATE;
  IF NOT FOUND OR v_source.branch_id <> v_transfer.from_branch_id THEN RAISE EXCEPTION 'Factory product no longer exists'; END IF;
  IF v_source.quantity < v_transfer.quantity THEN
    RAISE EXCEPTION 'Insufficient Factory stock. Available: %, transfer quantity: %', v_source.quantity, v_transfer.quantity;
  END IF;
  SELECT id INTO v_destination_product_id FROM public.products
  WHERE branch_id = v_transfer.to_branch_id AND name = v_source.name AND bottle_size = v_source.bottle_size
    AND bottle_specification_id IS NOT DISTINCT FROM v_source.bottle_specification_id
  LIMIT 1 FOR UPDATE;
  IF v_destination_product_id IS NULL THEN
    INSERT INTO public.products (name, bottle_size, buying_price, selling_price, quantity, low_stock_threshold, branch_id, bottle_specification_id)
    VALUES (v_source.name, v_source.bottle_size, v_source.buying_price, v_source.selling_price, 0, v_source.low_stock_threshold, v_transfer.to_branch_id, v_source.bottle_specification_id)
    RETURNING id INTO v_destination_product_id;
  END IF;
  UPDATE public.products SET quantity = quantity - v_transfer.quantity WHERE id = v_source.id;
  UPDATE public.products SET quantity = quantity + v_transfer.quantity WHERE id = v_destination_product_id;
  INSERT INTO public.inventory_logs (product_id, product_name, type, quantity, reference, branch_id, date)
  VALUES
    (v_source.id, v_source.name, 'OUT', v_transfer.quantity, 'Transfer ' || v_transfer.transfer_number || ' to branch', v_transfer.from_branch_id, now()),
    (v_destination_product_id, v_source.name, 'IN', v_transfer.quantity, 'Transfer ' || v_transfer.transfer_number || ' received from Factory', v_transfer.to_branch_id, now());
  UPDATE public.stock_transfers SET status = 'RECEIVED', received_by = auth.uid(), received_at = now() WHERE id = p_transfer_id;
END;
$$;


--
-- Name: record_bottle_production(uuid, uuid, integer, integer, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_bottle_production(p_bottle_specification_id uuid, p_finished_product_id uuid, p_processed integer, p_faulty integer, p_branch_id uuid, p_recorded_by uuid, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_available integer;
  v_good integer;
  v_record_id uuid;
  v_product_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')) THEN
    RAISE EXCEPTION 'Not authorised to record production';
  END IF;
  IF p_branch_id IS NULL OR p_processed IS NULL OR p_processed < 1 OR p_faulty IS NULL OR p_faulty < 0 OR p_faulty > p_processed THEN
    RAISE EXCEPTION 'Invalid production quantities or branch';
  END IF;
  SELECT quantity_bottles INTO v_available FROM public.raw_bottle_inventory
    WHERE branch_id = p_branch_id AND bottle_specification_id = p_bottle_specification_id FOR UPDATE;
  IF COALESCE(v_available, 0) < p_processed THEN
    RAISE EXCEPTION 'Insufficient raw bottles. Available: %, requested: %', COALESCE(v_available, 0), p_processed;
  END IF;
  SELECT name INTO v_product_name FROM public.products
    WHERE id = p_finished_product_id AND branch_id = p_branch_id AND bottle_specification_id = p_bottle_specification_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Select a finished product mapped to the same bottle specification and branch';
  END IF;
  v_good := p_processed - p_faulty;
  UPDATE public.raw_bottle_inventory SET quantity_bottles = quantity_bottles - p_processed, updated_at = now()
    WHERE branch_id = p_branch_id AND bottle_specification_id = p_bottle_specification_id;
  INSERT INTO public.production_records (production_date, bales, total_bottles, faulty_bottles, good_bottles, economy_bottles, executive_bottles, economy_packs, executive_packs, loose_bottles, economy_allocation, expected_revenue, branch_id, recorded_by, notes, raw_bottle_specification_id, finished_product_id, raw_bottles_consumed, good_bottles_created)
  VALUES (CURRENT_DATE, 0, p_processed, p_faulty, v_good, 0, 0, 0, 0, 0, 0, 0, p_branch_id, p_recorded_by, p_notes, p_bottle_specification_id, p_finished_product_id, p_processed, v_good)
  RETURNING id INTO v_record_id;
  INSERT INTO public.raw_bottle_inventory_logs (branch_id, bottle_specification_id, movement_type, quantity_bottles, reference, production_record_id, recorded_by)
  VALUES (p_branch_id, p_bottle_specification_id, 'PRODUCTION_CONSUMPTION', p_processed, 'Production run', v_record_id, p_recorded_by);
  IF p_faulty > 0 THEN
    INSERT INTO public.raw_bottle_inventory_logs (branch_id, bottle_specification_id, movement_type, quantity_bottles, reference, production_record_id, recorded_by)
    VALUES (p_branch_id, p_bottle_specification_id, 'BREAKAGE', p_faulty, 'Faulty / broken bottles in production', v_record_id, p_recorded_by);
  END IF;
  UPDATE public.products SET quantity = quantity + v_good WHERE id = p_finished_product_id;
  INSERT INTO public.inventory_logs (product_id, product_name, type, quantity, reference, branch_id, date)
  VALUES (p_finished_product_id, v_product_name, 'IN', v_good, 'Production run: ' || v_record_id::text, p_branch_id, now());
  RETURN v_record_id;
END;
$$;


--
-- Name: record_manual_mpesa_payment(uuid, text, text, numeric, timestamp with time zone, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_manual_mpesa_payment(p_sale_id uuid, p_mpesa_receipt text, p_phone_number text, p_amount numeric, p_payment_time timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text, p_message_reference text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: record_raw_bottle_purchase(uuid, text, uuid, integer, numeric, public.payment_mode, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_raw_bottle_purchase(p_supplier_id uuid, p_supplier_name text, p_bottle_specification_id uuid, p_bales integer, p_buying_price numeric, p_payment_mode public.payment_mode, p_branch_id uuid, p_recorded_by uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_bottles_per_bale integer;
  v_bottles integer;
  v_purchase_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')) THEN
    RAISE EXCEPTION 'Not authorised to record raw bottle purchases';
  END IF;
  IF p_bales IS NULL OR p_bales < 1 OR p_buying_price IS NULL OR p_buying_price < 0 OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch, bale quantity, and buying price are required';
  END IF;
  SELECT bottles_per_bale INTO v_bottles_per_bale FROM public.bottle_specifications
    WHERE id = p_bottle_specification_id AND is_active = true;
  IF v_bottles_per_bale IS NULL THEN
    RAISE EXCEPTION 'Bottles per bale has not been configured for this bottle type';
  END IF;
  v_bottles := p_bales * v_bottles_per_bale;
  INSERT INTO public.purchases (supplier_id, supplier_name, product_id, product_name, quantity, buying_price, total_cost, payment_mode, branch_id, recorded_by, date, raw_bottle_specification_id, purchase_unit, bales_purchased, bottles_received)
  SELECT p_supplier_id, p_supplier_name, NULL, bs.display_name || ' empty bottles', p_bales, p_buying_price, p_bales * p_buying_price, p_payment_mode, p_branch_id, p_recorded_by, now(), bs.id, 'BALE', p_bales, v_bottles
  FROM public.bottle_specifications bs WHERE bs.id = p_bottle_specification_id
  RETURNING id INTO v_purchase_id;
  INSERT INTO public.raw_bottle_inventory (branch_id, bottle_specification_id, quantity_bottles)
  VALUES (p_branch_id, p_bottle_specification_id, v_bottles)
  ON CONFLICT (branch_id, bottle_specification_id)
  DO UPDATE SET quantity_bottles = public.raw_bottle_inventory.quantity_bottles + EXCLUDED.quantity_bottles, updated_at = now();
  INSERT INTO public.raw_bottle_inventory_logs (branch_id, bottle_specification_id, movement_type, quantity_bottles, reference, purchase_id, recorded_by)
  VALUES (p_branch_id, p_bottle_specification_id, 'PURCHASE', v_bottles, 'Raw bottle purchase', v_purchase_id, p_recorded_by);
  RETURN v_purchase_id;
END;
$$;


--
-- Name: sales_mark_inventory_applied(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sales_mark_inventory_applied() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Sales created already PAID are settled by the client flow that inserted them.
  IF NEW.payment_status = 'PAID' THEN
    NEW.inventory_applied := true;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_factory_branch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_factory_branch(p_branch_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'Only a superadmin can set the factory branch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active) THEN
    RAISE EXCEPTION 'Choose an active branch';
  END IF;
  UPDATE public.branches SET is_factory = false WHERE is_factory = true;
  UPDATE public.branches SET is_factory = true WHERE id = p_branch_id;
END;
$$;


--
-- Name: update_announcements_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_announcements_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'equipment'::text NOT NULL,
    value numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    branch_id uuid,
    acquired_date date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bottle_specifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bottle_specifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    bottle_size text NOT NULL,
    display_name text NOT NULL,
    bottles_per_bale integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bottle_specifications_bottle_size_check CHECK ((bottle_size = ANY (ARRAY['1L'::text, '500ml'::text]))),
    CONSTRAINT bottle_specifications_bottles_per_bale_check CHECK (((bottles_per_bale IS NULL) OR (bottles_per_bale > 0))),
    CONSTRAINT bottle_specifications_category_check CHECK ((category = ANY (ARRAY['executive'::text, 'economy'::text])))
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_factory boolean DEFAULT false NOT NULL
);


--
-- Name: cash_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    cashier_id uuid NOT NULL,
    shift text NOT NULL,
    reconciliation_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    expected_total numeric(10,2) DEFAULT 0 NOT NULL,
    actual_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    actual_total numeric(10,2) DEFAULT 0 NOT NULL,
    difference numeric(10,2) DEFAULT 0 NOT NULL,
    status text NOT NULL,
    transaction_charges numeric(10,2) DEFAULT 0 NOT NULL,
    remarks text,
    approval_status public.reconciliation_status DEFAULT 'Pending'::public.reconciliation_status NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_reconciliations_shift_check CHECK ((shift = ANY (ARRAY['Morning'::text, 'Evening'::text]))),
    CONSTRAINT cash_reconciliations_status_check CHECK ((status = ANY (ARRAY['BALANCED'::text, 'SURPLUS'::text, 'DEFICIT'::text])))
);


--
-- Name: cash_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cashier_id uuid NOT NULL,
    branch_id uuid,
    shift_date date DEFAULT CURRENT_DATE NOT NULL,
    cash_amount numeric DEFAULT 0 NOT NULL,
    mpesa_amount numeric DEFAULT 0 NOT NULL,
    credit_amount numeric DEFAULT 0 NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    validated_by uuid,
    validated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: credit_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_mode text DEFAULT 'Cash'::text NOT NULL,
    mpesa_receipt text,
    notes text,
    recorded_by uuid,
    branch_id uuid,
    balance_after numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credit_payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    notes text,
    credit_balance numeric(10,2) DEFAULT 0 NOT NULL,
    loyalty_points integer DEFAULT 0 NOT NULL,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    address text,
    customer_type text DEFAULT 'regular'::text NOT NULL
);


--
-- Name: inventory_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    type text NOT NULL,
    quantity integer NOT NULL,
    reference text,
    branch_id uuid,
    date timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_logs_type_check CHECK ((type = ANY (ARRAY['IN'::text, 'OUT'::text])))
);


--
-- Name: loyalty_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    sale_id uuid,
    points integer NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_deletions_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_deletions_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    message_reference text,
    correlation_id text,
    sale_id uuid,
    amount numeric,
    status text,
    deleted_by uuid,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    snapshot jsonb
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'coop'::text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    phone_number text NOT NULL,
    message_reference text NOT NULL,
    transaction_currency text DEFAULT 'KES'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    transaction_date timestamp with time zone,
    result_code text,
    result_description text,
    sale_id uuid,
    narration text,
    operator_code text,
    raw_request jsonb,
    raw_payload jsonb,
    initiated_by uuid,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    correlation_id text,
    payment_method text,
    payment_source text,
    mpesa_receipt text,
    payment_time timestamp with time zone,
    notes text,
    entered_by uuid,
    error_category text,
    attempt_count integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone,
    completed_at timestamp with time zone
);


--
-- Name: payment_failure_reasons; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.payment_failure_reasons WITH (security_invoker='on') AS
 SELECT COALESCE(error_category, 'UNCATEGORISED'::text) AS error_category,
    count(*) AS occurrences,
    count(*) FILTER (WHERE (created_at > (now() - '7 days'::interval))) AS last_7_days,
    count(*) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))) AS last_24_hours,
    max(created_at) AS last_seen,
    (array_agg(result_description ORDER BY created_at DESC))[1] AS latest_description
   FROM public.payments
  WHERE (status <> 'SUCCESS'::text)
  GROUP BY COALESCE(error_category, 'UNCATEGORISED'::text)
  ORDER BY (count(*)) DESC;


--
-- Name: payment_health_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.payment_health_daily WITH (security_invoker='on') AS
 SELECT (date_trunc('day'::text, created_at))::date AS day,
    count(*) AS total_attempts,
    count(*) FILTER (WHERE (status = 'SUCCESS'::text)) AS successful,
    count(*) FILTER (WHERE (status = ANY (ARRAY['FAILED'::text, 'CANCELLED'::text]))) AS failed,
    count(*) FILTER (WHERE (status = 'PENDING'::text)) AS still_pending,
    round(((100.0 * (count(*) FILTER (WHERE (status = 'SUCCESS'::text)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS success_rate,
    round(((100.0 * (count(*) FILTER (WHERE ((error_category ~~ 'UPSTREAM%'::text) OR (error_category = ANY (ARRAY['PROVIDER_ERROR'::text, 'PROVIDER_CONFIG'::text])))))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS provider_failure_rate,
    round(avg(EXTRACT(epoch FROM (COALESCE(completed_at, updated_at) - created_at))) FILTER (WHERE (status = 'SUCCESS'::text)), 1) AS avg_completion_seconds,
    round(max(EXTRACT(epoch FROM (COALESCE(completed_at, updated_at) - created_at))) FILTER (WHERE (status = 'SUCCESS'::text)), 1) AS max_completion_seconds,
    count(*) FILTER (WHERE (attempt_count > 1)) AS retried_attempts,
    count(*) FILTER (WHERE ((attempt_count > 1) AND (status = 'SUCCESS'::text))) AS retried_successful
   FROM public.payments
  GROUP BY ((date_trunc('day'::text, created_at))::date)
  ORDER BY ((date_trunc('day'::text, created_at))::date) DESC;


--
-- Name: production_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_date date DEFAULT CURRENT_DATE NOT NULL,
    bales integer DEFAULT 0 NOT NULL,
    total_bottles integer DEFAULT 0 NOT NULL,
    faulty_bottles integer DEFAULT 0 NOT NULL,
    good_bottles integer DEFAULT 0 NOT NULL,
    economy_bottles integer DEFAULT 0 NOT NULL,
    executive_bottles integer DEFAULT 0 NOT NULL,
    economy_packs integer DEFAULT 0 NOT NULL,
    executive_packs integer DEFAULT 0 NOT NULL,
    loose_bottles integer DEFAULT 0 NOT NULL,
    economy_allocation numeric DEFAULT 50 NOT NULL,
    expected_revenue numeric DEFAULT 0 NOT NULL,
    branch_id uuid,
    recorded_by uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_bottle_specification_id uuid,
    finished_product_id uuid,
    raw_bottles_consumed integer,
    good_bottles_created integer,
    CONSTRAINT production_records_qty_valid CHECK (((total_bottles >= 0) AND (faulty_bottles >= 0) AND (good_bottles >= 0) AND (faulty_bottles <= total_bottles)))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    bottle_size text NOT NULL,
    buying_price numeric(10,2) DEFAULT 0 NOT NULL,
    selling_price numeric(10,2) DEFAULT 0 NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    low_stock_threshold integer DEFAULT 5 NOT NULL,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bales integer DEFAULT 0 NOT NULL,
    packs integer DEFAULT 0 NOT NULL,
    faulty_bottles integer DEFAULT 0 NOT NULL,
    bottles_per_bale integer DEFAULT 90 NOT NULL,
    bottles_per_pack integer DEFAULT 12 NOT NULL,
    bottle_specification_id uuid
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    phone text,
    status public.approval_status DEFAULT 'pending'::public.approval_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid,
    supplier_name text NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    buying_price numeric(10,2) NOT NULL,
    total_cost numeric(10,2) NOT NULL,
    payment_mode public.payment_mode DEFAULT 'Cash'::public.payment_mode NOT NULL,
    branch_id uuid,
    recorded_by uuid,
    date timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_bottle_specification_id uuid,
    purchase_unit text,
    bales_purchased integer,
    bottles_received integer
);


--
-- Name: raw_bottle_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raw_bottle_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    bottle_specification_id uuid NOT NULL,
    quantity_bottles integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT raw_bottle_inventory_qty_nonneg CHECK ((quantity_bottles >= 0)),
    CONSTRAINT raw_bottle_inventory_quantity_bottles_check CHECK ((quantity_bottles >= 0))
);


--
-- Name: raw_bottle_inventory_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raw_bottle_inventory_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    bottle_specification_id uuid NOT NULL,
    movement_type text NOT NULL,
    quantity_bottles integer NOT NULL,
    reference text,
    purchase_id uuid,
    production_record_id uuid,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT raw_bottle_inventory_logs_movement_type_check CHECK ((movement_type = ANY (ARRAY['PURCHASE'::text, 'PRODUCTION_CONSUMPTION'::text, 'BREAKAGE'::text]))),
    CONSTRAINT raw_bottle_inventory_logs_quantity_bottles_check CHECK ((quantity_bottles > 0))
);


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    selling_price numeric(10,2) NOT NULL,
    buying_price numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    discount_type public.discount_type,
    discount_value numeric(10,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(10,2) DEFAULT 0 NOT NULL,
    profit numeric(10,2) NOT NULL,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    customer_name text,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    selling_price numeric(10,2) NOT NULL,
    buying_price numeric(10,2) NOT NULL,
    discount_type public.discount_type,
    discount_value numeric(10,2) DEFAULT 0 NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    discount_amount numeric(10,2) DEFAULT 0 NOT NULL,
    final_amount numeric(10,2) NOT NULL,
    profit numeric(10,2) NOT NULL,
    payment_mode public.payment_mode DEFAULT 'Cash'::public.payment_mode NOT NULL,
    branch_id uuid,
    recorded_by uuid,
    date timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_status text DEFAULT 'PAID'::text NOT NULL,
    idempotency_key text,
    inventory_applied boolean DEFAULT false NOT NULL
);


--
-- Name: stock_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    adjustment_type public.adjustment_type NOT NULL,
    quantity integer NOT NULL,
    reason text,
    status public.approval_status DEFAULT 'pending'::public.approval_status NOT NULL,
    requested_by uuid NOT NULL,
    approved_by uuid,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_transfer_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_transfer_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_number text DEFAULT public.next_stock_transfer_number() NOT NULL,
    transfer_date date DEFAULT CURRENT_DATE NOT NULL,
    from_branch_id uuid NOT NULL,
    to_branch_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    remarks text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_by uuid NOT NULL,
    approved_by uuid,
    received_by uuid,
    received_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_transfers_check CHECK ((from_branch_id <> to_branch_id)),
    CONSTRAINT stock_transfers_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT stock_transfers_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'RECEIVED'::text, 'CANCELLED'::text])))
);


--
-- Name: subscription_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    amount numeric DEFAULT 1000 NOT NULL,
    purpose text DEFAULT 'DATABASE RENEWALS'::text NOT NULL,
    last_payment_date timestamp with time zone,
    next_due_date timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    payment_reference text,
    grace_period_days integer DEFAULT 7 NOT NULL,
    billing_cycle text DEFAULT 'monthly'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    location text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value text DEFAULT ''::text NOT NULL,
    is_encrypted boolean DEFAULT false NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_type text NOT NULL,
    target_value numeric(10,2) NOT NULL,
    current_value numeric(10,2) DEFAULT 0 NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    branch_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reward text DEFAULT ''::text,
    consequence text DEFAULT ''::text,
    period text DEFAULT 'monthly'::text NOT NULL,
    expected_profit numeric DEFAULT 0 NOT NULL,
    actual_profit numeric DEFAULT 0 NOT NULL,
    CONSTRAINT targets_target_type_check CHECK ((target_type = ANY (ARRAY['sales'::text, 'inventory'::text])))
);


--
-- Name: user_branch_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_branch_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    voucher_number text NOT NULL,
    purpose text NOT NULL,
    category text DEFAULT 'misc'::text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    branch_id uuid,
    recorded_by uuid,
    date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: bottle_specifications bottle_specifications_category_bottle_size_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bottle_specifications
    ADD CONSTRAINT bottle_specifications_category_bottle_size_key UNIQUE (category, bottle_size);


--
-- Name: bottle_specifications bottle_specifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bottle_specifications
    ADD CONSTRAINT bottle_specifications_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: cash_reconciliations cash_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_reconciliations
    ADD CONSTRAINT cash_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: cash_submissions cash_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_submissions
    ADD CONSTRAINT cash_submissions_pkey PRIMARY KEY (id);


--
-- Name: credit_payments credit_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_payments
    ADD CONSTRAINT credit_payments_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: inventory_logs inventory_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_pkey PRIMARY KEY (id);


--
-- Name: loyalty_points loyalty_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_pkey PRIMARY KEY (id);


--
-- Name: payment_deletions_audit payment_deletions_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_deletions_audit
    ADD CONSTRAINT payment_deletions_audit_pkey PRIMARY KEY (id);


--
-- Name: payments payments_message_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_message_reference_key UNIQUE (message_reference);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: production_records production_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: raw_bottle_inventory raw_bottle_inventory_branch_id_bottle_specification_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory
    ADD CONSTRAINT raw_bottle_inventory_branch_id_bottle_specification_id_key UNIQUE (branch_id, bottle_specification_id);


--
-- Name: raw_bottle_inventory_logs raw_bottle_inventory_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory_logs
    ADD CONSTRAINT raw_bottle_inventory_logs_pkey PRIMARY KEY (id);


--
-- Name: raw_bottle_inventory raw_bottle_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory
    ADD CONSTRAINT raw_bottle_inventory_pkey PRIMARY KEY (id);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: stock_adjustments stock_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id);


--
-- Name: stock_transfers stock_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_pkey PRIMARY KEY (id);


--
-- Name: stock_transfers stock_transfers_transfer_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_transfer_number_key UNIQUE (transfer_number);


--
-- Name: subscription_records subscription_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_records
    ADD CONSTRAINT subscription_records_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: targets targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_pkey PRIMARY KEY (id);


--
-- Name: user_branch_assignments user_branch_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch_assignments
    ADD CONSTRAINT user_branch_assignments_pkey PRIMARY KEY (id);


--
-- Name: user_branch_assignments user_branch_assignments_user_id_branch_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch_assignments
    ADD CONSTRAINT user_branch_assignments_user_id_branch_id_key UNIQUE (user_id, branch_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: branches_one_factory_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_one_factory_idx ON public.branches USING btree (is_factory) WHERE is_factory;


--
-- Name: customers_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customers_email_unique ON public.customers USING btree (email) WHERE ((email IS NOT NULL) AND (email <> ''::text));


--
-- Name: customers_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customers_phone_unique ON public.customers USING btree (phone) WHERE ((phone IS NOT NULL) AND (phone <> ''::text));


--
-- Name: idx_announcements_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_active ON public.announcements USING btree (is_active, expires_at);


--
-- Name: idx_announcements_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_created_by ON public.announcements USING btree (created_by);


--
-- Name: idx_announcements_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_priority ON public.announcements USING btree (priority, created_at DESC);


--
-- Name: idx_announcements_target_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_target_branch ON public.announcements USING btree (target_branch_id);


--
-- Name: idx_cash_reconciliations_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_reconciliations_branch ON public.cash_reconciliations USING btree (branch_id);


--
-- Name: idx_cash_reconciliations_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_reconciliations_date ON public.cash_reconciliations USING btree (reconciliation_date DESC);


--
-- Name: idx_cash_reconciliations_shift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_reconciliations_shift ON public.cash_reconciliations USING btree (shift);


--
-- Name: idx_cash_reconciliations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_reconciliations_status ON public.cash_reconciliations USING btree (approval_status);


--
-- Name: idx_credit_payments_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_payments_customer ON public.credit_payments USING btree (customer_id, created_at DESC);


--
-- Name: idx_payments_sale_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_sale_id ON public.payments USING btree (sale_id);


--
-- Name: payments_category_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_category_created_idx ON public.payments USING btree (error_category, created_at DESC);


--
-- Name: payments_correlation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_correlation_idx ON public.payments USING btree (correlation_id);


--
-- Name: payments_manual_mpesa_receipt_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_manual_mpesa_receipt_unique ON public.payments USING btree (mpesa_receipt) WHERE ((payment_method = 'MPESA_MANUAL'::text) AND (mpesa_receipt IS NOT NULL));


--
-- Name: payments_pending_recovery_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_pending_recovery_idx ON public.payments USING btree (created_at) WHERE (status = 'PENDING'::text);


--
-- Name: payments_sale_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_sale_status_idx ON public.payments USING btree (sale_id, status);


--
-- Name: payments_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_status_created_idx ON public.payments USING btree (status, created_at DESC);


--
-- Name: products_name_branch_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_name_branch_unique ON public.products USING btree (branch_id, lower(name));


--
-- Name: sale_items_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_items_product_id_idx ON public.sale_items USING btree (product_id);


--
-- Name: sale_items_sale_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_items_sale_id_idx ON public.sale_items USING btree (sale_id);


--
-- Name: sales_idempotency_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_idempotency_key_unique ON public.sales USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: stock_transfers_from_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfers_from_branch_idx ON public.stock_transfers USING btree (from_branch_id, created_at DESC);


--
-- Name: stock_transfers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfers_status_idx ON public.stock_transfers USING btree (status, created_at DESC);


--
-- Name: stock_transfers_to_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfers_to_branch_idx ON public.stock_transfers USING btree (to_branch_id, created_at DESC);


--
-- Name: vouchers_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vouchers_number_unique ON public.vouchers USING btree (voucher_number);


--
-- Name: announcements trg_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_announcements_updated_at();


--
-- Name: sales trg_sales_mark_inventory_applied; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sales_mark_inventory_applied BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.sales_mark_inventory_applied();


--
-- Name: bottle_specifications update_bottle_specifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bottle_specifications_updated_at BEFORE UPDATE ON public.bottle_specifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: branches update_branches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cash_reconciliations update_cash_reconciliations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cash_reconciliations_updated_at BEFORE UPDATE ON public.cash_reconciliations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: credit_payments update_credit_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_credit_payments_updated_at BEFORE UPDATE ON public.credit_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customers update_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments update_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stock_adjustments update_stock_adjustments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_stock_adjustments_updated_at BEFORE UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stock_transfers update_stock_transfers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers update_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: targets update_targets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_targets_updated_at BEFORE UPDATE ON public.targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: announcements announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: announcements announcements_target_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_target_branch_id_fkey FOREIGN KEY (target_branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: assets assets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: cash_reconciliations cash_reconciliations_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_reconciliations
    ADD CONSTRAINT cash_reconciliations_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: cash_reconciliations cash_reconciliations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_reconciliations
    ADD CONSTRAINT cash_reconciliations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: cash_reconciliations cash_reconciliations_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_reconciliations
    ADD CONSTRAINT cash_reconciliations_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: cash_submissions cash_submissions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_submissions
    ADD CONSTRAINT cash_submissions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: credit_payments credit_payments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_payments
    ADD CONSTRAINT credit_payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: credit_payments credit_payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_payments
    ADD CONSTRAINT credit_payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: credit_payments credit_payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_payments
    ADD CONSTRAINT credit_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);


--
-- Name: customers customers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: inventory_logs inventory_logs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: inventory_logs inventory_logs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: loyalty_points loyalty_points_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: loyalty_points loyalty_points_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;


--
-- Name: production_records production_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: production_records production_records_finished_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_finished_product_id_fkey FOREIGN KEY (finished_product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: production_records production_records_raw_bottle_specification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_raw_bottle_specification_id_fkey FOREIGN KEY (raw_bottle_specification_id) REFERENCES public.bottle_specifications(id) ON DELETE RESTRICT;


--
-- Name: products products_bottle_specification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_bottle_specification_id_fkey FOREIGN KEY (bottle_specification_id) REFERENCES public.bottle_specifications(id) ON DELETE SET NULL;


--
-- Name: products products_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchases purchases_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_raw_bottle_specification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_raw_bottle_specification_id_fkey FOREIGN KEY (raw_bottle_specification_id) REFERENCES public.bottle_specifications(id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: raw_bottle_inventory raw_bottle_inventory_bottle_specification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory
    ADD CONSTRAINT raw_bottle_inventory_bottle_specification_id_fkey FOREIGN KEY (bottle_specification_id) REFERENCES public.bottle_specifications(id) ON DELETE RESTRICT;


--
-- Name: raw_bottle_inventory raw_bottle_inventory_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory
    ADD CONSTRAINT raw_bottle_inventory_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: raw_bottle_inventory_logs raw_bottle_inventory_logs_bottle_specification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory_logs
    ADD CONSTRAINT raw_bottle_inventory_logs_bottle_specification_id_fkey FOREIGN KEY (bottle_specification_id) REFERENCES public.bottle_specifications(id) ON DELETE RESTRICT;


--
-- Name: raw_bottle_inventory_logs raw_bottle_inventory_logs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory_logs
    ADD CONSTRAINT raw_bottle_inventory_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: raw_bottle_inventory_logs raw_bottle_inventory_logs_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory_logs
    ADD CONSTRAINT raw_bottle_inventory_logs_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE SET NULL;


--
-- Name: raw_bottle_inventory_logs raw_bottle_inventory_logs_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_bottle_inventory_logs
    ADD CONSTRAINT raw_bottle_inventory_logs_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sale_items sale_items_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sales sales_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: sales sales_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sales sales_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: stock_adjustments stock_adjustments_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: stock_adjustments stock_adjustments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: stock_adjustments stock_adjustments_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stock_adjustments stock_adjustments_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: stock_transfers stock_transfers_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: stock_transfers stock_transfers_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id);


--
-- Name: stock_transfers stock_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: stock_transfers stock_transfers_from_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_from_branch_id_fkey FOREIGN KEY (from_branch_id) REFERENCES public.branches(id);


--
-- Name: stock_transfers stock_transfers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: stock_transfers stock_transfers_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_received_by_fkey FOREIGN KEY (received_by) REFERENCES auth.users(id);


--
-- Name: stock_transfers stock_transfers_to_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_to_branch_id_fkey FOREIGN KEY (to_branch_id) REFERENCES public.branches(id);


--
-- Name: targets targets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: targets targets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: targets targets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_branch_assignments user_branch_assignments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch_assignments
    ADD CONSTRAINT user_branch_assignments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: user_branch_assignments user_branch_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch_assignments
    ADD CONSTRAINT user_branch_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vouchers vouchers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: user_branch_assignments Admins can delete branch assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete branch assignments" ON public.user_branch_assignments FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: branches Admins can delete branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete branches" ON public.branches FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: credit_payments Admins can delete credit payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete credit payments" ON public.credit_payments FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: targets Admins can delete targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete targets" ON public.targets FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: user_branch_assignments Admins can insert branch assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert branch assignments" ON public.user_branch_assignments FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: branches Admins can insert branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert branches" ON public.branches FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins can insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: targets Admins can insert targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert targets" ON public.targets FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: profiles Admins can update any profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: user_branch_assignments Admins can update branch assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update branch assignments" ON public.user_branch_assignments FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: branches Admins can update branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update branches" ON public.branches FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: cash_submissions Admins can update cash submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update cash submissions" ON public.cash_submissions FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: credit_payments Admins can update credit payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update credit payments" ON public.credit_payments FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins can update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: stock_adjustments Admins can update stock adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update stock adjustments" ON public.stock_adjustments FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: targets Admins can update targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update targets" ON public.targets FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: cash_submissions Admins can view all cash submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all cash submissions" ON public.cash_submissions FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: customers Admins can view all customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all customers" ON public.customers FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: purchases Admins can view all purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all purchases" ON public.purchases FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: sales Admins can view all sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all sales" ON public.sales FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: bottle_specifications Admins manage bottle specifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage bottle specifications" ON public.bottle_specifications TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: announcements Announcements deletable by admins and own creators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements deletable by admins and own creators" ON public.announcements FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) OR (public.has_role(auth.uid(), 'supervisor'::public.app_role) AND (created_by = auth.uid()))));


--
-- Name: announcements Announcements insertable by admins and supervisors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements insertable by admins and supervisors" ON public.announcements FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: announcements Announcements updatable by admins and own creators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements updatable by admins and own creators" ON public.announcements FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) OR (public.has_role(auth.uid(), 'supervisor'::public.app_role) AND (created_by = auth.uid())))) WITH CHECK ((public.is_admin(auth.uid()) OR (public.has_role(auth.uid(), 'supervisor'::public.app_role) AND (created_by = auth.uid()))));


--
-- Name: announcements Announcements viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements viewable by authenticated" ON public.announcements FOR SELECT TO authenticated USING (((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now())) AND ((target_type = 'All Users'::text) OR ((target_type = 'Branch'::text) AND (target_branch_id IN ( SELECT ub.branch_id
   FROM public.user_branch_assignments ub
  WHERE (ub.user_id = auth.uid())))))));


--
-- Name: assets Assets deletable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assets deletable by admins" ON public.assets FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: assets Assets insertable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assets insertable by admins" ON public.assets FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: assets Assets updatable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assets updatable by admins" ON public.assets FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: assets Assets viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assets viewable by authenticated" ON public.assets FOR SELECT TO authenticated USING (true);


--
-- Name: payment_deletions_audit Audit insertable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit insertable by superadmin" ON public.payment_deletions_audit FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'superadmin'::public.app_role) AND (deleted_by = auth.uid())));


--
-- Name: payment_deletions_audit Audit viewable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit viewable by superadmin" ON public.payment_deletions_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: credit_payments Authenticated users can insert credit payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert credit payments" ON public.credit_payments FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: credit_payments Authenticated users can view credit payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view credit payments" ON public.credit_payments FOR SELECT TO authenticated USING (true);


--
-- Name: bottle_specifications Bottle specifications viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bottle specifications viewable by authenticated" ON public.bottle_specifications FOR SELECT TO authenticated USING (true);


--
-- Name: bottle_specifications Bottle specs insertable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bottle specs insertable by admins" ON public.bottle_specifications FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: bottle_specifications Bottle specs updatable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bottle specs updatable by admins" ON public.bottle_specifications FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: bottle_specifications Bottle specs viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bottle specs viewable by authenticated" ON public.bottle_specifications FOR SELECT TO authenticated USING (true);


--
-- Name: user_branch_assignments Branch assignments viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Branch assignments viewable by authenticated" ON public.user_branch_assignments FOR SELECT TO authenticated USING (true);


--
-- Name: branches Branches viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Branches viewable by authenticated" ON public.branches FOR SELECT TO authenticated USING (true);


--
-- Name: cash_submissions Cash submissions insertable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cash submissions insertable by authenticated" ON public.cash_submissions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: cash_reconciliations Cashiers can insert reconciliations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cashiers can insert reconciliations" ON public.cash_reconciliations FOR INSERT TO authenticated WITH CHECK (((auth.uid() = cashier_id) AND (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['cashier'::public.app_role, 'supervisor'::public.app_role, 'superadmin'::public.app_role])))))));


--
-- Name: customers Customers deletable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers deletable by admins" ON public.customers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: customers Customers insertable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers insertable by authenticated" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: customers Customers updatable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers updatable by authenticated" ON public.customers FOR UPDATE TO authenticated USING (true);


--
-- Name: inventory_logs Inventory logs insertable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Inventory logs insertable by authenticated" ON public.inventory_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: inventory_logs Inventory logs viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Inventory logs viewable by authenticated" ON public.inventory_logs FOR SELECT TO authenticated USING (true);


--
-- Name: loyalty_points Loyalty points insertable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Loyalty points insertable by authenticated" ON public.loyalty_points FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: loyalty_points Loyalty points viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Loyalty points viewable by authenticated" ON public.loyalty_points FOR SELECT TO authenticated USING (true);


--
-- Name: payments Payments cancellable when pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Payments cancellable when pending" ON public.payments FOR UPDATE TO authenticated USING ((status = 'PENDING'::text)) WITH CHECK ((status = ANY (ARRAY['PENDING'::text, 'CANCELLED'::text])));


--
-- Name: payments Payments deletable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Payments deletable by superadmin" ON public.payments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: payments Payments insertable by service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Payments insertable by service role" ON public.payments FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: payments Payments updatable by service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Payments updatable by service role" ON public.payments FOR UPDATE TO service_role USING (true);


--
-- Name: payments Payments viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Payments viewable by authenticated" ON public.payments FOR SELECT TO authenticated USING (true);


--
-- Name: production_records Production records deletable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Production records deletable by admins" ON public.production_records FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: production_records Production records insertable by admins and stock managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Production records insertable by admins and stock managers" ON public.production_records FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: production_records Production records viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Production records viewable by authenticated" ON public.production_records FOR SELECT TO authenticated USING (true);


--
-- Name: products Products deletable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Products deletable by admins" ON public.products FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: products Products insertable by admins and stock managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Products insertable by admins and stock managers" ON public.products FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: products Products updatable by admins and stock managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Products updatable by admins and stock managers" ON public.products FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: products Products viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Products viewable by authenticated" ON public.products FOR SELECT TO authenticated USING (true);


--
-- Name: purchases Purchases insertable by admins and stock managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Purchases insertable by admins and stock managers" ON public.purchases FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: raw_bottle_inventory Raw bottle inventory viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Raw bottle inventory viewable by authenticated" ON public.raw_bottle_inventory FOR SELECT TO authenticated USING (true);


--
-- Name: raw_bottle_inventory_logs Raw bottle logs viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Raw bottle logs viewable by authenticated" ON public.raw_bottle_inventory_logs FOR SELECT TO authenticated USING (true);


--
-- Name: cash_reconciliations Reconciliations viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reconciliations viewable by authenticated" ON public.cash_reconciliations FOR SELECT TO authenticated USING (true);


--
-- Name: user_roles Roles viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);


--
-- Name: sale_items Sale items insertable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sale items insertable by authenticated" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: sale_items Sale items viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sale items viewable by authenticated" ON public.sale_items FOR SELECT TO authenticated USING (true);


--
-- Name: sales Sales cancellable when payment pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales cancellable when payment pending" ON public.sales FOR UPDATE TO authenticated USING ((payment_status = 'PENDING'::text)) WITH CHECK (true);


--
-- Name: sales Sales insertable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales insertable by authenticated" ON public.sales FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: sales Sales updatable by service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales updatable by service role" ON public.sales FOR UPDATE TO service_role USING (true);


--
-- Name: stock_adjustments Stock adjustments insertable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Stock adjustments insertable by authenticated" ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: stock_adjustments Stock adjustments viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Stock adjustments viewable by authenticated" ON public.stock_adjustments FOR SELECT TO authenticated USING (true);


--
-- Name: stock_transfers Stock transfers viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Stock transfers viewable by authenticated" ON public.stock_transfers FOR SELECT TO authenticated USING (true);


--
-- Name: subscription_records Subscription deletable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Subscription deletable by superadmin" ON public.subscription_records FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: subscription_records Subscription insertable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Subscription insertable by superadmin" ON public.subscription_records FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: subscription_records Subscription updatable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Subscription updatable by superadmin" ON public.subscription_records FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: subscription_records Subscription viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Subscription viewable by authenticated" ON public.subscription_records FOR SELECT TO authenticated USING (true);


--
-- Name: cash_reconciliations Supervisors and admins can update (approve/reject); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Supervisors and admins can update (approve/reject)" ON public.cash_reconciliations FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: suppliers Suppliers deletable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Suppliers deletable by admins" ON public.suppliers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: suppliers Suppliers insertable by admins and stock managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Suppliers insertable by admins and stock managers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: suppliers Suppliers updatable by admins and stock managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Suppliers updatable by admins and stock managers" ON public.suppliers FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: suppliers Suppliers viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Suppliers viewable by authenticated" ON public.suppliers FOR SELECT TO authenticated USING (true);


--
-- Name: system_settings System settings deletable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System settings deletable by superadmin" ON public.system_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: system_settings System settings insertable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System settings insertable by superadmin" ON public.system_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: system_settings System settings updatable by superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System settings updatable by superadmin" ON public.system_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));


--
-- Name: system_settings System settings viewable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System settings viewable by admins" ON public.system_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: targets Targets viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Targets viewable by authenticated" ON public.targets FOR SELECT TO authenticated USING (true);


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: cash_submissions Users can view cash submissions in their branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view cash submissions in their branches" ON public.cash_submissions FOR SELECT USING ((branch_id IN ( SELECT user_branch_assignments.branch_id
   FROM public.user_branch_assignments
  WHERE (user_branch_assignments.user_id = auth.uid()))));


--
-- Name: customers Users can view customers in their branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view customers in their branches" ON public.customers FOR SELECT USING ((branch_id IN ( SELECT user_branch_assignments.branch_id
   FROM public.user_branch_assignments
  WHERE (user_branch_assignments.user_id = auth.uid()))));


--
-- Name: purchases Users can view purchases in their branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view purchases in their branches" ON public.purchases FOR SELECT USING ((branch_id IN ( SELECT user_branch_assignments.branch_id
   FROM public.user_branch_assignments
  WHERE (user_branch_assignments.user_id = auth.uid()))));


--
-- Name: sales Users can view sales in their branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view sales in their branches" ON public.sales FOR SELECT USING ((branch_id IN ( SELECT user_branch_assignments.branch_id
   FROM public.user_branch_assignments
  WHERE (user_branch_assignments.user_id = auth.uid()))));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: vouchers Vouchers deletable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vouchers deletable by admins" ON public.vouchers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: vouchers Vouchers insertable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vouchers insertable by admins" ON public.vouchers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: vouchers Vouchers viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vouchers viewable by authenticated" ON public.vouchers FOR SELECT TO authenticated USING (true);


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: bottle_specifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bottle_specifications ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_deletions_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_deletions_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: production_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: raw_bottle_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raw_bottle_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: raw_bottle_inventory raw_bottle_inventory_insertable_by_admins_and_stock_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_bottle_inventory_insertable_by_admins_and_stock_managers ON public.raw_bottle_inventory FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: raw_bottle_inventory_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raw_bottle_inventory_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: raw_bottle_inventory_logs raw_bottle_inventory_logs_insertable_by_admins_and_stock_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_bottle_inventory_logs_insertable_by_admins_and_stock_manage ON public.raw_bottle_inventory_logs FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: raw_bottle_inventory_logs raw_bottle_inventory_logs_updatable_by_admins_and_stock_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_bottle_inventory_logs_updatable_by_admins_and_stock_manager ON public.raw_bottle_inventory_logs FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: raw_bottle_inventory raw_bottle_inventory_updatable_by_admins_and_stock_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_bottle_inventory_updatable_by_admins_and_stock_managers ON public.raw_bottle_inventory FOR UPDATE TO authenticated USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role))) WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'::public.app_role)));


--
-- Name: sale_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_records ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

--
-- Name: user_branch_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_branch_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 8RxRJyLa9ptNzJNPou0LQ5dhyRE3JFIaYsPieX7QgG7zbD1xUtXxgChvWYbQ8Vr

