import { GroupedShift } from './shift-grouping';
import { formatDateInTz, formatTimeInTz } from './time';

const escapeCSV = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'on_time': return 'Вовремя';
    case 'late': return 'Опоздание';
    case 'early': return 'Раньше';
    case 'offsite': return 'Вне объекта';
    default: return status;
  }
};

export const exportShiftsToCSV = (shifts: GroupedShift[], filename = 'shifts-export.csv'): void => {
  const headers = [
    'Сотрудник',
    'Объект',
    'Часовой пояс',
    'Дата начала',
    'Время начала',
    'Дата конца',
    'Время конца',
    'Статус',
    'Опоздание (мин)',
    'Пришёл раньше (мин)',
    'Паузы (мин)',
    'Выходы за радиус',
    'Самое длинное отсутствие (мин)',
    'Отработано (мин)',
    'Отработано (ч:мм)',
    'Переработка засчитана (мин)',
    'Переработка ждёт подтверждения (мин)',
  ];

  const rows = shifts.map((shift) => {
    const tz = shift.site_timezone ?? null;
    const startDate = new Date(shift.started_at);
    const endDate = shift.ended_at ? new Date(shift.ended_at) : null;
    const workedH = shift.minutes_worked
      ? `${Math.floor(shift.minutes_worked / 60)}:${String(shift.minutes_worked % 60).padStart(2, '0')}`
      : '';

    return [
      escapeCSV(shift.user_name),
      escapeCSV(shift.site_name),
      escapeCSV(tz ?? ''),
      escapeCSV(formatDateInTz(startDate, tz)),
      escapeCSV(formatTimeInTz(startDate, tz)),
      escapeCSV(endDate ? formatDateInTz(endDate, tz) : ''),
      escapeCSV(endDate ? formatTimeInTz(endDate, tz) : 'В процессе'),
      escapeCSV(getStatusLabel(shift.status)),
      escapeCSV(shift.minutes_late > 0 ? shift.minutes_late : 0),
      escapeCSV(shift.early_minutes && shift.early_minutes > 0 ? shift.early_minutes : 0),
      escapeCSV(shift.total_paused_minutes ?? 0),
      escapeCSV(shift.out_of_radius_count ?? 0),
      escapeCSV(shift.longest_absence_minutes ?? 0),
      escapeCSV(shift.minutes_worked ?? ''),
      escapeCSV(workedH),
      escapeCSV(shift.overtime_minutes_approved ?? 0),
      escapeCSV(shift.overtime_minutes_pending ?? 0),
    ].join(',');
  });

  // BOM for correct Cyrillic rendering in Excel
  const BOM = '\uFEFF';
  const csvContent = BOM + [headers.join(','), ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
