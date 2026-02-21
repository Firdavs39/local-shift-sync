-- ============================================================
-- MULTI-TENANCY MIGRATION FOR VEZIR GEOTIME
-- Выполнять в Supabase Dashboard → SQL Editor
-- Выполняйте каждый блок ПОСЛЕДОВАТЕЛЬНО
-- ============================================================

-- ============================================================
-- MIGRATION A: Создать таблицу companies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id UUID REFERENCES auth.users(id),
  plan TEXT NOT NULL DEFAULT 'trial',
  plan_expires_at TIMESTAMP WITH TIME ZONE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  max_workers INTEGER NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MIGRATION B: Добавить company_id ко всем таблицам
-- ============================================================

-- Убрать UNIQUE с pin (в мультитенанте разные компании могут иметь одинаковый PIN)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pin_key;

-- Добавить company_id
ALTER TABLE public.profiles   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.sites      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.shifts     ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.settings   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Добавить email к profiles если нет
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Новый compound unique: PIN уникален в рамках компании
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_company_pin_unique;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_company_pin_unique UNIQUE (company_id, pin);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_profiles_company_id   ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company_id ON public.user_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_sites_company_id      ON public.sites(company_id);
CREATE INDEX IF NOT EXISTS idx_shifts_company_id     ON public.shifts(company_id);

-- ============================================================
-- MIGRATION C: Helper-функция для получения company_id текущего пользователя
-- SECURITY DEFINER чтобы избежать рекурсию RLS
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

-- ============================================================
-- MIGRATION D: Переписать RLS политики (изоляция по компании)
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "company_profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "company_profiles_insert" ON public.profiles;

CREATE POLICY "company_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "company_profiles_insert"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- user_roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "company_roles_select" ON public.user_roles;
DROP POLICY IF EXISTS "company_roles_all" ON public.user_roles;

CREATE POLICY "company_roles_select"
  ON public.user_roles FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "company_roles_all"
  ON public.user_roles FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- sites
DROP POLICY IF EXISTS "Authenticated users can view active sites" ON public.sites;
DROP POLICY IF EXISTS "Admins can view all sites" ON public.sites;
DROP POLICY IF EXISTS "Admins can manage sites" ON public.sites;
DROP POLICY IF EXISTS "company_sites_select" ON public.sites;
DROP POLICY IF EXISTS "company_sites_all" ON public.sites;

CREATE POLICY "company_sites_select"
  ON public.sites FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND active = true);

CREATE POLICY "company_sites_all"
  ON public.sites FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- shifts
DROP POLICY IF EXISTS "Users can view own shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admins can view all shifts" ON public.shifts;
DROP POLICY IF EXISTS "Users can create own shifts" ON public.shifts;
DROP POLICY IF EXISTS "Users can update own shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admins can manage all shifts" ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_worker_select" ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_admin_select" ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_insert" ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_update" ON public.shifts;
DROP POLICY IF EXISTS "company_shifts_admin_all" ON public.shifts;

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

-- companies RLS
DROP POLICY IF EXISTS "company_select_own" ON public.companies;
DROP POLICY IF EXISTS "company_update_owner" ON public.companies;

CREATE POLICY "company_select_own"
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.get_my_company_id());

CREATE POLICY "company_update_owner"
  ON public.companies FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid());

-- settings
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.settings;
DROP POLICY IF EXISTS "company_settings_select" ON public.settings;
DROP POLICY IF EXISTS "company_settings_update" ON public.settings;

CREATE POLICY "company_settings_select"
  ON public.settings FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "company_settings_update"
  ON public.settings FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- MIGRATION E: Обновить trigger handle_new_user
-- Теперь принимает company_id из user_metadata
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, pin, active, company_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Новый пользователь'),
    COALESCE(new.raw_user_meta_data->>'pin', ''),
    true,
    CASE
      WHEN new.raw_user_meta_data->>'company_id' IS NOT NULL
      THEN (new.raw_user_meta_data->>'company_id')::UUID
      ELSE NULL
    END
  );

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (
    new.id,
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'worker'::app_role),
    CASE
      WHEN new.raw_user_meta_data->>'company_id' IS NOT NULL
      THEN (new.raw_user_meta_data->>'company_id')::UUID
      ELSE NULL
    END
  );

  RETURN new;
END;
$$;

-- ============================================================
-- MIGRATION F: Telegram config таблица
-- ============================================================
CREATE TABLE IF NOT EXISTS public.telegram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  notify_late BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_telegram_all" ON public.telegram_config;

CREATE POLICY "company_telegram_all"
  ON public.telegram_config FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- DONE! Теперь задеплойте Edge Functions:
-- supabase functions deploy register-company
-- supabase functions deploy create-worker
-- supabase functions deploy stripe-checkout
-- supabase functions deploy stripe-webhook
-- supabase functions deploy stripe-portal
-- supabase functions deploy notify-late
-- ============================================================
