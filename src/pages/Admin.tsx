import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCurrentUser, logout, isAdmin, UserWithRole } from '@/lib/supabase-auth';
import { Users, MapPin, FileBarChart, LogOut, Settings, CreditCard, Send, KeyRound, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface DashboardStats {
  users: number;
  sites: number;
  activeShifts: number;
  todayShifts: number;
}

const Admin = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ users: 0, sites: 0, activeShifts: 0, todayShifts: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = async () => {
    try {
      setStatsLoading(true);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [usersRes, sitesRes, activeRes, todayRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('sites').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('shifts').select('id', { count: 'exact', head: true }).is('ended_at', null),
        supabase.from('shifts').select('id', { count: 'exact', head: true }).gte('started_at', todayStart.toISOString()),
      ]);

      setStats({
        users: usersRes.count ?? 0,
        sites: sitesRes.count ?? 0,
        activeShifts: activeRes.count ?? 0,
        todayShifts: todayRes.count ?? 0,
      });
    } catch {
      // Stats are non-critical, silently fail
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          toast.error('Доступ запрещён');
          navigate('/auth');
          return;
        }

        const adminStatus = await isAdmin();
        if (!adminStatus) {
          toast.error('Доступ запрещён');
          navigate('/me');
          return;
        }

        setUser(currentUser);
        loadStats();
      } catch {
        toast.error('Ошибка авторизации');
        navigate('/auth');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold">{user.full_name}</h1>
              <p className="text-xs text-muted-foreground">Администратор</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Панель администратора</h2>
          <p className="text-muted-foreground">Управление пользователями и объектами</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Users Management */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/admin/users')}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Пользователи</h3>
            <p className="text-muted-foreground">
              Управление сотрудниками, создание новых пользователей и настройка PIN-кодов
            </p>
            <Button className="w-full bg-gradient-to-r from-primary to-primary-glow">
              Управление пользователями
            </Button>
          </Card>

          {/* Sites Management */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/admin/sites')}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <MapPin className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Объекты</h3>
            <p className="text-muted-foreground">
              Добавление и настройка рабочих объектов, геолокация и расписание
            </p>
            <Button className="w-full bg-gradient-to-r from-accent to-accent/80">
              Управление объектами
            </Button>
          </Card>

          {/* Who is on shift */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/admin/on-shift')}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Activity className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Кто на смене</h3>
            <p className="text-muted-foreground">
              Кто сейчас работает, опоздания, отсутствия и дисциплина за сегодня
            </p>
            <Button variant="outline" className="w-full border-2" onClick={() => navigate('/admin/on-shift')}>
              Открыть
            </Button>
          </Card>

          {/* Reports */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/admin/reports')}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FileBarChart className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Отчёты</h3>
            <p className="text-muted-foreground">
              Статистика по сменам, опозданиям и отработанным часам. Экспорт в CSV
            </p>
            <Button variant="outline" className="w-full border-2">
              Просмотр отчётов
            </Button>
          </Card>

          {/* Settings */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/admin/settings')}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-muted to-muted-foreground flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Settings className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Настройки</h3>
            <p className="text-muted-foreground">
              Общие настройки системы, лимиты и политики хранения данных
            </p>
            <Button variant="outline" className="w-full border-2" onClick={() => navigate('/admin/settings')}>
              Настройки системы
            </Button>
          </Card>

          {/* Billing */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/admin/billing')}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CreditCard className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Тариф и оплата</h3>
            <p className="text-muted-foreground">
              Управление подпиской, смена тарифного плана
            </p>
            <Button variant="outline" className="w-full border-2" onClick={() => navigate('/admin/billing')}>
              Управление тарифом
            </Button>
          </Card>

          {/* Telegram */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/admin/telegram')}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Send className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Telegram</h3>
            <p className="text-muted-foreground">
              Уведомления об опозданиях в Telegram. Настройка бота
            </p>
            <Button variant="outline" className="w-full border-2" onClick={() => navigate('/admin/telegram')}>
              Настроить уведомления
            </Button>
          </Card>

          {/* API Keys */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/admin/api-keys')}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <KeyRound className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">API-ключи</h3>
            <p className="text-muted-foreground">
              Доступ для AI-агентов, Telegram-ботов, n8n и других интеграций
            </p>
            <Button variant="outline" className="w-full border-2" onClick={() => navigate('/admin/api-keys')}>
              Управление ключами
            </Button>
          </Card>
        </div>

        {/* Quick Stats */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Быстрая статистика</h3>
            <Button variant="ghost" size="sm" onClick={loadStats} disabled={statsLoading}>
              {statsLoading ? '...' : 'Обновить'}
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">
                {statsLoading ? '…' : stats.users}
              </div>
              <div className="text-sm text-muted-foreground">Пользователей</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">
                {statsLoading ? '…' : stats.sites}
              </div>
              <div className="text-sm text-muted-foreground">Объектов</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">
                {statsLoading ? '…' : stats.activeShifts}
              </div>
              <div className="text-sm text-muted-foreground">Активных смен</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">
                {statsLoading ? '…' : stats.todayShifts}
              </div>
              <div className="text-sm text-muted-foreground">Смен сегодня</div>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Admin;
