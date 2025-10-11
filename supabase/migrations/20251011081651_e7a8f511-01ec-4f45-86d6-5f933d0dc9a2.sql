-- Delete all non-admin users to start fresh
-- Keep only the admin user

DO $$
DECLARE
  user_record RECORD;
BEGIN
  -- Delete all profiles except admin
  FOR user_record IN 
    SELECT id FROM public.profiles WHERE full_name != 'Администратор'
  LOOP
    -- Delete from auth.users (this will cascade to profiles and user_roles)
    DELETE FROM auth.users WHERE id = user_record.id;
    RAISE NOTICE 'Deleted user: %', user_record.id;
  END LOOP;
END $$;