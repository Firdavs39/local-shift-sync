import { Card } from '@/components/ui/card';
import { Clock, MapPin, TrendingDown, TrendingUp, Pause, PlayCircle, Calendar, RefreshCw, Bot, Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { formatTime, formatDate } from '@/lib/time';
import { GroupedShift } from '@/lib/shift-grouping';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';

interface AdminShiftCardProps {
  shift: GroupedShift;
}

export function AdminShiftCard({ shift }: AdminShiftCardProps) {
  const manualPauses = (shift.pause_history || []).filter((p: any) => !p.auto);
  const autoPauses = shift.auto_pauses || [];
  const totalPausedMinutes = shift.total_paused_minutes || 0;

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
  const hasPauses = manualPauses.length > 0 || autoPauses.length > 0;

  return (
    <TooltipProvider>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value={shift.id} className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline hover:bg-muted/50">
            <div className="flex items-center justify-between w-full pr-4">
              <div className="flex items-center gap-3">
                <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
                <div className="text-left">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {shift.site_name}
                    {shift.is_grouped && (
                      <Badge variant="secondary" className="text-xs">
                        <RefreshCw className="w-3 h-3 mr-1" />
                        {shift.shift_segments.length}
                      </Badge>
                    )}
                    {shift.is_overtime && (
                      <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600">
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
                  {totalPausedMinutes} мин
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

            {/* Segments for grouped shifts */}
            {shift.is_grouped && shift.shift_segments.length > 1 && (
              <Card className="p-3 bg-orange-50 border-orange-200">
                <div className="flex items-center gap-2 text-orange-700 mb-3">
                  <RefreshCw className="w-4 h-4" />
                  <span className="font-medium">
                    Работник завершал и начинал снова ({shift.shift_segments.length} смен)
                  </span>
                </div>
                <div className="space-y-3 ml-6">
                  {shift.shift_segments.map((segment, index) => (
                    <div key={segment.id} className="text-sm">
                      <div className="font-medium text-orange-800 mb-1">Смена {index + 1}</div>
                      <div className="space-y-1 text-orange-700">
                        <div>• Начало: {formatTime(new Date(segment.started_at))}</div>
                        {segment.ended_at && (
                          <div>• Конец: {formatTime(new Date(segment.ended_at))}</div>
                        )}
                        {segment.minutes_worked !== undefined && (
                          <div>
                            • Отработано: {Math.floor(segment.minutes_worked / 60)}ч {segment.minutes_worked % 60}м
                          </div>
                        )}
                        {segment.pause_history && segment.pause_history.length > 0 && (
                          <div className="text-amber-600">
                            • Паузы: {segment.pause_history.length} ({segment.total_paused_minutes} мин)
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Auto Pauses (между сменами) */}
            {autoPauses.length > 0 && (
              <Card className="p-3 bg-orange-50 border-orange-200">
                <div className="flex items-center gap-2 text-orange-700 mb-2">
                  <RefreshCw className="w-4 h-4" />
                  <span className="font-medium">
                    Автопаузы между сменами ({autoPauses.length} шт., {autoPauses.reduce((sum, p) => sum + p.duration_minutes, 0)} мин)
                  </span>
                </div>
                <div className="space-y-2 ml-6">
                  {autoPauses.map((pause, index) => (
                    <div key={index} className="text-sm text-orange-800">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        <span>
                          Завершил: {formatTime(new Date(pause.started_at))} → 
                          Начал снова: {formatTime(new Date(pause.ended_at))}
                        </span>
                        <Badge variant="secondary" className="text-xs bg-orange-100">
                          {pause.duration_minutes} мин
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

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

            {/* Manual Pause History */}
            {manualPauses.length > 0 && (
              <Card className="p-3 bg-amber-50 border-amber-200">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <Pause className="w-4 h-4" />
                  <span className="font-medium">
                    Ручные паузы ({manualPauses.length} шт., {manualPauses.reduce((sum: number, p: any) => {
                      if (p.paused_at && p.resumed_at) {
                        return sum + Math.floor((new Date(p.resumed_at).getTime() - new Date(p.paused_at).getTime()) / 60000);
                      }
                      return sum;
                    }, 0)} мин)
                  </span>
                </div>
                <div className="space-y-2 ml-6">
                  {manualPauses.map((pause: any, idx: number) => (
                    <div key={idx} className="text-sm text-amber-800">
                      <div className="flex items-center gap-2">
                        <Pause className="w-3 h-3" />
                        <span>Начало: {formatTime(new Date(pause.paused_at))}</span>
                      </div>
                      {pause.resumed_at && (
                        <div className="flex items-center gap-2 ml-5">
                          <PlayCircle className="w-3 h-3" />
                          <span>Продолжил: {formatTime(new Date(pause.resumed_at))}</span>
                          <span className="text-amber-600">
                            ({Math.floor((new Date(pause.resumed_at).getTime() - new Date(pause.paused_at).getTime()) / 60000)} мин)
                          </span>
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
    </TooltipProvider>
  );
}
