
-- Role enum
CREATE TYPE public.app_role AS ENUM ('superadmin', 'supervisor', 'cashier', 'stock_manager');

-- User approval status enum
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');

-- Payment mode enum
CREATE TYPE public.payment_mode AS ENUM ('Cash', 'Mpesa', 'Credit');

-- Discount type enum
CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed');

-- Stock adjustment type enum
CREATE TYPE public.adjustment_type AS ENUM ('increase', 'decrease');

-- PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  status approval_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- USER ROLES TABLE
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF app_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin', 'supervisor')
  )
$$;

CREATE POLICY "Roles viewable by authenticated"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- BRANCHES TABLE
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branches viewable by authenticated"
  ON public.branches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert branches"
  ON public.branches FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update branches"
  ON public.branches FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete branches"
  ON public.branches FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- USER BRANCH ASSIGNMENTS
CREATE TABLE public.user_branch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

ALTER TABLE public.user_branch_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch assignments viewable by authenticated"
  ON public.user_branch_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert branch assignments"
  ON public.user_branch_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update branch assignments"
  ON public.user_branch_assignments FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete branch assignments"
  ON public.user_branch_assignments FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- PRODUCTS TABLE
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bottle_size TEXT NOT NULL,
  buying_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products viewable by authenticated"
  ON public.products FOR SELECT TO authenticated USING (true);

CREATE POLICY "Products insertable by admins and stock managers"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'));

CREATE POLICY "Products updatable by admins and stock managers"
  ON public.products FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'));

CREATE POLICY "Products deletable by admins"
  ON public.products FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- CUSTOMERS TABLE
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  credit_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers viewable by authenticated"
  ON public.customers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Customers insertable by authenticated"
  ON public.customers FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Customers updatable by authenticated"
  ON public.customers FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Customers deletable by admins"
  ON public.customers FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- SUPPLIERS TABLE
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Suppliers viewable by authenticated"
  ON public.suppliers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Suppliers insertable by admins and stock managers"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'));

CREATE POLICY "Suppliers updatable by admins and stock managers"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'));

CREATE POLICY "Suppliers deletable by admins"
  ON public.suppliers FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- SALES TABLE
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  selling_price NUMERIC(10,2) NOT NULL,
  buying_price NUMERIC(10,2) NOT NULL,
  discount_type discount_type,
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(10,2) NOT NULL,
  profit NUMERIC(10,2) NOT NULL,
  payment_mode payment_mode NOT NULL DEFAULT 'Cash',
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales viewable by authenticated"
  ON public.sales FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sales insertable by authenticated"
  ON public.sales FOR INSERT TO authenticated WITH CHECK (true);

-- PURCHASES TABLE
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  buying_price NUMERIC(10,2) NOT NULL,
  total_cost NUMERIC(10,2) NOT NULL,
  payment_mode payment_mode NOT NULL DEFAULT 'Cash',
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Purchases viewable by authenticated"
  ON public.purchases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Purchases insertable by admins and stock managers"
  ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'stock_manager'));

-- INVENTORY LOGS TABLE
CREATE TABLE public.inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
  quantity INTEGER NOT NULL,
  reference TEXT,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory logs viewable by authenticated"
  ON public.inventory_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Inventory logs insertable by authenticated"
  ON public.inventory_logs FOR INSERT TO authenticated WITH CHECK (true);

-- STOCK ADJUSTMENTS TABLE
CREATE TABLE public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  adjustment_type adjustment_type NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT,
  status approval_status NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock adjustments viewable by authenticated"
  ON public.stock_adjustments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Stock adjustments insertable by authenticated"
  ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update stock adjustments"
  ON public.stock_adjustments FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

-- LOYALTY POINTS TABLE
CREATE TABLE public.loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Loyalty points viewable by authenticated"
  ON public.loyalty_points FOR SELECT TO authenticated USING (true);

CREATE POLICY "Loyalty points insertable by authenticated"
  ON public.loyalty_points FOR INSERT TO authenticated WITH CHECK (true);

-- TARGETS TABLE
CREATE TABLE public.targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('sales', 'inventory')),
  target_value NUMERIC(10,2) NOT NULL,
  current_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Targets viewable by authenticated"
  ON public.targets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert targets"
  ON public.targets FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update targets"
  ON public.targets FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete targets"
  ON public.targets FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_adjustments_updated_at BEFORE UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_targets_updated_at BEFORE UPDATE ON public.targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Admins can update profiles (for approval)
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));
