import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, ArrowLeft, User, Lock } from 'lucide-react';
import { loginWithCredentials } from '@/lib/supabase-auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Auth = () => {
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleUpdateAdminPassword = async () => {
    setUpdatingPassword(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-admin-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success('Пароль администратора обновлен!');
      } else {
        toast.error(data.error || 'Ошибка обновления пароля');
      }
    } catch (error) {
      console.error('Error updating admin password:', error);
      toast.error('Ошибка обновления пароля');
    } finally {
      setUpdatingPassword(false);
    }
  };

  useEffect(() => {
    // Check if already logged in
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .limit(1);
        
        if (roles && roles.length > 0) {
          navigate(roles[0].role === 'admin' ? '/admin' : '/me');
        }
      }
    };

    checkAuth();
  }, [navigate]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();

    if (!login.trim() || !pin.trim()) {
      toast.error('Введите логин и PIN код');
      return;
    }

    if (pin.length !== 3) {
      toast.error('PIN код должен быть 3 цифры');
      return;
    }

    setLoading(true);
    try {
      console.log('Attempting login:', { login: login.trim(), pin });
      const user = await loginWithCredentials(login.trim(), pin);
      console.log('Login result:', user);
      
      if (user) {
        toast.success(`Добро пожаловать, ${user.full_name}!`);
        navigate(user.role === 'admin' ? '/admin' : '/me');
      } else {
        toast.error('Неверный логин или PIN код. Проверьте консоль браузера для деталей (F12)');
        setPin('');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Ошибка входа. Проверьте консоль браузера (F12)');
      setPin('');
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
          <h1 className="text-3xl font-bold">VEZIR - GeoTime</h1>
          <p className="text-muted-foreground">Вход в систему</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login">Логин</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="login"
                type="text"
                placeholder="Admin или ваше имя"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Примеры: "Администратор", "Кали" (точно как в профиле)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">PIN код</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                placeholder="•••"
                value={pin}
                onChange={(e) => handlePinInput(e.target.value)}
                className="pl-10 text-center text-2xl tracking-widest"
                maxLength={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              3-значный PIN код (для админа: 777)
            </p>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-gradient-to-r from-primary to-accent"
            disabled={loading || !login.trim() || pin.length !== 3}
          >
            {loading ? 'Вход...' : 'Войти'}
          </Button>
        </form>

        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUpdateAdminPassword}
            disabled={updatingPassword}
            className="w-full text-xs"
          >
            {updatingPassword ? 'Обновление...' : 'Обновить пароль администратора'}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/welcome')}
            className="w-full text-xs"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Auth;
