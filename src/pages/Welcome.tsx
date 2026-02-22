import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  MapPin, Shield, Users, FileBarChart, Send, Clock,
  CheckCircle, ArrowRight, Building2, Zap, Crown,
  AlertTriangle, XCircle, TrendingDown, MessageCircle,
  ChevronDown, ChevronUp, Star,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import GeoTimeLogo from '@/components/GeoTimeLogo';

const CONTACT_TELEGRAM = 'https://t.me/llmaiweb3';

// ─── TRANSLATIONS ────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  ru: {
    nav: { login: 'Войти', try: 'Попробовать' },
    badge: 'Пробный период бесплатно · Без карты',
    hero: {
      line1: 'Знайте, где ваши',
      line2: 'сотрудники',
      line3: 'в любую минуту',
      sub: 'Геолокация + учёт смен + Telegram-уведомления об опозданиях. Для охраны, строительства, клининга и любого выездного персонала.',
      cta1: 'Зарегистрировать компанию',
      cta2: 'Войти в систему',
      check1: 'Без установки приложений',
      check2: 'Работает на любом телефоне',
      check3: 'Поддержка в Telegram',
    },
    pain: {
      title: 'Узнаёте себя?',
      sub: 'Эти проблемы каждый день стоят вам деньги и нервы',
      items: [
        { title: '«Я уже на объекте»', desc: 'Сотрудник говорит, что пришёл вовремя — но вы не можете это проверить.' },
        { title: 'Опоздал — узнали в конце дня', desc: 'Клиент жалуется на задержку, а вы об опоздании узнаёте постфактум.' },
        { title: 'Табель на бумаге', desc: 'Часы записываются вручную, ошибки неизбежны, зарплатные споры — регулярны.' },
        { title: '5+ объектов одновременно', desc: 'Невозможно уследить за всеми бригадами в разных точках города.' },
      ],
    },
    how: {
      title: 'Запуск за 10 минут',
      sub: 'Никаких IT-специалистов и долгих внедрений',
      steps: [
        { title: 'Зарегистрируйте компанию', desc: 'Введите название — всё готово. Сотрудники входят по PIN, без email и паролей.' },
        { title: 'Добавьте объекты', desc: 'Адрес, радиус зоны и время начала смены. Раздайте PIN-коды бригадирам.' },
        { title: 'Контролируйте онлайн', desc: 'Кто на месте, кто опоздал, сколько часов. CSV для зарплаты — одним кликом.' },
      ],
    },
    features: {
      title: 'Всё включено',
      sub: 'Инструменты для полного контроля команды',
      items: [
        { title: 'Геолокация и зоны', desc: 'Начать смену можно только находясь в радиусе объекта. Обмануть систему невозможно.' },
        { title: 'Точный учёт опозданий', desc: 'Каждая минута фиксируется. Отчёт покажет кто систематически нарушает режим.' },
        { title: 'Telegram-уведомления', desc: 'Мгновенный алерт вам в Telegram когда сотрудник опоздал — без лишних шагов.' },
        { title: 'Отчёты и экспорт', desc: 'Фильтр по дням, неделям, месяцам. Экспорт CSV в один клик для зарплатной ведомости.' },
        { title: 'Паузы в смене', desc: 'Обед, перерыв — сотрудник ставит паузу. Время не идёт, история сохраняется.' },
        { title: 'Управление командой', desc: 'Добавляйте сотрудников, назначайте роли, меняйте PIN — всё в пару кликов.' },
      ],
    },
    stats: [
      { value: '10 мин', label: 'Запуск с нуля' },
      { value: '100%', label: 'Работает в браузере' },
      { value: '24/7', label: 'Поддержка' },
    ],
    testimonial: {
      text: '"Раньше бригадиры записывали время в тетрадь — постоянные споры по зарплате. Теперь всё прозрачно: кто пришёл, во сколько, сколько отработал. Экономим минимум 2 часа в день на учёте."',
      name: 'Руслан А.',
      role: 'Охранное предприятие, Ташкент',
    },
    pricing: {
      title: 'Простые цены',
      sub: 'Платите только за реальных сотрудников · Оплата через Payme',
      popular: 'Для бизнеса',
      cta: 'Начать бесплатно',
      ctaPaid: 'Подключить',
      ask: 'Задать вопрос',
      note: 'Принимаем Payme и банковский перевод (счёт-фактура)',
      askMsg: (name: string) => `Здравствуйте! Хочу узнать подробнее о тарифе "${name}"`,
      examples: '10 чел → 100 000 сум · 30 чел → 300 000 сум · 50 чел → 500 000 сум',
      perWorker: 'сум × кол-во сотрудников / мес',
    },
    plans: [
      { name: 'Бесплатно', price: '0', forever: true, features: ['До 5 сотрудников', '1 объект', 'Геолокация и смены', 'Отчёты и CSV', 'Навсегда бесплатно'] },
      { name: 'Бизнес', price: '10 000', popular: true, features: ['Неограниченно сотрудников', 'Неограниченно объектов', 'Telegram уведомления', 'Отчёты и CSV экспорт', 'Поддержка в Telegram'] },
    ],
    faq: {
      title: 'Частые вопросы',
      items: [
        { q: 'Нужно ли устанавливать приложение?', a: 'Нет. GeoTime работает прямо в браузере телефона — сотрудник открывает ссылку и готово. Никаких установок из App Store или Google Play.' },
        { q: 'Что если сотрудник выключит геолокацию?', a: 'Без геолокации нельзя начать смену — система выдаст ошибку. Обмануть не получится: смена привязана к GPS-координатам объекта с радиусом, который вы сами задаёте.' },
        { q: 'Как оплачивать? Принимаете Payme?', a: 'Оплата через Payme или банковский перевод (счёт-фактура). Напишите нам в Telegram и мы выставим счёт в течение рабочего дня.' },
        { q: 'Можно попробовать бесплатно?', a: 'Да! До 5 сотрудников — навсегда бесплатно. Без карты и реквизитов.' },
        { q: 'Как считается стоимость?', a: '10 000 сум умножить на количество сотрудников в месяц. 20 человек = 200 000 сум, 50 человек = 500 000 сум. Чем больше команда — тем выгоднее на одного человека.' },
      ],
    },
    cta: {
      title: 'Перестаньте платить\nза часы, которых не было',
      sub: 'Регистрация за 2 минуты. Пробный период бесплатно. Карта не нужна.',
      btn1: 'Зарегистрировать компанию',
      btn2: 'Написать в Telegram',
    },
    footer: {
      copy: '© 2025 · Ташкент, Узбекистан',
      login: 'Войти',
      register: 'Регистрация',
      prices: 'Цены',
    },
    perMonth: 'сум/мес',
  },
  uz: {
    nav: { login: 'Kirish', try: 'Sinab ko\'rish' },
    badge: 'Sinov muddati bepul · Kartasiz',
    hero: {
      line1: 'Xodimlaringiz',
      line2: 'qayerda ekanini',
      line3: 'har daqiqada biling',
      sub: 'Geolokatsiya + smenalarni hisoblash + kechikishlar haqida Telegram xabarnomalar. Qo\'riqlash, qurilish, tozalash va har qanday ko\'chma xodimlar uchun.',
      cta1: 'Kompaniyani ro\'yxatdan o\'tkazing',
      cta2: 'Tizimga kirish',
      check1: 'Ilovalar o\'rnatmasdan',
      check2: 'Har qanday telefonda ishlaydi',
      check3: 'Telegramda qo\'llab-quvvatlash',
    },
    pain: {
      title: 'O\'zingizni tanidingizmi?',
      sub: 'Bu muammolar har kuni sizga pul va asab talab qiladi',
      items: [
        { title: '«Men allaqachon ob\'ektdaman»', desc: 'Xodim o\'z vaqtida kelganini aytadi — lekin siz buni tekshira olmaysiz.' },
        { title: 'Kechikdi — kunning oxirida bildingiz', desc: 'Mijoz kechikish haqida shikoyat qiladi, siz esa buni so\'ng bilasiz.' },
        { title: 'Qog\'ozdagi jadval', desc: 'Soatlar qo\'lda yoziladi, xatolar muqarrar, ish haqi bo\'yicha nizolar doimiy.' },
        { title: 'Bir vaqtda 5+ ob\'ekt', desc: 'Shaharning turli nuqtalarida barcha brigadalarni kuzatib bo\'lmaydi.' },
      ],
    },
    how: {
      title: '10 daqiqada ishga tushirish',
      sub: 'IT mutaxassislar va uzoq joriy etishsiz',
      steps: [
        { title: 'Kompaniyani ro\'yxatdan o\'tkazing', desc: 'Nomini kiriting — hammasi tayyor. Xodimlar PIN orqali, email va parolsiz kiradi.' },
        { title: 'Ob\'ektlarni qo\'shing', desc: 'Manzil, zona radiusi va smena boshlanish vaqti. Brigadirlarga PIN-kodlar bering.' },
        { title: 'Onlayn nazorat qiling', desc: 'Kim joyida, kim kechikdi, necha soat. Ish haqi uchun CSV — bir klik bilan.' },
      ],
    },
    features: {
      title: 'Hammasi kiritilgan',
      sub: 'Jamoani to\'liq nazorat qilish vositalari',
      items: [
        { title: 'Geolokatsiya va zonalar', desc: 'Smenani faqat ob\'ekt radiusida bo\'lganingizda boshlash mumkin. Tizimni aldab bo\'lmaydi.' },
        { title: 'Kechikishlarni aniq hisoblash', desc: 'Har daqiqa qayd etiladi. Hisobot kim muntazam tartibni buzishini ko\'rsatadi.' },
        { title: 'Telegram xabarnomalar', desc: 'Xodim kechikkanida Telegramga darhol xabar — ortiqcha qadamlarsiz.' },
        { title: 'Hisobotlar va eksport', desc: 'Kunlar, haftalar, oylar bo\'yicha filtr. Ish haqi uchun CSV eksporti bir klik bilan.' },
        { title: 'Smenadagi tanaffuslar', desc: 'Tushlik, tanaffus — xodim to\'xtatadi. Vaqt o\'tmaydi, tarix saqlanadi.' },
        { title: 'Jamoa boshqaruvi', desc: 'Xodimlarni qo\'shing, rollarni belgilang, PIN ni o\'zgartiring — hammasi bir necha klik.' },
      ],
    },
    stats: [
      { value: '10 min', label: 'Noldan ishga tushirish' },
      { value: '100%', label: 'Brauzerda ishlaydi' },
      { value: '24/7', label: 'Qo\'llab-quvvatlash' },
    ],
    testimonial: {
      text: '"Ilgari brigadirlar vaqtni daftarga yozishardi — doimiy ish haqi nizolari. Endi hammasi shaffof: kim keldi, soat nechada, necha soat ishladi. Hisobda kuniga kamida 2 soat tejayapmiz."',
      name: 'Ruslan A.',
      role: 'Qo\'riqlash korxonasi, Toshkent',
    },
    pricing: {
      title: 'Oddiy narxlar',
      sub: 'Faqat haqiqiy xodimlar uchun to\'lang · Payme orqali to\'lov',
      popular: 'Biznes uchun',
      cta: 'Bepul boshlash',
      ctaPaid: 'Ulash',
      ask: 'Savol berish',
      note: 'Payme va bank o\'tkazmasi (hisob-faktura) qabul qilinadi',
      askMsg: (name: string) => `Salom! "${name}" tarifi haqida ko'proq bilishni istayman`,
      examples: '10 kishi → 100 000 so\'m · 30 kishi → 300 000 so\'m · 50 kishi → 500 000 so\'m',
      perWorker: 'so\'m × xodimlar soni / oy',
    },
    plans: [
      { name: 'Bepul', price: '0', forever: true, features: ['5 tagacha xodim', '1 ob\'ekt', 'Geolokatsiya va smenalar', 'Hisobotlar va CSV', 'Doimo bepul'] },
      { name: 'Biznes', price: '10 000', popular: true, features: ['Cheksiz xodimlar', 'Cheksiz ob\'ektlar', 'Telegram xabarnomalar', 'Hisobotlar va CSV eksport', 'Telegramda qo\'llab-quvvatlash'] },
    ],
    faq: {
      title: 'Ko\'p so\'raladigan savollar',
      items: [
        { q: 'Ilova o\'rnatish kerakmi?', a: 'Yo\'q. GeoTime to\'g\'ridan-to\'g\'ri telefon brauzerida ishlaydi — xodim havolani ochadi va tayyor. App Store yoki Google Play dan hech qanday o\'rnatish yo\'q.' },
        { q: 'Xodim geolokatsiyani o\'chirsa nima bo\'ladi?', a: 'Geolokatsiyasiz smena boshlash mumkin emas — tizim xato beradi. Aldab bo\'lmaydi: smena siz belgilagan radiusga ega ob\'ekt GPS koordinatalariga bog\'langan.' },
        { q: 'Qanday to\'lash mumkin? Payme qabul qilasizmi?', a: 'Payme orqali yoki bank o\'tkazmasi (hisob-faktura) orqali to\'lov. Telegramda yozing va biz ish kuni davomida hisob-faktura chiqaramiz.' },
        { q: 'Bepul sinab ko\'rish mumkinmi?', a: 'Ha! 5 tagacha xodim — doimo bepul. Karta va rekvizitlar kerak emas.' },
        { q: 'Narx qanday hisoblanadi?', a: '10 000 so\'mni xodimlar soniga ko\'paytiring. 20 kishi = 200 000 so\'m, 50 kishi = 500 000 so\'m oyiga.' },
      ],
    },
    cta: {
      title: 'Bo\'lmagan soatlar uchun\nto\'lashni to\'xtating',
      sub: '2 daqiqada ro\'yxatdan o\'tish. Sinov muddati bepul. Karta kerak emas.',
      btn1: 'Kompaniyani ro\'yxatdan o\'tkazing',
      btn2: 'Telegramga yozish',
    },
    footer: {
      copy: '© 2025 · Toshkent, O\'zbekiston',
      login: 'Kirish',
      register: 'Ro\'yxatdan o\'tish',
      prices: 'Narxlar',
    },
    perMonth: 'so\'m/oy',
  },
} as const;

