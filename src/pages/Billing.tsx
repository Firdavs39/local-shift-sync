import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, CreditCard, Check, Zap, Building2, Crown, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUser } from '@/lib/supabase-auth';

// TODO: замените на ваш Telegram/WhatsApp для приёма оплаты
const CONTACT_TELEGRAM = 'https://t.me/llmaiweb3';

interface CompanyInfo {
  plan: string;
  max_workers: number;
  plan_expires_at: string | null;
}

interface WorkerCount {
  current: number;
}

const PLANS = [
  {
    id: 'starter',
    name: 'Старт',
    price: '99 000',
    maxWorkers: 10,
    icon: Zap,
    color: 'from-blue-500 to-blue-600',
    features: ['До 10 сотрудников', 'До 3 объектов', 'Отчёты и CSV', 'Геолокация'],
  },
  {
    id: 'business',
    name: 'Бизнес',
    price: '249 000',
    maxWorkers: 50,
    icon: Building2,
    color: 'from-primary to-accent',
    features: ['До 50 сотрудников', 'До 20 объектов', 'Telegram уведомления', 'Приоритетная поддержка'],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Корпоративный',
    price: '599 000',
    maxWorkers: 200,
    icon: Crown,
    color: 'from-yellow-500 to-orange-500',
    features: ['До 200 сотрудников', 'Неограничено объектов', 'API доступ', 'Выделенный менеджер'],
  },
];

const getPlanLabel = (plan: string) => {
  switch (plan) {
    case 'trial': return 'Пробный период';
    case 'starter': return 'Старт';
    case 'business': return 'Бизнес';
    case 'enterprise': return 'Корпоративный';
    default: return plan;
  }
};

const Billing = () => {
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [workerCount, setWorkerCount] = useState<WorkerCount>({ current: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getCurrentUser();
        if (!user?.company_id) return;

        const [companyRes, countRes] = await Promise.all([
          supabase
            .from('companies')
            .select('plan, max_workers, plan_expires_at')
            .eq('id', user.company_id)
            .single(),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', user.company_id)
            .eq('active', true),
        ]);

        if (companyRes.data) setCompany(companyRes.data);
        setWorkerCount({ current: countRes.count ?? 0 });
      } catch {
        toast.error('Ошибка загрузки данных тарифа');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleContactForPlan = (planName: string) => {
    const text = encodeURIComponent(`Здравствуйте! Хочу подключить тариф "${planName}" для своей компании.`);
    window.open(`${CONTACT_TELEGRAM}?text=${text}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <CreditCard className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Тариф и оплата</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Current plan */}
        {!loading && company && (
          <Card className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Текущий тариф</p>
                <p className="text-2xl font-bold">{getPlanLabel(company.plan)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Сотрудников: {workerCount.current} из {company.max_workers}
                </p>
                {company.plan_expires_at && (
                  <p className="text-sm text-muted-foreground">
                    Действует до: {new Date(company.plan_expires_at).toLocaleDateString('ru-RU')}
                  </p>
                )}
                {company.plan === 'trial' && (
                  <p className="text-sm text-amber-600 font-medium mt-1">
                    ⚠️ Пробный период — выберите тариф для продолжения работы
                  </p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Использовано сотрудников</span>
                <span>{workerCount.current} / {company.max_workers}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (workerCount.current / company.max_workers) * 100)}%` }}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Plans */}
        <div>
          <h2 className="text-2xl font-bold text-center mb-2">Выберите тариф</h2>
          <p className="text-center text-muted-foreground mb-6 text-sm">
            Оплата через Payme или банковский перевод • Для подключения напишите нам
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const isCurrent = company?.plan === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={`p-6 space-y-4 relative ${plan.popular ? 'border-primary border-2' : ''}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-white text-xs px-3 py-1 rounded-full font-medium">
                        Популярный
                      </span>
                    </div>
                  )}

                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  <div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground text-sm">сум/месяц</span>
                    </div>
                  </div>

                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <Button className="w-full" variant="outline" disabled>
                      Текущий тариф
                    </Button>
                  ) : (
                    <Button
                      className={`w-full ${plan.popular ? 'bg-gradient-to-r from-primary to-accent' : ''}`}
                      variant={plan.popular ? 'default' : 'outline'}
                      onClick={() => handleContactForPlan(plan.name)}
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Подключить →
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        <Card className="p-4 bg-muted/50 text-center">
          <p className="text-sm text-muted-foreground">
            Оплата принимается через Payme или банковский перевод (счёт-фактура).
            При смене тарифа лимит сотрудников обновляется в течение 1 рабочего дня.
          </p>
        </Card>
      </main>
    </div>
  );
};

export default Billing;
