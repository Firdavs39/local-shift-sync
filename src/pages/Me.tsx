import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCurrentUser, logout } from '@/lib/supabase-auth';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentPosition, getCurrentPositionAccurate, evaluateRadius, getDistance, type RadiusEvaluation } from '@/lib/geo';
import { getShiftStatus, formatTime, formatDate, calculateMinutesWorked, getMinutesLate, isAfterExpected } from '@/lib/time';
import { computeDayStats, type ShiftForStats } from '@/lib/discipline';
import { pickEffectiveTimes, type AssignmentOverride } from '@/lib/expected-times';
import { Clock, MapPin, LogOut, Play, Square, Smartphone, History, Pause, PlayCircle, CheckCircle2, XCircle, AlertCircle, Trophy, TrendingDown, TrendingUp, Footprints, Repeat } from 'lucide-react';
import { toast } from 'sonner';

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
}

interface Shift {
  id: string;
  user_id: string;
  site_id: string;
  started_at: string;
  ended_at?: string;
  start_lat: number;
  start_lon: number;
  end_lat?: number;
  end_lon?: number;
  status: 'early' | 'on_time' | 'late' | 'offsite';
  minutes_late: number;
  minutes_worked?: number;
  is_paused?: boolean;
  paused_at?: string;
  total_paused_minutes?: number;
  pause_history?: any;
  auto_ended?: boolean;
  is_overtime?: boolean;
}

