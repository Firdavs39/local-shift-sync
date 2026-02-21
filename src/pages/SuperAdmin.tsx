import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Clock, Users, MapPin, CheckCircle, XCircle,
  RefreshCw, Shield, ChevronDown, ChevronUp, LogIn
} from 'lucide-react';

interface Company {
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_expires_at: string | null;
  max_workers: number;
  active: boolean;
  created_at: string;
  workers_count: number;
  sites_count: number;
}

const PLANS = ['trial', 'start', 'business', 'corporate'] as const;
const PLAN_LABELS: Record<string, string> = {
  trial: 'Пробный',
  start: 'Старт',
  business: 'Бизнес',
  corporate: 'Корпоративный',
};
const PLAN_COLORS: Record<string, string> = {
  trial: 'bg-gray-100 text-gray-600',
  start: 'bg-blue-100 text-blue-700',
  business: 'bg-violet-100 text-violet-700',
  corporate: 'bg-amber-100 text-amber-700',
};

const SuperAdmin = () => {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<Record<string, string>>({});
  const [editDays, setEditDays] = useState<Record<string, string>>({});

  const call = async (action: string, payload?: object) => {
    const { data, error } = await supabase.functions.invoke('super-admin', {
      body: { password, action, payload },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const login = async () => {
    if (!password.trim()) return;
    setLoading(true);
    try {
      const data = await call('list');
      setCompanies(data.companies);
      setAuthed(true);
    } catch (e: any) {
      toast.error(e.message ?? 'Неверный пароль');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await call('list');
      setCompanies(data.companies);
      toast.success('Обновлено');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const update = async (company_id: string, extra: object = {}) => {
    const plan = editPlan[company_id];
    const days = parseInt(editDays[company_id] ?? '0');
    try {
      await call('update', { company_id, plan, days: days || undefined, ...extra });
      toast.success('Обновлено');
      await refresh();
      setExpanded(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleActive = async (c: Company) => {
    try {
      await call('update', { company_id: c.id, active: !c.active });
      toast.success(c.active ? 'Компания заблокирована' : 'Компания активирована');
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
  };

  const isExpired = (d: string | null) => {
    if (!d) return false;
    return new Date(d) < new Date();
  };

  // ── Login screen ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-8 space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold">Super Admin</span>
          </div>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
            <Button
              className="w-full bg-violet-600 hover:bg-violet-700"
              onClick={login}
              disabled={loading}
            >
              {loading ? 'Проверка...' : <><LogIn className="w-4 h-4 mr-2" />Войти</>}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Super Admin</h1>
              <p className="text-xs text-gray-400">{companies.length} компаний</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}
            className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Всего компаний', value: companies.length },
            { label: 'Активных', value: companies.filter(c => c.active).length },
            { label: 'Всего сотрудников', value: companies.reduce((s, c) => s + c.workers_count, 0) },
            { label: 'Истёкших', value: companies.filter(c => isExpired(c.plan_expires_at)).length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
              <div className="text-2xl font-bold text-violet-400">{value}</div>
              <div className="text-xs text-gray-400 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Companies list */}
        <div className="space-y-3">
          {companies.map((c) => {
            const expired = isExpired(c.plan_expires_at);
            const open = expanded === c.id;
            return (
              <div key={c.id}
                className={`bg-gray-900 rounded-2xl border transition-colors ${
                  !c.active ? 'border-red-900/60' : expired ? 'border-amber-900/60' : 'border-gray-800'
                }`}>

                {/* Company row */}
                <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(open ? null : c.id)}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{c.name}</span>
                      <span className="text-xs text-gray-500">/{c.slug}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[c.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                        {PLAN_LABELS[c.plan] ?? c.plan}
                      </span>
                      {!c.active && (
                        <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full">Заблокирован</span>
                      )}
                      {expired && c.active && (
                        <span className="text-xs bg-amber-900/40 text-amber-400 px-2 py-0.5 rounded-full">Истёк</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.workers_count} сотр.</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.sites_count} объ.</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />до {formatDate(c.plan_expires_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleActive(c); }}
                      className={`p-1.5 rounded-lg transition-colors ${c.active ? 'hover:bg-red-900/30' : 'hover:bg-green-900/30'}`}
                      title={c.active ? 'Заблокировать' : 'Разблокировать'}
                    >
                      {c.active
                        ? <CheckCircle className="w-5 h-5 text-green-500" />
                        : <XCircle className="w-5 h-5 text-red-400" />
                      }
                    </button>
                    {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {/* Expand: edit panel */}
                {open && (
                  <div className="border-t border-gray-800 p-4 space-y-4">
                    <p className="text-xs text-gray-400">Зарег. {new Date(c.created_at).toLocaleDateString('ru-RU')} · Лимит сотр.: {c.max_workers}</p>

                    <div className="flex flex-wrap gap-3">
                      {/* Plan select */}
                      <div className="space-y-1">
                        <label className="text-xs text-gray-400">Тариф</label>
                        <select
                          value={editPlan[c.id] ?? c.plan}
                          onChange={(e) => setEditPlan({ ...editPlan, [c.id]: e.target.value })}
                          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-violet-500"
                        >
                          {PLANS.map((p) => (
                            <option key={p} value={p}>{PLAN_LABELS[p]}</option>
                          ))}
                        </select>
                      </div>

                      {/* Days to add */}
                      <div className="space-y-1">
                        <label className="text-xs text-gray-400">Продлить на (дней)</label>
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          placeholder="30"
                          value={editDays[c.id] ?? ''}
                          onChange={(e) => setEditDays({ ...editDays, [c.id]: e.target.value })}
                          className="bg-gray-800 border-gray-700 text-white w-36"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => update(c.id)}>
                        Применить
                      </Button>
                      {/* Quick buttons */}
                      {[30, 90, 365].map((d) => (
                        <Button key={d} size="sm" variant="outline"
                          className="border-gray-700 text-gray-300 hover:bg-gray-800"
                          onClick={() => {
                            setEditDays({ ...editDays, [c.id]: String(d) });
                            update(c.id);
                          }}>
                          +{d}д
                        </Button>
                      ))}
                      <Button size="sm" variant="outline"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800 ml-auto"
                        onClick={() => setExpanded(null)}>
                        Закрыть
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SuperAdmin;
