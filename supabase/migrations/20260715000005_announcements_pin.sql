-- Announcements: Add is_pinned column and update ordering

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON public.announcements(is_pinned DESC, created_at DESC);

-- Update the get_active_announcements function to sort pinned first, then by priority, then by date
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
    a.is_pinned DESC,
    CASE a.priority
      WHEN 'Critical' THEN 0
      WHEN 'Important' THEN 1
      WHEN 'Normal' THEN 2
    END,
    a.created_at DESC;
$$;
