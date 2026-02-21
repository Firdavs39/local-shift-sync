import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Send, Bot, MessageSquare, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUser } from '@/lib/supabase-auth';

interface TelegramConfig {
  bot_token: string;
  chat_id: string;
  notify_late: boolean;
}

const TelegramSettings = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<TelegramConfig>({ bot_token: '', chat_id: '', notify_late: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getCurrentUser();
        if (!user?.company_id) return;
        setCompanyId(user.company_id);

        const { data } = await supabase
          .from('telegram_config')
          .select('bot_token, chat_id, notify_late')
          .eq('company_id', user.company_id)
          .single();

        if (data) setConfig(data);
      } catch {
        // No config yet — form starts empty
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!config.bot_token.trim() || !config.chat_id.trim()) {
      toast.error('Заполните Bot Token и Chat ID');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('telegram_config')
        .upsert({
          company_id: companyId,
          bot_token: config.bot_token.trim(),
          chat_id: config.chat_id.trim(),
          notify_late: config.notify_late,
        }, { onConflict: 'company_id' });

      if (error) throw error;
      toast.success('Настройки Telegram сохранены');
    } catch {
      toast.error('Ошибка сохранения настроек');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.bot_token.trim() || !config.chat_id.trim()) {
      toast.error('Сначала сохраните настройки');
      return;
    }

    setTesting(true);
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${config.bot_token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: config.chat_id,
            text: '✅ VEZIR GeoTime: Telegram уведомления настроены и работают!',
          }),
        },
      );

      const result = await response.json();
      if (result.ok) {
        toast.success('Тестовое сообщение отправлено! Проверьте Telegram.');
      } else {
        toast.error(`Ошибка Telegram: ${result.description}`);
      }
    } catch {
      toast.error('Не удалось отправить сообщение. Проверьте Bot Token.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Send className="w-5 h-5 text-blue-500" />
          <h1 className="text-xl font-semibold">Telegram уведомления</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* Instruction */}
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-500" />
            Как настроить бота
          </h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
              <span>Откройте Telegram, найдите <strong className="text-foreground">@BotFather</strong> и напишите <code className="bg-muted px-1 rounded">/newbot</code></span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
              <span>Следуйте инструкциям, введите имя бота. BotFather выдаст вам <strong className="text-foreground">Bot Token</strong> — скопируйте его</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
              <span>Напишите вашему боту любое сообщение, затем откройте в браузере: <code className="bg-muted px-1 rounded text-xs break-all">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> и найдите <code className="bg-muted px-1 rounded">chat.id</code></span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>
              <span>Вставьте Token и Chat ID ниже, сохраните и нажмите "Тест"</span>
            </li>
          </ol>
        </Card>

        {/* Config form */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSave} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="bot_token" className="flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  Bot Token
                </Label>
                <Input
                  id="bot_token"
                  type="text"
                  placeholder="1234567890:AAEFxxx..."
                  value={config.bot_token}
                  onChange={(e) => setConfig({ ...config, bot_token: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="chat_id" className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Chat ID
                </Label>
                <Input
                  id="chat_id"
                  type="text"
                  placeholder="-100123456789 или 123456789"
                  value={config.chat_id}
                  onChange={(e) => setConfig({ ...config, chat_id: e.target.value })}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Для группы Chat ID начинается с минуса: -100...
                </p>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <input
                  type="checkbox"
                  id="notify_late"
                  checked={config.notify_late}
                  onChange={(e) => setConfig({ ...config, notify_late: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="notify_late" className="cursor-pointer text-sm">
                  Уведомлять об опозданиях сотрудников
                </Label>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing || !config.bot_token || !config.chat_id}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {testing ? 'Отправка...' : 'Тест'}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
};

export default TelegramSettings;
