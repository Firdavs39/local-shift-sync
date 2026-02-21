import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Building2, User, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState<{ slug: string; adminName: string } | null>(null);
  const [formData, setFormData] = useState({
    companyName: '',
    adminName: '',
    adminPin: '',
  });

  const handlePinInput = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 4);
    setFormData({ ...formData, adminPin: numbers });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.companyName.trim()) {
      toast.error('Введите название компании');
      return;
    }
    if (!formData.adminName.trim()) {
      toast.error('Введите имя администратора');
      return;
    }
    if (formData.adminPin.length !== 4) {
      toast.error('PIN должен быть 4 цифры');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-company', {
        body: {
          companyName: formData.companyName.trim(),
          adminName: formData.adminName.trim(),
          adminPin: formData.adminPin,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccessData({ slug: data.companySlug, adminName: data.adminName });
      setStep('success');
    } catch (err: any) {
      const msg = err.message || 'Ошибка регистрации. Попробуйте другое название компании.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success' && successData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 space-y-6 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-green-700">Компания зарегистрирована!</h1>
            <p className="text-muted-foreground">Сохраните данные для входа</p>
          </div>

          <div className="bg-muted rounded-xl p-6 space-y-4 text-left">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Код компании</p>
              <p className="text-2xl font-bold font-mono text-primary">{successData.slug}</p>
              <p className="text-xs text-muted-foreground mt-1">Введите этот код при входе</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Логин администратора</p>
              <p className="text-lg font-semibold">{successData.adminName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">PIN-код</p>
              <p className="text-lg font-semibold">•••• (тот, что вы указали)</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              ⚠️ Запишите код компании! Без него вы не сможете войти в систему.
            </p>
          </div>

          <Button
            className="w-full bg-gradient-to-r from-primary to-accent"
            onClick={() => navigate('/auth')}
          >
            Войти в систему →
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-2">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Регистрация компании</h1>
          <p className="text-muted-foreground text-sm">
            14 дней бесплатно. Без привязки карты.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Название компании</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="companyName"
                type="text"
                placeholder="ООО Везир или Мой Бизнес"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="pl-10"
                autoFocus
                maxLength={100}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Из него будет создан код компании для входа
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminName">Ваше имя (администратор)</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="adminName"
                type="text"
                placeholder="Иванов Иван"
                value={formData.adminName}
                onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                className="pl-10"
                maxLength={100}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminPin">PIN-код администратора (4 цифры)</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="adminPin"
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={formData.adminPin}
                onChange={(e) => handlePinInput(e.target.value)}
                className="pl-10 text-center text-2xl tracking-widest"
                maxLength={4}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-gradient-to-r from-primary to-accent"
            disabled={loading || !formData.companyName.trim() || !formData.adminName.trim() || formData.adminPin.length !== 4}
          >
            {loading ? 'Создание компании...' : 'Зарегистрировать компанию →'}
          </Button>
        </form>

        <div className="pt-2 border-t text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/auth')}
            className="text-xs"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Уже есть аккаунт? Войти
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Register;
