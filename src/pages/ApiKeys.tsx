import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  KeyRound,
  Plus,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  RotateCw,
  Activity,
  AlertCircle,
  Bot,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiKeysApi,
  ApiKey,
  TierLimits,
  CreateKeyResponse,
  RotateKeyResponse,
  formatKeyPreview,
  formatRelativeTime,
  formatExpiration,
  scopeLabel,
} from '@/lib/api-keys-client';
import { CreateKeyDialog } from '@/components/api-keys/CreateKeyDialog';
import { RevealKeyDialog } from '@/components/api-keys/RevealKeyDialog';
import { EditKeyDialog } from '@/components/api-keys/EditKeyDialog';
import { UsageDialog } from '@/components/api-keys/UsageDialog';

const ApiKeys = () => {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [tier, setTier] = useState<TierLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'active' | 'revoked'>('active');

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [reveal, setReveal] = useState<{ plainKey: string; name: string; isRotation: boolean; overlapDays?: number } | null>(null);
  const [editKey, setEditKey] = useState<ApiKey | null>(null);
  const [usageKey, setUsageKey] = useState<ApiKey | null>(null);
  const [revokeKey, setRevokeKey] = useState<ApiKey | null>(null);
  const [revokeConfirmName, setRevokeConfirmName] = useState('');
  const [rotateKey, setRotateKey] = useState<ApiKey | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    try {
      const [list, t] = await Promise.all([
        ApiKeysApi.list(true), // include revoked
        ApiKeysApi.tier(),
      ]);
      setKeys(list.keys);
      setTier(t);
    } catch (err: any) {
      toast.error(err?.message ?? 'Не удалось загрузить ключи');
    }
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleCreated = (response: CreateKeyResponse) => {
    setReveal({ plainKey: response.plain_key, name: response.key.name, isRotation: false });
    load();
  };

  const handleRotateConfirm = async () => {
    if (!rotateKey) return;
    setActionLoading(true);
    try {
      const r: RotateKeyResponse = await ApiKeysApi.rotate(rotateKey.id);
      setRotateKey(null);
      setReveal({ plainKey: r.plain_key, name: r.new_key.name, isRotation: true, overlapDays: r.overlap_days });
      load();
      toast.success(`Ротирован. Старый ключ работает ещё ${r.overlap_days} дней.`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Ошибка ротации');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeKey) return;
    if (revokeConfirmName !== revokeKey.name) {
      toast.error('Имя ключа не совпадает');
      return;
    }
    setActionLoading(true);
    try {
      await ApiKeysApi.revoke(revokeKey.id);
      toast.success('Ключ отозван');
      setRevokeKey(null);
      setRevokeConfirmName('');
      load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Ошибка отзыва');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async (key: ApiKey) => {
    setActionLoading(true);
    try {
      await ApiKeysApi.restore(key.id);
      toast.success(`Ключ "${key.name}" восстановлен`);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Не удалось восстановить (возможно, прошло >30 дней)');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const activeKeys = keys.filter((k) => k.status === 'active');
  const revokedKeys = keys.filter((k) => k.status === 'revoked');
  const tierAllowsIp = tier?.plan === 'business' || tier?.plan === 'enterprise';
  const noQuotaLeft = tier && tier.keys_remaining <= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <KeyRound className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <h1 className="font-semibold">API-ключи</h1>
            <p className="text-xs text-muted-foreground">Для AI-агентов, Telegram-ботов и интеграций</p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        {/* Tier card */}
        {tier && (
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Тариф: {tierName(tier.plan)}</h3>
                  <Badge variant="secondary">{tier.plan}</Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Ключей использовано</div>
                    <div className="font-semibold">
                      {tier.active_keys_count} / {tier.max_keys >= 9999 ? '∞' : tier.max_keys}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Лимит запросов</div>
                    <div className="font-semibold">{tier.rate_limit_rpm} req/min</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Дневная квота</div>
                    <div className="font-semibold">
                      {tier.daily_quota >= 100000000 ? '∞' : tier.daily_quota.toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Audit-log</div>
                    <div className="font-semibold">
                      {tier.audit_retention_days === 0 ? 'нет' : `${tier.audit_retention_days} дн`}
                    </div>
                  </div>
                </div>

                {tier.max_keys < 9999 && (
                  <Progress
                    value={Math.min(100, Math.round((tier.active_keys_count / tier.max_keys) * 100))}
                    className="h-2"
                  />
                )}
              </div>

              <Button
                onClick={() => setCreateOpen(true)}
                disabled={noQuotaLeft}
                className="shrink-0"
              >
                <Plus className="w-4 h-4 mr-1" />
                Создать ключ
              </Button>
            </div>

            {noQuotaLeft && (
              <Alert className="mt-4">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription className="text-sm">
                  Лимит ключей исчерпан. Отзови неиспользуемый или{' '}
                  <button className="underline" onClick={() => navigate('/admin/billing')}>
                    обнови тариф
                  </button>
                  .
                </AlertDescription>
              </Alert>
            )}
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'revoked')}>
          <TabsList>
            <TabsTrigger value="active">
              Активные ({activeKeys.length})
            </TabsTrigger>
            <TabsTrigger value="revoked">
              Отозванные ({revokedKeys.length})
            </TabsTrigger>
            <TabsTrigger value="docs">Документация</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3 mt-4">
            {activeKeys.length === 0 ? (
              <EmptyState onCreate={() => setCreateOpen(true)} />
            ) : (
              activeKeys.map((key) => (
                <KeyCard
                  key={key.id}
                  apiKey={key}
                  onView={() => setUsageKey(key)}
                  onEdit={() => setEditKey(key)}
                  onRotate={() => setRotateKey(key)}
                  onRevoke={() => setRevokeKey(key)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="revoked" className="space-y-3 mt-4">
            {revokedKeys.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">Отозванных ключей нет</Card>
            ) : (
              revokedKeys.map((key) => (
                <RevokedKeyCard
                  key={key.id}
                  apiKey={key}
                  loading={actionLoading}
                  onRestore={() => handleRestore(key)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="docs" className="mt-4">
            <DocsTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialogs */}
      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
        tierAllowsIpAllowlist={tierAllowsIp}
      />
      {reveal && (
        <RevealKeyDialog
          open={true}
          plainKey={reveal.plainKey}
          keyName={reveal.name}
          isRotation={reveal.isRotation}
          overlapDays={reveal.overlapDays}
          onAcknowledge={() => setReveal(null)}
        />
      )}
      <EditKeyDialog
        apiKey={editKey}
        open={!!editKey}
        onOpenChange={(o) => !o && setEditKey(null)}
        onSaved={load}
        tierAllowsIpAllowlist={tierAllowsIp}
      />
      <UsageDialog
        apiKey={usageKey}
        open={!!usageKey}
        onOpenChange={(o) => !o && setUsageKey(null)}
      />

      {/* Rotate confirm */}
      <AlertDialog open={!!rotateKey} onOpenChange={(o) => !o && !actionLoading && setRotateKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ротировать ключ?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Будет создан <strong>новый ключ</strong> с теми же настройками.
                Старый ключ продолжит работать <strong>ещё 7 дней</strong> — успей обновить интеграцию.
              </span>
              <span className="block font-medium">{rotateKey?.name}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotateConfirm} disabled={actionLoading}>
              {actionLoading ? 'Создаём…' : 'Ротировать'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke confirm with name typing */}
      <AlertDialog
        open={!!revokeKey}
        onOpenChange={(o) => {
          if (!o && !actionLoading) {
            setRevokeKey(null);
            setRevokeConfirmName('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отозвать ключ?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                Ключ <strong>{revokeKey?.name}</strong> перестанет работать немедленно.
                Восстановить можно в течение 30 дней.
              </span>
              <span className="block">
                Введи имя ключа <code className="px-1 rounded bg-muted text-xs">{revokeKey?.name}</code> для подтверждения:
              </span>
              <input
                type="text"
                value={revokeConfirmName}
                onChange={(e) => setRevokeConfirmName(e.target.value)}
                placeholder={revokeKey?.name}
                className="w-full px-3 py-2 border rounded-md text-sm"
                disabled={actionLoading}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeConfirm}
              disabled={actionLoading || revokeConfirmName !== revokeKey?.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? 'Отзываем…' : 'Отозвать'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ----- helper UI components -----

function tierName(plan: string): string {
  const map: Record<string, string> = {
    trial: 'Пробный',
    starter: 'Старт',
    business: 'Бизнес',
    enterprise: 'Корпоративный',
  };
  return map[plan] ?? plan;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="p-12 text-center space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <KeyRound className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold">Создай первый ключ</h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        API-ключ позволит твоему AI-агенту (Hermes, n8n, кастомный бот) читать данные компании через bot-api.
        Read-only, изолированно по компании, под твоим контролем.
      </p>
      <Button onClick={onCreate}>
        <Plus className="w-4 h-4 mr-1" />
        Создать ключ
      </Button>
    </Card>
  );
}

function KeyCard({
  apiKey,
  onView,
  onEdit,
  onRotate,
  onRevoke,
}: {
  apiKey: ApiKey;
  onView: () => void;
  onEdit: () => void;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const exp = formatExpiration(apiKey.expires_at);
  const dailyPct = apiKey.usage && apiKey.daily_quota > 0
    ? Math.min(100, Math.round((apiKey.usage.daily_used / apiKey.daily_quota) * 100))
    : 0;

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold">{apiKey.name}</h4>
            {apiKey.agent_type && (
              <Badge variant="outline" className="text-xs">
                <Bot className="w-3 h-3 mr-1" />
                {apiKey.agent_type}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {formatKeyPreview(apiKey)}
            </code>
            {apiKey.scopes.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">
                {scopeLabel(s)}
              </Badge>
            ))}
          </div>
          {apiKey.intended_use && (
            <p className="text-xs text-muted-foreground">{apiKey.intended_use}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span>Использован: {formatRelativeTime(apiKey.last_used_at)}</span>
            <span>·</span>
            <span className={exp.warning === 'soon' ? 'text-orange-600' : exp.warning === 'expired' ? 'text-red-600' : ''}>
              Истекает: {exp.text}
            </span>
            {apiKey.ip_allowlist && apiKey.ip_allowlist.length > 0 && (
              <>
                <span>·</span>
                <span>IP allowlist: {apiKey.ip_allowlist.length}</span>
              </>
            )}
          </div>
          {apiKey.usage && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Сегодня: {apiKey.usage.daily_used} / {apiKey.daily_quota.toLocaleString('ru-RU')}
                </span>
                {dailyPct > 80 && <span className="text-orange-600">{dailyPct}%</span>}
              </div>
              <Progress value={dailyPct} className="h-1" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="sm" onClick={onView}>
            <Activity className="w-4 h-4 mr-1" /> Метрики
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-1" /> Изменить
          </Button>
          <Button variant="ghost" size="sm" onClick={onRotate}>
            <RotateCw className="w-4 h-4 mr-1" /> Ротировать
          </Button>
          <Button variant="ghost" size="sm" onClick={onRevoke} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Отозвать
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RevokedKeyCard({
  apiKey,
  loading,
  onRestore,
}: {
  apiKey: ApiKey;
  loading: boolean;
  onRestore: () => void;
}) {
  const revokedDate = apiKey.revoked_at ? new Date(apiKey.revoked_at) : null;
  const daysLeft = revokedDate
    ? 30 - Math.floor((Date.now() - revokedDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const canRestore = daysLeft > 0;

  return (
    <Card className="p-4 opacity-70">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="font-medium line-through">{apiKey.name}</h4>
            <Badge variant="destructive" className="text-xs">отозван</Badge>
          </div>
          <code className="text-xs text-muted-foreground">{formatKeyPreview(apiKey)}</code>
          <div className="text-xs text-muted-foreground">
            Отозван: {formatRelativeTime(apiKey.revoked_at)}
            {canRestore && ` · Можно восстановить ещё ${daysLeft} дн`}
            {!canRestore && ' · Окно восстановления истекло'}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRestore}
          disabled={!canRestore || loading}
        >
          <Eye className="w-4 h-4 mr-1" /> Восстановить
        </Button>
      </div>
    </Card>
  );
}

function DocsTab() {
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? 'https://ldyshcvwxfzvfjrkcfgw.supabase.co';
  const baseUrl = `${supabaseUrl}/functions/v1/bot-api`;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Базовый URL</h3>
        <code className="block text-xs bg-muted p-3 rounded break-all">{baseUrl}</code>
        <p className="text-sm text-muted-foreground">
          Все запросы — <code>GET</code>. Авторизация через заголовок <code>Authorization: Bearer gtk_v1_...</code>.
        </p>
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="font-semibold">Endpoints (read-only)</h3>
        <div className="space-y-2 text-sm">
          {[
            { path: '/', desc: 'Discovery — возвращает scopes ключа и список endpoints' },
            { path: '/shifts', desc: 'Список смен (фильтры: date, status, user_id, site_id, limit)' },
            { path: '/active-now', desc: 'Кто на смене прямо сейчас (ended_at IS NULL)' },
            { path: '/late-today', desc: 'Опоздавшие сегодня, отсортировано по minutes_late' },
            { path: '/workers', desc: 'Список сотрудников (active=true)' },
            { path: '/sites', desc: 'Список объектов с timezone и expected_start/end' },
            { path: '/worker-stats?name=&days=', desc: 'Статистика сотрудника по имени' },
            { path: '/summary?days=', desc: 'Агрегат за период' },
            { path: '/digest?type=morning|evening|weekly', desc: 'Готовая сводка' },
            { path: '/audit-log', desc: 'История запросов (требует scope read:audit)' },
          ].map((ep) => (
            <div key={ep.path} className="flex items-start gap-3 py-2 border-b last:border-0">
              <code className="text-primary text-xs font-mono shrink-0 min-w-[200px]">{ep.path}</code>
              <span className="text-muted-foreground text-xs">{ep.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Пример: курл</h3>
        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`curl -H "Authorization: Bearer gtk_v1_live_..." \\
  ${baseUrl}/active-now`}
        </pre>

        <h3 className="font-semibold mt-4">Пример: Python</h3>
        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`import os, requests
key = os.environ["GEOTIME_API_KEY"]
r = requests.get(
    f"${baseUrl}/late-today",
    headers={"Authorization": f"Bearer {key}"}
)
print(r.json()["data"]["late"])`}
        </pre>

        <h3 className="font-semibold mt-4">Пример: Node.js</h3>
        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`const key = process.env.GEOTIME_API_KEY;
const res = await fetch("${baseUrl}/summary?days=7", {
  headers: { Authorization: \`Bearer \${key}\` }
});
const { data } = await res.json();
console.log(data);`}
        </pre>
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="font-semibold flex items-center gap-2">
          <ChevronRight className="w-4 h-4" />
          Скармливание AI-агенту
        </h3>
        <p className="text-sm text-muted-foreground">
          Дай агенту переменную окружения <code>GEOTIME_API_KEY</code> и системный промпт:
        </p>
        <pre className="text-xs bg-muted p-3 rounded">
{`Ты — диспетчер по учёту рабочего времени.
Используй REST API GeoTime: ${baseUrl}
Auth: Authorization: Bearer $GEOTIME_API_KEY

Утром в 9:00 присылай сводку через /digest?type=morning
Вечером в 18:00 — /digest?type=evening
По запросам "кто опоздал" вызывай /late-today
Не выдумывай данные — всегда вызывай инструмент.`}
        </pre>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-2">Лимиты и ошибки</h3>
        <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
          <li><code>401 invalid_key</code> — ключ недействителен / отозван / истёк</li>
          <li><code>403 scope_denied</code> — нужен другой scope</li>
          <li><code>403 ip_denied</code> — IP не в allowlist ключа</li>
          <li><code>429 rate_limited</code> — превышен RPM (см. <code>Retry-After</code>)</li>
          <li><code>500 config_error</code> — серверная проблема (свяжись с поддержкой)</li>
        </ul>
      </Card>

      <a
        href="https://github.com/Firdavs39/local-shift-sync/blob/main/docs/BOT_API.md"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        Полная документация на GitHub
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

export default ApiKeys;
