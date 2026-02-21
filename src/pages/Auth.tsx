import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, User, Lock, Building2 } from 'lucide-react';
import GeoTimeLogo from '@/components/GeoTimeLogo';
import { loginWithCredentials } from '@/lib/supabase-auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Auth = () => {
  const navigate = useNavigate();
  const [companySlug, setCompanySlug] = useState('');
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

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

    if (!companySlug.trim() || !login.trim() || !pin.trim()) {
      toast.error('Заполните все поля');
      return;
    }

    if (pin.length !== 4) {
      toast.error('PIN код должен быть 4 цифры');
      return;
    }

    setLoading(true);
    try {
      const user = await loginWithCredentials(companySlug.trim(), login.trim(), pin);

      if (user) {
        toast.success(`Добро пожаловать, ${user.full_name}!`);
        navigate(user.role === 'admin' ? '/admin' : '/me');
      } else {
        toast.error('Неверный код компании, логин или PIN');
        setPin('');
      }
    } catch {
      toast.error('Ошибка входа. Проверьте данные.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 4);
    setPin(numbers);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-4">
          <GeoTimeLogo size={64} className="mx-auto mb-2" />
          <h1 className="text-3xl font-bold">GeoTime</h1>
          <p className="text-muted-foreground">Вход в систему</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company">Код компании</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="company"
                type="text"
                placeholder="vezir или название компании"
                value={companySlug}
                onChange={(e) => setCompanySlug(e.target.value.toLowerCase().trim())}
                className="pl-10"
                autoFocus
                autoCapitalize="none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="login">Ваше имя (логин)</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="login"
                type="text"
                placeholder="Иванов Иван"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">PIN код</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={pin}
                onChange={(e) => handlePinInput(e.target.value)}
                className="pl-10 text-center text-2xl tracking-widest"
                maxLength={4}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-gradient-to-r from-primary to-accent"
            disabled={loading || !companySlug.trim() || !login.trim() || pin.length !== 4}
          >
            {loading ? 'Вход...' : 'Войти'}
          </Button>
        </form>

        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs text-center text-muted-foreground">
            Нет аккаунта?
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate('/register')}
          >
            Зарегистрировать компанию
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="w-full text-xs"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            На главную
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Auth;
