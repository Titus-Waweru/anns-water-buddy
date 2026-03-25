
-- Function to auto-assign superadmin role and approve the system owner
CREATE OR REPLACE FUNCTION public.handle_superadmin_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create trigger on auth.users for new signups
CREATE TRIGGER on_auth_user_created_superadmin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_superadmin_assignment();
