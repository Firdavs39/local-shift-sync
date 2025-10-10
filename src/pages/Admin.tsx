import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCurrentUser, logout, isAdmin } from '@/lib/auth';
import { Users, MapPin, FileBarChart, LogOut, Settings } from 'lucide-react';
import { toast } from 'sonner';

const Admin = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();

  useEffect(() => {
    if (!user || !isAdmin()) {
      toast.error('Доступ запрещён');
      navigate('/login');
    }
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
              <h1 className="font-semibold">{user.fullName}</h1>
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
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group">
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
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group">
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

          {/* Reports */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FileBarChart className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Отчёты</h3>
            <p className="text-muted-foreground">
              Статистика по сменам, опозданиям и отработанным часам
            </p>
            <Button variant="outline" className="w-full border-2">
              Просмотр отчётов
            </Button>
          </Card>

          {/* Settings */}
          <Card className="p-8 space-y-4 hover:shadow-lg transition-shadow cursor-pointer group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-muted to-muted-foreground flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Settings className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold">Настройки</h3>
            <p className="text-muted-foreground">
              Общие настройки системы, лимиты и политики хранения данных
            </p>
            <Button variant="outline" className="w-full border-2">
              Настройки системы
            </Button>
          </Card>
        </div>

        {/* Quick Stats */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Быстрая статистика</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">0</div>
              <div className="text-sm text-muted-foreground">Пользователей</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">0</div>
              <div className="text-sm text-muted-foreground">Объектов</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">0</div>
              <div className="text-sm text-muted-foreground">Активных смен</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">0</div>
              <div className="text-sm text-muted-foreground">Смен сегодня</div>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Admin;
