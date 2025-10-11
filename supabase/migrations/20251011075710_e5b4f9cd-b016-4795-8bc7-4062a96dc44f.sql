-- Fix authentication for existing workers
-- This will update passwords for all existing users to match the format: FullName (no spaces) + PIN

DO $$
DECLARE
  profile_record RECORD;
  new_password TEXT;
BEGIN
  -- Loop through all profiles that have email
  FOR profile_record IN 
    SELECT id, full_name, pin, email 
    FROM public.profiles 
    WHERE email IS NOT NULL AND full_name != 'Администратор'
  LOOP
    -- Generate password: full_name (no spaces) + pin
    new_password := REPLACE(profile_record.full_name, ' ', '') || profile_record.pin;
    
    -- Update password in auth.users using the admin API
    -- Note: We need to use the auth.users table directly
    UPDATE auth.users
    SET 
      encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
    WHERE id = profile_record.id;
    
    RAISE NOTICE 'Updated password for user: % (email: %)', profile_record.full_name, profile_record.email;
  END LOOP;
END $$;