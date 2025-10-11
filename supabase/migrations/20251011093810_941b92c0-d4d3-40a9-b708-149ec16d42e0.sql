-- Allow anonymous users to read profiles for login purposes
-- This is needed for the login flow to find users by full_name and PIN
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Anyone can view profiles for login"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);