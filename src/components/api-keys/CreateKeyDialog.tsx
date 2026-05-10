import { useState, FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiKeysApi, ApiKeyScope, scopeLabel, scopeDescription, CreateKeyResponse } from '@/lib/api-keys-client';

interface CreateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (response: CreateKeyResponse) => void;
  tierAllowsIpAllowlist: boolean;
}

const ALL_SCOPES: ApiKeyScope[] = ['read:basic', 'read:reports', 'read:full', 'read:audit'];

const AGENT_TYPES = [
  { value: 'telegram-bot', label: 'Telegram-бот' },
  { value: 'n8n', label: 'n8n workflow' },
  { value: 'zapier', label: 'Zapier' },
  { value: 'hermes', label: 'Hermes Agent' },
  { value: 'custom', label: 'Свой скрипт / интеграция' },
];

const EXPIRATION_OPTIONS = [
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: '180', label: '180 дней' },
  { value: '365', label: '1 год (по умолчанию)' },
  { value: 'custom', label: 'Своя дата' },
];

export function CreateKeyDialog({ open, onOpenChange, onCreated, tierAllowsIpAllowlist }: CreateKeyDialogProps) {
  const [name, setName] = useState('');
  const [agentType, setAgentType] = useState('telegram-bot');
  const [intendedUse, setIntendedUse] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['read:basic']);
  const [expirationDays, setExpirationDays] = useState('365');
  const [customDate, setCustomDate] = useState('');
  const [ipAllowlist, setIpAllowlist] = useState('');
  const [env, setEnv] = useState<'live' | 'test'>('live');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setAgentType('telegram-bot');
    setIntendedUse('');
    setScopes(['read:basic']);
    setExpirationDays('365');
    setCustomDate('');
    setIpAllowlist('');
    setEnv('live');
  };

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
    reset();
  };

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((prev) => {
      if (prev.includes(scope)) {
        return prev.filter((s) => s !== scope);
      }
      return [...prev, scope];
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      toast.error('Укажи название ключа');
      return;
    }
    if (scopes.length === 0) {
      toast.error('Выбери хотя бы один scope');
      return;
    }

    let expiresAt: string | null = null;
    if (expirationDays === 'custom') {
      if (!customDate) {
        toast.error('Укажи дату истечения');
        return;
      }
      expiresAt = new Date(customDate).toISOString();
    } else {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(expirationDays, 10));
      expiresAt = d.toISOString();
    }

    let ipList: string[] | undefined;
    if (ipAllowlist.trim() && tierAllowsIpAllowlist) {
      ipList = ipAllowlist
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    setSubmitting(true);
    try {
      const response = await ApiKeysApi.create({
        name: name.trim(),
        scopes,
        agent_type: agentType,
        intended_use: intendedUse.trim() || undefined,
        expires_at: expiresAt,
        ip_allowlist: ipList,
        env,
      });
      toast.success('Ключ создан. Сохрани его сейчас.');
      onCreated(response);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Не удалось создать ключ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый API-ключ</DialogTitle>
          <DialogDescription>
            Этот ключ позволит AI-агенту читать данные твоей компании через bot-api.
            После создания полный ключ будет показан один раз — сохрани его сразу.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Название ключа *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Напр. Hermes для Иванова"
              maxLength={100}
              required
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Чтобы потом узнать какой агент использует этот ключ
            </p>
          </div>

          <div>
            <Label htmlFor="agent_type">Тип агента</Label>
            <Select value={agentType} onValueChange={setAgentType} disabled={submitting}>
              <SelectTrigger id="agent_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_TYPES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="intended_use">Назначение (опционально)</Label>
            <Textarea
              id="intended_use"
              value={intendedUse}
              onChange={(e) => setIntendedUse(e.target.value)}
              placeholder="Напр. Утренние сводки в Telegram-чат"
              rows={2}
              maxLength={500}
              disabled={submitting}
            />
          </div>

          <div>
            <Label>Разрешения (scopes) *</Label>
            <div className="space-y-2 mt-2">
              {ALL_SCOPES.map((scope) => (
                <label
                  key={scope}
                  className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={scopes.includes(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                    disabled={submitting}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="font-medium text-sm">{scopeLabel(scope)}</div>
                    <div className="text-xs text-muted-foreground">{scopeDescription(scope)}</div>
                    <code className="text-xs text-primary">{scope}</code>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              По умолчанию — минимально необходимое <code>read:basic</code>. Не давай больше чем нужно.
            </p>
          </div>

          <div>
            <Label htmlFor="expiration">Истекает</Label>
            <Select value={expirationDays} onValueChange={setExpirationDays} disabled={submitting}>
              <SelectTrigger id="expiration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {expirationDays === 'custom' && (
              <Input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="mt-2"
                disabled={submitting}
              />
            )}
          </div>

          {tierAllowsIpAllowlist && (
            <div>
              <Label htmlFor="ip_allowlist">IP allowlist (опционально, тариф Бизнес+)</Label>
              <Textarea
                id="ip_allowlist"
                value={ipAllowlist}
                onChange={(e) => setIpAllowlist(e.target.value)}
                placeholder={'Через запятую или с новой строки\n93.184.216.34\n203.0.113.0/24'}
                rows={3}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Если задано — ключ работает только с этих IP. Пусто = разрешены все.
              </p>
            </div>
          )}

          <div>
            <Label>Окружение</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant={env === 'live' ? 'default' : 'outline'}
                onClick={() => setEnv('live')}
                disabled={submitting}
                className="flex-1"
              >
                Production (live)
              </Button>
              <Button
                type="button"
                variant={env === 'test' ? 'default' : 'outline'}
                onClick={() => setEnv('test')}
                disabled={submitting}
                className="flex-1"
              >
                Test (test)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {env === 'live'
                ? 'Префикс gtk_v1_live_ — для боевого использования'
                : 'Префикс gtk_v1_test_ — для разработки и тестов'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Создать ключ
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
