import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, Lock, ArrowLeft, Mail, Shield } from 'lucide-react';
import { loginWithPin, loginWithEmail } from '@/lib/supabase-auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Auth = () => {
  const navigate = useNavigate();
  const [adminPin, setAdminPin] = useState('');
  const [workerEmail, setWorkerEmail] = useState('');
  const [workerPassword, setWorkerPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Redirect based on role
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .limit(1);
        
        if (roles && roles.length > 0) {
          if (roles[0].role === 'admin') {
            navigate('/admin');
          } else {
            navigate('/me');
          }
        }
      }
    };

    checkAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          // Handle successful sign in
          setTimeout(async () => {
            const { data: roles } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', session.user.id)
              .limit(1);
            
            if (roles && roles.length > 0) {
              if (roles[0].role === 'admin') {
                navigate('/admin');
              } else {
                navigate('/me');
              }
            }
          }, 0);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin.length !== 3) {
      toast.error('PIN должен быть 3 цифры');
      return;
    }

    setLoading(true);
    try {
      const user = await loginWithPin(adminPin);
      if (user) {
        toast.success(`Добро пожаловать, ${user.full_name}!`);
        navigate('/admin');
      } else {
        toast.error('Неверный PIN администратора');
        setAdminPin('');
      }
    } catch (error) {
      toast.error('Ошибка входа');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleWorkerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workerEmail || !workerPassword) {
      toast.error('Введите email и пароль');
      return;
    }

    setLoading(true);
    try {
      const user = await loginWithEmail(workerEmail, workerPassword);
      if (user) {
        toast.success(`Добро пожаловать, ${user.full_name}!`);
        navigate('/me');
      } else {
        toast.error('Неверный email или пароль');
      }
    } catch (error) {
      toast.error('Ошибка входа');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 3);
    setAdminPin(numbers);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-2">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">GeoTime Cloud</h1>
          <p className="text-muted-foreground">Вход в систему</p>
        </div>

        <Tabs defaultValue="worker" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="worker">Сотрудник</TabsTrigger>
            <TabsTrigger value="admin">Администратор</TabsTrigger>
          </TabsList>

          <TabsContent value="worker" className="space-y-4">
            <form onSubmit={handleWorkerLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={workerEmail}
                    onChange={(e) => setWorkerEmail(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••"
                    value={workerPassword}
                    onChange={(e) => setWorkerPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-primary to-accent"
                disabled={loading}
              >
                {loading ? 'Вход...' : 'Войти'}
              </Button>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Нет аккаунта?{' '}
                  <Button
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => navigate('/register')}
                  >
                    Зарегистрироваться
                  </Button>
                </p>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="admin" className="space-y-4">
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-pin">PIN администратора</Label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="admin-pin"
                    type="password"
                    inputMode="numeric"
                    placeholder="•••"
                    value={adminPin}
                    onChange={(e) => handlePinInput(e.target.value)}
                    className="pl-10 text-center text-2xl tracking-widest h-14"
                    maxLength={3}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  По умолчанию: 777
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-primary to-accent"
                disabled={adminPin.length !== 3 || loading}
              >
                {loading ? 'Проверка...' : 'Войти как админ'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/welcome')}
            className="text-xs"
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