type Lang = keyof typeof TRANSLATIONS;

// ─── PLAN ICONS ──────────────────────────────────────────────────────────────
const PLAN_META = [
  { icon: Zap,    color: 'from-gray-400 to-gray-500',    border: 'border-gray-100'   },
  { icon: Crown,  color: 'from-violet-600 to-indigo-600', border: 'border-violet-200' },
];

const FEATURE_META = [
  { icon: MapPin,      color: 'text-violet-600', bg: 'bg-violet-50'  },
  { icon: Clock,       color: 'text-indigo-600', bg: 'bg-indigo-50'  },
  { icon: Send,        color: 'text-blue-600',   bg: 'bg-blue-50'    },
  { icon: FileBarChart,color: 'text-green-600',  bg: 'bg-green-50'   },
  { icon: Shield,      color: 'text-purple-600', bg: 'bg-purple-50'  },
  { icon: Users,       color: 'text-orange-600', bg: 'bg-orange-50'  },
];

const PAIN_META = [
  { icon: AlertTriangle, color: 'text-amber-500',  bg: 'bg-amber-50'  },
  { icon: XCircle,       color: 'text-red-500',    bg: 'bg-red-50'    },
  { icon: TrendingDown,  color: 'text-orange-500', bg: 'bg-orange-50' },
  { icon: Users,         color: 'text-purple-500', bg: 'bg-purple-50' },
];

