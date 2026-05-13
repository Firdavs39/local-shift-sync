import { Card } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { MapPin, Clock, Pause, TrendingUp, TrendingDown, CheckCircle, Bot, Zap } from 'lucide-react';
import { formatTimeInTz } from '@/lib/time';

interface PauseEvent {
  paused_at: string;
  resumed_at?: string;
  duration_minutes?: number;
}

interface ShiftCardProps {
  shift: {
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
    auto_ended?: boolean;
    is_overtime?: boolean;
    site_timezone?: string | null;
  };
}

export function ShiftCard({ shift }: ShiftCardProps) {
  const getStatusInfo = () => {
    switch (shift.status) {
      case 'on_time':
        return {
          icon: CheckCircle,
          color: 'text-green-500',
          bg: 'bg-green-500/10',
          label: 'Вовремя',
        };
      case 'late':
        return {
          icon: TrendingDown,
          color: 'text-destructive',
          bg: 'bg-destructive/10',
          label: `Опоздание ${shift.minutes_late} мин`,
        };
      case 'early':
        return {
          icon: TrendingUp,
          color: 'text-blue-500',
          bg: 'bg-blue-500/10',
          label: shift.early_minutes ? `Раньше на ${shift.early_minutes} мин` : 'Раньше',
        };
      default:
        return {
          icon: MapPin,
          color: 'text-muted-foreground',
          bg: 'bg-muted',
          label: 'Вне объекта',
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <TooltipProvider>
      <Card className="overflow-hidden">
        <Accordion type="single" collapsible>
          <AccordionItem value="details" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/5">
              <div className="flex items-center gap-3 w-full text-left">
                <div className={cn('p-2 rounded-lg', statusInfo.bg)}>
                  <StatusIcon className={cn('w-5 h-5', statusInfo.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">{shift.site_name}</span>
                    {shift.is_overtime && (
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-xs">
                        <Zap className="w-3 h-3 mr-1" />
                        Переработка
                      </Badge>
                    )}
                    {shift.auto_ended && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Bot className="w-4 h-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Смена завершена автоматически
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatTimeInTz(new Date(shift.started_at), shift.site_timezone)}
                    {shift.ended_at && ` - ${formatTimeInTz(new Date(shift.ended_at), shift.site_timezone)}`}
                    {shift.minutes_worked !== undefined && (
                      <span className="ml-2">
                        ({Math.floor(shift.minutes_worked / 60)}ч {shift.minutes_worked % 60}м)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </AccordionTrigger>

          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3 pt-2">
              {/* Status Details */}
              <div className={cn('p-3 rounded-lg', statusInfo.bg)}>
                <div className="flex items-center gap-2 mb-1">
                  <StatusIcon className={cn('w-4 h-4', statusInfo.color)} />
                  <span className={cn('font-medium text-sm', statusInfo.color)}>
                    {statusInfo.label}
                  </span>
                </div>
                {shift.status === 'late' && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Пришли в {formatTimeInTz(new Date(shift.started_at), shift.site_timezone)}
                  </div>
                )}
                {shift.status === 'early' && shift.early_minutes && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Пришли раньше на {shift.early_minutes} минут
                  </div>
                )}
              </div>

              {/* Working Time */}
              {shift.minutes_worked !== undefined && (
                <div className="flex items-start gap-2 text-sm">
                  <Clock className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <div className="font-medium">Чистое рабочее время</div>
                    <div className="text-muted-foreground">
                      {Math.floor(shift.minutes_worked / 60)} часов {shift.minutes_worked % 60} минут
                      {shift.total_paused_minutes > 0 && (
                        <span className="text-yellow-600">
                          {' '}(без учета {shift.total_paused_minutes} мин на паузе)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Pause History */}
              {shift.pause_events && shift.pause_events.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Pause className="w-4 h-4 text-yellow-500" />
                    <span>История пауз</span>
                  </div>
                  <div className="space-y-2 ml-6">
                    {shift.pause_events.map((pause, index) => (
                      <div
                        key={index}
                        className="text-sm p-2 rounded bg-yellow-500/5 border border-yellow-500/20"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Пауза {index + 1}</span>
                          {pause.duration_minutes !== undefined && (
                            <span className="font-medium text-yellow-600">
                              {pause.duration_minutes} мин
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Начало: {formatTimeInTz(new Date(pause.paused_at), shift.site_timezone)}
                        </div>
                        {pause.resumed_at && (
                          <div className="text-xs text-muted-foreground">
                            Конец: {formatTimeInTz(new Date(pause.resumed_at), shift.site_timezone)}
                          </div>
                        )}
                        {!pause.resumed_at && (
                          <div className="text-xs text-yellow-600 mt-1">
                            В процессе...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
    </TooltipProvider>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
