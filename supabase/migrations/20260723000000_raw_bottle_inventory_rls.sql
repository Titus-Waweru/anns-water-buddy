-- Raw Bottle Inventory RLS Policies
-- Adds INSERT and UPDATE policies for raw_bottle_inventory
-- Only superadmin, supervisor, and stock_manager roles can write

-- Allow admins (superadmin/supervisor) and stock managers to insert
CREATE POLICY "raw_bottle_inventory_insertable_by_admins_and_stock_managers"
  ON public.raw_bottle_inventory FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')
  );

-- Allow admins (superadmin/supervisor) and stock managers to update
CREATE POLICY "raw_bottle_inventory_updatable_by_admins_and_stock_managers"
  ON public.raw_bottle_inventory FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')
  )
  WITH CHECK (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager')
  );
