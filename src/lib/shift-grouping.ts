import { differenceInMinutes } from 'date-fns';
import { getDayKeyInTz } from './time';

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
  /** IANA timezone of the SITE — used to render times in the local zone of the object. */
  site_timezone?: string | null;
  is_grouped: boolean; // Флаг что это группа смен
  shift_segments: ShiftSegment[]; // Детали каждой смены в группе
  auto_pauses: AutoPause[]; // Автопаузы между сменами
  auto_ended?: boolean;
  is_overtime?: boolean;
  /** Сколько раз сотрудник выходил за радиус объекта (auto-pause события). */
  out_of_radius_count: number;
  /** Самое длительное отсутствие на месте в минутах (максимальная пауза). */
  longest_absence_minutes: number;
  /** Sum of approved overtime minutes across the group (discarded/pending excluded if hideDiscarded). */
  overtime_minutes_approved: number;
  /** Sum of pending overtime minutes — waiting for the worker to confirm. */
  overtime_minutes_pending: number;
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
  site_timezone?: string | null;
  auto_ended?: boolean;
  is_overtime?: boolean;
  overtime_minutes?: number;
  /** none | pending | approved | discarded. Discarded is hidden in the UI. */
  overtime_status?: string;
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

    // Ключ группы: работник + объект + день. "День" считается в timezone
    // сайта, а не в зоне браузера — иначе ночные смены на разных объектах
    // могут попасть не в свой день.
    const shiftDate = getDayKeyInTz(new Date(shift.started_at), shift.site_timezone ?? null);
    const groupKey = `${shift.user_id}_${shift.site_id}_${shiftDate}`;

    // Находим все смены в этой группе
    const groupShifts: BaseShift[] = [shift];
    processed.add(shift.id);

    // Ищем смены на том же объекте в тот же день тем же работником
    for (let j = i + 1; j < sorted.length; j++) {
      const nextShift = sorted[j];
      const nextDate = getDayKeyInTz(new Date(nextShift.started_at), nextShift.site_timezone ?? null);
      const nextKey = `${nextShift.user_id}_${nextShift.site_id}_${nextDate}`;

      // Don't group if current shift was auto_ended and next is overtime
      if (nextKey === groupKey && !processed.has(nextShift.id)) {
        const lastInGroup = groupShifts[groupShifts.length - 1];
        if (lastInGroup.auto_ended && nextShift.is_overtime) {
          break; // Stop grouping - overtime shift starts a new group
        }
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

// Read a pause entry from either canonical {paused_at, resumed_at, reason} or
// legacy {started_at, ended_at} schema, returning the "is this a radius exit?"
// signal + the duration in minutes.
function pauseSignals(entry: any): { isAutoRadiusExit: boolean; durationMinutes: number } {
  const startedAt: string | undefined = entry?.paused_at ?? entry?.started_at;
  const endedAt: string | undefined = entry?.resumed_at ?? entry?.ended_at;
  // Legacy entries from auto-end-shifts had no `reason` — they were all auto.
  const reason = entry?.reason === 'manual' ? 'manual' : 'auto';
  const durationMinutes = typeof entry?.duration_minutes === 'number'
    ? Math.max(0, entry.duration_minutes)
    : (startedAt && endedAt
        ? Math.max(0, differenceInMinutes(new Date(endedAt), new Date(startedAt)))
        : 0);
  return { isAutoRadiusExit: reason === 'auto', durationMinutes };
}

function summarizePauses(allPauses: any[]): { out_of_radius_count: number; longest_absence_minutes: number } {
  let count = 0;
  let longest = 0;
  for (const entry of allPauses) {
    // Skip the "synthetic" auto-pauses between segments (we mark them with
    // a `auto: true` flag in createGroupedShift below) — those are computed
    // separately as the gap BETWEEN shifts, not as in-shift radius exits.
    if (entry && entry.auto === true) continue;
    const { isAutoRadiusExit, durationMinutes } = pauseSignals(entry);
    if (isAutoRadiusExit) count += 1;
    if (durationMinutes > longest) longest = durationMinutes;
  }
  return { out_of_radius_count: count, longest_absence_minutes: longest };
}

function createGroupedShift(shifts: BaseShift[]): GroupedShift {
  // Если только одна смена - возвращаем её без изменений
  if (shifts.length === 1) {
    const shift = shifts[0];
    const history = shift.pause_history || [];
    const { out_of_radius_count, longest_absence_minutes } = summarizePauses(history);
    const ot = shift.overtime_minutes ?? 0;
    const otStatus = shift.overtime_status ?? 'none';
    return {
      ...shift,
      shift_ids: [shift.id],
      pause_history: history,
      total_paused_minutes: shift.total_paused_minutes || 0,
      site_timezone: shift.site_timezone ?? null,
      is_grouped: false,
      shift_segments: [],
      auto_pauses: [],
      auto_ended: shift.auto_ended,
      is_overtime: shift.is_overtime,
      out_of_radius_count,
      longest_absence_minutes,
      overtime_minutes_approved: otStatus === 'approved' ? ot : 0,
      overtime_minutes_pending: otStatus === 'pending' ? ot : 0,
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

  const { out_of_radius_count, longest_absence_minutes } = summarizePauses(allPauses);
  // The "auto-pause between segments" (worker stopped and restarted the shift)
  // isn't a radius exit, but the gap can be long — fold it into the
  // longest-absence metric so the discipline view doesn't miss it.
  const longestWithGaps = autoPauses.reduce(
    (acc, gap) => Math.max(acc, gap.duration_minutes),
    longest_absence_minutes,
  );

  // Sum overtime across segments by status — discarded is invisible.
  let overtime_minutes_approved = 0;
  let overtime_minutes_pending = 0;
  for (const s of shifts) {
    const ot = s.overtime_minutes ?? 0;
    if (s.overtime_status === 'approved') overtime_minutes_approved += ot;
    else if (s.overtime_status === 'pending') overtime_minutes_pending += ot;
  }

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
    site_timezone: firstShift.site_timezone ?? null,
    is_grouped: true,
    shift_segments: shiftSegments,
    auto_pauses: autoPauses,
    auto_ended: lastShift.auto_ended,
    is_overtime: firstShift.is_overtime,
    out_of_radius_count,
    longest_absence_minutes: longestWithGaps,
    overtime_minutes_approved,
    overtime_minutes_pending,
  };
}
