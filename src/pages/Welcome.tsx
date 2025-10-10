import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Clock, MapPin, Shield, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { useEffect, useState } from 'react';

const Welcome = () => {
  const navigate = useNavigate();
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);

  useEffect(() => {
    // Check if there are any users in the database
    db.users.count().then(count => {
      if (count > 0) {
        setIsFirstLaunch(false);
        navigate('/login');
      }
    });
  }, [navigate]);

  const handleAdminSetup = async () => {
    // Admin with PIN 777 is created automatically on DB init
    alert(`PIN администратора: 777`);
    navigate('/login');
  };

  if (!isFirstLaunch) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4 shadow-lg">
            <Clock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            GeoTime Local
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Система учёта рабочего времени с геолокацией. Работает полностью офлайн на вашем устройстве.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6 space-y-3 border-2 hover:border-primary/50 transition-colors">
            <MapPin className="w-8 h-8 text-primary" />
            <h3 className="font-semibold">Геолокация</h3>
            <p className="text-sm text-muted-foreground">Точная привязка к рабочим объектам</p>
          </Card>
          
          <Card className="p-6 space-y-3 border-2 hover:border-accent/50 transition-colors">
            <Clock className="w-8 h-8 text-accent" />
            <h3 className="font-semibold">Учёт времени</h3>
            <p className="text-sm text-muted-foreground">Автоматический расчёт опозданий и часов</p>
          </Card>
          
          <Card className="p-6 space-y-3 border-2 hover:border-primary/50 transition-colors">
            <Shield className="w-8 h-8 text-primary" />
            <h3 className="font-semibold">Офлайн режим</h3>
            <p className="text-sm text-muted-foreground">Работает без интернета</p>
          </Card>
          
          <Card className="p-6 space-y-3 border-2 hover:border-accent/50 transition-colors">
            <Users className="w-8 h-8 text-accent" />
            <h3 className="font-semibold">До 20 сотрудников</h3>
            <p className="text-sm text-muted-foreground">Локальное управление командой</p>
          </Card>
        </div>

        {/* Role Selection */}
        <Card className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Начало работы</h2>
            <p className="text-muted-foreground">Выберите вашу роль для первой настройки</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <Button
              size="lg"
              className="h-32 text-lg bg-gradient-to-br from-primary to-primary-glow hover:shadow-lg transition-all"
              onClick={handleAdminSetup}
            >
              <div className="space-y-2">
                <Shield className="w-8 h-8 mx-auto" />
                <div>Я администратор</div>
                <div className="text-xs opacity-80 font-normal">Настройка системы и управление</div>
              </div>
            </Button>
            
            <Button
              size="lg"
              variant="outline"
              className="h-32 text-lg border-2 hover:bg-accent/10 hover:border-accent transition-all"
              onClick={() => navigate('/login')}
            >
              <div className="space-y-2">
                <Users className="w-8 h-8 mx-auto" />
                <div>Я сотрудник</div>
                <div className="text-xs opacity-80 font-normal">Отметка времени на объектах</div>
              </div>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Welcome;
