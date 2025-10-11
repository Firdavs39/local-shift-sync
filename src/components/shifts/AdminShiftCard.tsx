import { Card } from '@/components/ui/card';
import { Clock, MapPin, TrendingDown, TrendingUp, Pause, PlayCircle, Calendar } from 'lucide-react';
import { formatTime, formatDate } from '@/lib/time';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface PauseEvent {
  paused_at: string;
  resumed_at?: string;
  duration_minutes?: number;
}

interface AdminShiftCardProps {
  shift: {
    id: string;
    user_name?: string;
    site_name: string;
    started_at: string;
    ended_at?: string;
    status: 'early' | 'on_time' | 'late';
    minutes_late: number;
    minutes_worked?: number;
    early_minutes?: number;
    pause_history?: any[];
    total_paused_minutes?: number;
  };
}

export function AdminShiftCard({ shift }: AdminShiftCardProps) {
  const pauseEvents: PauseEvent[] = (shift.pause_history || []).map((pause: any) => {
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

  const getStatusInfo = () => {
    switch (shift.status) {
      case 'on_time':
        return { label: 'Вовремя', color: 'text-green-600', icon: Clock };
      case 'late':
        return { label: 'Опоздание', color: 'text-red-600', icon: TrendingDown };
      case 'early':
        return { label: 'Раньше времени', color: 'text-blue-600', icon: TrendingUp };
      default:
        return { label: shift.status, color: 'text-muted-foreground', icon: Clock };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  const hasPauses = pauseEvents.length > 0;

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value={shift.id} className="border rounded-lg">
        <AccordionTrigger className="px-4 hover:no-underline hover:bg-muted/50">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
              <div className="text-left">
                <div className="font-medium">{shift.site_name}</div>
                {shift.user_name && (
                  <div className="text-sm text-muted-foreground">{shift.user_name}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className={statusInfo.color}>{statusInfo.label}</span>
              {hasPauses && (
                <span className="text-amber-600 flex items-center gap-1">
                  <Pause className="w-4 h-4" />
                  {pauseEvents.length} пауз
                </span>
              )}
              <span className="text-muted-foreground">
                {formatTime(new Date(shift.started_at))}
              </span>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <div className="space-y-4 pt-2">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Дата:</span>
                <span className="font-medium">{formatDate(new Date(shift.started_at))}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Объект:</span>
                <span className="font-medium">{shift.site_name}</span>
              </div>
            </div>

            {/* Time Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Начало:</span>
                <span className="ml-2 font-medium">{formatTime(new Date(shift.started_at))}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Конец:</span>
                <span className="ml-2 font-medium">
                  {shift.ended_at ? formatTime(new Date(shift.ended_at)) : 'В процессе'}
                </span>
              </div>
            </div>

            {/* Status Details */}
            {shift.status === 'late' && shift.minutes_late > 0 && (
              <Card className="p-3 bg-red-50 border-red-200">
                <div className="flex items-center gap-2 text-red-700">
                  <TrendingDown className="w-4 h-4" />
                  <span className="font-medium">Опоздание на {shift.minutes_late} минут</span>
                </div>
              </Card>
            )}

            {shift.status === 'early' && shift.early_minutes && shift.early_minutes > 0 && (
              <Card className="p-3 bg-blue-50 border-blue-200">
                <div className="flex items-center gap-2 text-blue-700">
                  <TrendingUp className="w-4 h-4" />
                  <span className="font-medium">Пришёл на {shift.early_minutes} минут раньше</span>
                </div>
              </Card>
            )}

            {/* Pause History */}
            {hasPauses && (
              <Card className="p-3 bg-amber-50 border-amber-200">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <Pause className="w-4 h-4" />
                  <span className="font-medium">
                    История пауз ({pauseEvents.length} шт., {shift.total_paused_minutes || 0} мин)
                  </span>
                </div>
                <div className="space-y-2 ml-6">
                  {pauseEvents.map((pause, idx) => (
                    <div key={idx} className="text-sm text-amber-800">
                      <div className="flex items-center gap-2">
                        <Pause className="w-3 h-3" />
                        <span>Начало: {formatTime(new Date(pause.paused_at))}</span>
                      </div>
                      {pause.resumed_at && (
                        <div className="flex items-center gap-2 ml-5">
                          <PlayCircle className="w-3 h-3" />
                          <span>Продолжил: {formatTime(new Date(pause.resumed_at))}</span>
                          {pause.duration_minutes && (
                            <span className="text-amber-600">
                              ({pause.duration_minutes} мин)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Total Worked */}
            {shift.minutes_worked !== undefined && (
              <div className="flex items-center gap-2 text-sm pt-2 border-t">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">Всего отработано:</span>
                <span className="font-bold text-primary">
                  {Math.floor(shift.minutes_worked / 60)} ч {shift.minutes_worked % 60} м
                </span>
                {hasPauses && (
                  <span className="text-muted-foreground text-xs">
                    (без учёта пауз)
                  </span>
                )}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}