const STEP_ICONS = [Building2, MapPin, FileBarChart];

// ─── LOSS CALCULATOR ──────────────────────────────────────────────────────────
const Calculator = () => {
  const [workers, setWorkers] = useState(30);
  const [animKey, setAnimKey] = useState(0);

  const handleChange = (val: number) => {
    setWorkers(val);
    setAnimKey(k => k + 1);
  };

  const hourlyRate = 2_500_000 / 176;
  const fakeHours  = (30 / 60) * 22;
  const totalLoss  = Math.round(hourlyRate * fakeHours * workers / 1000) * 1000;
  const geoCost    = workers * 10_000;
  const savings    = totalLoss - geoCost;
  const roi        = Math.round(totalLoss / geoCost);
  const pct        = Math.max(2, Math.round((geoCost / totalLoss) * 100));
  const filled     = Math.round(((workers - 5) / 195) * 100);

  const fmt = (n: number) => n.toLocaleString('ru-RU') + ' сум';
  const pop: React.CSSProperties = { animation: 'geotime-num-pop 0.42s cubic-bezier(.4,0,.2,1) forwards' };

  return (
    <section className="relative py-24 px-4 overflow-hidden bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-950">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/20 blur-3xl pointer-events-none" style={{ animation: 'geotime-orb1 16s ease-in-out infinite' }} />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" style={{ animation: 'geotime-orb2 20s ease-in-out infinite' }} />
      <div className="absolute inset-0 opacity-[0.035] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div className="relative z-10 max-w-3xl mx-auto">
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 text-violet-300 px-4 py-1.5 rounded-full text-xs font-medium">
            🧮 Калькулятор потерь
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
            Считаем сколько вы теряете<br />
            <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">прямо сейчас</span>
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            В среднем каждый сотрудник приписывает 30 мин в день. Потяните слайдер — увидите свои потери.
          </p>
        </div>

        <div className="bg-white/[0.06] backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-8 shadow-2xl space-y-8">

          {/* Slider */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm font-medium">Количество сотрудников</span>
              <div className="bg-violet-500/25 border border-violet-400/35 rounded-xl px-4 py-1.5">
                <span className="text-white font-extrabold text-xl tabular-nums">{workers}</span>
                <span className="text-violet-300 text-sm ml-1.5">чел</span>
              </div>
            </div>
            <input
              type="range" min={5} max={200} step={1} value={workers}
              onChange={e => handleChange(Number(e.target.value))}
              className="geotime-slider"
              style={{ background: `linear-gradient(to right,#8b5cf6 0%,#6366f1 ${filled}%,rgba(255,255,255,0.12) ${filled}%,rgba(255,255,255,0.12) 100%)` }}
            />
            <div className="flex justify-between text-xs text-slate-600 px-0.5">
              {[5, 50, 100, 150, 200].map(v => <span key={v}>{v}</span>)}
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-3 gap-4 items-stretch">
            <div className="bg-red-500/12 border border-red-500/20 rounded-2xl p-5 text-center space-y-2">
              <div className="text-3xl">💸</div>
              <div className="text-red-300/80 text-[11px] font-semibold uppercase tracking-widest">Теряете в месяц</div>
              <div key={`l${animKey}`} className="text-red-100 font-extrabold text-xl leading-snug" style={pop}>{fmt(totalLoss)}</div>
              <div className="text-red-400/60 text-[11px]">30 мин приписок × {workers} чел</div>
            </div>

            <div className="bg-emerald-500/12 border border-emerald-500/20 rounded-2xl p-5 text-center space-y-2">
              <div className="text-3xl">✅</div>
              <div className="text-emerald-300/80 text-[11px] font-semibold uppercase tracking-widest">GeoTime стоит</div>
              <div key={`c${animKey}`} className="text-emerald-100 font-extrabold text-xl leading-snug" style={pop}>{fmt(geoCost)}</div>
              <div className="text-emerald-400/60 text-[11px]">10 000 сум × {workers} чел</div>
            </div>

            <div className="bg-violet-500/15 border border-violet-400/25 rounded-2xl p-5 text-center space-y-2 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent pointer-events-none rounded-2xl" />
              <div className="text-3xl">💰</div>
              <div className="text-violet-300/80 text-[11px] font-semibold uppercase tracking-widest">Экономия</div>
              <div key={`s${animKey}`} className="text-violet-100 font-extrabold text-xl leading-snug" style={pop}>{fmt(savings)}</div>
              <div className="text-violet-400/60 text-[11px]">чистая прибыль в месяц</div>
            </div>
          </div>

          {/* ROI Bar */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>GeoTime — всего <span className="text-white font-bold">{pct}%</span> от ваших потерь</span>
              <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 text-amber-300 px-3 py-1 rounded-full text-[11px] font-semibold">
                ⚡ ROI {roi}× — окупается в {roi} раз
              </div>
            </div>
            <div className="h-5 bg-white/[0.07] rounded-full overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-red-600/50 to-orange-500/40 rounded-full" />
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-violet-500 to-indigo-500 flex items-center justify-end pr-2"
                style={{ width: `${pct}%`, minWidth: 40 }}
              >
                <span className="text-white text-[10px] font-bold whitespace-nowrap">{pct}%</span>
              </div>
            </div>
            <div className="flex items-center gap-5 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500/70 shrink-0" />Потери без контроля</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />Стоимость GeoTime</span>
            </div>
          </div>

          {/* CTA */}
          <Button
            className="w-full h-14 text-base font-bold bg-gradient-to-r from-violet-500 to-indigo-500 hover:opacity-90 shadow-xl shadow-violet-900/60 border-0 rounded-2xl"
            onClick={() => window.location.href = '/register'}
          >
            Начать экономить {fmt(savings)} / мес
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        <p className="text-center text-slate-600 text-[11px] mt-5">
          * Средняя зарплата 2 500 000 сум/мес · 176 рабочих часов · 30 мин приписок/день на сотрудника
        </p>
      </div>
    </section>
  );
};

// ─── MARQUEE ──────────────────────────────────────────────────────────────────
const MARQUEE_ITEMS = [
  { icon: '✅', text: 'Алишер К. начал смену · Объект №1',           time: '08:02' },
  { icon: '⚠️', text: 'Бахром Ю. опоздал на 23 мин · Объект №2',    time: '08:31' },
  { icon: '✅', text: 'Санжар М. прибыл · GPS подтверждён',           time: '07:58' },
  { icon: '📊', text: 'Отчёт за неделю сформирован · CSV готов',      time: '18:00' },
  { icon: '📲', text: 'Telegram-уведомление отправлено директору',    time: '08:31' },
  { icon: '✅', text: 'Дилшод А. завершил смену · 8ч 02мин',          time: '17:04' },
  { icon: '✅', text: 'Улугбек Р. открыл смену вовремя',              time: '09:00' },
  { icon: '⏰', text: 'Автозакрытие смен · 5 сотрудников',             time: '18:00' },
  { icon: '⚠️', text: 'Нодир Т. вышел из зоны объекта',              time: '14:22' },
  { icon: '✅', text: 'Жамшид Х. на объекте · 3-й день без опозданий', time: '08:00' },
];

const NotifMarquee = () => {
  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="overflow-hidden bg-white border-y border-gray-100 py-3 relative">
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
      <div
        className="flex gap-4 w-max"
        style={{ animation: 'geotime-marquee 40s linear infinite' }}
      >
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full px-4 py-1.5 shrink-0 hover:border-violet-200 hover:bg-violet-50 transition-colors">
            <span className="text-sm leading-none">{item.icon}</span>
            <span className="text-xs font-medium text-gray-700 whitespace-nowrap">{item.text}</span>
            <span className="text-[11px] text-gray-400 font-mono whitespace-nowrap ml-1">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── HOOKS ────────────────────────────────────────────────────────────────────
const useScrollReveal = (threshold = 0.12) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
};

const useCountUp = (target: number, duration = 1600, start = false) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(ease * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [start, target, duration]);
  return count;
};

// ─── REVEAL DIV ───────────────────────────────────────────────────────────────
interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'left' | 'right';
}
const RevealDiv: React.FC<RevealProps> = ({ children, className = '', delay = 0, direction = 'up' }) => {
  const { ref, visible } = useScrollReveal();
  const initial = direction === 'left' ? 'translateX(-36px)' : direction === 'right' ? 'translateX(36px)' : 'translateY(36px)';
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : initial,
        transition: `opacity 0.65s cubic-bezier(.4,0,.2,1) ${delay}ms, transform 0.65s cubic-bezier(.4,0,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

// ─── STAT ITEM ────────────────────────────────────────────────────────────────
const StatItem = ({ value, label, start }: { value: string; label: string; start: boolean }) => {
  const match = value.match(/^(\d+)(.*)$/);
  const num = match ? parseInt(match[1]) : 0;
  const suffix = match ? match[2] : value;
  const count = useCountUp(num, 1600, start);
  return (
    <div className="text-center p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100">
      <div className="text-2xl sm:text-4xl font-extrabold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
        {match ? `${count}${suffix}` : value}
      </div>
      <div className="text-xs sm:text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
};

// ─── STATS ROW ────────────────────────────────────────────────────────────────
const StatsRow = ({ stats }: { stats: readonly { value: string; label: string }[] }) => {
  const { ref, visible } = useScrollReveal(0.3);
  return (
    <div ref={ref} className="grid grid-cols-3 gap-3 sm:gap-6">
      {stats.map(({ value, label }) => (
        <StatItem key={label} value={value} label={label} start={visible} />
      ))}
    </div>
  );
};

// ─── APP MOCKUP ───────────────────────────────────────────────────────────────
const MOCK_WORKERS = [
  { name: 'Алишер К.', site: 'Объект №1', time: '08:02', ok: true },
  { name: 'Бахром Ю.', site: 'Объект №2', time: '08:31', ok: false, late: '23 мин' },
  { name: 'Санжар М.', site: 'Объект №1', time: '07:58', ok: true },
];
const AppMockup = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3800);
    return () => clearInterval(id);
  }, []);
  const notifVisible = tick % 2 === 0;
  return (
    <div className="relative mx-auto select-none" style={{ maxWidth: 320 }}>
      {/* Notification */}
      <div
        key={tick}
        className="absolute -top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
        style={{ animation: notifVisible ? 'geotime-notif 3.8s ease forwards' : 'none', opacity: 0 }}
      >
        <div className="bg-white border border-orange-200 rounded-2xl px-3.5 py-2.5 shadow-xl flex items-center gap-2.5 whitespace-nowrap">
          <span className="text-base">📲</span>
          <div>
            <div className="text-[11px] font-semibold text-gray-700">Telegram уведомление</div>
            <div className="text-[11px] text-orange-600 font-medium">Бахром Ю. опоздал на 23 мин</div>
          </div>
        </div>
      </div>

      {/* Card */}
      <div
        className="bg-white rounded-3xl overflow-hidden border border-gray-100"
        style={{
          animation: 'geotime-float 5s ease-in-out infinite',
          boxShadow: '0 30px 70px -20px rgba(124,58,237,0.25), 0 4px 20px -5px rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GeoTimeLogo size={18} />
            <span className="text-white text-sm font-semibold">GeoTime</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ animation: 'geotime-pulse 2s ease-in-out infinite' }} />
            <span className="text-violet-200 text-xs font-mono">08:35</span>
          </div>
        </div>

        {/* Workers */}
        <div className="divide-y divide-gray-50">
          {MOCK_WORKERS.map((w, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="relative shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${w.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {w.name.split(' ').map(p => p[0]).join('')}
                </div>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${w.ok ? 'bg-green-400' : 'bg-red-400'}`}
                  style={!w.ok ? { animation: 'geotime-pulse 1.2s ease-in-out infinite' } : {}}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-800">{w.name}</span>
                  <span className="text-[11px] text-gray-400 font-mono">{w.time}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[11px] text-gray-400">{w.site}</span>
                  {w.ok
                    ? <span className="text-[11px] text-green-600 font-medium">✓ Вовремя</span>
                    : <span className="text-[11px] text-red-500 font-medium">⚠ +{w.late}</span>
                  }
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="bg-violet-50 px-4 py-2.5 flex items-center justify-between border-t border-violet-100">
          <span className="text-[11px] text-violet-500">● 3 онлайн</span>
          <span className="text-[11px] text-violet-700 font-semibold">Открыть отчёт →</span>
        </div>
      </div>
    </div>
  );
};

