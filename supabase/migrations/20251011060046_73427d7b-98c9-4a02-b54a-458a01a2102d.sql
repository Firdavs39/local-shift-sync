-- Fix search_path security warning for handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile with data from metadata
  INSERT INTO public.profiles (id, full_name, pin, active)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Новый пользователь'),
    COALESCE(new.raw_user_meta_data->>'pin', ''),
    true
  );
  
  -- Assign role from metadata (default to worker)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new.id,
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'worker'::app_role)
  );
  
  RETURN new;
END;
$$;