import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Settings as SettingsIcon, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AppSettings {
  max_users: number;
  purge_policy_days: number;
  accuracy_cap_m: number;
}

const Settings = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings>({
    max_users: 20,
    purge_policy_days: 365,
    accuracy_cap_m: 60,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Get company id for this user
        const { data: cid, error: cidError } = await supabase.rpc('get_my_company_id');
        if (cidError || !cid) throw new Error('Компания не найдена');
        setCompanyId(cid);

        const { data, error } = await supabase
          .from('settings')
          .select('max_users, purge_policy_days, accuracy_cap_m')
          .eq('id', cid)
          .single();

        if (error) throw error;
        if (data) {
          const row = data as { max_users: number; purge_policy_days: number; accuracy_cap_m?: number };
          setSettings({
            max_users: row.max_users,
            purge_policy_days: row.purge_policy_days,
            accuracy_cap_m: typeof row.accuracy_cap_m === 'number' ? row.accuracy_cap_m : 60,
          });
        }
      } catch {
        toast.error('Ошибка загрузки настроек');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      toast.error('Компания не найдена');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          max_users: settings.max_users,
          purge_policy_days: settings.purge_policy_days,
          accuracy_cap_m: settings.accuracy_cap_m,
        })
        .eq('id', companyId);

      if (error) throw error;
      toast.success('Настройки сохранены');
    } catch {
      toast.error('Ошибка сохранения настроек');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Настройки системы</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-lg space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="max_users">Максимум сотрудников</Label>
                <Input
                  id="max_users"
                  type="number"
                  min={1}
                  max={1000}
                  value={settings.max_users}
                  onChange={(e) => setSettings({ ...settings, max_users: parseInt(e.target.value) || 20 })}
                />
                <p className="text-xs text-muted-foreground">
                  Максимальное количество активных пользователей в системе
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="purge_days">Хранить данные (дней)</Label>
                <Input
                  id="purge_days"
                  type="number"
                  min={30}
                  max={3650}
                  value={settings.purge_policy_days}
                  onChange={(e) => setSettings({ ...settings, purge_policy_days: parseInt(e.target.value) || 365 })}
                />
                <p className="text-xs text-muted-foreground">
                  Смены старше указанного количества дней будут автоматически удалены
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accuracy_cap">Допуск GPS-погрешности (м)</Label>
                <Input
                  id="accuracy_cap"
                  type="number"
                  min={0}
                  max={200}
                  value={settings.accuracy_cap_m}
                  onChange={(e) => setSettings({ ...settings, accuracy_cap_m: Math.max(0, Math.min(200, parseInt(e.target.value) || 0)) })}
                />
                <p className="text-xs text-muted-foreground">
                  Насколько мягко система относится к GPS-погрешности. <b>0</b> — строгий
                  режим: «внутри» только если фактическое расстояние ≤ радиуса.
                  <b> 60</b> (по умолчанию) — терпимо к городской погрешности.
                  Чем больше значение, тем чаще сотрудник засчитывается «внутри радиуса»
                  при неточном сигнале.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Сохранение...' : 'Сохранить настройки'}
              </Button>
            </form>
          </Card>
        )}

        <Card className="p-6 border-dashed">
          <h3 className="font-semibold mb-2 text-muted-foreground">Информация о системе</h3>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Версия: 2.0</p>
            <p>База данных: Supabase</p>
            <p>Аутентификация: PIN-код</p>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Settings;