// ─── FAQ ITEM ─────────────────────────────────────────────────────────────────
const FaqItem = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border transition-all duration-200 ${open ? 'bg-primary/5 border-primary/30' : 'bg-white border-gray-100'}`}>
      <button className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left" onClick={() => setOpen(!open)}>
        <span className="font-medium text-sm leading-snug">{q}</span>
        <span className={`mt-0.5 shrink-0 rounded-full p-1 transition-colors ${open ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>
      {open && <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-violet-100 pt-3">{a}</p>}
    </div>
  );
};

// ─── LANG TOGGLE ─────────────────────────────────────────────────────────────
const LangToggle = ({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) => (
  <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-semibold">
    {(['ru', 'uz'] as Lang[]).map((l) => (
      <button
        key={l}
        onClick={() => setLang(l)}
        className={`px-2.5 py-1 rounded-md transition-all ${lang === l ? 'bg-white shadow text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
      >
        {l.toUpperCase()}
      </button>
    ))}
  </div>
);

// ─── WELCOME PAGE ─────────────────────────────────────────────────────────────
const Welcome = () => {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>('ru');
  const t = TRANSLATIONS[lang];

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GeoTimeLogo size={28} />
            <span className="font-bold text-base">GeoTime</span>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle lang={lang} setLang={setLang} />
            <button onClick={() => navigate('/auth')} className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-3 py-1.5 hidden sm:block">
              {t.nav.login}
            </button>
            <Button size="sm" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-sm h-8 px-4" onClick={() => navigate('/register')}>
              {t.nav.try}
            </Button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-violet-50 to-white pt-14 pb-20 px-4">
        {/* Animated orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-20 w-96 h-96 rounded-full bg-violet-200 opacity-40 blur-3xl" style={{ animation: 'geotime-orb1 12s ease-in-out infinite' }} />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-indigo-200 opacity-35 blur-3xl" style={{ animation: 'geotime-orb2 15s ease-in-out infinite' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-purple-100 opacity-30 blur-3xl" style={{ animation: 'geotime-orb1 18s ease-in-out infinite reverse' }} />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

            {/* Left: Text */}
            <div className="flex-1 text-center lg:text-left space-y-6">
              <div
                className="inline-flex items-center gap-2 bg-white border border-violet-200 text-violet-700 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm"
                style={{ animation: 'geotime-badge-pulse 2.5s ease-in-out infinite' }}
              >
                <Zap className="w-3 h-3" />
                {t.badge}
              </div>
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight">
                {t.hero.line1}
                <span className="block bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{t.hero.line2}</span>
                {t.hero.line3}
              </h1>
              <p className="text-base sm:text-lg text-gray-500 max-w-xl leading-relaxed mx-auto lg:mx-0">{t.hero.sub}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start pt-2">
                <Button size="lg" className="h-12 px-7 text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 shadow-lg shadow-violet-200" onClick={() => navigate('/register')}>
                  {t.hero.cta1} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-7 text-base border-gray-200 text-gray-800 hover:bg-gray-50 hover:text-gray-900" onClick={() => navigate('/auth')}>
                  {t.hero.cta2}
                </Button>
              </div>
              <div className="flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-gray-400 pt-1">
                {[t.hero.check1, t.hero.check2, t.hero.check3].map((c) => (
                  <span key={c} className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500" />{c}</span>
                ))}
              </div>
            </div>

            {/* Right: App Mockup */}
            <div className="flex-1 w-full max-w-sm lg:max-w-none pt-8 lg:pt-0">
              <AppMockup />
            </div>

          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <NotifMarquee />

      {/* PAIN */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <RevealDiv className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.pain.title}</h2>
            <p className="text-gray-500 text-sm sm:text-base">{t.pain.sub}</p>
          </RevealDiv>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {t.pain.items.map((item, i) => {
              const { icon: Icon, color, bg } = PAIN_META[i];
              const dir = i % 2 === 0 ? 'left' : 'right';
              return (
                <RevealDiv key={i} direction={dir} delay={i * 80}>
                  <div className="flex gap-4 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm h-full">
                    <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </RevealDiv>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <RevealDiv className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.how.title}</h2>
            <p className="text-gray-500 text-sm sm:text-base">{t.how.sub}</p>
          </RevealDiv>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {t.how.steps.map((step, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <RevealDiv key={i} delay={i * 120}>
                  <div className="relative flex flex-row md:flex-col gap-4 md:gap-0 md:text-center">
                    {i < 2 && <div className="hidden md:block absolute top-6 left-1/2 w-full h-px bg-gradient-to-r from-violet-200 to-transparent" />}
                    <div className="shrink-0 md:mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-violet-200 relative z-10">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="md:mt-4">
                      <div className="flex items-center gap-2 mb-1 md:justify-center">
                        <Icon className="w-4 h-4 text-violet-500" />
                        <h3 className="font-semibold text-sm">{step.title}</h3>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                </RevealDiv>
              );
            })}
          </div>
        </div>
      </section>

      {/* CALCULATOR */}
      <Calculator />

      {/* FEATURES */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <RevealDiv className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.features.title}</h2>
            <p className="text-gray-500 text-sm sm:text-base">{t.features.sub}</p>
          </RevealDiv>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.features.items.map((item, i) => {
              const { icon: Icon, color, bg } = FEATURE_META[i];
              return (
                <RevealDiv key={i} delay={i * 70}>
                  <div
                    className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm cursor-default"
                    style={{ transition: 'transform 0.15s ease, box-shadow 0.15s ease', willChange: 'transform' }}
                    onMouseMove={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const x = ((e.clientX - r.left) / r.width - 0.5) * 16;
                      const y = ((e.clientY - r.top) / r.height - 0.5) * -16;
                      e.currentTarget.style.transform = `perspective(700px) rotateX(${y}deg) rotateY(${x}deg) translateZ(6px)`;
                      e.currentTarget.style.boxShadow = '0 16px 40px -10px rgba(124,58,237,0.18)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg) translateZ(0)';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </RevealDiv>
              );
            })}
          </div>
        </div>
      </section>

      {/* STATS + TESTIMONIAL */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          <StatsRow stats={t.stats} />
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-3xl border border-violet-100 p-6 sm:p-8">
            <div className="flex gap-0.5 mb-3">
              {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
            </div>
            <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-4">{t.testimonial.text}</p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 flex items-center justify-center text-white text-xs font-bold">
                {t.testimonial.name[0]}
              </div>
              <div>
                <div className="text-sm font-medium">{t.testimonial.name}</div>
                <div className="text-xs text-gray-400">{t.testimonial.role}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-16 px-4 bg-gray-50" id="pricing">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.pricing.title}</h2>
            <p className="text-gray-500 text-sm sm:text-base">{t.pricing.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {t.plans.map((plan, i) => {
              const { icon: Icon, color, border } = PLAN_META[i];
              const popular = 'popular' in plan && plan.popular;
              const forever = 'forever' in plan && plan.forever;
              return (
                <div key={i} className={`relative bg-white rounded-3xl border-2 ${popular ? 'border-violet-400 shadow-xl shadow-violet-100' : `${border} shadow-sm`} p-6 flex flex-col gap-5`}>
                  {popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[11px] px-3 py-1 rounded-full font-semibold">{t.pricing.popular}</span>
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{plan.name}</div>
                    {popular ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-extrabold text-violet-700">{plan.price}</span>
                          <span className="text-gray-500 text-xs leading-tight">{t.pricing.perWorker}</span>
                        </div>
                        <div className="mt-2 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5 leading-relaxed">
                          {t.pricing.examples}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold">{plan.price}</span>
                        <span className="text-gray-400 text-sm">{t.perMonth}</span>
                      </div>
                    )}
                  </div>
                  <ul className="space-y-2 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs sm:text-sm text-gray-600">
                        <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${popular ? 'text-violet-500' : 'text-green-500'}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-2">
                    <Button
                      className={`w-full text-sm h-10 ${popular ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 shadow-lg shadow-violet-200 text-white' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:text-gray-900'}`}
                      variant={popular ? 'default' : 'outline'}
                      onClick={() => navigate('/register')}
                    >
                      {forever ? t.pricing.cta : t.pricing.ctaPaid}
                    </Button>
                    {popular && (
                      <button
                        className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-1 transition-colors"
                        onClick={() => {
                          const text = encodeURIComponent(t.pricing.askMsg(plan.name));
                          window.open(`${CONTACT_TELEGRAM}?text=${text}`, '_blank');
                        }}
                      >
                        <MessageCircle className="w-3 h-3" />{t.pricing.ask}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-gray-400 mt-5">{t.pricing.note}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">{t.faq.title}</h2>
          <div className="space-y-2">
            {t.faq.items.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl p-8 sm:p-12 shadow-2xl shadow-violet-200">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 whitespace-pre-line">{t.cta.title}</h2>
          <p className="text-violet-200 text-sm sm:text-base mb-8">{t.cta.sub}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="h-12 px-6 text-sm font-semibold bg-white text-violet-700 hover:bg-violet-50 hover:text-violet-700" onClick={() => navigate('/register')}>
              {t.cta.btn1} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-6 text-sm border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white hover:border-white/60" onClick={() => window.open(CONTACT_TELEGRAM, '_blank')}>
              <MessageCircle className="w-4 h-4 mr-2" />{t.cta.btn2}
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 bg-white py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <GeoTimeLogo size={24} />
              <span className="font-semibold text-sm">GeoTime</span>
            </div>
            <div className="text-xs text-gray-400 leading-relaxed">
              © 2025 GeoTime · Все права защищены<br />
              Разработано <span className="text-gray-500 font-medium">Firdavs Fayzullayev</span>
            </div>
          </div>
          <div className="flex items-center gap-5 text-xs text-gray-400">
            <button onClick={() => navigate('/auth')} className="hover:text-gray-700 transition-colors">{t.footer.login}</button>
            <button onClick={() => navigate('/register')} className="hover:text-gray-700 transition-colors">{t.footer.register}</button>
            <a href="#pricing" className="hover:text-gray-700 transition-colors">{t.footer.prices}</a>
            <a href={CONTACT_TELEGRAM} target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />Telegram
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Welcome;
