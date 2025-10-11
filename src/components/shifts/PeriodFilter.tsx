import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';

type PeriodType = 'day' | 'week' | 'month';

interface PeriodFilterProps {
  selectedPeriod: PeriodType;
  selectedDate: Date;
  onPeriodChange: (period: PeriodType) => void;
  onDateChange: (date: Date) => void;
}

export function PeriodFilter({
  selectedPeriod,
  selectedDate,
  onPeriodChange,
  onDateChange,
}: PeriodFilterProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={selectedPeriod === 'day' ? 'default' : 'outline'}
          onClick={() => onPeriodChange('day')}
          size="sm"
        >
          День
        </Button>
        <Button
          variant={selectedPeriod === 'week' ? 'default' : 'outline'}
          onClick={() => onPeriodChange('week')}
          size="sm"
        >
          Неделя
        </Button>
        <Button
          variant={selectedPeriod === 'month' ? 'default' : 'outline'}
          onClick={() => onPeriodChange('month')}
          size="sm"
        >
          Месяц
        </Button>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !selectedDate && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? format(selectedDate, 'PPP', { locale: ru }) : 'Выберите дату'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && onDateChange(date)}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
