-- Update admin password to match the login format
-- Password should be full_name (no spaces) + PIN = "Администратор777"
-- We'll use a service role function to update the password

DO $$
BEGIN
  -- Update the password for admin user using auth.users
  -- Note: In production, passwords should be hashed, but Supabase handles this automatically
  -- We can't directly update auth.users passwords via SQL, so we'll ensure the profile is correct
  
  -- Make sure the profile has the correct email
  UPDATE public.profiles
  SET email = 'admin777@geotime.local'
  WHERE pin = '777' AND full_name = 'Администратор';
  
END $$;