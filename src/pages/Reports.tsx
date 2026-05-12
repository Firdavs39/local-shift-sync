import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, RefreshCw, Users, Pause, TrendingUp, Download, Footprints, Repeat } from 'lucide-react';
import { exportShiftsToCSV } from '@/lib/csv-export';
import { formatTime, formatDate, calculateEarlyMinutes } from '@/lib/time';
import { pickEffectiveTimes, type AssignmentOverride } from '@/lib/expected-times';
import { toast } from 'sonner';
import { PeriodFilter, PeriodType } from '@/components/shifts/PeriodFilter';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { groupShiftsByWorkerSiteDay, GroupedShift } from '@/lib/shift-grouping';

interface ShiftReport {
  id: string;
  user_id: string;
  user_name: string;
  site_id: string;
  site_name: string;
  started_at: string;
  ended_at?: string;
  status: 'early' | 'on_time' | 'late';
  minutes_late: number;
  minutes_worked?: number;
  early_minutes?: number;
  pause_history?: any[];
  total_paused_minutes?: number;
  expected_start?: string;
}

const PAGE_SIZE = 50;

const Reports = () => {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState<GroupedShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [page, setPage] = useState(1);

  const getPeriodRange = () => {
    switch (selectedPeriod) {
      case 'day':
        return {
          start: startOfDay(selectedDate),
          end: endOfDay(selectedDate),
        };
      case 'week':
        return {
          start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
          end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
        };
      case 'month':
        return {
          start: startOfMonth(selectedDate),
          end: endOfMonth(selectedDate),
        };
    }
  };

  const loadShifts = async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodRange();
      
      const { data: shiftsData, error } = await supabase
        .from('shifts')
        .select(`
          id,
          user_id,
          site_id,
          started_at,
          ended_at,
          status,
          minutes_late,
          minutes_worked,
          pause_history,
          total_paused_minutes
        `)
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .order('started_at', { ascending: false });

      if (error) throw error;

      // Load user names
      const userIds = [...new Set(shiftsData?.map(s => s.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      // Load site names + default expected times (we'll override per-(user, site) below).
      const siteIds = [...new Set(shiftsData?.map(s => s.site_id) || [])];
      const { data: sites } = await supabase
        .from('sites')
        .select('id, name, expected_start, expected_end')
        .in('id', siteIds);

      // Load all (user, site) assignment overrides relevant to this batch.
      // RLS limits admin to their company, so this is bounded.
      const { data: assignmentRows } = await supabase
        .from('worker_site_assignments')
        .select('user_id, site_id, expected_start, expected_end')
        .in('user_id', userIds)
        .in('site_id', siteIds);
      const assignmentMap = new Map<string, AssignmentOverride>();
      for (const row of (assignmentRows as unknown as Array<{ user_id: string; site_id: string; expected_start: string | null; expected_end: string | null }>) || []) {
        assignmentMap.set(`${row.user_id}|${row.site_id}`, {
          expected_start: row.expected_start,
          expected_end: row.expected_end,
        });
      }

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));
      const siteMap = new Map(sites?.map(s => [s.id, { name: s.name, expected_start: s.expected_start, expected_end: s.expected_end }]));

      const enrichedShifts: ShiftReport[] = (shiftsData || [])
        .filter(shift => shift.status !== 'offsite') // Filter out old offsite shifts
        .map(shift => {
          const siteInfo = siteMap.get(shift.site_id);
          const effective = siteInfo
            ? pickEffectiveTimes(
                assignmentMap.get(`${shift.user_id}|${shift.site_id}`) || null,
                { expected_start: siteInfo.expected_start, expected_end: siteInfo.expected_end },
              )
            : null;
          const earlyMinutes = effective
            ? calculateEarlyMinutes(new Date(shift.started_at), effective.start)
            : undefined;

          return {
            ...shift,
            status: shift.status as 'early' | 'on_time' | 'late',
            user_name: profileMap.get(shift.user_id) || 'Неизвестно',
            site_name: siteInfo?.name || 'Неизвестно',
            expected_start: effective?.start,
            early_minutes: earlyMinutes,
            pause_history: Array.isArray(shift.pause_history) ? shift.pause_history : [],
          };
        });

      // Группируем смены по работнику + объект + день
      const groupedShifts = groupShiftsByWorkerSiteDay(enrichedShifts);
      setShifts(groupedShifts);
    } catch (error) {
      console.error('Error loading shifts:', error);
      toast.error('Ошибка загрузки отчётов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadShifts();
  }, [selectedPeriod, selectedDate]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'on_time': return 'Вовремя';
      case 'late': return 'Опоздание';
      case 'early': return 'Раньше';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_time': return 'text-green-600';
      case 'late': return 'text-red-600';
      case 'early': return 'text-blue-600';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold">Отчёты по сменам</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportShiftsToCSV(shifts, 'shifts-export.csv')}
              disabled={shifts.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Экспорт CSV
            </Button>
            <Button variant="outline" size="icon" onClick={loadShifts} disabled={loading}>
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card className="p-6">
          <PeriodFilter
            selectedPeriod={selectedPeriod}
            selectedDate={selectedDate}
            onPeriodChange={setSelectedPeriod}
            onDateChange={setSelectedDate}
          />
        </Card>

        <Card className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : shifts.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Нет данных о сменах</p>
            </div>
          ) : (
            (() => {
              const totalPages = Math.ceil(shifts.length / PAGE_SIZE);
              const paginated = shifts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
              return (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Сотрудник</TableHead>
                          <TableHead>Объект</TableHead>
                          <TableHead>Начало</TableHead>
                          <TableHead>Конец</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Опоздание</TableHead>
                          <TableHead>Раньше</TableHead>
                          <TableHead>Паузы</TableHead>
                          <TableHead>Выходы за радиус</TableHead>
                          <TableHead>Макс отсутствие</TableHead>
                          <TableHead>Отработано</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginated.map((shift) => (
                          <TableRow
                            key={shift.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/admin/workers/${shift.user_id}`)}
                          >
                            <TableCell className="font-medium">
                              {shift.user_name}
                              {shift.is_grouped && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  🔄 {shift.shift_segments.length} смен(ы)
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{shift.site_name}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>{formatDate(new Date(shift.started_at))}</div>
                                <div className="text-muted-foreground">{formatTime(new Date(shift.started_at))}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {shift.ended_at ? (
                                <div className="text-sm">
                                  <div>{formatDate(new Date(shift.ended_at))}</div>
                                  <div className="text-muted-foreground">{formatTime(new Date(shift.ended_at))}</div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">В процессе</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className={getStatusColor(shift.status)}>
                                {getStatusLabel(shift.status)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {shift.minutes_late > 0 ? `${shift.minutes_late} мин` : '-'}
                            </TableCell>
                            <TableCell>
                              {shift.early_minutes && shift.early_minutes > 0 ? (
                                <span className="text-blue-600 flex items-center gap-1">
                                  <TrendingUp className="w-3 h-3" />
                                  {shift.early_minutes} мин
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {shift.pause_history && shift.pause_history.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  <span className="text-amber-600 flex items-center gap-1">
                                    <Pause className="w-3 h-3" />
                                    {shift.pause_history.length} ({shift.total_paused_minutes || 0} мин)
                                  </span>
                                  {shift.is_grouped && shift.auto_pauses.length > 0 && (
                                    <span className="text-xs text-orange-600">
                                      🔄 {shift.auto_pauses.length} автопауз(ы)
                                    </span>
                                  )}
                                </div>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {shift.out_of_radius_count > 0 ? (
                                <span className="text-orange-600 flex items-center gap-1">
                                  <Repeat className="w-3 h-3" />
                                  {shift.out_of_radius_count}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {shift.longest_absence_minutes > 0 ? (
                                <span className="text-orange-600 flex items-center gap-1">
                                  <Footprints className="w-3 h-3" />
                                  {shift.longest_absence_minutes} мин
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {shift.minutes_worked
                                ? `${Math.floor(shift.minutes_worked / 60)}ч ${shift.minutes_worked % 60}м`
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, shifts.length)} из {shifts.length}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          ← Назад
                        </Button>
                        <span className="flex items-center px-3 text-sm">
                          {page} / {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                        >
                          Вперёд →
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()
          )}
        </Card>
      </main>
    </div>
  );
};

export default Reports;
