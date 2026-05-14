import { Card } from '@/components/ui/card';
import { ShiftCard } from './ShiftCard';
import { Calendar, Clock, TrendingDown, TrendingUp, Footprints, Repeat } from 'lucide-react';

interface PauseEvent {
  paused_at: string;
  resumed_at?: string;
  duration_minutes?: number;
}

interface Shift {
  id: string;
  site_name: string;
  started_at: string;
  ended_at?: string;
  status: 'early' | 'on_time' | 'late' | 'offsite';
  minutes_late: number;
  minutes_worked?: number;
  total_paused_minutes?: number;
  early_minutes?: number;
  pause_events: PauseEvent[];
  site_timezone?: string | null;
}

interface DayStats {
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  pausedMinutes?: number;
  outOfRadiusCount?: number;
  longestAbsenceMinutes?: number;
  overtimeApprovedMinutes?: number;
  overtimePendingMinutes?: number;
}

interface DailyBreakdownProps {
  dailyBreakdown: {
    date: string;
    shifts: Shift[];
    dayStats: DayStats;
  }[];
}

export function DailyBreakdown({ dailyBreakdown }: DailyBreakdownProps) {
  if (dailyBreakdown.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">Нет смен за выбранный период</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {dailyBreakdown.map((day) => (
        <Card key={day.date} className="p-4 md:p-6">
          {/* Day Header */}
          <div className="mb-4 pb-4 border-b">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">{day.date}</h3>
            </div>
            
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">Отработано:</span>
                <span className="font-medium">
                  {Math.floor(day.dayStats.workedMinutes / 60)}ч {day.dayStats.workedMinutes % 60}м
                </span>
              </div>
              
              {day.dayStats.lateMinutes > 0 && (
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <span className="text-muted-foreground">Опоздания:</span>
                  <span className="font-medium text-destructive">
                    {day.dayStats.lateMinutes} мин
                  </span>
                </div>
              )}
              
              {day.dayStats.earlyMinutes > 0 && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <span className="text-muted-foreground">Раньше:</span>
                  <span className="font-medium text-blue-500">
                    {day.dayStats.earlyMinutes} мин
                  </span>
                </div>
              )}

              {day.dayStats.outOfRadiusCount !== undefined && day.dayStats.outOfRadiusCount > 0 && (
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-orange-500" />
                  <span className="text-muted-foreground">Выходов за радиус:</span>
                  <span className="font-medium text-orange-500">
                    {day.dayStats.outOfRadiusCount}
                  </span>
                </div>
              )}

              {day.dayStats.longestAbsenceMinutes !== undefined && day.dayStats.longestAbsenceMinutes > 0 && (
                <div className="flex items-center gap-2">
                  <Footprints className="w-4 h-4 text-orange-500" />
                  <span className="text-muted-foreground">Макс отсутствие:</span>
                  <span className="font-medium text-orange-500">
                    {day.dayStats.longestAbsenceMinutes} мин
                  </span>
                </div>
              )}

              {day.dayStats.overtimeApprovedMinutes !== undefined && day.dayStats.overtimeApprovedMinutes > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">⚡</span>
                  <span className="text-muted-foreground">Переработка:</span>
                  <span className="font-medium text-amber-600">
                    {Math.floor(day.dayStats.overtimeApprovedMinutes / 60) > 0 && `${Math.floor(day.dayStats.overtimeApprovedMinutes / 60)} ч `}
                    {day.dayStats.overtimeApprovedMinutes % 60} мин
                  </span>
                </div>
              )}
              {day.dayStats.overtimePendingMinutes !== undefined && day.dayStats.overtimePendingMinutes > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">⚡</span>
                  <span className="text-muted-foreground">Ждёт подтверждения:</span>
                  <span className="font-medium text-amber-500 italic">
                    {Math.floor(day.dayStats.overtimePendingMinutes / 60) > 0 && `${Math.floor(day.dayStats.overtimePendingMinutes / 60)} ч `}
                    {day.dayStats.overtimePendingMinutes % 60} мин
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Shifts List */}
          <div className="space-y-3">
            {day.shifts.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
