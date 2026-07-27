-- Raw Bottle Inventory Logs RLS Policies
-- Adds INSERT policy for raw_bottle_inventory_logs
-- Only superadmin, supervisor, and stock_manager roles can write

-- Allow admins (superadmin/supervisor) and stock managers to insert
CREATE POLICY "raw_bottle_inventory_logs_insertable_by_admins_and_stock_managers"
  ON public.raw_bottle_inventory_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')
  );

-- Allow admins (superadmin/supervisor) and stock managers to update
CREATE POLICY "raw_bottle_inventory_logs_updatable_by_admins_and_stock_managers"
  ON public.raw_bottle_inventory_logs FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')
  )
  WITH CHECK (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')
  );
