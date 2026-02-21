import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Clock, MapPin, Shield, Users, FileBarChart, Send,
  CheckCircle, ArrowRight, Building2, Zap, Crown,
  AlertTriangle, XCircle, TrendingDown, MessageCircle,
  ChevronDown, ChevronUp, Star,
} from 'lucide-react';
import { useState } from 'react';

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
      title: 'Прозрачные цены',
      sub: 'Оплата через Payme или банковский перевод · Пробный период бесплатно',
      popular: 'Популярный',
      cta: 'Начать бесплатно',
      ask: 'Задать вопрос',
      note: 'Принимаем Payme и банковский перевод (счёт-фактура)',
      askMsg: (name: string) => `Здравствуйте! Хочу узнать подробнее о тарифе "${name}"`,
    },
    plans: [
      { name: 'Старт', price: '99 000', features: ['До 10 сотрудников', 'До 3 объектов', 'Отчёты и CSV', 'Геолокация'] },
      { name: 'Бизнес', price: '249 000', popular: true, features: ['До 50 сотрудников', 'До 20 объектов', 'Telegram уведомления', 'Приоритетная поддержка'] },
      { name: 'Корпоративный', price: '599 000', features: ['До 200 сотрудников', 'Объекты без лимита', 'API доступ', 'Выделенный менеджер'] },
    ],
    faq: {
      title: 'Частые вопросы',
      items: [
        { q: 'Нужно ли устанавливать приложение?', a: 'Нет. VEZIR GeoTime работает прямо в браузере телефона — сотрудник открывает ссылку и готово. Никаких установок из App Store или Google Play.' },
        { q: 'Что если сотрудник выключит геолокацию?', a: 'Без геолокации нельзя начать смену — система выдаст ошибку. Обмануть не получится: смена привязана к GPS-координатам объекта с радиусом, который вы сами задаёте.' },
        { q: 'Как оплачивать? Принимаете Payme?', a: 'Оплата через Payme или банковский перевод (счёт-фактура). Напишите нам в Telegram и мы выставим счёт в течение рабочего дня.' },
        { q: 'Можно попробовать бесплатно?', a: 'Да! После регистрации вы получаете пробный период без ограничений по функционалу. Карта и реквизиты не нужны.' },
        { q: 'Сколько объектов можно добавить?', a: 'На тарифе Старт — до 3 объектов, на Бизнесе — до 20, на Корпоративном — без ограничений.' },
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
      title: 'Shaffof narxlar',
      sub: 'Payme orqali to\'lov yoki bank o\'tkazmasi · Sinov muddati bepul',
      popular: 'Mashhur',
      cta: 'Bepul boshlash',
      ask: 'Savol berish',
      note: 'Payme va bank o\'tkazmasi (hisob-faktura) qabul qilinadi',
      askMsg: (name: string) => `Salom! "${name}" tarifi haqida ko'proq bilishni istayman`,
    },
    plans: [
      { name: 'Start', price: '99 000', features: ['10 tagacha xodim', '3 tagacha ob\'ekt', 'Hisobotlar va CSV', 'Geolokatsiya'] },
      { name: 'Biznes', price: '249 000', popular: true, features: ['50 tagacha xodim', '20 tagacha ob\'ekt', 'Telegram xabarnomalar', 'Ustuvor qo\'llab-quvvatlash'] },
      { name: 'Korporativ', price: '599 000', features: ['200 tagacha xodim', 'Ob\'ektlar cheksiz', 'API kirish', 'Shaxsiy menejer'] },
    ],
    faq: {
      title: 'Ko\'p so\'raladigan savollar',
      items: [
        { q: 'Ilova o\'rnatish kerakmi?', a: 'Yo\'q. VEZIR GeoTime to\'g\'ridan-to\'g\'ri telefon brauzerida ishlaydi — xodim havolani ochadi va tayyor. App Store yoki Google Play dan hech qanday o\'rnatish yo\'q.' },
        { q: 'Xodim geolokatsiyani o\'chirsa nima bo\'ladi?', a: 'Geolokatsiyasiz smena boshlash mumkin emas — tizim xato beradi. Aldab bo\'lmaydi: smena siz belgilagan radiusga ega ob\'ekt GPS koordinatalariga bog\'langan.' },
        { q: 'Qanday to\'lash mumkin? Payme qabul qilasizmi?', a: 'Payme orqali yoki bank o\'tkazmasi (hisob-faktura) orqali to\'lov. Telegramda yozing va biz ish kuni davomida hisob-faktura chiqaramiz.' },
        { q: 'Bepul sinab ko\'rish mumkinmi?', a: 'Ha! Ro\'yxatdan o\'tgandan keyin siz funksionallik bo\'yicha cheklovlarsiz sinov muddati olasiz. Karta va rekvizitlar kerak emas.' },
        { q: 'Nechta ob\'ekt qo\'shish mumkin?', a: 'Start tarifida — 3 tagacha ob\'ekt, Biznesda — 20 tagacha, Korporativda — cheklovsiz.' },
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
  { icon: Zap,    color: 'from-blue-500 to-cyan-500',    border: 'border-blue-100'   },
  { icon: Shield, color: 'from-violet-600 to-indigo-600', border: 'border-violet-200' },
  { icon: Crown,  color: 'from-amber-500 to-orange-500', border: 'border-amber-100'  },
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
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base">VEZIR GeoTime</span>
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
      <section className="relative overflow-hidden bg-gradient-to-b from-violet-50 to-white pt-16 pb-20 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-violet-100 opacity-60 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-indigo-100 opacity-50 blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-white border border-violet-200 text-violet-700 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm">
            <Zap className="w-3 h-3" />
            {t.badge}
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight">
            {t.hero.line1}
            <span className="block bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{t.hero.line2}</span>
            {t.hero.line3}
          </h1>
          <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">{t.hero.sub}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button size="lg" className="h-12 px-7 text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 shadow-lg shadow-violet-200" onClick={() => navigate('/register')}>
              {t.hero.cta1} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-7 text-base border-gray-200 text-gray-800 hover:bg-gray-50 hover:text-gray-900" onClick={() => navigate('/auth')}>
              {t.hero.cta2}
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-gray-400 pt-1">
            {[t.hero.check1, t.hero.check2, t.hero.check3].map((c) => (
              <span key={c} className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500" />{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* PAIN */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.pain.title}</h2>
            <p className="text-gray-500 text-sm sm:text-base">{t.pain.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {t.pain.items.map((item, i) => {
              const { icon: Icon, color, bg } = PAIN_META[i];
              return (
                <div key={i} className="flex gap-4 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.how.title}</h2>
            <p className="text-gray-500 text-sm sm:text-base">{t.how.sub}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {t.how.steps.map((step, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <div key={i} className="relative flex flex-row md:flex-col gap-4 md:gap-0 md:text-center">
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
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.features.title}</h2>
            <p className="text-gray-500 text-sm sm:text-base">{t.features.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.features.items.map((item, i) => {
              const { icon: Icon, color, bg } = FEATURE_META[i];
              return (
                <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* STATS + TESTIMONIAL */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            {t.stats.map(({ value, label }) => (
              <div key={label} className="text-center p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100">
                <div className="text-2xl sm:text-4xl font-extrabold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">{value}</div>
                <div className="text-xs sm:text-sm text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
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
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t.pricing.title}</h2>
            <p className="text-gray-500 text-sm sm:text-base">{t.pricing.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {t.plans.map((plan, i) => {
              const { icon: Icon, color, border } = PLAN_META[i];
              const popular = 'popular' in plan && plan.popular;
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
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{plan.name}</div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl sm:text-3xl font-extrabold">{plan.price}</span>
                      <span className="text-gray-400 text-sm">{t.perMonth}</span>
                    </div>
                  </div>
                  <ul className="space-y-2 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs sm:text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
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
                      {t.pricing.cta}
                    </Button>
                    <button
                      className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-1 transition-colors"
                      onClick={() => {
                        const text = encodeURIComponent(t.pricing.askMsg(plan.name));
                        window.open(`${CONTACT_TELEGRAM}?text=${text}`, '_blank');
                      }}
                    >
                      <MessageCircle className="w-3 h-3" />{t.pricing.ask}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm">VEZIR GeoTime</span>
            <span className="text-gray-300 hidden sm:block">·</span>
            <span className="text-gray-400 text-xs hidden sm:block">{t.footer.copy}</span>
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
