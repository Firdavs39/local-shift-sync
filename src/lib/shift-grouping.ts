import { differenceInMinutes } from 'date-fns';

export interface GroupedShift {
  id: string; // ID первой смены в группе
  shift_ids: string[]; // Все ID смен в группе
  user_id: string;
  user_name: string;
  site_id: string;
  site_name: string;
  started_at: string; // Начало первой смены
  ended_at?: string; // Конец последней смены
  status: 'early' | 'on_time' | 'late';
  minutes_late: number;
  minutes_worked?: number;
  early_minutes?: number;
  pause_history: any[];
  total_paused_minutes: number;
  expected_start?: string;
  is_grouped: boolean; // Флаг что это группа смен
  shift_segments: ShiftSegment[]; // Детали каждой смены в группе
  auto_pauses: AutoPause[]; // Автопаузы между сменами
}

export interface ShiftSegment {
  id: string;
  started_at: string;
  ended_at?: string;
  minutes_worked?: number;
  pause_history: any[];
  total_paused_minutes: number;
}

export interface AutoPause {
  started_at: string; // Когда завершил смену
  ended_at: string; // Когда начал новую смену
  duration_minutes: number;
}

interface BaseShift {
  id: string;
  user_id: string;
  user_name: string;
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
  expected_start?: string;
}

/**
 * Группирует смены одного работника на одном объекте в один рабочий день
 * Автоматически рассчитывает "автопаузы" между завершением и началом смен
 */
export function groupShiftsByWorkerSiteDay(shifts: BaseShift[]): GroupedShift[] {
  // Сортируем по времени начала
  const sorted = [...shifts].sort((a, b) => 
    new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  const groups: GroupedShift[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const shift = sorted[i];
    
    if (processed.has(shift.id)) continue;

    // Ключ группы: работник + объект + день
    const shiftDate = new Date(shift.started_at).toDateString();
    const groupKey = `${shift.user_id}_${shift.site_id}_${shiftDate}`;

    // Находим все смены в этой группе
    const groupShifts: BaseShift[] = [shift];
    processed.add(shift.id);

    // Ищем смены на том же объекте в тот же день тем же работником
    for (let j = i + 1; j < sorted.length; j++) {
      const nextShift = sorted[j];
      const nextDate = new Date(nextShift.started_at).toDateString();
      const nextKey = `${nextShift.user_id}_${nextShift.site_id}_${nextDate}`;

      if (nextKey === groupKey && !processed.has(nextShift.id)) {
        groupShifts.push(nextShift);
        processed.add(nextShift.id);
      }
    }

    // Создаем группированную смену
    const grouped = createGroupedShift(groupShifts);
    groups.push(grouped);
  }

  return groups;
}

function createGroupedShift(shifts: BaseShift[]): GroupedShift {
  // Если только одна смена - возвращаем её без изменений
  if (shifts.length === 1) {
    const shift = shifts[0];
    return {
      ...shift,
      shift_ids: [shift.id],
      pause_history: shift.pause_history || [],
      total_paused_minutes: shift.total_paused_minutes || 0,
      is_grouped: false,
      shift_segments: [],
      auto_pauses: [],
    };
  }

  // Группируем несколько смен
  const firstShift = shifts[0];
  const lastShift = shifts[shifts.length - 1];

  // Рассчитываем автопаузы между сменами
  const autoPauses: AutoPause[] = [];
  const allPauses: any[] = [];
  let totalPausedMinutes = 0;

  for (let i = 0; i < shifts.length - 1; i++) {
    const current = shifts[i];
    const next = shifts[i + 1];

    // Добавляем ручные паузы текущей смены
    if (current.pause_history && current.pause_history.length > 0) {
      allPauses.push(...current.pause_history);
      totalPausedMinutes += current.total_paused_minutes || 0;
    }

    // Если текущая смена завершена, рассчитываем автопаузу до следующей
    if (current.ended_at) {
      const endTime = new Date(current.ended_at);
      const nextStartTime = new Date(next.started_at);
      const autoPauseDuration = differenceInMinutes(nextStartTime, endTime);

      if (autoPauseDuration > 0) {
        autoPauses.push({
          started_at: current.ended_at,
          ended_at: next.started_at,
          duration_minutes: autoPauseDuration,
        });

        // Добавляем автопаузу в общий список пауз
        allPauses.push({
          paused_at: current.ended_at,
          resumed_at: next.started_at,
          auto: true, // Флаг что это автопауза
        });

        totalPausedMinutes += autoPauseDuration;
      }
    }
  }

  // Добавляем паузы последней смены
  if (lastShift.pause_history && lastShift.pause_history.length > 0) {
    allPauses.push(...lastShift.pause_history);
    totalPausedMinutes += lastShift.total_paused_minutes || 0;
  }

  // Рассчитываем общее отработанное время
  const totalMinutesWorked = shifts.reduce((sum, s) => sum + (s.minutes_worked || 0), 0);

  // Создаем сегменты смен
  const shiftSegments: ShiftSegment[] = shifts.map(s => ({
    id: s.id,
    started_at: s.started_at,
    ended_at: s.ended_at,
    minutes_worked: s.minutes_worked,
    pause_history: s.pause_history || [],
    total_paused_minutes: s.total_paused_minutes || 0,
  }));

  return {
    id: firstShift.id,
    shift_ids: shifts.map(s => s.id),
    user_id: firstShift.user_id,
    user_name: firstShift.user_name,
    site_id: firstShift.site_id,
    site_name: firstShift.site_name,
    started_at: firstShift.started_at,
    ended_at: lastShift.ended_at,
    status: firstShift.status,
    minutes_late: firstShift.minutes_late,
    early_minutes: firstShift.early_minutes,
    minutes_worked: totalMinutesWorked,
    pause_history: allPauses,
    total_paused_minutes: totalPausedMinutes,
    expected_start: firstShift.expected_start,
    is_grouped: true,
    shift_segments: shiftSegments,
    auto_pauses: autoPauses,
  };
}
