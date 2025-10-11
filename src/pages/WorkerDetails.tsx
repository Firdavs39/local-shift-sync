import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, User, Calendar } from 'lucide-react';
import { formatDate, calculateEarlyMinutes } from '@/lib/time';
import { toast } from 'sonner';
import { PeriodFilter, PeriodType } from '@/components/shifts/PeriodFilter';
import { DailyBreakdown } from '@/components/shifts/DailyBreakdown';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

interface WorkerProfile {
  id: string;
  full_name: string;
  pin: string;
  active: boolean;
  email?: string;
}

interface ShiftDetail {
  id: string;
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
}

const WorkerDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [shifts, setShifts] = useState<ShiftDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

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

  useEffect(() => {
    if (!id) return;

    const loadWorkerData = async () => {
      setLoading(true);
      try {
        // Load worker profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();

        if (profileError) throw profileError;
        setWorker(profile);

        const { start, end } = getPeriodRange();

        // Load worker shifts for period
        const { data: shiftsData, error: shiftsError } = await supabase
          .from('shifts')
          .select('*')
          .eq('user_id', id)
          .gte('started_at', start.toISOString())
          .lte('started_at', end.toISOString())
          .order('started_at', { ascending: false });

        if (shiftsError) throw shiftsError;

        // Load site names and expected start times
        const siteIds = [...new Set(shiftsData?.map(s => s.site_id) || [])];
        const { data: sites } = await supabase
          .from('sites')
          .select('id, name, expected_start')
          .in('id', siteIds);

        const siteMap = new Map(sites?.map(s => [s.id, { name: s.name, expected_start: s.expected_start }]));

        const enrichedShifts: ShiftDetail[] = (shiftsData || [])
          .filter(shift => shift.status !== 'offsite') // Filter out old offsite shifts
          .map(shift => {
            const siteInfo = siteMap.get(shift.site_id);
            const earlyMinutes = siteInfo?.expected_start 
              ? calculateEarlyMinutes(new Date(shift.started_at), siteInfo.expected_start)
              : undefined;
            
            return {
              ...shift,
              status: shift.status as 'early' | 'on_time' | 'late',
              site_name: siteInfo?.name || 'Неизвестно',
              early_minutes: earlyMinutes,
              pause_history: Array.isArray(shift.pause_history) ? shift.pause_history : [],
            };
          });

        setShifts(enrichedShifts);
      } catch (error) {
        console.error('Error loading worker data:', error);
        toast.error('Ошибка загрузки данных сотрудника');
      } finally {
        setLoading(false);
      }
    };

    loadWorkerData();
  }, [id, selectedPeriod, selectedDate]);


  const calculateTotalStats = () => {
    const totalMinutesWorked = shifts.reduce((sum, shift) => sum + (shift.minutes_worked || 0), 0);
    const totalMinutesLate = shifts.reduce((sum, shift) => sum + shift.minutes_late, 0);
    const totalMinutesEarly = shifts.reduce((sum, shift) => sum + (shift.early_minutes || 0), 0);
    const totalPausedMinutes = shifts.reduce((sum, shift) => sum + (shift.total_paused_minutes || 0), 0);
    const completedShifts = shifts.filter(s => s.ended_at).length;
    const activeShifts = shifts.filter(s => !s.ended_at).length;

    return {
      totalHours: Math.floor(totalMinutesWorked / 60),
      totalMinutes: totalMinutesWorked % 60,
      totalLateMinutes: totalMinutesLate,
      totalEarlyMinutes: totalMinutesEarly,
      totalPausedMinutes: totalPausedMinutes,
      completedShifts,
      activeShifts,
    };
  };

  const groupShiftsByDay = () => {
    const grouped = new Map<string, ShiftDetail[]>();
    
    shifts.forEach(shift => {
      const date = formatDate(new Date(shift.started_at));
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(shift);
    });
    
    return Array.from(grouped.entries()).map(([date, dayShifts]) => {
      const workedMinutes = dayShifts.reduce((sum, s) => sum + (s.minutes_worked || 0), 0);
      const lateMinutes = dayShifts.reduce((sum, s) => sum + s.minutes_late, 0);
      const earlyMinutes = dayShifts.reduce((sum, s) => sum + (s.early_minutes || 0), 0);
      
      return {
        date,
        shifts: dayShifts,
        dayStats: {
          workedMinutes,
          lateMinutes,
          earlyMinutes,
        },
      };
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Сотрудник не найден</p>
          <Button className="mt-4" onClick={() => navigate('/admin/reports')}>
            Вернуться к отчётам
          </Button>
        </Card>
      </div>
    );
  }

  const stats = calculateTotalStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/reports')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold">Информация о сотруднике</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Worker Info Card */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-2xl font-bold">
              {worker.full_name[0]}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">{worker.full_name}</h2>
              <div className="space-y-1 text-sm text-muted-foreground">
                {worker.email && <p>Email: {worker.email}</p>}
                <p>PIN: {worker.pin}</p>
                <p>
                  Статус: {' '}
                  <span className={worker.active ? 'text-green-600' : 'text-red-600'}>
                    {worker.active ? 'Активен' : 'Неактивен'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Period Filter */}
        <Card className="p-6">
          <PeriodFilter
            selectedPeriod={selectedPeriod}
            selectedDate={selectedDate}
            onPeriodChange={setSelectedPeriod}
            onDateChange={setSelectedDate}
          />
        </Card>

        {/* Statistics Cards */}
        <div className="grid md:grid-cols-5 gap-4">
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.completedShifts}</div>
            <div className="text-sm text-muted-foreground">Завершённых смен</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.totalHours}ч {stats.totalMinutes}м
            </div>
            <div className="text-sm text-muted-foreground">Отработано</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.totalLateMinutes} мин</div>
            <div className="text-sm text-muted-foreground">Опозданий</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalEarlyMinutes} мин</div>
            <div className="text-sm text-muted-foreground">Раньше времени</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.totalPausedMinutes} мин</div>
            <div className="text-sm text-muted-foreground">На паузах</div>
          </Card>
        </div>

        {/* Shifts History with Daily Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            История смен
          </h3>
          
          {shifts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Нет данных о сменах за выбранный период</p>
            </div>
          ) : (
            <DailyBreakdown 
              dailyBreakdown={groupShiftsByDay().map(day => ({
                ...day,
                shifts: day.shifts.map(shift => ({
                  ...shift,
                  site_name: shift.site_name,
                  pause_events: (shift.pause_history || []).map((pause: any) => {
                    if (pause.paused_at && pause.resumed_at) {
                      const pausedAt = new Date(pause.paused_at);
                      const resumedAt = new Date(pause.resumed_at);
                      const duration = Math.floor((resumedAt.getTime() - pausedAt.getTime()) / 60000);
                      return {
                        paused_at: pause.paused_at,
                        resumed_at: pause.resumed_at,
                        duration_minutes: duration,
                      };
                    }
                    return pause;
                  }),
                }))
              }))} 
            />
          )}
        </Card>
      </main>
    </div>
  );
};

export default WorkerDetails;
