import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ArrowLeft,
  MapPin,
  Trophy,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Footprints,
  Repeat,
  Users,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatTimeInTz, getDayKeyInTz, getDayStartInTz } from '@/lib/time';
import { computeDayStats, type ShiftForStats } from '@/lib/discipline';
import { pickEffectiveTimes, type AssignmentOverride } from '@/lib/expected-times';

interface SiteRow {
  id: string;
  name: string;
  expected_start: string;
  expected_end: string;
  timezone: string | null;
  active: boolean;
}

interface ProfileRow {
  id: string;
  full_name: string;
  active: boolean;
}

interface AssignmentRow {
  id: string;
  user_id: string;
  site_id: string;
  expected_start: string | null;
  expected_end: string | null;
}

interface ShiftRow {
  id: string;
  user_id: string;
  site_id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  minutes_late: number;
  minutes_worked: number | null;
  total_paused_minutes: number | null;
  pause_history: unknown;
  is_overtime: boolean | null;
  is_paused: boolean | null;
}

interface WorkerOnSite {
  userId: string;
  fullName: string;
  effectiveStart: string;
  effectiveEnd: string;
  /** IANA tz of the site this worker belongs to, for timestamp formatting. */
  siteTimezone: string | null;
  shifts: ShiftRow[];
  stats: ReturnType<typeof computeDayStats>;
  /** Has any shift today on this site (started already). */
  hasStartedToday: boolean;
  /** Currently active (no ended_at) shift on this site. */
  activeShift: ShiftRow | null;
}

/**
 * Earliest "midnight" across all known site timezones. Used as the lower
 * bound when pulling today's shifts — guarantees no site loses a row near
 * its day boundary regardless of where the admin's browser is located.
 */
