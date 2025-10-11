import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Clock, MapPin, Shield, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Welcome = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4 shadow-lg">
            <Clock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            GeoTime Cloud
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Система учёта рабочего времени с геолокацией. Синхронизация между устройствами.
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
            <h3 className="font-semibold">Облачная синхронизация</h3>
            <p className="text-sm text-muted-foreground">Доступ с любого устройства</p>
          </Card>
          
          <Card className="p-6 space-y-3 border-2 hover:border-accent/50 transition-colors">
            <Users className="w-8 h-8 text-accent" />
            <h3 className="font-semibold">Неограниченно сотрудников</h3>
            <p className="text-sm text-muted-foreground">Облачное управление командой</p>
          </Card>
        </div>

        {/* Role Selection */}
        <Card className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Вход в систему</h2>
            <p className="text-muted-foreground">Войдите с вашим PIN кодом</p>
          </div>
          
          <Button
            size="lg"
            className="w-full h-20 text-lg bg-gradient-to-br from-primary to-accent hover:shadow-lg transition-all"
            onClick={handleLogin}
          >
            <div className="space-y-1">
              <Shield className="w-8 h-8 mx-auto" />
              <div>Войти</div>
              <div className="text-xs opacity-80 font-normal">Введите ваш PIN код</div>
            </div>
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default Welcome;
