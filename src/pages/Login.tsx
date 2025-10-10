import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Clock, Lock } from 'lucide-react';
import { login } from '@/lib/auth';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 3) {
      toast.error('PIN должен быть 3 цифры');
      return;
    }

    setLoading(true);
    try {
      const user = await login(pin);
      if (user) {
        toast.success(`Добро пожаловать, ${user.fullName}!`);
        if (user.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/me');
        }
      } else {
        toast.error('Неверный PIN или пользователь неактивен');
        setPin('');
      }
    } catch (error) {
      toast.error('Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 3);
    setPin(numbers);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-2">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">GeoTime Local</h1>
          <p className="text-muted-foreground">Введите ваш PIN-код</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="password"
                inputMode="numeric"
                placeholder="•••"
                value={pin}
                onChange={(e) => handlePinInput(e.target.value)}
                className="pl-10 text-center text-2xl tracking-widest h-14"
                maxLength={3}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              3-значный PIN код
            </p>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-gradient-to-r from-primary to-accent"
            disabled={pin.length !== 3 || loading}
          >
            {loading ? 'Проверка...' : 'Войти'}
          </Button>
        </form>

        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/welcome')}
            className="text-xs"
          >
            Первый запуск?
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Login;
