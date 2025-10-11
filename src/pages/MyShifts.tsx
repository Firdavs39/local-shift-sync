import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/supabase-auth';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PeriodFilter } from '@/components/shifts/PeriodFilter';
import { PeriodStats } from '@/components/shifts/PeriodStats';
import { DailyBreakdown } from '@/components/shifts/DailyBreakdown';
import { calculateEarlyMinutes, formatDate } from '@/lib/time';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

type PeriodType = 'day' | 'week' | 'month';

interface PauseEvent {
  paused_at: string;
  resumed_at?: string;
  duration_minutes?: number;
}

interface ShiftWithDetails {
  id: string;
  site_id: string;
  site_name: string;
  started_at: string;
  ended_at?: string;
  status: 'early' | 'on_time' | 'late' | 'offsite';
  minutes_late: number;
  minutes_worked?: number;
  total_paused_minutes?: number;
  early_minutes?: number;
  pause_events: PauseEvent[];
  expected_start: string;
}

interface DayStats {
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
}

const MyShifts = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [shifts, setShifts] = useState<ShiftWithDetails[]>([]);

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
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    loadShifts();
  }, [user, selectedPeriod, selectedDate]);

  const getPeriodDates = () => {
    const start = new Date(selectedDate);
    const end = new Date(selectedDate);

    switch (selectedPeriod) {
      case 'day':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
        start.setTime(weekStart.getTime());
        start.setHours(0, 0, 0, 0);
        end.setTime(weekEnd.getTime());
        end.setHours(23, 59, 59, 999);
        break;
      case 'month':
        const monthStart = startOfMonth(selectedDate);
        const monthEnd = endOfMonth(selectedDate);
        start.setTime(monthStart.getTime());
        start.setHours(0, 0, 0, 0);
        end.setTime(monthEnd.getTime());
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
  };

  const loadShifts = async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates();

      const { data, error } = await supabase
        .from('shifts')
        .select(`
          *,
          sites (
            name,
            expected_start,
            expected_end
          )
        `)
        .eq('user_id', user.id)
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .order('started_at', { ascending: false });

      if (error) {
        console.error('Error loading shifts:', error);
        toast.error('Ошибка загрузки смен');
        return;
      }

      // Process shifts to add computed fields
      const processedShifts: ShiftWithDetails[] = (data || []).map((shift: any) => {
        const pauseHistory = Array.isArray(shift.pause_history) ? shift.pause_history : [];
        const pauseEvents: PauseEvent[] = pauseHistory.map((pause: any) => {
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
        });

        const earlyMinutes = shift.status === 'early' || shift.status === 'on_time'
          ? calculateEarlyMinutes(new Date(shift.started_at), shift.sites.expected_start)
          : 0;

        return {
          id: shift.id,
          site_id: shift.site_id,
          site_name: shift.sites.name,
          started_at: shift.started_at,
          ended_at: shift.ended_at,
          status: shift.status,
          minutes_late: shift.minutes_late,
          minutes_worked: shift.minutes_worked,
          total_paused_minutes: shift.total_paused_minutes || 0,
          early_minutes: earlyMinutes,
          pause_events: pauseEvents,
          expected_start: shift.sites.expected_start,
        };
      });

      setShifts(processedShifts);
    } catch (error) {
      console.error('Error loading shifts:', error);
      toast.error('Ошибка загрузки смен');
    } finally {
      setLoading(false);
    }
  };

  const calculatePeriodStats = () => {
    const totalWorkedMinutes = shifts.reduce((sum, shift) => sum + (shift.minutes_worked || 0), 0);
    const totalLateMinutes = shifts.reduce((sum, shift) => sum + shift.minutes_late, 0);
    const totalEarlyMinutes = shifts.reduce((sum, shift) => sum + (shift.early_minutes || 0), 0);
    const totalPausedMinutes = shifts.reduce((sum, shift) => sum + (shift.total_paused_minutes || 0), 0);
    const shiftsCount = shifts.length;
    const sitesWorked = [...new Set(shifts.map((shift) => shift.site_name))];

    return {
      totalWorkedMinutes,
      totalLateMinutes,
      totalEarlyMinutes,
      totalPausedMinutes,
      shiftsCount,
      sitesWorked,
    };
  };

  const groupShiftsByDay = () => {
    const grouped = new Map<string, ShiftWithDetails[]>();

    shifts.forEach((shift) => {
      const date = formatDate(new Date(shift.started_at));
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(shift);
    });

    return Array.from(grouped.entries()).map(([date, dayShifts]) => {
      const dayStats: DayStats = {
        workedMinutes: dayShifts.reduce((sum, s) => sum + (s.minutes_worked || 0), 0),
        lateMinutes: dayShifts.reduce((sum, s) => sum + s.minutes_late, 0),
        earlyMinutes: dayShifts.reduce((sum, s) => sum + (s.early_minutes || 0), 0),
      };

      return {
        date,
        shifts: dayShifts,
        dayStats,
      };
    });
  };

  if (!user) return null;

  const periodStats = calculatePeriodStats();
  const dailyBreakdown = groupShiftsByDay();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10 backdrop-blur-sm bg-card/80">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/me')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Мои смены</h1>
            <p className="text-sm text-muted-foreground">{user.full_name}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Period Filter */}
        <PeriodFilter
          selectedPeriod={selectedPeriod}
          selectedDate={selectedDate}
          onPeriodChange={setSelectedPeriod}
          onDateChange={setSelectedDate}
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Period Stats */}
            <PeriodStats {...periodStats} />

            {/* Daily Breakdown */}
            <DailyBreakdown dailyBreakdown={dailyBreakdown} />
          </>
        )}
      </main>
    </div>
  );
};

export default MyShifts;
