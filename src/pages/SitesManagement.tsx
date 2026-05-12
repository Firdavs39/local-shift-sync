import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, MapPin, Plus, Trash2, Navigation, RefreshCw, Users, X, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { getDistance, getCurrentPositionAccurate } from '@/lib/geo';
import { supabase } from '@/integrations/supabase/client';
import tzLookup from 'tz-lookup';

// Resolve IANA timezone from (lat, lon). Falls back to browser timezone if
// lookup fails (e.g. coords in the open ocean or out of range).
function resolveTimezone(lat: number, lon: number): { tz: string; auto: boolean } {
  try {
    return { tz: tzLookup(lat, lon), auto: true };
  } catch {
    const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return { tz: fallback, auto: false };
  }
}

interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius_m: number;
  expected_start: string;
  expected_end: string;
  timezone: string;
  active: boolean;
  created_at: string;
}

interface WorkerOption {
  id: string;
  full_name: string;
}

interface Assignment {
  id: string;
  user_id: string;
  site_id: string;
  expected_start: string | null;
  expected_end: string | null;
  // joined
  worker_name?: string;
}

const SitesManagement = () => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    lat: '',
    lon: '',
    radiusM: '100',
    expectedStart: '09:00',
    expectedEnd: '18:00',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  // True while tz was last set by auto-detection from lat/lon. Becomes false
  // if the admin overrides the field manually. Stays true so we can show
  // "автоопределено" badge in the form.
  const [tzAuto, setTzAuto] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // Auto-detect timezone whenever the lat/lon pair changes to a valid value.
  // Only updates tz if the admin hasn't overridden it manually in this session.
  useEffect(() => {
    const lat = parseFloat(formData.lat);
    const lon = parseFloat(formData.lon);
    if (isNaN(lat) || isNaN(lon)) return;
    const resolved = resolveTimezone(lat, lon);
    setFormData(prev => ({ ...prev, tz: resolved.tz }));
    setTzAuto(resolved.auto);
    // Intentionally depend only on lat/lon — we DO want to overwrite a previous
    // auto-detected tz when the coords change. Manual override is preserved
    // through the onChange handler on the tz input (which sets tzAuto=false).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.lat, formData.lon]);

  // Per-site assignments + workers list for the "manage workers" dialog.
  const [assignmentsBySite, setAssignmentsBySite] = useState<Record<string, Assignment[]>>({});
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [assignDialogSite, setAssignDialogSite] = useState<Site | null>(null);
  const [newAssignment, setNewAssignment] = useState({
    userId: '',
    expectedStart: '',
    expectedEnd: '',
  });

  // Helper: request geolocation with multi-sample accuracy and typed error reason
  const requestGeolocation = async (silent = false): Promise<{ lat: number; lon: number; accuracy?: number } | null> => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGeoError('Браузер не поддерживает геолокацию');
      if (!silent) toast.error('Браузер не поддерживает геолокацию');
      return null;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setGeoError('Геолокация работает только по HTTPS. Открой сайт через https://… или localhost');
      if (!silent) toast.error('Геолокация работает только по HTTPS');
      return null;
    }
    setGeoLoading(true);
    try {
      const pos = await getCurrentPositionAccurate({
        targetAccuracyM: 20,   // for setting site coords we want it tight
        maxSamples: 4,
        timeoutMs: 15000,
      });
      const loc = { lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy };
      setUserLocation(loc);
      setGeoError(null);
      setGeoLoading(false);
      if (!silent && pos.accuracy > 50) {
        toast.warning(`GPS точность ±${Math.round(pos.accuracy)}м — для точного определения координат объекта выйди на улицу.`);
      }
      return loc;
    } catch (error: any) {
      setGeoLoading(false);
      const code = error?.code;
      let msg = 'Геолокация недоступна';
      if (code === 1 || /denied/i.test(error?.message ?? '')) {
        msg = 'Доступ к геолокации запрещён. Разреши в настройках браузера (значок замка в адресной строке → Местоположение → Разрешить).';
      } else if (code === 2) {
        msg = 'Не удалось определить координаты. Проверь GPS/Wi-Fi или попробуй на улице.';
      } else if (code === 3) {
        msg = 'Превышено время ожидания GPS. Попробуй ещё раз.';
      } else if (error?.message) {
        msg = error.message;
      }
      setGeoError(msg);
      if (!silent) toast.error(msg);
      console.error('Geolocation error:', code, error?.message);
      return null;
    }
  };

  useEffect(() => {
    loadSites();
    requestGeolocation(true); // silent on mount — show error only when user clicks the button

    // Auto-refresh on window focus
    const handleFocus = () => {
      loadSites();
    };

    window.addEventListener('focus', handleFocus);

    // Set up real-time subscription for sites
    const channel = supabase
      .channel('sites-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sites',
        },
        () => {
          loadSites();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, []);

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading sites:', error);
      toast.error('Ошибка загрузки объектов');
      return;
    }

    setSites(data || []);
    // After loading sites, refresh the per-site assignment map too.
    loadAssignments();
  };

  const loadAssignments = async () => {
    const { data, error } = await supabase
      .from('worker_site_assignments')
      .select('id, user_id, site_id, expected_start, expected_end');
    if (error) {
      console.error('Error loading assignments:', error);
      return;
    }
    const rows = (data as unknown as Assignment[]) || [];
    // Pull worker names in a single batch so the UI can render them.
    const userIds = Array.from(new Set(rows.map(r => r.user_id)));
    let nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      nameMap = new Map((profs || []).map(p => [p.id, p.full_name]));
    }
    const grouped: Record<string, Assignment[]> = {};
    for (const a of rows) {
      const enriched: Assignment = { ...a, worker_name: nameMap.get(a.user_id) ?? '—' };
      if (!grouped[a.site_id]) grouped[a.site_id] = [];
      grouped[a.site_id].push(enriched);
    }
    setAssignmentsBySite(grouped);
  };

  const loadWorkers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, active')
      .eq('active', true)
      .order('full_name');
    setWorkers(((data as unknown) as WorkerOption[]) || []);
  };

  const openAssignDialog = (site: Site) => {
    setAssignDialogSite(site);
    setNewAssignment({
      userId: '',
      expectedStart: site.expected_start,
      expectedEnd: site.expected_end,
    });
    if (workers.length === 0) loadWorkers();
  };

  const closeAssignDialog = () => {
    setAssignDialogSite(null);
    setNewAssignment({ userId: '', expectedStart: '', expectedEnd: '' });
  };

  const handleAddAssignment = async () => {
    if (!assignDialogSite) return;
    if (!newAssignment.userId) {
      toast.error('Выберите сотрудника');
      return;
    }
    // Empty inputs map to NULL → site defaults are used.
    const expectedStart = newAssignment.expectedStart || null;
    const expectedEnd = newAssignment.expectedEnd || null;

    const { data: companyId, error: companyErr } = await supabase.rpc('get_my_company_id');
    if (companyErr || !companyId) {
      toast.error('Не удалось определить компанию');
      return;
    }

    const { error } = await supabase
      .from('worker_site_assignments')
      .insert({
        company_id: companyId,
        user_id: newAssignment.userId,
        site_id: assignDialogSite.id,
        expected_start: expectedStart,
        expected_end: expectedEnd,
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('Этот сотрудник уже назначен. Измените существующее назначение.');
      } else {
        console.error('Error adding assignment:', error);
        toast.error('Ошибка добавления назначения');
      }
      return;
    }

    toast.success('Сотрудник назначен');
    setNewAssignment({
      userId: '',
      expectedStart: assignDialogSite.expected_start,
      expectedEnd: assignDialogSite.expected_end,
    });
    loadAssignments();
  };

  const handleUpdateAssignment = async (assignmentId: string, expectedStart: string | null, expectedEnd: string | null) => {
    const { error } = await supabase
      .from('worker_site_assignments')
      .update({ expected_start: expectedStart, expected_end: expectedEnd })
      .eq('id', assignmentId);
    if (error) {
      console.error('Error updating assignment:', error);
      toast.error('Ошибка обновления');
      return;
    }
    toast.success('Назначение обновлено');
    loadAssignments();
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    const { error } = await supabase
      .from('worker_site_assignments')
      .delete()
      .eq('id', assignmentId);
    if (error) {
      console.error('Error deleting assignment:', error);
      toast.error('Ошибка удаления назначения');
      return;
    }
    toast.success('Назначение удалено');
    loadAssignments();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const lat = parseFloat(formData.lat);
    const lon = parseFloat(formData.lon);
    const radiusM = parseInt(formData.radiusM);

    if (isNaN(lat) || isNaN(lon) || isNaN(radiusM)) {
      toast.error('Неверные координаты или радиус');
      return;
    }

    const { data: companyId, error: companyErr } = await supabase.rpc('get_my_company_id');
    if (companyErr || !companyId) {
      toast.error('Не удалось определить компанию');
      return;
    }

    const { error } = await supabase
      .from('sites')
      .insert({
        name: formData.name,
        lat,
        lon,
        radius_m: radiusM,
        expected_start: formData.expectedStart,
        expected_end: formData.expectedEnd,
        timezone: formData.tz,
        active: true,
        company_id: companyId,
      });

    if (error) {
      console.error('Error adding site:', error);
      toast.error('Ошибка добавления объекта');
      return;
    }

    toast.success('Объект добавлен');
    setShowForm(false);
    setFormData({
      name: '',
      lat: '',
      lon: '',
      radiusM: '100',
      expectedStart: '09:00',
      expectedEnd: '18:00',
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    setTzAuto(false);
    loadSites();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('sites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting site:', error);
      toast.error('Ошибка удаления объекта');
      return;
    }

    toast.success('Объект удалён');
    loadSites();
  };

  const handleUseCurrentLocation = async () => {
    // Try cached location first; if none, request fresh
    let loc = userLocation;
    if (!loc) {
      loc = await requestGeolocation(false);
    }
    if (loc) {
      setFormData({
        ...formData,
        lat: loc.lat.toFixed(6),
        lon: loc.lon.toFixed(6)
      });
      toast.success('Координаты установлены');
    }
    // If null — error toast already shown by requestGeolocation
  };

  const getDistanceToSite = (site: Site) => {
    if (!userLocation) return null;
    const distance = getDistance(
      userLocation.lat,
      userLocation.lon,
      site.lat,
      site.lon
    );
    return Math.round(distance);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold">Управление объектами</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={loadSites}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {userLocation && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-primary" />
                <span className="font-medium">Ваша геолокация:</span>
                <span className="text-muted-foreground">
                  {userLocation.lat.toFixed(6)}, {userLocation.lon.toFixed(6)}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => requestGeolocation(false)} disabled={geoLoading}>
                <RefreshCw className={`w-3 h-3 mr-1 ${geoLoading ? 'animate-spin' : ''}`} />
                Обновить
              </Button>
            </div>
          </Card>
        )}

        {!userLocation && geoError && (
          <Card className="p-4 bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900">
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <Navigation className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-orange-900 dark:text-orange-200">Геолокация недоступна</div>
                  <div className="text-orange-800 dark:text-orange-300 text-xs mt-1">{geoError}</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => requestGeolocation(false)} disabled={geoLoading}>
                {geoLoading ? (
                  <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Запрашиваю…</>
                ) : (
                  <><Navigation className="w-3 h-3 mr-1" />Попробовать снова</>
                )}
              </Button>
            </div>
          </Card>
        )}

        {showForm && (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Название объекта</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Широта</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Долгота</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={formData.lon}
                    onChange={(e) => setFormData({ ...formData, lon: e.target.value })}
                    required
                  />
                </div>
              </div>

              <Button type="button" variant="outline" onClick={handleUseCurrentLocation} className="w-full">
                <Navigation className="w-4 h-4 mr-2" />
                Использовать текущую геолокацию
              </Button>

              <div>
                <Label>Радиус (метры)</Label>
                <Input
                  type="number"
                  value={formData.radiusM}
                  onChange={(e) => setFormData({ ...formData, radiusM: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Начало смены</Label>
                  <Input
                    type="time"
                    value={formData.expectedStart}
                    onChange={(e) => setFormData({ ...formData, expectedStart: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Конец смены</Label>
                  <Input
                    type="time"
                    value={formData.expectedEnd}
                    onChange={(e) => setFormData({ ...formData, expectedEnd: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  Часовой пояс объекта
                  {tzAuto && (
                    <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                      автоопределён
                    </span>
                  )}
                </Label>
                <Input
                  value={formData.tz}
                  onChange={(e) => {
                    setFormData({ ...formData, tz: e.target.value });
                    setTzAuto(false);
                  }}
                  placeholder="Asia/Tashkent"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Определяется автоматически из координат. По нему считаются опоздания,
                  ранний приход и время окончания смены. Меняйте только если автоопределение
                  ошиблось.
                </p>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">Сохранить</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-4">
          {sites.map((site) => {
            const distance = getDistanceToSite(site);
            const isNearby = distance !== null && distance <= site.radius_m;

            const siteAssignments = assignmentsBySite[site.id] || [];
            return (
              <Card key={site.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin className={`w-5 h-5 ${isNearby ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <h3 className="text-lg font-semibold">{site.name}</h3>
                      {distance !== null && (
                        <span className={`text-sm px-2 py-1 rounded ${isNearby ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                          {distance}м {isNearby && '✓'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>📍 {site.lat.toFixed(6)}, {site.lon.toFixed(6)}</p>
                      <p>⭕ Радиус: {site.radius_m}м</p>
                      <p>🕒 По умолчанию: {site.expected_start} - {site.expected_end}</p>
                      <p>🌍 {site.timezone}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(site.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Workers assigned to this site (with their individual schedules). */}
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="w-4 h-4 text-primary" />
                      Сотрудники: {siteAssignments.length}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openAssignDialog(site)}>
                      <Plus className="w-3 h-3 mr-1" />
                      Управлять
                    </Button>
                  </div>
                  {siteAssignments.length > 0 ? (
                    <div className="space-y-1 text-xs">
                      {siteAssignments.slice(0, 5).map((a) => {
                        const start = a.expected_start ?? site.expected_start;
                        const end = a.expected_end ?? site.expected_end;
                        const isDefault = !a.expected_start && !a.expected_end;
                        return (
                          <div key={a.id} className="flex items-center justify-between gap-2">
                            <span className="font-medium">{a.worker_name}</span>
                            <span className={isDefault ? 'text-muted-foreground' : ''}>
                              {start}–{end}{isDefault && ' (по умолчанию)'}
                            </span>
                          </div>
                        );
                      })}
                      {siteAssignments.length > 5 && (
                        <div className="text-muted-foreground">…и ещё {siteAssignments.length - 5}</div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Пока никто не назначен. Все активные сотрудники видят этот объект.
                    </p>
                  )}
                </div>
              </Card>
            );
          })}

          {sites.length === 0 && !showForm && (
            <Card className="p-12 text-center">
              <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Нет объектов</p>
              <Button onClick={() => setShowForm(true)} className="mt-4">
                Добавить первый объект
              </Button>
            </Card>
          )}
        </div>
      </main>

      {/* Assignment management dialog */}
      <Dialog open={!!assignDialogSite} onOpenChange={(open) => { if (!open) closeAssignDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Сотрудники на «{assignDialogSite?.name}»</DialogTitle>
            <DialogDescription>
              Назначайте сотрудников с индивидуальным графиком. Пустые поля времени = использовать
              время по умолчанию ({assignDialogSite?.expected_start}–{assignDialogSite?.expected_end}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {(assignDialogSite ? assignmentsBySite[assignDialogSite.id] || [] : []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Никто пока не назначен на этот объект.
              </p>
            )}
            {(assignDialogSite ? assignmentsBySite[assignDialogSite.id] || [] : []).map((a) => (
              <div key={a.id} className="flex items-center gap-2 p-3 rounded-md border">
                <div className="flex-1 text-sm font-medium">{a.worker_name}</div>
                <Input
                  type="time"
                  value={a.expected_start ?? ''}
                  placeholder={assignDialogSite?.expected_start}
                  className="w-28"
                  onBlur={(e) => {
                    const v = e.target.value || null;
                    if (v !== (a.expected_start ?? null)) {
                      handleUpdateAssignment(a.id, v, a.expected_end);
                    }
                  }}
                />
                <Input
                  type="time"
                  value={a.expected_end ?? ''}
                  placeholder={assignDialogSite?.expected_end}
                  className="w-28"
                  onBlur={(e) => {
                    const v = e.target.value || null;
                    if (v !== (a.expected_end ?? null)) {
                      handleUpdateAssignment(a.id, a.expected_start, v);
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteAssignment(a.id)}
                  className="text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t space-y-3">
            <div className="text-sm font-medium">Добавить сотрудника</div>
            <Select
              value={newAssignment.userId}
              onValueChange={(v) => setNewAssignment({ ...newAssignment, userId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {workers
                  .filter(w => {
                    if (!assignDialogSite) return true;
                    const taken = new Set((assignmentsBySite[assignDialogSite.id] || []).map(a => a.user_id));
                    return !taken.has(w.id);
                  })
                  .map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Начало</Label>
                <Input
                  type="time"
                  value={newAssignment.expectedStart}
                  onChange={(e) => setNewAssignment({ ...newAssignment, expectedStart: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Конец</Label>
                <Input
                  type="time"
                  value={newAssignment.expectedEnd}
                  onChange={(e) => setNewAssignment({ ...newAssignment, expectedEnd: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAssignDialog}>Закрыть</Button>
            <Button onClick={handleAddAssignment} disabled={!newAssignment.userId}>
              <Plus className="w-4 h-4 mr-1" />
              Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SitesManagement;
