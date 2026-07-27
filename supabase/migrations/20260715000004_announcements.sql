-- Announcements Module
-- Internal communication board for Wonder Aqua management

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Normal', 'Important', 'Critical')) DEFAULT 'Normal',
  target_type TEXT NOT NULL CHECK (target_type IN ('All Users', 'Branch')) DEFAULT 'All Users',
  target_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- All authenticated users can view active announcements
CREATE POLICY "Announcements viewable by authenticated"
  ON public.announcements FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      target_type = 'All Users'
      OR (
        target_type = 'Branch'
        AND target_branch_id IN (
          SELECT ub.branch_id FROM public.user_branch_assignments ub WHERE ub.user_id = auth.uid()
        )
      )
    )
  );

-- Superadmins and supervisors can create announcements
CREATE POLICY "Announcements insertable by admins and supervisors"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

-- Superadmins can update any announcement; supervisors can update their own
CREATE POLICY "Announcements updatable by admins and own creators"
  ON public.announcements FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND created_by = auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND created_by = auth.uid())
  );

-- Superadmins can delete any announcement; supervisors can delete their own
CREATE POLICY "Announcements deletable by admins and own creators"
  ON public.announcements FOR DELETE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND created_by = auth.uid())
  );

-- Indexes
CREATE INDEX idx_announcements_priority ON public.announcements(priority, created_at DESC);
CREATE INDEX idx_announcements_active ON public.announcements(is_active, expires_at);
CREATE INDEX idx_announcements_created_by ON public.announcements(created_by);
CREATE INDEX idx_announcements_target_branch ON public.announcements(target_branch_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_announcements_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_announcements_updated_at();

-- Function to get active announcements for the current user
CREATE OR REPLACE FUNCTION public.get_active_announcements()
RETURNS SETOF public.announcements
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.get_active_announcements TO authenticated;
