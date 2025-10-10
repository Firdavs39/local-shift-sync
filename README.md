# GeoTime Local

## О проекте

**GeoTime Local** — система учёта рабочего времени с геолокацией, работающая полностью офлайн. Все данные хранятся локально в IndexedDB через Dexie, без использования внешних серверов или баз данных.

## Основные возможности

✅ **Офлайн режим** - работает без интернета  
✅ **Геолокация** - привязка смен к рабочим объектам  
✅ **Учёт времени** - автоматический расчёт опозданий и отработанных часов  
✅ **PWA** - устанавливается как приложение  
✅ **WakeLock** - экран не гаснет во время смены  
✅ **Два типа пользователей** - администраторы и сотрудники  
✅ **PIN-авторизация** - простой вход без паролей  
✅ **До 20 сотрудников** - локальное управление командой

## Технологии

- **React 18** + **TypeScript**
- **Vite** - быстрая сборка
- **Tailwind CSS** - стилизация
- **Dexie** - IndexedDB обёртка
- **date-fns** - работа с датами
- **shadcn/ui** - UI компоненты
- **Geolocation API** - определение местоположения
- **WakeLock API** - управление экраном

## Структура данных

### Users (Пользователи)
```typescript
{
  id: number;
  fullName: string;
  role: 'admin' | 'worker';
  pin: string;
  active: boolean;
  createdAt: Date;
}
```

### Sites (Объекты)
```typescript
{
  id: number;
  name: string;
  lat: number;
  lon: number;
  radiusM: number;
  expectedStart: string; // 'HH:mm'
  expectedEnd: string; // 'HH:mm'
  tz: string;
  active: boolean;
  createdAt: Date;
}
```

### Shifts (Смены)
```typescript
{
  id: number;
  userId: number;
  siteId: number;
  startedAt: Date;
  endedAt?: Date;
  startLat: number;
  startLon: number;
  endLat?: number;
  endLon?: number;
  status: 'early' | 'on_time' | 'late' | 'offsite';
  minutesLate: number;
  minutesWorked?: number;
  createdAt: Date;
}
```

### Settings (Настройки)
```typescript
{
  id: 'app';
  maxUsers: number;
  purgePolicyDays: number;
}
```

## Экраны

- **/welcome** - первый запуск, выбор роли
- **/login** - вход по PIN-коду
- **/me** - кабинет сотрудника
- **/admin** - панель администратора

## Установка и запуск

```bash
# Установка зависимостей
npm install

# Запуск dev сервера
npm run dev

# Сборка
npm run build

# Предпросмотр сборки
npm run preview
```

## Первый запуск

1. Откройте приложение
2. Выберите "Я администратор"
3. Запомните сгенерированный PIN-код
4. Войдите с этим PIN
5. Создайте объекты и сотрудников в админ-панели

## Использование

### Для сотрудника:
1. Войти по PIN-коду
2. Включить WakeLock (опционально)
3. Нажать "Начать смену" на объекте
4. По окончании нажать "Закончить смену"

### Для администратора:
1. Войти по PIN-коду
2. Управлять пользователями и объектами
3. Просматривать отчёты и статистику
4. Настраивать систему

## PWA функции

- Устанавливается как приложение на главный экран
- Работает полностью офлайн
- Service Worker кэширует ресурсы
- WakeLock не даёт экрану погаснуть во время смены

## Безопасность

- Данные хранятся локально на устройстве
- PIN-коды не передаются никуда
- Нет внешних запросов
- Геолокация используется только локально

## Лицензия

MIT

## URL проекта

[https://lovable.dev/projects/4f9f18fc-1853-4622-bafc-7fa57ef96ef7](https://lovable.dev/projects/4f9f18fc-1853-4622-bafc-7fa57ef96ef7)