function earliestSiteMidnight(siteTzs: string[]): Date {
  if (siteTzs.length === 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const now = new Date();
  const ts = siteTzs.map(tz => getDayStartInTz(now, tz).getTime());
  return new Date(Math.min(...ts));
}

const WhoIsOnShift = () => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Step 1: fetch sites first so we know which tzs span "today".
      const sitesRes = await supabase
        .from('sites').select('id, name, expected_start, expected_end, timezone, active').eq('active', true);
      const sitesData = (sitesRes.data as SiteRow[]) || [];
      setSites(sitesData);

      // Step 2: query lower bound = earliest "today" midnight across all
      // site timezones. Per-site filtering happens in the sitesWithWorkers
      // memo below (we keep only rows whose started_at falls into "today"
      // in their own site's tz).
      const siteTzs = sitesData.map(s => s.timezone).filter(Boolean) as string[];
      const lowerBound = earliestSiteMidnight(siteTzs).toISOString();

      const [profilesRes, assignmentsRes, shiftsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, active'),
        supabase
          .from('worker_site_assignments')
          .select('id, user_id, site_id, expected_start, expected_end'),
        supabase
          .from('shifts')
          .select('id, user_id, site_id, started_at, ended_at, status, minutes_late, minutes_worked, total_paused_minutes, pause_history, is_overtime, is_paused')
          .gte('started_at', lowerBound),
      ]);
      setProfiles((profilesRes.data as ProfileRow[]) || []);
      setAssignments(((assignmentsRes.data as unknown) as AssignmentRow[]) || []);
      setShifts((shiftsRes.data as ShiftRow[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();

    const channel = supabase
      .channel('whoisonshift-shifts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => { loadAll(); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  // Group: for each site, the workers assigned to it (+ their today's shifts + stats).
  const sitesWithWorkers = useMemo(() => {
    return sites.map(site => {
      const siteAssignments = assignments.filter(a => a.site_id === site.id);
      const workers: WorkerOnSite[] = siteAssignments.map(a => {
        const profile = profileMap.get(a.user_id);
        const fullName = profile?.full_name || '—';
        const effective = pickEffectiveTimes(
          { expected_start: a.expected_start, expected_end: a.expected_end } as AssignmentOverride,
          { expected_start: site.expected_start, expected_end: site.expected_end, timezone: site.timezone },
        );
        // Only shifts that fall into "today" in the SITE's timezone.
        // A worker who started at 02:00 local on a Tashkent site is part
        // of today's bucket; the same UTC instant for a Moscow-site shift
        // belongs to yesterday — bucketing happens per-site, not per-server.
        const todayKey = getDayKeyInTz(new Date(), site.timezone);
        const userShifts = shifts
          .filter(s =>
            s.user_id === a.user_id
            && s.site_id === site.id
            && getDayKeyInTz(new Date(s.started_at), site.timezone) === todayKey,
          )
          .sort((x, y) => new Date(x.started_at).getTime() - new Date(y.started_at).getTime());
        const stats = computeDayStats(
          userShifts.map((s): ShiftForStats => ({
            id: s.id,
            started_at: s.started_at,
            ended_at: s.ended_at,
            minutes_worked: s.minutes_worked,
            total_paused_minutes: s.total_paused_minutes,
            pause_history: (s.pause_history as ShiftForStats['pause_history']) ?? null,
            is_overtime: s.is_overtime,
            minutes_late: s.minutes_late,
            status: s.status,
          })),
          { start: effective.start, timezone: site.timezone ?? undefined },
        );
        const activeShift = userShifts.find(s => !s.ended_at) ?? null;
        return {
          userId: a.user_id,
          fullName,
          effectiveStart: effective.start,
          effectiveEnd: effective.end,
          siteTimezone: site.timezone ?? null,
          shifts: userShifts,
          stats,
          hasStartedToday: userShifts.length > 0,
          activeShift,
        };
      });
      return { site, workers };
    });
  }, [sites, assignments, shifts, profileMap]);

  // Discipline-of-the-day aggregates across ALL buckets in the company.
  const discipline = useMemo(() => {
    let firstStarter: { userId: string; name: string; startedAt: Date; effectiveStart: string; tz: string | null } | null = null;
    let lastStarter: { userId: string; name: string; startedAt: Date; tz: string | null } | null = null;
    let worstLate: { userId: string; name: string; minutes: number } | null = null;
    let longestAbsence: { userId: string; name: string; minutes: number } | null = null;
    let mostExits: { userId: string; name: string; count: number } | null = null;

    for (const { site, workers } of sitesWithWorkers) {
      for (const w of workers) {
        if (!w.stats.firstStartedAt) continue;
        if (!firstStarter || w.stats.firstStartedAt < firstStarter.startedAt) {
          firstStarter = {
            userId: w.userId,
            name: w.fullName,
            startedAt: w.stats.firstStartedAt,
            effectiveStart: w.effectiveStart,
            tz: site.timezone ?? null,
          };
        }
        if (!lastStarter || w.stats.firstStartedAt > lastStarter.startedAt) {
          lastStarter = { userId: w.userId, name: w.fullName, startedAt: w.stats.firstStartedAt, tz: site.timezone ?? null };
        }
        if (w.stats.minutesLate > 0 && (!worstLate || w.stats.minutesLate > worstLate.minutes)) {
          worstLate = { userId: w.userId, name: w.fullName, minutes: w.stats.minutesLate };
        }
        if (w.stats.longestAbsenceMinutes > 0 && (!longestAbsence || w.stats.longestAbsenceMinutes > longestAbsence.minutes)) {
          longestAbsence = { userId: w.userId, name: w.fullName, minutes: w.stats.longestAbsenceMinutes };
        }
        if (w.stats.outOfRadiusCount > 0 && (!mostExits || w.stats.outOfRadiusCount > mostExits.count)) {
          mostExits = { userId: w.userId, name: w.fullName, count: w.stats.outOfRadiusCount };
        }
      }
    }
    return { firstStarter, lastStarter, worstLate, longestAbsence, mostExits };
  }, [sitesWithWorkers]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold">Кто на смене</h1>
          </div>
          <Button variant="outline" size="icon" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Discipline of the day */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="w-4 h-4 text-amber-500" />
            Дисциплина за сегодня
          </div>
          {!discipline.firstStarter && !discipline.worstLate && !discipline.longestAbsence && !discipline.mostExits ? (
            <p className="text-sm text-muted-foreground">Сегодня пока никто не выходил на смену.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {discipline.firstStarter && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-md p-2">
                  <Trophy className="w-4 h-4 text-green-600" />
                  <div>
                    <div className="font-medium">🎉 Первый на смене</div>
                    <div className="text-muted-foreground">
                      {discipline.firstStarter.name} — {formatTimeInTz(discipline.firstStarter.startedAt, discipline.firstStarter.tz)}
                    </div>
                  </div>
                </div>
              )}
              {discipline.lastStarter && discipline.firstStarter && discipline.lastStarter.userId !== discipline.firstStarter.userId && (
                <div className="flex items-center gap-2 bg-muted/40 border rounded-md p-2">
                  <TrendingDown className="w-4 h-4 text-orange-600" />
                  <div>
                    <div className="font-medium">🔻 Последним начал</div>
                    <div className="text-muted-foreground">
                      {discipline.lastStarter.name} — {formatTimeInTz(discipline.lastStarter.startedAt, discipline.lastStarter.tz)}
                    </div>
                  </div>
                </div>
              )}
              {discipline.worstLate && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-md p-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <div>
                    <div className="font-medium">⚠️ Максимальное опоздание</div>
                    <div className="text-muted-foreground">
                      {discipline.worstLate.name} — {discipline.worstLate.minutes} мин
                    </div>
                  </div>
                </div>
              )}
              {discipline.longestAbsence && (
                <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-md p-2">
                  <Footprints className="w-4 h-4 text-orange-600" />
                  <div>
                    <div className="font-medium">🚶 Самое долгое отсутствие</div>
                    <div className="text-muted-foreground">
                      {discipline.longestAbsence.name} — {discipline.longestAbsence.minutes} мин
                    </div>
                  </div>
                </div>
              )}
              {discipline.mostExits && (
                <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-md p-2">
                  <Repeat className="w-4 h-4 text-orange-600" />
                  <div>
                    <div className="font-medium">🔁 Больше всего выходов за радиус</div>
                    <div className="text-muted-foreground">
                      {discipline.mostExits.name} — {discipline.mostExits.count} раз
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Per-site list */}
        {sitesWithWorkers.length === 0 && !loading && (
          <Card className="p-12 text-center text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-3" />
            Нет активных объектов.
          </Card>
        )}

        {sitesWithWorkers.map(({ site, workers }) => (
          <Card key={site.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                <h2 className="font-semibold">{site.name}</h2>
                <span className="text-xs text-muted-foreground">
                  по умолч. {site.expected_start}–{site.expected_end}
                </span>
              </div>
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Users className="w-3 h-3" /> {workers.length}
              </span>
            </div>
            {workers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет назначенных сотрудников.</p>
            ) : (
              <div className="space-y-2">
                {workers.map(w => {
                  const isFirst = discipline.firstStarter?.userId === w.userId;
                  const isLast = discipline.lastStarter && discipline.firstStarter && discipline.lastStarter.userId !== discipline.firstStarter.userId && discipline.lastStarter.userId === w.userId;
                  const isLate = w.stats.minutesLate > 0;
                  const isEarly = w.stats.earlyMinutes > 0;
                  const isWorking = !!w.activeShift && !w.activeShift.is_paused;
                  const isPaused = !!w.activeShift?.is_paused;
                  const notStarted = !w.hasStartedToday;
                  const bgClass = isLate
                    ? 'bg-red-500/5 border-red-500/30'
                    : isWorking
                      ? 'bg-green-500/5 border-green-500/30'
                      : isPaused
                        ? 'bg-yellow-500/5 border-yellow-500/30'
                        : 'bg-card border-border';
                  return (
                    <div key={w.userId} className={`flex items-start justify-between gap-3 p-3 rounded-md border ${bgClass}`}>
                      <div className="min-w-0">
                        <div className="font-medium flex flex-wrap items-center gap-2">
                          {w.fullName}
                          <span className="text-xs text-muted-foreground">
                            {w.effectiveStart}–{w.effectiveEnd}
                          </span>
                          {isFirst && (
                            <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">
                              🎉 Первый
                            </span>
                          )}
                          {isLast && (
                            <span className="text-xs bg-muted text-muted-foreground border rounded px-1.5 py-0.5">
                              🔻 Последний
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                          {notStarted && <span>Ещё не начал</span>}
                          {isWorking && <span className="text-green-600 dark:text-green-400">На объекте</span>}
                          {isPaused && <span className="text-yellow-600 dark:text-yellow-500">Вне радиуса (пауза)</span>}
                          {isLate && (
                            <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                              <TrendingDown className="w-3 h-3" /> Опоздал на {w.stats.minutesLate} мин
                            </span>
                          )}
                          {isEarly && (
                            <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> Раньше на {w.stats.earlyMinutes} мин
                            </span>
                          )}
                          {w.stats.totalPausedMinutes > 0 && (
                            <span className="flex items-center gap-1">
                              <Footprints className="w-3 h-3" /> Отсутствие {w.stats.totalPausedMinutes} мин
                            </span>
                          )}
                          {w.stats.outOfRadiusCount > 0 && (
                            <span className="flex items-center gap-1">
                              <Repeat className="w-3 h-3" /> {w.stats.outOfRadiusCount} выходов
                            </span>
                          )}
                        </div>
                      </div>
                      {w.stats.firstStartedAt && (
                        <div className="text-xs text-muted-foreground text-right shrink-0">
                          с {formatTimeInTz(w.stats.firstStartedAt, w.siteTimezone)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ))}
      </main>
    </div>
  );
};

export default WhoIsOnShift;
