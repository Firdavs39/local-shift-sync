# GeoTime Bot API

> Read-only HTTP API для AI-агентов, Telegram-ботов, n8n, Zapier и любых внешних интеграций. Каждая компания может выпустить свой ключ через `/admin/api-keys`.

## Содержание

1. [Аутентификация](#аутентификация)
2. [Формат ключа](#формат-ключа)
3. [Тарифы и лимиты](#тарифы-и-лимиты)
4. [Endpoints](#endpoints)
5. [Управление ключами (manage-api-keys)](#управление-ключами-manage-api-keys)
6. [Скоупы (scopes)](#скоупы-scopes)
7. [Ошибки](#ошибки)
8. [Безопасность](#безопасность)
9. [Примеры интеграций](#примеры-интеграций)
10. [Системный промпт для AI-агента](#системный-промпт-для-ai-агента)

---

## Аутентификация

Каждый запрос к bot-api требует API-ключ в HTTP-заголовке. Поддерживаются два формата:

```http
Authorization: Bearer gtk_v1_live_acme_AbCd...X4f9
```

или (legacy):

```http
X-Bot-Key: gtk_v1_live_acme_AbCd...X4f9
```

Ключ создаётся админом компании в `/admin/api-keys` через UI и **показывается один раз** при создании. Сохрани его в `.env` своего бота сразу.

### Получение ключа

1. Войди как admin компании в GeoTime
2. Открой **Дашборд → API-ключи**
3. Нажми **«Создать ключ»**, заполни форму (название, scopes, тип агента, срок)
4. Скопируй ключ из reveal-окна и сохрани

---

## Формат ключа

```
gtk_v1_live_<company_slug>_<32_random_base62>
gtk_v1_live_acme_AbCd1234EfGh5678IjKl9012MnOpQrSt
└─┬─┘ └┬┘ └─┬─┘ └────┬─────┘ └──────────────┬──────────────┘
 │   │    │       │                       │
 │   │    │       │                       Random 32 chars (192 bits entropy)
 │   │    │       Company slug
 │   │    Environment: 'live' or 'test'
 │   Format version (v1)
 GeoTime Key prefix
```

В БД хранится **только** HMAC-SHA-256 хеш ключа. Сам ключ нигде не сохраняется после показа.

---

## Тарифы и лимиты

| Тариф | Ключей | RPM | Daily quota | Audit retention | IP allowlist |
|---|---|---|---|---|---|
| **Trial** | 1 (sandbox) | 30 | 1 000 | — | — |
| **Старт** | 2 | 60 | 10 000 | 7 дней | — |
| **Бизнес** | 10 | 300 | 100 000 | 30 дней | ✓ |
| **Корпоративный** | ∞ | 1 000 | ∞ | 365 дней | ✓ (required) |

**Token bucket algorithm**: per-key sliding window. При превышении возвращается **HTTP 429** с заголовком `Retry-After: <seconds>`.

**Daily quota** считается по UTC-полуночи. Превышение → 429 на весь день.

**Overage**: 0.3-0.5 ₽ за 100 запросов сверх квоты (выставляется с следующим счётом).

---

## Endpoints

Базовый URL:

```
https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/bot-api
```

Все endpoints — **GET only**. Все ответы в формате:

```json
{ "data": { ... } }
```

или ошибка:

```json
{ "error": { "message": "...", "code": "..." } }
```

### `GET /`

Discovery — возвращает scopes ключа и список доступных endpoints. Полезно как первый запрос для AI-агента, чтобы он знал свои возможности.

```bash
curl -H "Authorization: Bearer $KEY" \
  https://.../bot-api/
```

Ответ:
```json
{
  "data": {
    "api": "GeoTime bot-api",
    "version": "v1",
    "company_id": "uuid-...",
    "scopes": ["read:basic", "read:reports"],
    "endpoints": ["GET /shifts", "GET /workers", ...]
  }
}
```

### `GET /shifts`

Список смен с фильтрами.

**Query params:**
- `date` (YYYY-MM-DD) — фильтр по дате начала
- `status` (`early` | `on_time` | `late` | `offsite`) — фильтр по статусу
- `user_id` (UUID) — фильтр по сотруднику
- `site_id` (UUID) — фильтр по объекту
- `limit` (1–100, default 20) — макс кол-во результатов

**Scope:** `read:basic`

```bash
curl -H "Authorization: Bearer $KEY" \
  "https://.../bot-api/shifts?status=late&date=2026-05-10&limit=50"
```

Ответ:
```json
{
  "data": {
    "shifts": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "full_name": "Иван Петров",
        "site_id": "uuid",
        "site_name": "Склад №1",
        "site_timezone": "Europe/Moscow",
        "started_at": "2026-05-10T09:15:00+00:00",
        "ended_at": null,
        "status": "late",
        "minutes_late": 15,
        "minutes_worked": null,
        "total_paused_minutes": 0,
        "auto_ended": false,
        "is_overtime": false
      }
    ],
    "count": 1
  }
}
```

### `GET /active-now`

Кто на смене прямо сейчас (`ended_at IS NULL`). **Scope:** `read:basic`.

### `GET /late-today`

Опоздавшие сегодня (`status='late'`, отсортированы по `minutes_late DESC`). **Scope:** `read:basic`.

### `GET /workers`

Активные сотрудники компании.

**Query params:** `active=true` (default) | `active=false`

**Scope:** `read:basic`

### `GET /sites`

Активные объекты с координатами, timezone, расписанием.

**Query params:** `active=true` (default)

**Scope:** `read:basic`

### `GET /worker-stats`

Статистика конкретного сотрудника за период.

**Query params:**
- `name` (string) — частичное совпадение по `full_name` (case-insensitive)
- `user_id` (UUID) — точное совпадение
- `days` (1–365, default 30) — период

**Один из `name` или `user_id` обязателен.**

**Scope:** `read:reports` или `read:basic`

Ответ:
```json
{
  "data": {
    "workers": [{
      "user_id": "uuid",
      "full_name": "Иван Петров",
      "shifts_count": 22,
      "late_count": 3,
      "on_time_count": 17,
      "early_count": 2,
      "offsite_count": 0,
      "overtime_count": 1,
      "total_minutes_worked": 9460,
      "total_minutes_late": 47,
      "avg_minutes_late": 16,
      "total_hours_worked": 157.7
    }],
    "period_days": 30,
    "count": 1
  }
}
```

### `GET /summary`

Агрегат за период.

**Query params:**
- `days` (1–90, default 7)
- `site_id` (UUID, optional) — только по конкретному объекту

**Scope:** `read:reports` или `read:basic`

Ответ:
```json
{
  "data": {
    "period_days": 7,
    "total_shifts": 142,
    "on_time": 128,
    "late": 12,
    "early": 2,
    "offsite": 0,
    "overtime": 4,
    "total_hours": 1136.5,
    "avg_minutes_late": 12,
    "site_id": null
  }
}
```

### `GET /digest`

Готовая сводка для отправки в Telegram-чат.

**Query params:**
- `type` — `morning` (1 день) | `evening` (1 день) | `weekly` (7 дней)

**Scope:** `read:reports` или `read:basic`

Ответ:
```json
{
  "data": {
    "type": "morning",
    "period_days": 1,
    "total_shifts": 22,
    "on_time": 18,
    "late": 3,
    "offsite": 0,
    "overtime": 1,
    "closed": 14,
    "still_open": 8,
    "top_late": [
      { "name": "Иван Петров", "total_min": 45, "count": 1 }
    ],
    "generated_at": "2026-05-10T09:00:00.000Z"
  }
}
```

### `GET /audit-log`

История запросов API (только для проверки агентом своей активности).

**Query params:** `limit` (1–100, default 20)

**Scope:** `read:audit` (требуется отдельный)

---

## Управление ключами (manage-api-keys)

Отдельный Edge Function для CRUD ключей, требует JWT админа компании. Используется UI `/admin/api-keys`, но можно вызывать и напрямую.

Базовый URL:
```
https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/manage-api-keys
```

Все запросы требуют `Authorization: Bearer <user_jwt>`.

| Метод | Путь | Действие |
|---|---|---|
| `POST` | `/create` | Создать ключ → вернуть plain key один раз |
| `GET` | `/list?include_revoked=true` | Список ключей |
| `GET` | `/tier` | Текущие лимиты тарифа |
| `GET` | `/usage/:id` | Per-key usage статистика |
| `GET` | `/events/:id` | Аудит-лог изменений ключа |
| `PATCH` | `/:id` | Изменить name/scopes/ip/expires |
| `POST` | `/:id/revoke` | Отозвать |
| `POST` | `/:id/restore` | Восстановить (если <30 дней с revoke) |
| `POST` | `/:id/rotate` | Bluestrap rotation (старый живёт ещё 7 дней) |

### POST /create

```json
{
  "name": "Hermes для Иванова",
  "scopes": ["read:basic", "read:reports"],
  "agent_type": "telegram-bot",
  "intended_use": "Утренние сводки в групповой чат",
  "expires_at": "2027-05-10T00:00:00Z",
  "ip_allowlist": ["93.184.216.34"],
  "env": "live"
}
```

Ответ:
```json
{
  "data": {
    "key": {
      "id": "uuid",
      "name": "Hermes для Иванова",
      "key_prefix": "gtk_v1_live_acme",
      "key_last4": "X4f9",
      "scopes": ["read:basic","read:reports"],
      "agent_type": "telegram-bot",
      "expires_at": "2027-05-10T00:00:00Z",
      "created_at": "2026-05-10T..."
    },
    "plain_key": "gtk_v1_live_acme_AbCd...X4f9",
    "warning": "This is the ONLY time the full key will be shown. Save it now."
  }
}
```

---

## Скоупы (scopes)

| Scope | Что разрешает |
|---|---|
| `read:basic` | `/shifts`, `/active-now`, `/late-today`, `/workers`, `/sites` |
| `read:reports` | `/worker-stats`, `/summary`, `/digest` |
| `read:full` | Всё read-доступы (включая координаты в нерабочее время) |
| `read:audit` | `/audit-log` (требует отдельного scope) |
| `write:notes` | Зарезервировано для будущей версии (запись заметок к сменам) |

**Default при создании:** `read:basic` (минимально необходимое).

**Принцип**: давай ключу только те scopes которые реально нужны его задаче. Никогда не выдавай `read:full` если бот делает только утренние сводки.

---

## Ошибки

Все ошибки возвращают HTTP-код + JSON:

```json
{
  "error": { "message": "...", "code": "..." }
}
```

| Code | Status | Когда |
|---|---|---|
| `missing_key` | 401 | Нет заголовка Authorization |
| `invalid_format` | 401 | Ключ не подходит под regex `gtk_v1_(live\|test)_...` |
| `invalid_key` | 401 | Ключ не найден / отозван / неверный |
| `expired` | 401 | `expires_at < now()` |
| `ip_denied` | 403 | IP не в allowlist ключа |
| `scope_denied` | 403 | Не хватает scope для endpoint |
| `rate_limited` | 429 | Превышен RPM (см. `Retry-After`) |
| `not_found` | 404 | Endpoint не существует |
| `query_error` | 500 | Ошибка БД |
| `config_error` | 500 | Серверная конфигурация (свяжись с поддержкой) |

Заголовки 429:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
X-RateLimit-Remaining: 0
```

---

## Безопасность

### Что защищается

- **HMAC-SHA-256 + server-side pepper** — даже если БД утекёт, ключи нельзя восстановить
- **Constant-time comparison** — нет timing attacks при проверке
- **Tenant isolation** — `company_id` берётся ТОЛЬКО из ключа, любые `?company_id=` параметры игнорируются
- **PII filter** — pin, email, координаты сотрудников в нерабочее время никогда не возвращаются
- **Audit log** — каждый запрос пишется в `api_audit_log` (key_id, endpoint, IP, latency, status)
- **Rate limiting** — token bucket per-key + daily quota
- **Soft revoke** — отзыв даёт 30 дней на восстановление

### Что НЕ нужно делать

- ❌ Не коммить ключ в git, не публикуй на GitHub, не вставляй в скриншоты
- ❌ Не передавай ключ через URL (`?key=...`) — он попадёт в логи
- ❌ Не используй один ключ для прода и теста — выпусти `gtk_v1_test_` отдельно
- ❌ Не давай агенту scope `read:full` если ему хватит `read:basic`
- ❌ Не игнорируй HTTP 429 — добавь exponential backoff в клиент

### При утечке

1. Зайди в `/admin/api-keys`
2. Найди утёкший ключ
3. Нажми **«Отозвать»** → подтверди ввод имени ключа
4. Ключ перестаёт работать **немедленно**
5. Создай новый и обнови интеграцию

---

## Примеры интеграций

### Bash / curl

```bash
KEY="gtk_v1_live_acme_AbCd...X4f9"
BASE="https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/bot-api"

# Кто опоздал сегодня
curl -H "Authorization: Bearer $KEY" "$BASE/late-today"

# Утренняя сводка
curl -H "Authorization: Bearer $KEY" "$BASE/digest?type=morning"

# Статистика Иванова за неделю
curl -H "Authorization: Bearer $KEY" "$BASE/worker-stats?name=Иванов&days=7"
```

### Python

```python
import os, requests

API = "https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/bot-api"
HEADERS = {"Authorization": f"Bearer {os.environ['GEOTIME_API_KEY']}"}

def late_today():
    r = requests.get(f"{API}/late-today", headers=HEADERS, timeout=10)
    r.raise_for_status()
    return r.json()["data"]["late"]

def morning_digest():
    r = requests.get(f"{API}/digest", params={"type": "morning"}, headers=HEADERS)
    return r.json()["data"]

# Использование
for shift in late_today():
    print(f"🔴 {shift['full_name']} — {shift['minutes_late']} мин — {shift['site_name']}")
```

### Node.js

```javascript
const API = 'https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/bot-api';

async function call(path, params = {}) {
  const url = new URL(`${API}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.GEOTIME_API_KEY}` },
  });

  if (r.status === 429) {
    const retryAfter = r.headers.get('retry-after') ?? '60';
    throw new Error(`Rate limited, retry after ${retryAfter}s`);
  }
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  return (await r.json()).data;
}

// Использование
const summary = await call('/summary', { days: 7 });
console.log(`За неделю: ${summary.late} опозданий, ${summary.total_hours} часов`);
```

### n8n

1. Add node **HTTP Request**
2. Method: `GET`
3. URL: `{{$env.GEOTIME_API_URL}}/late-today`
4. Authentication: **Header Auth**
5. Header name: `Authorization`
6. Header value: `Bearer {{$env.GEOTIME_API_KEY}}`

### Hermes Agent (Nous Research)

Создай custom skill в `~/.hermes/skills/geotime/skill.yaml`:

```yaml
name: geotime
description: GeoTime time-tracking API access
env_vars:
  GEOTIME_API_KEY: "Set in ~/.hermes/.env"
tools:
  - name: late_today
    description: Get today's late shifts
    method: GET
    url: https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/bot-api/late-today
    headers:
      Authorization: "Bearer ${GEOTIME_API_KEY}"

  - name: morning_digest
    description: Get morning summary (yesterday + today open shifts)
    method: GET
    url: https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/bot-api/digest?type=morning
    headers:
      Authorization: "Bearer ${GEOTIME_API_KEY}"
```

---

## Системный промпт для AI-агента

Скармливай этот промпт своему AI-агенту (Claude / GPT / Gemma / любому) при инициализации:

```
Ты — диспетчер по учёту рабочего времени компании на платформе GeoTime.

ИНСТРУМЕНТЫ
У тебя есть HTTP API:
  Base URL: https://ldyshcvwxfzvfjrkcfgw.supabase.co/functions/v1/bot-api
  Auth:     Authorization: Bearer $GEOTIME_API_KEY

Все запросы — GET. Ответы в формате { "data": {...} } или { "error": {...} }.

КЛЮЧЕВЫЕ ENDPOINTS
  GET /active-now              — кто на смене прямо сейчас
  GET /late-today              — опоздавшие сегодня (отсортировано по minutes_late)
  GET /shifts?status=late      — список смен с фильтрами
  GET /workers                 — список активных сотрудников
  GET /sites                   — список объектов
  GET /worker-stats?name=X     — статистика сотрудника за 30 дней
  GET /summary?days=7          — агрегат за период
  GET /digest?type=morning|evening|weekly — готовые сводки

РАСПИСАНИЕ
  09:00 МСК — присылай /digest?type=morning в чат
  18:00 МСК — присылай /digest?type=evening
  Пятница 17:00 — присылай /digest?type=weekly

СТИЛЬ ОТВЕТОВ
- Деловой друг: коротко, без воды, без канцелярита
- Эмодзи статусов: 🟢 on_time, 🟡 early, 🔴 late, ⚠️ offsite
- Опоздание показывай в минутах: «Иван Петров — 🔴 15 мин на Складе»
- Список длиннее 10 — первые 10 + общее число

ПРАВИЛА
- Никогда не выдумывай данные — всегда вызывай инструмент
- При rate_limited (429) — жди указанные секунды и пробуй снова
- При invalid_key — сообщи владельцу что ключ устарел
- Не показывай chat_id, UUID, технические детали БД
- На просьбы «удали смену», «измени данные» — отказывай: «Это read-only доступ»

ЕСЛИ НЕ УВЕРЕН
- При неоднозначном имени («Иван») — попроси уточнить или покажи всех Иванов
- Если данных нет — так и скажи, не придумывай
```

---

## Установка / деплой

API полностью самодостаточен. После применения SQL миграций (через `npx supabase db push` или Supabase MCP) и деплоя двух Edge Functions (`bot-api`, `manage-api-keys`) система сразу готова.

**Pepper для HMAC-хеширования** генерируется автоматически при первом запуске миграции `20260510113014_bot_api_pepper_table.sql` (хранится в таблице `bot_api_secrets`, доступен только service_role через RPC `get_api_key_pepper()`). Никаких ручных шагов в Dashboard.

## Поддержка

- Issue tracker: https://github.com/Firdavs39/local-shift-sync/issues
- Управление ключами: `/admin/api-keys` в твоём кабинете
- Telegram: @llmaiweb3
