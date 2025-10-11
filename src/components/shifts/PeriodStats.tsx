import { Card } from '@/components/ui/card';
import { Clock, TrendingUp, TrendingDown, Pause, Briefcase, MapPin, Zap } from 'lucide-react';

interface PeriodStatsProps {
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  totalPausedMinutes: number;
  totalOvertimeMinutes?: number;
  shiftsCount: number;
  overtimeShiftsCount?: number;
  sitesWorked: string[];
}

export function PeriodStats({
  totalWorkedMinutes,
  totalLateMinutes,
  totalEarlyMinutes,
  totalPausedMinutes,
  totalOvertimeMinutes = 0,
  shiftsCount,
  overtimeShiftsCount = 0,
  sitesWorked,
}: PeriodStatsProps) {
  const formatHoursMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}ч ${mins}м`;
  };

  const stats = [
    {
      icon: Clock,
      label: 'Отработано',
      value: formatHoursMinutes(totalWorkedMinutes),
      color: 'text-primary',
    },
    {
      icon: TrendingDown,
      label: 'Опоздания',
      value: `${totalLateMinutes} мин`,
      color: 'text-destructive',
    },
    {
      icon: TrendingUp,
      label: 'Ранние прибытия',
      value: `${totalEarlyMinutes} мин`,
      color: 'text-blue-500',
    },
    {
      icon: Pause,
      label: 'На паузе',
      value: `${totalPausedMinutes} мин`,
      color: 'text-yellow-500',
    },
    {
      icon: Briefcase,
      label: 'Смен',
      value: shiftsCount,
      color: 'text-accent',
    },
  ];

  if (totalOvertimeMinutes > 0) {
    stats.push({
      icon: Zap,
      label: 'Переработка',
      value: formatHoursMinutes(totalOvertimeMinutes),
      color: 'text-amber-500',
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Статистика за период</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {stats.map((stat, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <stat.icon className={cn('w-4 h-4', stat.color)} />
                <span>{stat.label}</span>
              </div>
              <div className={cn('text-2xl font-bold', stat.color)}>
                {stat.value}
              </div>
              {stat.label === 'Переработка' && overtimeShiftsCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {overtimeShiftsCount} смен(ы)
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {sitesWorked.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Объекты</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {sitesWorked.map((site, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
              >
                {site}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
