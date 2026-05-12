# GeoTime — Контекст проекта для Claude

## Что это
SaaS-система учёта рабочего времени с геолокацией.
React + TypeScript + Vite + Supabase + Tailwind/shadcn-ui.

## Стек
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Backend: Supabase (Auth + PostgreSQL + Edge Functions)
- Платежи: Stripe (подписки)
- Уведомления: Telegram Bot API

## Что уже сделано (Claude реализовал)
- [x] Убраны все console.log из продакшн кода (PIN больше не логируется)
- [x] Реальная статистика в Admin Dashboard (4 Supabase запроса)
- [x] Страница настроек Settings (/admin/settings)
- [x] PIN изменён с 3 на 4 цифры (Auth + UsersManagement + create-worker)
- [x] Экспорт в CSV с BOM для Excel (src/lib/csv-export.ts)
- [x] Полный лендинг (src/pages/Welcome.tsx) — Hero, Фичи, Тарифы, CTA
- [x] Регистрация компании (src/pages/Register.tsx)
- [x] Multi-tenancy архитектура (company_id на всех таблицах)
- [x] Новый auth flow: companySlug + имя + PIN → email derivation
- [x] Edge Function: register-company (создаёт компанию + первого admin атомарно)
- [x] Edge Function: create-worker (обновлён: company_id, лимит, PIN=4)
- [x] Edge Function: stripe-checkout
- [x] Edge Function: stripe-webhook
- [x] Edge Function: stripe-portal
- [x] Edge Function: notify-late (Telegram уведомления об опозданиях)
- [x] Страница Billing (/admin/billing) — тарифы Starter/Business/Enterprise
- [x] Страница TelegramSettings (/admin/telegram) — настройка бота + тест
- [x] SQL миграционный файл подготовлен

## Что ЕЩЁ НЕ СДЕЛАНО (нужно сделать вручную)
- [ ] Запустить SQL миграции в Supabase Dashboard (файл: supabase/migrations/MULTI_TENANCY_MIGRATION.sql)
- [ ] Задеплоить Edge Functions командами npx supabase functions deploy ...
- [ ] Настроить Stripe: добавить STRIPE_SECRET_KEY и другие секреты в Supabase
- [ ] Настроить APP_URL в Supabase Secrets (домен продакшн сайта)
- [ ] Удалить старую папку C:\Users\user\local-shift-sync (занята сессией)

## Тарифные планы
| Тариф | Цена | Сотрудники |
|-------|------|------------|
| Старт | 990 ₽/мес | до 10 |
| Бизнес | 2490 ₽/мес | до 50 |
| Корпоративный | 5990 ₽/мес | до 200 |

## Структура БД (Supabase)
- `companies` — компании (slug, plan, max_workers, stripe_*)
- `profiles` — пользователи (company_id, full_name, pin, email)
- `user_roles` — роли (company_id, role: admin|worker)
- `sites` — объекты (company_id, lat, lon, radius_m, expected_start/end)
- `shifts` — смены (company_id, user_id, site_id, status, pause_history)
- `settings` — настройки (company_id, max_users, purge_policy_days)
- `telegram_config` — Telegram (company_id, bot_token, chat_id)

## Логин flow (multi-tenancy)
1. Пользователь вводит: код компании (slug) + имя + PIN
2. Frontend деривирует email: transliterate(name)@{slug}.geotime.local
3. Frontend деривирует password: name(no spaces) + pin
4. Прямой вызов supabase.auth.signInWithPassword({ email, password })

## Роуты
- / и /welcome → лендинг
- /auth → вход
- /register → регистрация компании
- /me → кабинет сотрудника
- /admin → панель администратора
- /admin/users, /admin/sites, /admin/reports → управление
- /admin/settings → настройки системы
- /admin/billing → подписки Stripe
- /admin/telegram → Telegram уведомления

## Важные файлы
- src/lib/supabase-auth.ts — вся логика авторизации
- src/integrations/supabase/client.ts — Supabase клиент
- .env — Supabase URL и ключи (уже заполнены)
- supabase/functions/ — все Edge Functions (Deno)
- supabase/migrations/MULTI_TENANCY_MIGRATION.sql — SQL для запуска в Dashboard

## Владелец проекта
Фирдавс. Телеграм-бот и другие проекты тоже есть в C:\Users\user\Projects\