const Me = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sites, setSites] = useState<Site[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [accuracyCapM, setAccuracyCapM] = useState<number>(60);
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [isFirstOfDay, setIsFirstOfDay] = useState<boolean>(false);
  /** site_id → assignment override (if any). Missing key = use site defaults. */
  const [myAssignments, setMyAssignments] = useState<Record<string, AssignmentOverride>>({});

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.role !== 'worker') {
        navigate('/auth');
        return;
      }
      setUser(currentUser);
    };

    checkAuth();

    // Update time every minute
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [navigate]);

  // Load TODAY's shifts (all of them, for the bucketed "today" stats block).
  // Lateness/early/absence accumulate across restarts → we need every row.
  const refreshTodayShifts = async () => {
    if (!user) return;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user.id)
      .gte('started_at', startOfToday.toISOString())
      .order('started_at', { ascending: true });
    setTodayShifts((data as Shift[]) || []);
  };

  // RPC: is the current user the first shift-starter in their company today?
  const refreshIsFirstOfDay = async () => {
    if (!user) return;
    const { data } = await supabase.rpc('am_i_first_today');
    setIsFirstOfDay(Boolean(data));
  };

  useEffect(() => {
    if (!user) return;

    // Load sites visible to this worker:
    //   - If they have ANY assignment → only show sites they're assigned to.
    //   - If they have NO assignments → show all active sites (soft rollout,
    //     mirrors the pre-assignments behaviour so existing workers keep
    //     working until an admin sets up their schedule).
    const loadSites = async () => {
      const { data: assignmentRows } = await supabase
        .from('worker_site_assignments')
        .select('site_id')
        .eq('user_id', user.id);
      const assignedSiteIds = ((assignmentRows as unknown) as Array<{ site_id: string }> | null)?.map(r => r.site_id) ?? [];

      let query = supabase.from('sites').select('*').eq('active', true);
      if (assignedSiteIds.length > 0) {
        query = query.in('id', assignedSiteIds);
      }
      const { data, error } = await query;

      if (error) {
        console.error('Error loading sites:', error);
        toast.error('Ошибка загрузки объектов');
      } else {
        setSites(data || []);
      }
    };

    // Load company-level accuracy cap (used to tune evaluateRadius).
    // Worker can SELECT from settings via RLS in their own company.
    const loadAccuracyCap = async () => {
      const { data } = await supabase
        .from('settings')
        .select('accuracy_cap_m')
        .limit(1)
        .maybeSingle();
      if (data && typeof (data as { accuracy_cap_m?: number }).accuracy_cap_m === 'number') {
        setAccuracyCapM((data as { accuracy_cap_m: number }).accuracy_cap_m);
      }
    };
    loadAccuracyCap();

    // Load this worker's per-site schedule overrides. NULL fields mean
    // "use site default" — pickEffectiveTimes() handles the fallback.
    const loadMyAssignments = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('worker_site_assignments')
        .select('site_id, expected_start, expected_end')
        .eq('user_id', user.id);
      if (error) {
        console.error('Error loading assignments:', error);
        return;
      }
      const map: Record<string, AssignmentOverride> = {};
      for (const row of (data as unknown as Array<{ site_id: string; expected_start: string | null; expected_end: string | null }>) || []) {
        map[row.site_id] = { expected_start: row.expected_start, expected_end: row.expected_end };
      }
      setMyAssignments(map);
    };
    loadMyAssignments();

    // Load active shift
    const loadActiveShift = async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error loading shift:', error);
      } else if (data && data.length > 0) {
        setActiveShift(data[0]);
      }
    };

    const loadTodayShifts = refreshTodayShifts;
    const loadIsFirstOfDay = refreshIsFirstOfDay;

    // Get current location with multi-sample accuracy improvement
    getCurrentPositionAccurate({ targetAccuracyM: 50, maxSamples: 3, timeoutMs: 12000 })
      .then(pos => {
        setUserLocation({ lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy });
        setGpsAccuracy(pos.accuracy);
        setLocationDenied(false);
      })
      .catch((error: any) => {
        console.error('Error getting location:', error);
        if (error?.code === 1 || /denied/i.test(error?.message ?? '')) {
          setLocationDenied(true);
        }
      });

    loadSites();
    loadActiveShift();
    loadTodayShifts();
    loadIsFirstOfDay();

    // Set up real-time subscription for shifts
    const channel = supabase
      .channel('shifts-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shifts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updatedShift = payload.new as Shift;

          // Show notification if shift was auto-ended
          if (updatedShift.auto_ended && updatedShift.ended_at) {
            const minutesWorked = updatedShift.minutes_worked || 0;
            toast.success('✅ Смена завершена автоматически', {
              description: `Отработано: ${Math.floor(minutesWorked / 60)}ч ${minutesWorked % 60}м`,
              duration: 10000,
            });
          }

          loadActiveShift();
          loadTodayShifts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Helper: get reason of the last (open) pause entry — 'manual' | 'auto' | null
  const getCurrentPauseReason = (shift: Shift | null): 'manual' | 'auto' | null => {
    if (!shift?.is_paused) return null;
    const history = Array.isArray(shift.pause_history) ? shift.pause_history : [];
    const last = history[history.length - 1];
    if (!last || last.resumed_at) return null;
    // Legacy entries (before this feature) didn't have `reason` → treat as 'auto'
    return last.reason === 'manual' ? 'manual' : 'auto';
  };

  // Monitor location during active shift — only handles AUTO pause/resume.
  // Manual pauses are not affected by location.
  useEffect(() => {
    if (!activeShift || activeShift.ended_at) return;

    const monitorLocation = async () => {
      try {
        // Take up to 2 samples (5-7s) to avoid acting on a single bad fix
        const pos = await getCurrentPositionAccurate({ targetAccuracyM: 30, maxSamples: 2, timeoutMs: 7000 });
        setUserLocation({ lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy });
        setGpsAccuracy(pos.accuracy);

        // Find the site for this shift
        const site = sites.find(s => s.id === activeShift.site_id);
        if (!site) return;

        // Don't act on garbage GPS — cell-only fixes can be ±500m
        if (pos.accuracy > 150) {
          console.log('[monitor] skipping action: GPS accuracy too poor:', pos.accuracy);
          return;
        }

        const evaluation = evaluateRadius(pos.lat, pos.lon, site.lat, site.lon, site.radius_m, pos.accuracy, accuracyCapM);
        const pauseReason = getCurrentPauseReason(activeShift);

        // 'uncertain' = sitting on the radius edge → don't toggle pause state (anti-flicker)
        if (evaluation.verdict === 'uncertain') {
          console.log('[monitor] verdict=uncertain, no action', evaluation);
          return;
        }

        // Case 1: definitely outside AND not paused → auto-pause
        if (evaluation.verdict === 'outside' && !activeShift.is_paused) {
          const now = new Date().toISOString();
          const pauseHistory = Array.isArray(activeShift.pause_history) ? activeShift.pause_history : [];

          const { error } = await supabase
            .from('shifts')
            .update({
              is_paused: true,
              paused_at: now,
              pause_history: [...pauseHistory, { paused_at: now, reason: 'auto' }],
            })
            .eq('id', activeShift.id);

          if (!error) {
            toast.warning('⚠️ Вы вышли из зоны объекта. Смена приостановлена автоматически.', {
              duration: 6000,
            });
          }
          return;
        }

        // Case 2: definitely inside radius AND currently on AUTO pause → auto-resume
        // (manual pauses are NOT auto-resumed — user must press the button)
        if (evaluation.verdict === 'inside' && activeShift.is_paused && pauseReason === 'auto') {
          const pauseHistory = Array.isArray(activeShift.pause_history) ? activeShift.pause_history : [];
          const lastPause = pauseHistory[pauseHistory.length - 1];

          if (lastPause && !lastPause.resumed_at) {
            const now = new Date();
            const pausedAt = new Date(activeShift.paused_at!);
            const pausedMinutes = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 60000));
            lastPause.resumed_at = now.toISOString();
            lastPause.duration_minutes = pausedMinutes;

            const { error } = await supabase
              .from('shifts')
              .update({
                is_paused: false,
                paused_at: null,
                total_paused_minutes: (activeShift.total_paused_minutes || 0) + pausedMinutes,
                pause_history: pauseHistory,
              })
              .eq('id', activeShift.id);

            if (!error) {
              toast.success('✅ Вы вернулись в зону объекта. Смена автоматически возобновлена.', {
                duration: 6000,
              });
            }
          }
        }
      } catch (error) {
        console.error('Error monitoring location:', error);
      }
    };

    // Check location every 30 seconds
    const interval = setInterval(monitorLocation, 30000);
    // Initial check
    monitorLocation();

    return () => clearInterval(interval);
  }, [activeShift, sites, accuracyCapM]);

  // Manual pause: user presses "Пауза"
  const handlePauseShift = async () => {
    if (!activeShift || activeShift.is_paused) return;
    const now = new Date().toISOString();
    const pauseHistory = Array.isArray(activeShift.pause_history) ? activeShift.pause_history : [];

    const { error } = await supabase
      .from('shifts')
      .update({
        is_paused: true,
        paused_at: now,
        pause_history: [...pauseHistory, { paused_at: now, reason: 'manual' }],
      })
      .eq('id', activeShift.id);

    if (error) {
      toast.error('Не удалось поставить на паузу');
      console.error(error);
    } else {
      toast.info('⏸ Смена на паузе');
    }
  };

  // Manual resume: user presses "Возобновить" (only valid for manual pauses)
  const handleResumeShift = async () => {
    if (!activeShift || !activeShift.is_paused) return;
    const pauseReason = getCurrentPauseReason(activeShift);
    if (pauseReason !== 'manual') {
      toast.error('Смена на автопаузе. Вернитесь в радиус объекта — она возобновится сама.');
      return;
    }

    const pauseHistory = Array.isArray(activeShift.pause_history) ? [...activeShift.pause_history] : [];
    const lastIndex = pauseHistory.length - 1;
    if (lastIndex < 0) return;
    const lastPause = { ...pauseHistory[lastIndex] };

    const now = new Date();
    const pausedAt = new Date(activeShift.paused_at!);
    const pausedMinutes = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 60000));
    lastPause.resumed_at = now.toISOString();
    lastPause.duration_minutes = pausedMinutes;
    pauseHistory[lastIndex] = lastPause;

    const { error } = await supabase
      .from('shifts')
      .update({
        is_paused: false,
        paused_at: null,
        total_paused_minutes: (activeShift.total_paused_minutes || 0) + pausedMinutes,
        pause_history: pauseHistory,
      })
      .eq('id', activeShift.id);

    if (error) {
      toast.error('Не удалось возобновить смену');
      console.error(error);
    } else {
      toast.success(`▶️ Смена возобновлена. Пауза длилась ${pausedMinutes} мин`);
    }
  };

  const toggleWakeLock = async () => {
    try {
      if (!wakeLockEnabled && 'wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
        setWakeLockEnabled(true);
        toast.success('Экран не будет гаснуть во время смены');
      } else if (wakeLock) {
        await wakeLock.release();
        setWakeLock(null);
        setWakeLockEnabled(false);
        toast.info('WakeLock отключен');
      }
    } catch (error) {
      toast.error('Не удалось активировать WakeLock');
    }
  };

  const handleStartShift = async () => {
    if (!selectedSite) {
      toast.error('Выберите объект для начала смены');
      return;
    }

    try {
      // Check if user has any active shift
      const { data: activeShifts } = await supabase
        .from('shifts')
        .select('id, site_id')
        .eq('user_id', user.id)
        .is('ended_at', null)
        .limit(1);

      if (activeShifts && activeShifts.length > 0) {
        toast.error('Завершите текущую смену перед началом новой!');
        return;
      }

      // Take 3 GPS samples for an accurate fix before committing
      const pos = await getCurrentPositionAccurate({ targetAccuracyM: 30, maxSamples: 3, timeoutMs: 12000 });
      const { lat: latitude, lon: longitude, accuracy } = pos;
      setUserLocation({ lat: latitude, lon: longitude, accuracy });
      setGpsAccuracy(accuracy);

      // Refuse to start with poor GPS — too risky for shift accounting
      if (accuracy > 100) {
        toast.error(`Слишком плохой GPS-сигнал (±${Math.round(accuracy)}м). Выйди на улицу или подожди и попробуй снова.`);
        return;
      }

      // Accuracy-aware radius check — refuses if we're not definitely inside
      const evaluation = evaluateRadius(latitude, longitude, selectedSite.lat, selectedSite.lon, selectedSite.radius_m, accuracy, accuracyCapM);

      if (evaluation.verdict === 'outside') {
        toast.error(`Вы вне радиуса объекта. Расстояние: ${Math.round(evaluation.distance)}м (допустимо: ${selectedSite.radius_m}м, погрешность GPS ±${Math.round(accuracy)}м)`);
        return;
      }

      if (evaluation.verdict === 'uncertain') {
        toast.error(`Граница радиуса. Подойди ближе к центру объекта (расстояние ${Math.round(evaluation.distance)}м, погрешность GPS ±${Math.round(accuracy)}м, радиус ${selectedSite.radius_m}м).`);
        return;
      }

      const now = new Date();
      const siteTz = selectedSite.timezone || 'UTC';

      // Resolve EFFECTIVE expected times: assignment override → site default.
      const effective = pickEffectiveTimes(
        myAssignments[selectedSite.id],
        { expected_start: selectedSite.expected_start, expected_end: selectedSite.expected_end, timezone: siteTz },
      );

      // Compare against expected_end in the SITE's timezone (not the browser's),
      // so a worker in a different tz than the site gets the same verdict as
      // the server-side auto-end-shifts function.
      const isAfterExpectedEnd = isAfterExpected(now, effective.end, siteTz);

      let status: 'early' | 'on_time' | 'late' | 'offsite';
      let minutesLate = 0;
      let isOvertime = false;

      if (isAfterExpectedEnd) {
        // After expected_end - this is overtime
        isOvertime = true;
        status = 'on_time';
        minutesLate = 0;

        toast.info('⚡ Начата сверхурочная смена (переработка)', {
          description: `Смена начата после ${effective.end}`,
        });
      } else {
        // Within working hours — always score against expected_start, even on
        // the 2nd/3rd shift of the day. Discipline metrics must not reset just
        // because the worker stopped and restarted.
        status = getShiftStatus(now, effective.start, true, siteTz);
        minutesLate = status === 'late' ? getMinutesLate(now, effective.start, siteTz) : 0;
      }

      const { data, error } = await supabase
        .from('shifts')
        .insert({
          user_id: user.id,
          site_id: selectedSite.id,
          started_at: now.toISOString(),
          start_lat: latitude,
          start_lon: longitude,
          status,
          minutes_late: minutesLate,
          is_overtime: isOvertime,
          auto_ended: false,
          company_id: user.company_id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Ошибка начала смены');
        console.error(error);
      } else {
        setActiveShift(data);
        setSelectedSite(null);
        toast.success(`Смена начата на объекте "${selectedSite.name}"${isOvertime ? ' (переработка)' : ''}`);
        refreshTodayShifts();
        refreshIsFirstOfDay();
      }
    } catch (error) {
      toast.error('Не удалось получить геолокацию');
      console.error(error);
    }
  };

  const handleEndShift = async () => {
    if (!activeShift) return;

    try {
      const pos = await getCurrentPositionAccurate({ targetAccuracyM: 30, maxSamples: 3, timeoutMs: 12000 });
      const { lat: latitude, lon: longitude, accuracy } = pos;
      setGpsAccuracy(accuracy);

      // Find the site for this shift
      const site = sites.find(s => s.id === activeShift.site_id);
      if (!site) {
        toast.error('Объект не найден');
        return;
      }

      if (accuracy > 100) {
        toast.error(`Слишком плохой GPS-сигнал (±${Math.round(accuracy)}м). Подожди немного и попробуй снова.`);
        return;
      }

      // Accuracy-aware check
      const evaluation = evaluateRadius(latitude, longitude, site.lat, site.lon, site.radius_m, accuracy, accuracyCapM);

      if (evaluation.verdict === 'outside') {
        toast.error(`Нельзя завершить смену вне радиуса объекта. Расстояние: ${Math.round(evaluation.distance)}м (допустимо: ${site.radius_m}м)`);
        return;
      }

      if (evaluation.verdict === 'uncertain') {
        toast.error(`Граница радиуса. Подойди ближе к объекту чтобы завершить смену (расстояние ${Math.round(evaluation.distance)}м, GPS ±${Math.round(accuracy)}м).`);
        return;
      }

      const now = new Date();

      // Calculate total minutes worked excluding paused time
      const totalMinutes = calculateMinutesWorked(new Date(activeShift.started_at), now);
      const pausedMinutes = activeShift.total_paused_minutes || 0;
      const minutesWorked = totalMinutes - pausedMinutes;

      const { error } = await supabase
        .from('shifts')
        .update({
          ended_at: now.toISOString(),
          end_lat: latitude,
          end_lon: longitude,
          minutes_worked: minutesWorked,
          is_paused: false,
          paused_at: null,
        })
        .eq('id', activeShift.id);

      if (error) {
        toast.error('Ошибка завершения смены');
        console.error(error);
      } else {
        setActiveShift(null);
        toast.success(`Смена завершена. Отработано: ${Math.floor(minutesWorked / 60)}ч ${minutesWorked % 60}м`);
        refreshTodayShifts();
      }
    } catch (error) {
      toast.error('Не удалось получить геолокацию');
      console.error(error);
    }
  };

  const handleLogout = async () => {
    if (wakeLock) {
      wakeLock.release();
    }
    await logout();
    navigate('/auth');
  };

  const getSiteDistance = (site: Site) => {
    if (!userLocation) return null;
    const distance = getDistance(userLocation.lat, userLocation.lon, site.lat, site.lon);
    return Math.round(distance);
  };

  // Verdict for a site given the worker's last known position. Returns null
  // until GPS gives us something to evaluate. Used both for the big radius
  // banner and for the mini coloured dots in the site list.
  const evaluateSiteForUser = (site: Site): RadiusEvaluation | null => {
    if (!userLocation) return null;
    return evaluateRadius(
      userLocation.lat,
      userLocation.lon,
      site.lat,
      site.lon,
      site.radius_m,
      userLocation.accuracy ?? 0,
      accuracyCapM,
    );
  };

  // The site whose radius status we want to surface front-and-center:
  // the active shift's site if any, otherwise the one the worker is selecting.
  const focusedSite: Site | null =
    (activeShift ? sites.find(s => s.id === activeShift.site_id) ?? null : null) || selectedSite;
  const focusedEvaluation = focusedSite ? evaluateSiteForUser(focusedSite) : null;

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10 backdrop-blur-sm bg-card/80">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
              {user.full_name[0]}
            </div>
            <div>
              <h1 className="font-semibold">{user.full_name}</h1>
              <p className="text-xs text-muted-foreground">Сотрудник</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Geolocation denied warning */}
        {locationDenied && (
          <Card className="p-4 border-destructive bg-destructive/5">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive text-sm">Геолокация отключена</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Для начала смены разрешите доступ к геолокации в настройках браузера и обновите страницу.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Current Time */}
        <Card className="p-6 text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-primary" />
          <div className="text-4xl font-bold mb-2">{formatTime(currentTime)}</div>
          <div className="text-muted-foreground">{formatDate(currentTime)}</div>
          {gpsAccuracy !== null && (
            <div className="mt-3 text-xs flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3" />
              <span className={
                gpsAccuracy <= 30 ? 'text-green-600 dark:text-green-400' :
                gpsAccuracy <= 100 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-orange-600 dark:text-orange-400'
              }>
                GPS точность ±{Math.round(gpsAccuracy)}м
                {gpsAccuracy > 100 && ' — выйди на улицу для точного замера'}
              </span>
            </div>
          )}
        </Card>

        {/* Big radius status banner — only when we have a focused site + GPS */}
        {focusedSite && focusedEvaluation && (() => {
          const distM = Math.round(focusedEvaluation.distance);
          const accM = Math.round(focusedEvaluation.accuracy);
          if (focusedEvaluation.verdict === 'inside') {
            return (
              <Card className="p-4 border-2 border-green-500 bg-green-500/10">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-green-700 dark:text-green-400">
                      Внутри радиуса — {distM} м
                    </div>
                    <div className="text-xs text-green-700/70 dark:text-green-400/70">
                      Объект «{focusedSite.name}», радиус {focusedSite.radius_m} м
                    </div>
                  </div>
                </div>
              </Card>
            );
          }
          if (focusedEvaluation.verdict === 'outside') {
            return (
              <Card className="p-4 border-2 border-red-500 bg-red-500/10">
                <div className="flex items-center gap-3">
                  <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-red-700 dark:text-red-400">
                      Вне радиуса — {distM} м
                    </div>
                    <div className="text-xs text-red-700/70 dark:text-red-400/70">
                      Объект «{focusedSite.name}», радиус {focusedSite.radius_m} м
                    </div>
                  </div>
                </div>
              </Card>
            );
          }
          return (
            <Card className="p-4 border-2 border-yellow-500 bg-yellow-500/10">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-500 shrink-0" />
                <div>
                  <div className="font-semibold text-yellow-700 dark:text-yellow-500">
                    На границе — {distM} м ±{accM} м
                  </div>
                  <div className="text-xs text-yellow-700/70 dark:text-yellow-500/70">
                    Подойди ближе к центру — GPS на границе радиуса {focusedSite.radius_m} м
                  </div>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* My Shifts Button */}
        <Button
          onClick={() => navigate('/me/shifts')}
          className="w-full"
          variant="outline"
          size="lg"
        >
          <History className="w-5 h-5 mr-2" />
          Мои смены
        </Button>

        {/* "Today" discipline summary — pinned to whichever site the worker is
            currently on (active shift) or last started today. Survives shift
            restarts: lateness anchors to the FIRST start of the day. */}
        {(() => {
          if (todayShifts.length === 0) return null;
          const focusSiteId = activeShift?.site_id || todayShifts[todayShifts.length - 1].site_id;
          const bucket = todayShifts.filter(s => s.site_id === focusSiteId);
          if (bucket.length === 0) return null;
          const site = sites.find(s => s.id === focusSiteId);
          const effective = site
            ? pickEffectiveTimes(
                myAssignments[focusSiteId],
                { expected_start: site.expected_start, expected_end: site.expected_end, timezone: site.timezone },
              )
            : null;
          const stats = computeDayStats(
            bucket.map((s): ShiftForStats => ({
              id: s.id,
              started_at: s.started_at,
              ended_at: s.ended_at ?? null,
              minutes_worked: s.minutes_worked ?? null,
              total_paused_minutes: s.total_paused_minutes ?? null,
              pause_history: (s.pause_history as ShiftForStats['pause_history']) ?? null,
              is_overtime: s.is_overtime ?? null,
              minutes_late: s.minutes_late ?? null,
              status: s.status,
            })),
            effective ? { start: effective.start, timezone: site?.timezone } : null,
          );
          const hasAnything =
            isFirstOfDay ||
            stats.minutesLate > 0 ||
            stats.earlyMinutes > 0 ||
            stats.totalPausedMinutes > 0 ||
            stats.outOfRadiusCount > 0;
          if (!hasAnything) return null;
          return (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Сегодня</h3>
                {site && (
                  <span className="text-xs text-muted-foreground">{site.name}</span>
                )}
              </div>
              {isFirstOfDay && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                  <Trophy className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    🎉 Первый на смене сегодня
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {stats.minutesLate > 0 && (
                  <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <TrendingDown className="w-4 h-4" />
                    <span>Опоздание: <b>{stats.minutesLate} мин</b></span>
                  </div>
                )}
                {stats.earlyMinutes > 0 && (
                  <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                    <TrendingUp className="w-4 h-4" />
                    <span>Раньше на <b>{stats.earlyMinutes} мин</b></span>
                  </div>
                )}
                {stats.totalPausedMinutes > 0 && (
                  <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                    <Footprints className="w-4 h-4" />
                    <span>Отсутствовал: <b>{stats.totalPausedMinutes} мин</b></span>
                  </div>
                )}
                {stats.outOfRadiusCount > 0 && (
                  <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                    <Repeat className="w-4 h-4" />
                    <span>Выходов за радиус: <b>{stats.outOfRadiusCount}</b></span>
                  </div>
                )}
              </div>
            </Card>
          );
        })()}

        {/* Shift Control */}
        {activeShift ? (
          <Card className="p-6 space-y-4 border-2 border-accent">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-3 h-3 rounded-full ${activeShift.is_paused ? 'bg-yellow-500' : 'bg-accent'} animate-pulse`} />
              <h2 className="text-lg font-semibold">{activeShift.is_paused ? 'Смена на паузе' : 'Смена идёт'}</h2>
            </div>

            {activeShift.is_overtime && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 font-medium">
                  ⚡ Сверхурочная работа (переработка)
                </div>
              </div>
            )}
            
            {activeShift.is_paused && (() => {
              const reason = getCurrentPauseReason(activeShift);
              return reason === 'manual' ? (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-600 dark:text-blue-400">
                  ⏸ Смена на ручной паузе. Нажми «Возобновить» чтобы продолжить.
                </div>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-600 dark:text-yellow-500">
                  ⚠️ Автопауза: вы вне радиуса объекта. Время не учитывается. Вернитесь в зону — смена сама возобновится.
                </div>
              );
            })()}
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Начало:</span>
                <span className="font-medium">{formatTime(new Date(activeShift.started_at))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Статус:</span>
                <span className={`font-medium ${
                  activeShift.status === 'on_time' ? 'text-accent' :
                  activeShift.status === 'late' ? 'text-destructive' :
                  activeShift.status === 'early' ? 'text-primary' :
                  'text-muted-foreground'
                }`}>
                  {activeShift.status === 'on_time' ? 'Вовремя' :
                   activeShift.status === 'late' ? `Опоздание ${activeShift.minutes_late} мин` :
                   activeShift.status === 'early' ? 'Раньше времени' :
                   'Вне объекта'}
                </span>
              </div>
              {activeShift.total_paused_minutes > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Время на паузе:</span>
                  <span className="font-medium text-yellow-600">{activeShift.total_paused_minutes} мин</span>
                </div>
              )}
            </div>

            {/* Manual pause / resume buttons */}
            {!activeShift.is_paused && (
              <Button
                onClick={handlePauseShift}
                variant="outline"
                className="w-full border-2 border-yellow-500/40 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/10"
                size="lg"
              >
                <Pause className="w-5 h-5 mr-2" />
                Поставить на паузу
              </Button>
            )}
            {activeShift.is_paused && getCurrentPauseReason(activeShift) === 'manual' && (
              <Button
                onClick={handleResumeShift}
                variant="outline"
                className="w-full border-2 border-accent text-accent hover:bg-accent/10"
                size="lg"
              >
                <PlayCircle className="w-5 h-5 mr-2" />
                Возобновить смену
              </Button>
            )}

            <Button
              onClick={handleEndShift}
              className="w-full bg-gradient-to-r from-destructive to-destructive/80"
              size="lg"
            >
              <Square className="w-5 h-5 mr-2" />
              Закончить смену
            </Button>
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Начать смену</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Выберите объект из списка ниже, затем нажмите "Начать смену"
            </p>
            
            {sites.length > 0 ? (
              <>
                <div className="space-y-2 mb-4">
                  {sites.map((site) => {
                    const distance = getSiteDistance(site);
                    const isSelected = selectedSite?.id === site.id;
                    const evaluation = evaluateSiteForUser(site);
                    const effective = pickEffectiveTimes(
                      myAssignments[site.id],
                      { expected_start: site.expected_start, expected_end: site.expected_end },
                    );
                    const dotClass =
                      evaluation?.verdict === 'inside' ? 'bg-green-500' :
                      evaluation?.verdict === 'outside' ? 'bg-red-500' :
                      evaluation?.verdict === 'uncertain' ? 'bg-yellow-500' :
                      'bg-muted-foreground/40';
                    return (
                      <button
                        key={site.id}
                        onClick={() => setSelectedSite(site)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50 bg-card'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-2 min-w-0">
                            <span
                              className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`}
                              aria-label={
                                evaluation?.verdict === 'inside' ? 'Внутри радиуса' :
                                evaluation?.verdict === 'outside' ? 'Вне радиуса' :
                                evaluation?.verdict === 'uncertain' ? 'На границе радиуса' :
                                'Расстояние неизвестно'
                              }
                            />
                            <div className="min-w-0">
                              <div className="font-medium">{site.name}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Время: {effective.start} - {effective.end}
                                {effective.source !== 'site_default' && (
                                  <span className="ml-1 text-primary">(ваш график)</span>
                                )}
                              </div>
                              {distance !== null && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  📍 {distance}м от вас
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ±{site.radius_m}м
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                <Button
                  onClick={handleStartShift}
                  disabled={!selectedSite}
                  className="w-full bg-gradient-to-r from-primary to-accent"
                  size="lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  {selectedSite ? `Начать смену на "${selectedSite.name}"` : 'Выберите объект'}
                </Button>
              </>
            ) : (
              <div className="text-center py-8">
                <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Нет доступных объектов</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Администратор ещё не добавил объекты
                </p>
              </div>
            )}
          </Card>
        )}

        {/* WakeLock Toggle */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium">Экран не гаснет</h3>
                <p className="text-xs text-muted-foreground">Держать экран активным во время смены</p>
              </div>
            </div>
            <Button
              variant={wakeLockEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={toggleWakeLock}
            >
              {wakeLockEnabled ? 'Включено' : 'Выключено'}
            </Button>
          </div>
        </Card>

      </main>
    </div>
  );
};

export default Me;
