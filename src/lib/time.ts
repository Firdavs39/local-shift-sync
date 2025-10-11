import { format, differenceInMinutes } from 'date-fns';

export function formatTime(date: Date): string {
  return format(date, 'HH:mm');
}

export function formatDate(date: Date): string {
  return format(date, 'dd.MM.yyyy');
}

export function formatDateTime(date: Date): string {
  return format(date, 'dd.MM.yyyy HH:mm');
}

export function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

export function getMinutesLate(actualTime: Date, expectedTimeStr: string): number {
  const { hours, minutes } = parseTime(expectedTimeStr);
  const expected = new Date(actualTime);
  expected.setHours(hours, minutes, 0, 0);
  
  const diff = differenceInMinutes(actualTime, expected);
  return diff > 0 ? diff : 0;
}

export function getShiftStatus(
  actualTime: Date,
  expectedTimeStr: string,
  isWithinSite: boolean
): 'early' | 'on_time' | 'late' | 'offsite' {
  if (!isWithinSite) return 'offsite';
  
  const minutesLate = getMinutesLate(actualTime, expectedTimeStr);
  
  if (minutesLate === 0) {
    const { hours, minutes } = parseTime(expectedTimeStr);
    const expected = new Date(actualTime);
    expected.setHours(hours, minutes, 0, 0);
    
    if (actualTime < expected) return 'early';
    return 'on_time';
  }
  
  return 'late';
}

export function calculateMinutesWorked(start: Date, end: Date): number {
  return differenceInMinutes(end, start);
}

export function calculateEarlyMinutes(startedAt: Date, expectedStart: string): number {
  const { hours, minutes } = parseTime(expectedStart);
  const expected = new Date(startedAt);
  expected.setHours(hours, minutes, 0, 0);
  
  const diff = differenceInMinutes(expected, startedAt);
  return diff > 0 ? diff : 0;
}
