import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, AlertCircle } from 'lucide-react';
import { ApiKey, ApiKeysApi, UsageStats, formatRelativeTime } from '@/lib/api-keys-client';

interface UsageDialogProps {
  apiKey: ApiKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UsageDialog({ apiKey, open, onOpenChange }: UsageDialogProps) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && apiKey) {
      setLoading(true);
      setStats(null);
      ApiKeysApi.usage(apiKey.id)
        .then(setStats)
        .catch(() => setStats(null))
        .finally(() => setLoading(false));
    }
  }, [open, apiKey]);

  if (!apiKey) return null;

  const dailyPct = stats?.bucket && apiKey.daily_quota > 0
    ? Math.min(100, Math.round((stats.bucket.daily_used / apiKey.daily_quota) * 100))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Статистика использования</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{apiKey.name}</span>
            {' · '}
            <code className="text-xs">{apiKey.key_prefix}...{apiKey.key_last4}</code>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {!loading && stats && (
          <div className="space-y-4">
            {/* Quota */}
            <Card className="p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="text-sm font-semibold">Дневная квота</h4>
                <span className="text-sm text-muted-foreground">
                  {stats.bucket?.daily_used ?? 0} / {apiKey.daily_quota}
                </span>
              </div>
              <Progress value={dailyPct} className="h-2" />
              {dailyPct > 80 && (
                <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Близко к лимиту
                </p>
              )}
            </Card>

            {/* Token bucket */}
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-2">Токены (rate limit)</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-2xl font-bold">{stats.bucket?.tokens ?? apiKey.rate_limit_rpm}</div>
                  <div className="text-xs text-muted-foreground">доступно сейчас</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{apiKey.rate_limit_rpm}</div>
                  <div className="text-xs text-muted-foreground">capacity (req/min)</div>
                </div>
              </div>
            </Card>

            {/* Endpoint stats */}
            <Card className="p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h4 className="text-sm font-semibold">Endpoints за 7 дней</h4>
                <span className="text-xs text-muted-foreground">
                  Всего запросов: {stats.total_requests_7d}
                </span>
              </div>
              {stats.endpoint_stats_7d.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Нет данных</p>
              ) : (
                <div className="space-y-2">
                  {stats.endpoint_stats_7d
                    .sort((a, b) => b.count - a.count)
                    .map((ep) => (
                      <div key={ep.endpoint} className="flex items-center justify-between text-sm border-b pb-1">
                        <code className="text-xs">{ep.endpoint}</code>
                        <div className="flex items-center gap-3 text-xs">
                          <span>{ep.count} запросов</span>
                          <span className="text-muted-foreground">{ep.avg_latency_ms}ms</span>
                          {ep.errors > 0 && (
                            <span className="text-red-600">{ep.errors} ошибок</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </Card>

            {/* Recent requests */}
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-3">Последние запросы</h4>
              {stats.recent_requests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Запросов ещё не было</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {stats.recent_requests.slice(0, 50).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            r.status_code < 300
                              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                              : r.status_code < 400
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950'
                              : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {r.status_code}
                        </span>
                        <code className="text-[11px]">{r.endpoint}</code>
                        {r.error_code && <span className="text-red-600 text-[10px]">{r.error_code}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-[10px]">
                        {r.latency_ms !== null && <span>{r.latency_ms}ms</span>}
                        <span>{formatRelativeTime(r.ts)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {!loading && !stats && (
          <p className="text-sm text-muted-foreground py-8 text-center">Не удалось загрузить статистику</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
