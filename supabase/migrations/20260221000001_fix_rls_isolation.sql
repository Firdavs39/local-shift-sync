-- ============================================================
-- FIX: Полная изоляция по company_id
-- Удаляем все глобальные политики, оставляем только компанийные
-- ============================================================

-- ============================================================
-- 1. PROFILES — убрать глобальную политику "Anyone can view profiles for login"
--    и все другие небезопасные политики
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view profiles for login"  ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles"         ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"        ON public.profiles;
DROP POLICY IF EXISTS "company_profiles_select"             ON public.profiles;
DROP POLICY IF EXISTS "company_profiles_insert"             ON public.profiles;
DROP POLICY IF EXISTS "company_profiles_update"             ON public.profiles;

-- Только своя компания
CREATE POLICY "company_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "company_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND company_id = public.get_my_company_id());

CREATE POLICY "company_profiles_admin_all"
  ON public.profiles FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 2. USER_ROLES — убрать глобальные политики
-- ============================================================
DROP POLICY IF EXISTS "Admins can view all roles"   ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles"     ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role"     ON public.user_roles;
DROP POLICY IF EXISTS "company_roles_select"        ON public.user_roles;
DROP POLICY IF EXISTS "company_roles_all"           ON public.user_roles;

CREATE POLICY "company_roles_select"
  ON public.user_roles FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "company_roles_admin_all"
  ON public.user_roles FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 3. SITES — убрать глобальные политики
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view active sites" ON public.sites;
DROP POLICY IF EXISTS "Admins can view all sites"                 ON public.sites;
DROP POLICY IF EXISTS "Admins can manage sites"                   ON public.sites;
DROP POLICY IF EXISTS "company_sites_select"                      ON public.sites;
DROP POLICY IF EXISTS "company_sites_all"                         ON public.sites;

CREATE POLICY "company_sites_select"
  ON public.sites FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND active = true);

CREATE POLICY "company_sites_admin_all"
  ON public.sites FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 4. SHIFTS — убрать глобальные политики
-- ============================================================
DROP POLICY IF EXISTS "Users can view own shifts"       ON public.shifts;
DROP POLICY IF EXISTS "Admins can view all shifts"      ON public.shifts;
DROP POLICY IF EXISTS "Users can create own shifts"     ON public.shifts;
DROP POLICY IF EXISTS "Users can update own shifts"     ON public.shifts;
DROP POLICY IF EXISTS "Admins can manage all shifts"    ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_worker_select"    ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_admin_select"     ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_insert"           ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_update"           ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_admin_all"        ON public.shifts;

CREATE POLICY "company_shifts_worker_select"
  ON public.shifts FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND company_id = public.get_my_company_id());

CREATE POLICY "company_shifts_admin_select"
  ON public.shifts FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "company_shifts_insert"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_my_company_id());

CREATE POLICY "company_shifts_update"
  ON public.shifts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND company_id = public.get_my_company_id());

CREATE POLICY "company_shifts_admin_all"
  ON public.shifts FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 5. SETTINGS — убрать глобальные политики
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can update settings"            ON public.settings;
DROP POLICY IF EXISTS "company_settings_select"               ON public.settings;
DROP POLICY IF EXISTS "company_settings_update"               ON public.settings;

CREATE POLICY "company_settings_select"
  ON public.settings FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "company_settings_update"
  ON public.settings FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 6. COMPANIES — изоляция по owner
-- ============================================================
DROP POLICY IF EXISTS "company_select_own"   ON public.companies;
DROP POLICY IF EXISTS "company_update_owner" ON public.companies;

CREATE POLICY "company_select_own"
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.get_my_company_id());

CREATE POLICY "company_update_owner"
  ON public.companies FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid());

-- ============================================================
-- 7. TELEGRAM CONFIG
-- ============================================================
DROP POLICY IF EXISTS "company_telegram_all" ON public.telegram_config;

CREATE POLICY "company_telegram_all"
  ON public.telegram_config FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 8. Починить has_role — добавить фильтр по company_id
--    чтобы admin одной компании не мог управлять другой
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (
        -- Для вызовов через Edge Functions (service role, auth.uid() = NULL)
        -- company_id не фильтруем — они уже используют service role
        company_id = get_my_company_id()
        OR get_my_company_id() IS NULL
      )
  )
$$;

-- ============================================================
-- 9. get_my_company_id — убедиться что актуальная версия
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;
