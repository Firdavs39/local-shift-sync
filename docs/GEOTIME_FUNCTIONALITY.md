# GeoTime — исчерпывающая документация системы

> Полный технический справочник для AI-агента (Hermes Agent). Описывает всё: каждую страницу, каждый компонент, каждую функцию, каждую таблицу БД, каждую Edge Function. Скармливать целиком как контекст.

## Оглавление

1. [О проекте и стек](#1-о-проекте-и-стек)
2. [Архитектура мульти-тенантности](#2-архитектура-мульти-тенантности)
3. [Все страницы (15)](#3-все-страницы-15)
4. [Компоненты](#4-компоненты)
5. [Хуки](#5-хуки)
6. [Library-функции (`src/lib/`)](#6-library-функции-srclib)
7. [Supabase интеграция](#7-supabase-интеграция)
8. [Все Edge Functions (9)](#8-все-edge-functions-9)
9. [Полная схема БД](#9-полная-схема-бд)
10. [RLS-политики](#10-rls-политики)
11. [Конфигурация проекта](#11-конфигурация-проекта)
12. [Endpoints для AI-агента](#12-endpoints-для-ai-агента)
13. [Известные ограничения](#13-известные-ограничения)

---

## 1. О проекте и стек

**GeoTime** — мульти-тенантная SaaS система учёта рабочего времени с GPS для охраны, стройки, клининга, выездного персонала. Работает в браузере без установки.

**Языки UI**: русский + узбекский. Полная локализация лендинга, кабинеты — только русский.

**Frontend**:
- React 18.3.1, TypeScript 5.8.3, Vite 5.4.19, `@vitejs/plugin-react-swc@^3.11.0`
- Tailwind CSS 3.4.17 + shadcn/ui (Radix UI primitives)
- React Router DOM 6.30.1
- TanStack React Query 5.83.0
- Dexie 4.2.1 + dexie-react-hooks 4.2.0 (IndexedDB для офлайн-кеша)
- date-fns 3.6.0
- Recharts 2.15.4 (графики)
- Sonner 1.7.4 (toast)
- Zod 3.25.76 (валидация форм)
- Lucide React (иконки)

**Backend**:
- Supabase Cloud (PostgreSQL 17 + Auth + Edge Functions Deno + RLS)
- Stripe (subscriptions + webhooks)
- Telegram Bot API

**Деплой**:
- Vercel — фронтенд (статический SPA, fallback на index.html)
- Supabase — БД + Edge Functions

**Project URL**: `https://ldyshcvwxfzvfjrkcfgw.supabase.co` (проект `geotime-prod`)

**Public URL**: `https://geotime.vercel.app/`

---

## 2. Архитектура мульти-тенантности

Каждая компания (`companies`) полностью изолирована:

- Все таблицы имеют `company_id` UUID
- Helper-функция `get_my_company_id()` (SECURITY DEFINER) возвращает `company_id` текущего юзера через `auth.uid()`
- Все RLS-политики применяют `WHERE company_id = get_my_company_id()`
- PIN уникален в рамках компании: `UNIQUE(company_id, pin)`

Helper-функция `has_role(user_id, role)` (SECURITY DEFINER) — проверка роли с учётом изоляции:
```sql
EXISTS(SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2 
       AND (company_id = get_my_company_id() OR get_my_company_id() IS NULL))
```

`get_my_company_id() IS NULL` — нужно для обращений service-role keys.

---

## 3. Все страницы (15)

### 3.1 Auth.tsx (`/auth`) — Вход

**Назначение**: Логин по slug компании + имя + PIN.

**Поля формы**:
- `companySlug` (text, lowercase) — код компании
- `workerName` (text) — полное имя (например "Иван Петров")
- `pin` (text, 4 цифры) — PIN-код

**Валидация**: непустые поля, PIN ровно 4 цифры.

**Действие "Войти"**:
1. `loginWithCredentials(slug, name, pin)` из `src/lib/supabase-auth.ts`
2. Транслитерация имени: кириллица → латиница (а→a, б→b, ...)
3. Email = `<translit_name_no_spaces>@<slug>.geotime.local`
4. Password = `<original_name_no_spaces><pin>` (например `ИванПетров1234`)
5. `supabase.auth.signInWithPassword({ email, password })`
6. Если admin → редирект на `/admin`, если worker → `/me`

**Error states**: Toast "Неверный код компании, логин или PIN" при ошибке.

**Ссылки**: `/register`, `/`.

### 3.2 Register.tsx (`/register`) — Регистрация компании

**Назначение**: Двухэтапная регистрация (форма + экран успеха).

**Поля формы**:
- `companyName` (text) — название компании
- `adminName` (text) — имя администратора
- `adminPin` (text, 4 цифры) — PIN администратора

**Действие "Создать компанию"**:
1. Вызов Edge Function `register-company` с `{companyName, adminName, adminPin}`
2. На сервере: создаётся `companies` (plan='trial', max_workers=10), Auth-пользователь, `profiles`, `user_roles` (role='admin'), `settings`
3. Возвращает `{success, companySlug, companyId, adminName}`
4. Показ экрана успеха с slug компании, именем, PIN-маской `(••••)`
5. Упоминание 14-дневного бесплатного trial

**Ссылки после успеха**: `/auth`, `/`.

### 3.3 Me.tsx (`/me`) — Кабинет сотрудника

**Назначение**: Активная смена + старт/пауза/завершение с геолокацией.

**Элементы UI**:
- Карточка текущего объекта с расстоянием (через Хаверсин)
- Кнопки старт/остановка смены
- Toggle WakeLock
- Реальное время (обновляется)
- Индикатор статуса (рано/вовремя/поздно)
- Экран ошибки при запрете геолокации

**Действия**:
- "Начать смену" → проверка `isWithinRadius` → INSERT в `shifts`
- "Завершить смену" → UPDATE `shifts` (ended_at, end_lat, end_lon, minutes_worked)
- Toggle WakeLock → `navigator.wakeLock.request('screen')` / `.release()`

**Загрузка данных**:
- Real-time subscription на `shifts` (текущая смена)
- SELECT `sites WHERE active=true AND company_id = get_my_company_id()`
- `getCurrentPosition()` обновляется каждые 30 секунд

**Особое поведение**:
- Авто-пауза при выходе за радиус объекта (push в `pause_history`)
- Авто-возобновление при возврате (закрывает entry с `resumed_at`)
- WakeLock держит экран включённым во время активной смены
- Detect overtime: если started_at > expected_end → флаг `is_overtime`

### 3.4 MyShifts.tsx (`/me/shifts`) — История своих смен

**Элементы**: PeriodFilter (день/неделя/месяц), карточки статистики (часы, опоздания, ранний приход, паузы), AdminDailyBreakdown (групповой просмотр по дням).

**Загрузка**: SELECT shifts JOIN sites (для name, expected_start). Группировка по дню.

**Pустое состояние**: "За выбранный период смен не найдено".

### 3.5 Admin.tsx (`/admin`) — Админ-дашборд

**6 интерактивных карточек** (с метриками):
1. Сотрудники (count active profiles) → `/admin/users`
2. Объекты (count active sites) → `/admin/sites`
3. Отчёты → `/admin/reports`
4. Настройки → `/admin/settings`
5. Биллинг → `/admin/billing`
6. Telegram → `/admin/telegram`

**Загрузка** (`loadStats` через `Promise.all`):
- count `profiles WHERE active=true`
- count `sites WHERE active=true`
- count `shifts WHERE ended_at IS NULL` (активные)
- count `shifts WHERE started_at >= today_00:00`

RLS автоматически фильтрует по company_id.

### 3.6 UsersManagement.tsx (`/admin/users`)

**Таблица сотрудников** + модалка create/edit + toggle active.

**Форма создания**:
- `fullName` (text)
- `pin` (text, 4 цифры)
- `role` (select: worker / admin)

**Действия**:
- Создать → Edge Function `create-worker`
- Редактировать → Edge Function `update-worker`
- Удалить → soft-delete (active=false). Блокируется если у юзера есть смены
- Toggle active → UPDATE `profiles.active`

**Real-time subscription** на `profiles` — зелёный индикатор "только что добавлен" для новых записей.

**Ошибки**:
- "Достигнут лимит сотрудников" (count ≥ max_workers по тарифу)
- "Пользователь с таким именем уже существует"
- "PIN must be exactly 4 digits"

### 3.7 SitesManagement.tsx (`/admin/sites`)

**Форма объекта**:
- `name` (text) — название
- `lat` (number) — широта (-90...90)
- `lon` (number) — долгота (-180...180)
- `radius_m` (number, default 100) — радиус геозоны
- `expectedStart` (time) — например "09:00"
- `expectedEnd` (time) — например "18:00"
- `timezone` (text, default 'Europe/Moscow')

**Кнопка "Использовать текущую локацию"**: `getCurrentPosition()` → автозаполнение lat/lon.

**Таблица сайтов**: показывает расстояние от текущей позиции до каждого объекта (в км).

**Real-time subscription** на `sites`.

### 3.8 Reports.tsx (`/admin/reports`)

**Таблица колонок**: Сотрудник, Объект, Начало, Конец, Статус, Опоздание, Раньше, Паузы, Отработано.

**Фильтры**: PeriodFilter (день/неделя/месяц).

**Группировка** через `groupShiftsByWorkerSiteDay()` из `src/lib/shift-grouping.ts` — несколько смен за день в одной строке.

**Цветовая кодификация статусов**: 🟢 on_time, 🔴 late, 🟡 early, ⚠️ offsite.

**Пагинация**: PAGE_SIZE = 50.

**Кнопка "Экспорт CSV"** → `exportShiftsToCSV()` (см. ниже).

**Клик по строке** → `/admin/workers/<user_id>`.

### 3.9 WorkerDetails.tsx (`/admin/workers/:id`)

**Карточки**:
- Информация о сотруднике (имя, email, PIN, статус)
- Метрики: завершённые смены, общие часы, опоздания, ранний приход, паузы

**AdminDailyBreakdown** — список смен по дням.

**Period filter** для выбора диапазона.

**Загрузка**:
- SELECT `profiles` WHERE id=:id
- SELECT `shifts` JOIN `sites` (name, expected_start) WHERE user_id=:id

### 3.10 Settings.tsx (`/admin/settings`)

**Поля формы**:
- `max_users` (number, 1-1000) — наследуется из `companies.max_workers`
- `purge_policy_days` (number, 30-3650) — сколько дней хранить (auto-purge не реализован)

**Действие "Сохранить"** → upsert в `settings`.

Информационная карточка: версия 2.0, БД Supabase, Auth по PIN-коду.

### 3.11 Billing.tsx (`/admin/billing`)

**Карточка текущего плана**: progress-bar `current_workers / max_workers`, имя тарифа, дата истечения.

**Три плана** (`PLANS` массив):
| Тариф | ID | Цена | Сотр. | Объекты |
|---|---|---|---|---|
| Starter | starter | 99 000 сум | 10 | 3 |
| Business | business | 249 000 сум | 50 | 20 (popular) |
| Enterprise | enterprise | 599 000 сум | 200 | ∞ |

**Действия**:
- "Подключить" → Edge Function `stripe-checkout` → редирект на Stripe Checkout
- "Управлять подпиской" → Edge Function `stripe-portal` → редирект на Customer Portal
- "Задать вопрос" → Telegram (`https://t.me/llmaiweb3`) с предзаполненным сообщением

**Trial**: 14 дней, plan='trial', max_workers=10, plan_expires_at = now+14d.

### 3.12 TelegramSettings.tsx (`/admin/telegram`)

**4-шаговая инструкция** (нумерованная):
1. Открыть `@BotFather` в Telegram
2. Создать бота `/newbot`
3. Получить chat_id (через @userinfobot или add бота в чат и `/start`)
4. Вставить bot_token и chat_id ниже

**Поля формы**:
- `bot_token` (text) — формат `1234567890:AAEFxxx...`
- `chat_id` (text) — `-100...` для групп или числовой ID
- `notify_late` (checkbox) — Уведомлять об опозданиях

**Действие "Сохранить"** → upsert в `telegram_config(company_id, bot_token, chat_id, notify_late)`.

**Действие "Тест"** → прямой вызов `https://api.telegram.org/bot{token}/sendMessage` с фронта. Текст: `✅ GeoTime: Telegram уведомления настроены и работают!`.

### 3.13 SuperAdmin.tsx (`/super`) — Платформенный админ

**Защита**: password-prompt на старте, темная тема.

**Аутентификация** через Edge Function `super-admin` с `{password, action: 'list'}`.

**Dashboard статистика**:
- Всего компаний
- Активных
- Заблокированных
- Истекших (plan_expires_at < now)

**Список компаний** (collapsible cards):
- Имя, slug, plan (бейдж с цветом)
- workers_count / max_workers
- sites_count
- plan_expires_at (бейдж "expired" если истёк)

**Действия в карточке компании**:
- Select для смены тарифа
- Input для дней продления
- Quick-кнопки: +30d, +90d, +365d
- Toggle active/inactive (CheckCircle/XCircle)

Все действия → Edge Function `super-admin` с `{password, action:'update', payload:{company_id, plan?, days?, active?}}`.

### 3.14 NotFound.tsx (`*`)

404 с большим градиент-текстом. Логирование в console: `404 Error: User attempted to access non-existent route: <pathname>`.

Ссылка на `/`.

### 3.15 Welcome.tsx (`/`, `/welcome`) — Лендинг

**15 секций** (полностью локализованных ru/uz):

1. **Nav** — логотип, переключатель RU/UZ, кнопки "Войти" и "Регистрация"

2. **Hero** — заголовок "Знайте, где ваши сотрудники в любую минуту", 3 чек-пойнта ("Без установки приложений", "Работает на любом телефоне", "Поддержка в Telegram"), 2 CTA-кнопки. Плавающий AppMockup с уведомлением.

3. **Marquee** — бесконечно скользящая строка с live-обновлениями (✅ начал смену, ⚠️ опоздал, GPS подтверждён, отчёт отправлен)

4. **Pain Points** — "Узнаёте себя?" + 4 проблемы:
   - "«Я уже на объекте»" — нельзя проверить
   - "Опоздал — узнали в конце дня"
   - "Табель на бумаге"
   - "5+ объектов одновременно"

5. **Comparison Table** — GeoTime vs Excel vs другие, 8 строк сравнения с CheckCircle/XCircle

6. **How It Works** — "Запуск за 10 минут", 3 шага: зарегистрировать / добавить объекты / контролировать онлайн

7. **Calculator** — интерактивный слайдер 5-200 сотрудников. Показывает: текущие потери, стоимость GeoTime, экономия, ROI ("⚡ ROI {N}× — окупается в N раз")

8. **GPS Showcase** — Badge "Геолокация в реальном времени", h1 "Видите каждого сотрудника прямо на карте". SVG-mockup карты с тремя рабочими (зелёный/зелёный/красный с пульсацией).

9. **Telegram Showcase** — Badge "Telegram-уведомления", h1 "Узнаёте об опоздании раньше клиента". Mockup чата (3 сообщения с phase-анимацией)

10. **Reports Showcase** — Badge "Умные отчёты", h1 "Зарплатная ведомость одним кликом". Mockup таблицы с CSV-кнопкой (idle → loading → done)

11. **Features** — "Всё включено", grid 3×2 (с 3D-перспективой при hover):
    - Геолокация и зоны
    - Точный учёт опозданий
    - Telegram-уведомления
    - Отчёты и экспорт
    - Паузы в смене
    - Управление командой

12. **Industry Tabs** — 4 отрасли с метриками и булитами:
    - **Охрана**: <1 с задержка, 100% GPS, −30% приписок
    - **Строительство**: 5+ объектов, 1 клик отчёт, −2 ч на учёт
    - **Клининг**: <1 мин до алерта, 20+ объектов, 0 необъяснённых смен
    - **Курьеры**: 10 мин старт, любой смартфон, +20% пунктуальность

13. **Stats Row** — 3 числа с count-up анимацией: 10 мин (запуск), 100% (браузер), 24/7 (поддержка)

14. **Testimonials Carousel** — 4 отзыва с автопереключением (5.5 с) или dots:
    - Руслан А. (Охранное предприятие, Ташкент) — "−2 ч/день на ручной учёт"
    - Санжар Т. (Строительная компания, Ташкент) — "5 объектов под контролем"
    - Нилуфар К. (Клининговый сервис, Самарканд) — "30+ объектов под контролем"
    - Баходир У. (Служба доставки, Ташкент) — "+20% пунктуальность"

15. **Pricing** — 2 плана:
    - **Free**: 0 сум, до 5 сотрудников, 1 объект, GPS+смены, отчёты+CSV, "Навсегда бесплатно"
    - **Business** (popular): 10 000 сум × кол-во сотр./мес, неограниченно сотрудников/объектов, Telegram, CSV, поддержка
    
    Note: оплата через Payme или банковский перевод.

16. **FAQ** — 5 Q&A с collapsible-аккордеоном:
    - "Нужно ли устанавливать приложение?" → нет, в браузере
    - "Что если выключит геолокацию?" → нельзя начать смену
    - "Принимаете Payme?" → да, или счёт-фактура
    - "Можно попробовать бесплатно?" → до 5 сотрудников бесплатно навсегда
    - "Как считается стоимость?" → 10 000 сум × N сотрудников

17. **Bottom CTA** — gradient-блок "Перестаньте платить за часы, которых не было", 2 кнопки

18. **Footer** — © 2025 Ташкент Узбекистан, ссылки: Войти, Регистрация, Цены, Telegram

**Анимации (CSS keyframes)**: `geotime-orb1/2`, `geotime-float`, `geotime-marquee`, `geotime-pulse`, `geotime-notif`, `geotime-num-pop`, `geotime-badge-pulse`.

**Custom hooks** на странице: `useScrollReveal`, `useCountUp`.

**i18n структуры**: `TRANSLATIONS[lang].{nav, badge, hero, pain, how, features, stats, testimonial, pricing, plans, faq, cta, footer}`, плюс отдельные `CALC_T`, `IND_T`, `TEST_T`, `SHOWCASE_T`, `MARQUEE_T`, `COMP_T`.

---

## 4. Компоненты

### 4.1 GeoTimeLogo.tsx
SVG 32×32 — фиолетовый круг (#7c3aed), пин локации, циферблат часов (стрелки на 10:00 и 3:00).

Props: `size?: number` (default 28), `className?: string`.

### 4.2 ProtectedRoute.tsx
Обёртка маршрутов. Props: `children`, `requireAdmin?: boolean`.

Логика:
1. `getCurrentUser()` + `isAdmin()`
2. Нет user → `/auth`
3. requireAdmin && !isAdmin → `/me`
4. company неактивна → экран блокировки с email поддержки
5. plan_expires_at < now → экран истечения подписки
6. Иначе рендер children

### 4.3 src/components/shifts/

**ShiftCard.tsx** — карточка смены сотрудника. Accordion с триггером (статус, объект, время, бейджи "переработка"/"автозавершение") и подробностями. `getStatusInfo(status)` возвращает иконку, цвет, лейбл.

**AdminShiftCard.tsx** — расширенная для админа. Поддерживает grouped shifts (несколько смен в один день в одной строке). Разделяет ручные паузы (фильтр `!p.auto`) и автопаузы между сменами. Иконка робота для `auto_ended`.

**DailyBreakdown.tsx** — список Card по дате со статистикой дня (`workedMinutes`, `lateMinutes`, `earlyMinutes`).

**AdminDailyBreakdown.tsx** — то же, но с AdminShiftCard и `totalPausedMinutes` в DayStats.

**PeriodFilter.tsx** — 3 кнопки (День/Неделя/Месяц) + Popover с Calendar. Возвращает `selectedPeriod: 'day'|'week'|'month'` и `selectedDate: Date`.

**PeriodStats.tsx** — карточки метрик за период:
- Отработано (Hч Mм)
- Опоздания (мин)
- Ранние прибытия (мин)
- На паузе (мин)
- Кол-во смен
- Переработка (если > 0, иконка Zap)

Plus card со списком объектов.

Helper: `formatHoursMinutes(minutes) => "${h}ч ${m}м"`.

---

## 5. Хуки

### 5.1 use-mobile.tsx
```ts
function useIsMobile(): boolean
```
matchMedia `(max-width: 767px)`, подписка на `change` событие.

### 5.2 use-toast.ts
Sonner-обёртка.

```ts
function useToast() {
  return {
    toasts: ToasterToast[],
    toast: (props) => { id, dismiss, update },
    dismiss: (toastId?) => void
  }
}
```

`TOAST_LIMIT = 1`, `TOAST_REMOVE_DELAY = 1_000_000`.

---

## 6. Library-функции (`src/lib/`)

### 6.1 supabase-auth.ts

**Типы**:
```ts
interface UserWithRole {
  id: string;
  full_name: string;
  pin: string;
  active: boolean;
  role: 'admin' | 'worker';
  company_id?: string;
}
```

**Транслитерация** (карта а→a, б→b, ё→e, ж→zh, ц→ts, ч→ch, ш→sh, щ→sch, ю→yu, я→ya, твёрдый/мягкий знак убираются).

**Функции**:
- `loginWithCredentials(slug, name, pin)` — описано в Auth.tsx выше
- `logout()` — `supabase.auth.signOut()` + clear localStorage
- `getCurrentUser()` — возвращает UserWithRole или null
- `isAdmin()` — `getCurrentUser()?.role === 'admin'`

### 6.2 csv-export.ts

**`exportShiftsToCSV(shifts: GroupedShift[], filename = 'shifts-export.csv')`**

12 колонок: Сотрудник, Объект, Дата начала, Время начала, Дата конца, Время конца, Статус, Опоздание, Пришёл раньше, Паузы, Отработано (мин), Отработано (ч:мм).

Helpers:
- `escapeCSV(value)` — кавычки + экранирование `"`/`,`/`\n`
- `getStatusLabel(status)`: on_time→Вовремя, late→Опоздание, early→Раньше, offsite→Вне объекта

Особенности: BOM `﻿` (для Excel), UTF-8, разделитель `,`. Auto-download через `link.click()`.

### 6.3 db.ts (Dexie / IndexedDB)

Класс `GeoTimeDB extends Dexie`:

```ts
users: '++id, role, active, pin'
sites: '++id, active'
shifts: '++id, userId, siteId, startedAt, status'
settings: 'id'
```

Default settings (если нет): `{maxUsers: 20, purgePolicyDays: 365}`.
Default admin (если нет/неправильный PIN): "Администратор" с PIN "777".

Используется как офлайн-fallback и кеш.

### 6.4 geo.ts

**`getDistance(lat1, lon1, lat2, lon2): number`** — формула Хаверсина:
```
R = 6371e3 // м
φ1, φ2 — широты в радианах
Δφ, Δλ — разности в радианах
a = sin²(Δφ/2) + cos(φ1)·cos(φ2)·sin²(Δλ/2)
c = 2 · atan2(√a, √(1-a))
return R * c
```

**`getCurrentPosition()`** — Promise с `enableHighAccuracy: true, timeout: 10000, maximumAge: 0`.

**`isWithinRadius(uLat, uLon, sLat, sLon, radius)`**: `distance <= radius`.

### 6.5 shift-grouping.ts

**`groupShiftsByWorkerSiteDay(shifts)`** — группирует смены одного сотрудника на одном объекте за один день.

Условие разбиения: если текущая смена `auto_ended=true` И следующая `is_overtime=true` → разные группы.

`createGroupedShift(shifts)` собирает:
- Все ручные паузы из всех смен
- **Автопаузы** между сменами (`differenceInMinutes(prev.ended_at, next.started_at)`)
- `shift_segments` — снимки каждой смены
- Объединённый `pause_history`
- Сумма `minutes_worked`

Типы: `GroupedShift`, `ShiftSegment`, `AutoPause`.

### 6.6 time.ts

- `formatTime(date)` → `"HH:mm"`
- `formatDate(date)` → `"dd.MM.yyyy"`
- `formatDateTime(date)` → `"dd.MM.yyyy HH:mm"`
- `parseTime("14:30")` → `{hours, minutes}`
- `getMinutesLate(actualTime, expectedTimeStr)` → max(0, diff)
- `getShiftStatus(actualTime, expectedTimeStr, isWithinSite)` → `'early'|'on_time'|'late'|'offsite'`:
  - `!isWithinSite` → 'offsite'
  - `minutesLate > 0` → 'late'
  - `minutesLate == 0 && actualTime < expected` → 'early'
  - иначе → 'on_time'
- `calculateMinutesWorked(start, end)` → differenceInMinutes
- `calculateEarlyMinutes(startedAt, expectedStart)` → max(0, expected - startedAt)

### 6.7 utils.ts

`cn(...inputs)` — clsx + twMerge для объединения Tailwind классов с разрешением конфликтов.

### 6.8 wakeLock.ts

- `requestWakeLock()` — `navigator.wakeLock.request('screen')`, возвращает `WakeLockSentinel | null`
- `releaseWakeLock(sentinel)` — `.release()`
- `isWakeLockSupported()` — `'wakeLock' in navigator`

### 6.9 install.ts (PWA)

- `initInstallPrompt()` — слушает `beforeinstallprompt`
- `showInstallPrompt()` — `.prompt()` + `userChoice`
- `canInstall()`, `isInstalled()`

---

## 7. Supabase интеграция (`src/integrations/supabase/`)

### 7.1 client.ts

```ts
export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    }
  }
);
```

### 7.2 types.ts (важные типы)

**profiles**:
```ts
{
  id: string; // UUID = auth.users.id
  full_name: string;
  pin: string;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}
```

**shifts**:
```ts
{
  id: string;
  user_id: string;
  site_id: string;
  started_at: string;
  ended_at: string | null;
  start_lat: number;
  start_lon: number;
  end_lat: number | null;
  end_lon: number | null;
  status: shift_status; // enum
  minutes_late: number;
  minutes_worked: number | null;
  is_paused: boolean | null;
  paused_at: string | null;
  pause_history: Json | null;
  total_paused_minutes: number | null;
  auto_ended: boolean | null;
  is_overtime: boolean | null;
  created_at: string;
}
```

**sites**:
```ts
{
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius_m: number;
  expected_start: string; // 'HH:mm:ss'
  expected_end: string;
  tz: string; // alias для timezone
  active: boolean;
  created_at: string;
  updated_at: string;
}
```

**Enums**:
- `shift_status`: `'early' | 'on_time' | 'late' | 'offsite'`
- `app_role`: `'admin' | 'worker'`

---

## 8. Все Edge Functions (9)

### 8.1 register-company

**Метод**: POST. **CORS**: `*`. **verify_jwt**: false.

**Env**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Body**: `{companyName, adminName, adminPin}` (PIN: `/^\d{4}$/`).

**Логика**:
1. Валидация (непустые, PIN 4 цифры)
2. Slug-генерация: `transliterate(companyName) + slugify` (макс 30 char, замена разделителей на `-`). Уникальность через `SELECT slug FROM companies WHERE slug LIKE '<slug>%'` + суффикс `-N`.
3. INSERT companies (plan='trial', max_workers=10, active=true) → возвращает {id, slug}
4. `supabaseAdmin.auth.admin.createUser({email, password, email_confirm: true, user_metadata: {full_name, pin, role: 'admin', company_id}})`
5. UPDATE companies.owner_user_id
6. UPDATE profiles SET email, company_id (триггер уже создал базовую запись)
7. UPDATE user_roles SET company_id
8. UPSERT settings(id=company_id, max_users=10, purge_policy_days=365)

**Откат**: при ошибке создания auth — DELETE company.

**Ответ** 200: `{success, companySlug, companyId, adminName}`.

**Ошибки** 400: "Заполните все поля", "PIN должен быть 4 цифры", "Не удалось создать компанию".

**Не атомарно** — может быть рассинхрон между auth.users и profiles.

### 8.2 create-worker

**Метод**: POST. **CORS**: `*`. **verify_jwt**: false (но проверяет Auth header).

**Env**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.

**Header**: `Authorization: Bearer <JWT>`.

**Body**: `{fullName, pin, role: 'admin'|'worker'}`.

**Логика**:
1. Извлечь callerUser из JWT (через anon-key + Auth header)
2. SELECT profiles.company_id WHERE id=callerUser.id
3. SELECT companies.slug, max_workers WHERE id=companyId
4. Валидация (PIN 4 цифры, role в enum)
5. SELECT count(*) profiles WHERE company_id=:cid AND active=true → 403 если ≥ max_workers
6. SELECT id FROM profiles WHERE ILIKE(full_name, fullName) AND company_id=:cid → 400 если найден
7. email = `<translit_no_spaces>@<slug>.geotime.local`, password = `<name_no_spaces><pin>`
8. `supabaseAdmin.auth.admin.createUser({email, password, email_confirm: true, user_metadata: {full_name, pin, role, company_id}})`
9. UPDATE profiles SET email, company_id WHERE id=newUserId
10. UPDATE user_roles SET company_id WHERE user_id=newUserId

**Ответ** 200: `{success, userId, fullName, pin}`.

**Ошибки**: 401 Unauthorized, 400 валидация, 403 "Достигнут лимит сотрудников".

### 8.3 update-worker

**Метод**: POST. **CORS**: `*`. **verify_jwt**: true (проверяет admin role).

**Body**: `{userId, fullName?, pin?, role?}`.

**Логика**:
1. Извлечь callerUser, проверить роль admin
2. SELECT callerProfile.company_id
3. SELECT targetProfile WHERE id=userId. Проверить targetProfile.company_id == callerProfile.company_id (иначе 400 "Нет доступа").
4. SELECT company.slug
5. Если изменено fullName или pin:
   - Получить текущий PIN если pin не предоставлен
   - Пересчитать email и password
   - `supabaseAdmin.auth.admin.updateUserById(userId, {email, password})`
   - UPDATE profiles SET full_name, email, pin
6. Если role в запросе: UPDATE user_roles SET role WHERE user_id=userId

**Ответ** 200: `{success}`.

### 8.4 auto-end-shifts

**Метод**: POST/GET. **CORS**: `*`. **verify_jwt**: false.

**Env**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Body**: пусто.

**Логика**:
1. SELECT shifts (id, user_id, site_id, started_at, is_paused, paused_at, pause_history, total_paused_minutes) JOIN sites(expected_end, timezone) WHERE ended_at IS NULL AND is_overtime=false
2. Для каждой смены:
   - Парсинг `expected_end` ("HH:MM:SS" или "HH:MM")
   - Конвертация UTC через timezone:
     ```ts
     nowAsLocal = Date(now.toLocaleString('en-US', {timeZone}))
     tzOffsetMs = now - nowAsLocal
     expectedEndLocal = setHours на nowAsLocal
     expectedEndTime = expectedEndLocal + tzOffsetMs
     ```
   - Если now >= expectedEndTime:
     - Если is_paused: добавить запись в pause_history `{started_at, ended_at, duration_minutes}` и прибавить к total_paused_minutes
     - minutesWorked = max(0, totalMinutes − total_paused_minutes)
     - UPDATE shifts SET ended_at=expectedEndTime, auto_ended=true, is_paused=false, paused_at=null, total_paused_minutes, pause_history, minutes_worked

**Ответ** 200: `{message, checked: N, ended: M}`.

### 8.5 notify-late

**Метод**: POST. **CORS**: `*`. **verify_jwt**: false.

**Body**: `{record: {company_id, user_id, site_id, minutes_late, started_at, status}}` или эти поля напрямую (поддерживает оба формата для DB Webhook).

**Логика**:
1. status !== 'late' || minutes_late <= 0 → `{skipped: true}`
2. SELECT telegram_config WHERE company_id=:cid. Если нет или notify_late=false → skip
3. SELECT profiles.full_name (fallback "Сотрудник")
4. SELECT sites.name (fallback "Объект")
5. Format time: `toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'})`
6. Markdown-сообщение:
   ```
   ⚠️ *Опоздание на работу*

   👤 *{name}*
   📍 Объект: {site}
   ⏰ Время прихода: {time}
   🕐 Опоздание: *{N} мин*
   ```
7. POST `https://api.telegram.org/bot{token}/sendMessage` с `{chat_id, text, parse_mode: 'Markdown'}`
8. **Retry-логика**: 3 попытки с exponential backoff (1s, 2s)

**Ответ**: `{sent: true}` или `{skipped: true, reason: ...}`.

### 8.6 stripe-checkout

**Метод**: POST. **CORS**: `*`. **verify_jwt**: false (Auth header).

**Env**: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_ENTERPRISE`, `APP_URL`.

**Plan config**:
```ts
PLAN_CONFIG = {
  starter:    { priceEnvKey: 'STRIPE_PRICE_STARTER',    maxWorkers: 10  },
  business:   { priceEnvKey: 'STRIPE_PRICE_BUSINESS',   maxWorkers: 50  },
  enterprise: { priceEnvKey: 'STRIPE_PRICE_ENTERPRISE', maxWorkers: 200 }
}
```

**Body**: `{planId}`.

**Логика**:
1. Auth header → user
2. Validate planId → priceId из env
3. SELECT companies (id, name, stripe_customer_id)
4. Если нет stripe_customer_id:
   - POST `https://api.stripe.com/v1/customers` с `name=<company.name>&metadata[company_id]=<id>`
   - UPDATE companies.stripe_customer_id
5. POST `https://api.stripe.com/v1/checkout/sessions`:
   ```
   customer={customerId}
   mode=subscription
   line_items[0][price]={priceId}
   line_items[0][quantity]=1
   success_url={APP_URL}/admin/billing?success=true
   cancel_url={APP_URL}/admin/billing?canceled=true
   metadata[company_id]={cid}
   metadata[plan_id]={planId}
   ```

**Ответ**: `{url}`.

### 8.7 stripe-portal

**Метод**: POST. **Env**: `STRIPE_SECRET_KEY`, `APP_URL`.

**Body**: пусто.

**Логика**:
1. Auth → user → company.stripe_customer_id
2. POST `https://api.stripe.com/v1/billing_portal/sessions` с `customer=<id>&return_url={APP_URL}/admin/billing`

**Ответ**: `{url}`.

### 8.8 stripe-webhook

**Метод**: POST. **CORS**: нет. **verify_jwt**: false.

**Env**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, и все `STRIPE_PRICE_*`.

**Header**: `Stripe-Signature: t=<timestamp>,v1=<signature>`.

**Body**: raw body Stripe Event.

**Логика**:
1. Парсинг подписи, HMAC-SHA256 верификация:
   ```ts
   payload = `${timestamp}.${rawBody}`
   computed = hex(crypto.subtle.sign('HMAC', key, payload))
   if (computed !== v1) → 400
   ```
2. event = JSON.parse(rawBody)

**Обработка событий**:

- `checkout.session.completed`:
  - GET `/v1/subscriptions/{session.subscription}` → priceId из `sub.items.data[0].price.id`
  - `updateCompanyPlan(session.customer, priceId, sub.id, sub.current_period_end)`

- `customer.subscription.updated`:
  - priceId из event → `updateCompanyPlan(...)`

- `customer.subscription.deleted`:
  - SELECT companies WHERE stripe_customer_id=:cust
  - UPDATE companies SET plan='trial', max_workers=10, stripe_subscription_id=NULL, plan_expires_at=NULL

`updateCompanyPlan(customerId, priceId, subId, expiresAt)`:
```sql
UPDATE companies SET 
  plan = PLAN_BY_PRICE[priceId].plan,
  max_workers = PLAN_BY_PRICE[priceId].maxWorkers,
  stripe_subscription_id = subId,
  plan_expires_at = new Date(expiresAt * 1000).toISOString()
WHERE id = (SELECT id FROM companies WHERE stripe_customer_id=:cust)
```

**Ответ**: 200 `{received: true}` или 400 plain text.

### 8.9 super-admin

**Метод**: POST. **CORS**: `*`. **verify_jwt**: false. **Auth**: password.

**Env**: `SUPER_ADMIN_PASSWORD`.

**Body**: `{password, action: 'list'|'update', payload?}`.

**Action 'list'**:
- SELECT companies ORDER BY created_at DESC
- Для каждой: COUNT profiles WHERE company_id, COUNT sites WHERE company_id
- Возврат: `{companies: [{...company, workers_count, sites_count}]}`

**Action 'update'** payload `{company_id, plan?, days?, active?}`:
- Если plan: UPDATE plan + max_workers (PLAN_LIMITS = {trial:10, start:10, business:50, corporate:200})
- Если days > 0: UPDATE plan_expires_at = now + days
- Если active присутствует: UPDATE active

**Ответ**: 200 `{success: true}` / 401 "Неверный пароль" / 400 "company_id required".

---

## 9. Полная схема БД

### 9.1 ENUM типы

```sql
CREATE TYPE app_role AS ENUM ('admin', 'worker');
CREATE TYPE shift_status AS ENUM ('early', 'on_time', 'late', 'offsite');
```

### 9.2 companies
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id UUID REFERENCES auth.users(id),
  plan TEXT NOT NULL DEFAULT 'trial',
  plan_expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  max_workers INTEGER NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.3 profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  pin TEXT NOT NULL,
  email TEXT,
  company_id UUID REFERENCES companies(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, pin)
);
CREATE INDEX idx_profiles_company_id ON profiles(company_id);
```

### 9.4 user_roles
```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  company_id UUID REFERENCES companies(id),
  UNIQUE(user_id, role)
);
CREATE INDEX idx_user_roles_company_id ON user_roles(company_id);
```

### 9.5 sites
```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL,
  expected_start TIME NOT NULL,
  expected_end TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  company_id UUID REFERENCES companies(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sites_company_id ON sites(company_id);
```

### 9.6 shifts
```sql
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  is_paused BOOLEAN DEFAULT false,
  paused_at TIMESTAMPTZ,
  pause_history JSONB DEFAULT '[]'::jsonb,
  total_paused_minutes INTEGER DEFAULT 0,
  start_lat DOUBLE PRECISION NOT NULL,
  start_lon DOUBLE PRECISION NOT NULL,
  end_lat DOUBLE PRECISION,
  end_lon DOUBLE PRECISION,
  status shift_status NOT NULL,
  minutes_late INTEGER NOT NULL DEFAULT 0,
  minutes_worked INTEGER,
  auto_ended BOOLEAN DEFAULT false,
  is_overtime BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shifts_company_id ON shifts(company_id);
```

`pause_history` структура (JSONB):
```json
[
  {"paused_at": "ISO", "resumed_at": "ISO", "duration_minutes": N},
  {"paused_at": "ISO", "resumed_at": null}
]
```

### 9.7 settings
```sql
CREATE TABLE settings (
  id TEXT PRIMARY KEY, -- может быть company_id в multi-tenancy
  max_users INTEGER NOT NULL DEFAULT 20,
  purge_policy_days INTEGER NOT NULL DEFAULT 365,
  company_id UUID REFERENCES companies(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.8 telegram_config
```sql
CREATE TABLE telegram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  notify_late BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.9 Helper-функции

**`get_my_company_id()`**:
```sql
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;
```

**`has_role(user_id, role)`**:
```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
      AND (company_id = get_my_company_id() OR get_my_company_id() IS NULL)
  )
$$;
```

**`handle_new_user()`** триггер:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name, pin, active, company_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Новый пользователь'),
    COALESCE(new.raw_user_meta_data->>'pin', ''),
    true,
    CASE WHEN new.raw_user_meta_data->>'company_id' IS NOT NULL
      THEN (new.raw_user_meta_data->>'company_id')::UUID ELSE NULL END
  );
  RETURN new;
END;
$$;
```

**`update_updated_at_column()`** — триггер для авто-обновления `updated_at` на `profiles`, `sites`.

---

## 10. RLS-политики

### 10.1 companies
```sql
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_select_own" ON companies FOR SELECT TO authenticated
  USING (id = get_my_company_id());

CREATE POLICY "company_update_owner" ON companies FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid());
```

### 10.2 profiles
```sql
CREATE POLICY "company_profiles_select" ON profiles FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "company_profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND company_id = get_my_company_id());

CREATE POLICY "company_profiles_admin_all" ON profiles FOR ALL TO authenticated
  USING (company_id = get_my_company_id() AND has_role(auth.uid(), 'admin'));
```

### 10.3 user_roles
```sql
CREATE POLICY "company_roles_select" ON user_roles FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "company_roles_admin_all" ON user_roles FOR ALL TO authenticated
  USING (company_id = get_my_company_id() AND has_role(auth.uid(), 'admin'));
```

### 10.4 sites
```sql
CREATE POLICY "company_sites_select" ON sites FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND active = true);

CREATE POLICY "company_sites_admin_all" ON sites FOR ALL TO authenticated
  USING (company_id = get_my_company_id() AND has_role(auth.uid(), 'admin'));
```

### 10.5 shifts
```sql
CREATE POLICY "company_shifts_worker_select" ON shifts FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND company_id = get_my_company_id());

CREATE POLICY "company_shifts_admin_select" ON shifts FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "company_shifts_insert" ON shifts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id = get_my_company_id());

CREATE POLICY "company_shifts_update" ON shifts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND company_id = get_my_company_id());

CREATE POLICY "company_shifts_admin_all" ON shifts FOR ALL TO authenticated
  USING (company_id = get_my_company_id() AND has_role(auth.uid(), 'admin'));
```

### 10.6 settings
```sql
CREATE POLICY "company_settings_select" ON settings FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "company_settings_update" ON settings FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id() AND has_role(auth.uid(), 'admin'));
```

### 10.7 telegram_config
```sql
CREATE POLICY "company_telegram_all" ON telegram_config FOR ALL TO authenticated
  USING (company_id = get_my_company_id() AND has_role(auth.uid(), 'admin'));
```

---

## 11. Конфигурация проекта

### 11.1 package.json scripts
```json
"dev": "vite"
"dev:host": "vite --host 0.0.0.0 --port 8080"
"build": "vite build"
"build:dev": "vite build --mode development"
"lint": "eslint ."
"preview": "vite preview"
```

### 11.2 vite.config.ts
```ts
{
  server: { host: "::", port: 8080, allowedHosts: true },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } }
}
```

### 11.3 tsconfig.json
- Path alias: `"@/*": ["./src/*"]`
- Soft type-checking: `noImplicitAny: false`, `strictNullChecks: false`

### 11.4 tailwind.config.ts (CSS переменные HSL)

**Light mode** (`:root`):
- `--primary: 217 91% 60%` (синий)
- `--secondary: 142 76% 36%` (зелёный)
- `--destructive: 0 84% 60%` (красный)
- `--accent: 142 76% 36%`
- `--background: 0 0% 100%`
- `--foreground: 222 47% 11%`

**Dark mode** (`.dark`): инверсия фон/текст.

**Градиенты**:
- `--gradient-primary: linear-gradient(135deg, hsl(217 91% 60%), hsl(262 83% 58%))`
- `--gradient-accent: linear-gradient(135deg, hsl(142 76% 36%), hsl(158 64% 52%))`

### 11.5 vercel.json
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### 11.6 index.html

- `lang="ru"`, viewport mobile, `theme-color: #7c3aed`
- OG: `og:title="GeoTime — Учёт рабочего времени с геолокацией"`, `og:locale=ru_RU`, `og:url=https://geotime.vercel.app/`
- JSON-LD `SoftwareApplication`, Узбекистан, UZS, цены 99000-599000
- PWA: `manifest.json`, SVG favicon + ICO fallback, Apple touch icon

### 11.7 .env переменные
```
VITE_SUPABASE_PROJECT_ID=ldyshcvwxfzvfjrkcfgw
VITE_SUPABASE_URL=https://ldyshcvwxfzvfjrkcfgw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<JWT anon-key>
```

### 11.8 App.tsx структура
```tsx
<QueryClientProvider client={queryClient}>
  <BrowserRouter>
    <Toaster />
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/register" element={<Register />} />
      <Route path="/me" element={<ProtectedRoute><Me /></ProtectedRoute>} />
      <Route path="/me/shifts" element={<ProtectedRoute><MyShifts /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
      <Route path="/admin/sites" element={<ProtectedRoute requireAdmin><SitesManagement /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute requireAdmin><UsersManagement /></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute requireAdmin><Reports /></ProtectedRoute>} />
      <Route path="/admin/workers/:id" element={<ProtectedRoute requireAdmin><WorkerDetails /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute requireAdmin><Settings /></ProtectedRoute>} />
      <Route path="/admin/billing" element={<ProtectedRoute requireAdmin><Billing /></ProtectedRoute>} />
      <Route path="/admin/telegram" element={<ProtectedRoute requireAdmin><TelegramSettings /></ProtectedRoute>} />
      <Route path="/super" element={<SuperAdmin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
</QueryClientProvider>
```

---

## 12. Endpoints для AI-агента

### 12.1 Supabase REST (PostgREST)

```
Base: https://ldyshcvwxfzvfjrkcfgw.supabase.co/rest/v1/
Headers: 
  apikey: <key>
  Authorization: Bearer <key>
  Accept: application/json
```

**Примеры запросов** (с фильтрацией по company_id):

```
# Все смены сегодня
GET /shifts?company_id=eq.<UUID>&started_at=gte.2026-05-09T00:00:00&select=*

# Опоздавшие сегодня
GET /shifts?company_id=eq.<UUID>&status=eq.late&started_at=gte.2026-05-09T00:00:00&order=minutes_late.desc

# Активные смены сейчас
GET /shifts?company_id=eq.<UUID>&ended_at=is.null&select=*

# Смены сотрудника по имени
GET /shifts?company_id=eq.<UUID>&user_id=in.(SELECT id FROM profiles WHERE full_name=ilike.*<name>*)
# (для in() нужен сложный fetch)

# Активные сотрудники
GET /profiles?company_id=eq.<UUID>&active=eq.true&select=id,full_name

# Активные объекты
GET /sites?company_id=eq.<UUID>&active=eq.true&select=*

# Аггрегации (RPC через PostgREST):
GET /shifts?company_id=eq.<UUID>&select=user_id,avg(minutes_late)&group=user_id
```

⚠️ **PostgREST не выполнит запросы** через anon key без активной сессии (RLS блокирует). Нужно:
- **Service role key** (полный доступ, никогда не давать LLM напрямую)
- **Read-only Postgres role** (через `GRANT SELECT` на 4 таблицы) с прямым `psycopg`/`asyncpg` подключением
- **Edge Function `bot-api`** (рекомендуется) — единый endpoint с `X-Bot-Key` секретом

### 12.2 Edge Functions

```
Base: https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/
```

| Функция | URL | Header |
|---|---|---|
| register-company | `/register-company` | (none) |
| create-worker | `/create-worker` | `Authorization: Bearer <user_jwt>` |
| update-worker | `/update-worker` | `Authorization: Bearer <user_jwt>` |
| auto-end-shifts | `/auto-end-shifts` | (cron) |
| notify-late | `/notify-late` | (none, DB webhook) |
| stripe-checkout | `/stripe-checkout` | `Authorization: Bearer <user_jwt>` |
| stripe-portal | `/stripe-portal` | `Authorization: Bearer <user_jwt>` |
| stripe-webhook | `/stripe-webhook` | `Stripe-Signature: ...` |
| super-admin | `/super-admin` | (password в body) |

### 12.3 Рекомендация для бота

Создать новую Edge Function `bot-api` (read-only) с собственным `X-Bot-Key`:

```
POST /functions/v1/bot-api
Header: X-Bot-Key: <secret>
Body: { "operation": "<name>", "params": {...} }
```

Операции:
- `today_shifts` — кто вышел сегодня
- `late_today` — опоздавшие сегодня
- `active_now` — на смене сейчас
- `avg_lateness?days=7` — топ опаздывающих
- `worker_stats?name=...` — статистика сотрудника
- `worked_hours?name=...` — отработано часов
- `offsite_incidents?days=30` — нарушения геозоны

Внутри функция использует service-role key (через `SUPABASE_SERVICE_ROLE_KEY`) и жёстко скоупится на `BOT_COMPANY_UUID`.

---

## 13. Известные ограничения

### Что нельзя сейчас
- ❌ Откатить смену задним числом (нет UI)
- ❌ Редактировать чужую смену админом (только просмотр)
- ❌ Восстановить soft-deleted сотрудника (нет UI)
- ❌ Изменить company_id у объекта/смены (по дизайну)
- ❌ Импорт смен через API (нет endpoint)
- ❌ Auto-purge старых смен по `purge_policy_days` (не реализован)

### Технические долги
- `UNIQUE(user_id, role)` на `user_roles` некорректен в multi-tenancy (нужен `user_id, company_id, role`)
- Регистрация компании НЕ атомарна (auth.users может остаться без profile)
- Email уникальность в компании не проверяется
- PIN дублируется в `profiles.pin` и в `auth.users.raw_user_meta_data.pin`
- Нет retry-логики во всех функциях кроме `notify-late`

### Что не сделано (из CLAUDE.md)
- [ ] Запустить SQL миграции в Supabase Dashboard
- [ ] Задеплоить Edge Functions (`npx supabase functions deploy`)
- [ ] Настроить Stripe секреты (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `STRIPE_WEBHOOK_SECRET`)
- [ ] Настроить `APP_URL` в Supabase Secrets

---

## Конец документа

Это полный технический справочник GeoTime. Скармливать AI-агенту как контекст системы.
