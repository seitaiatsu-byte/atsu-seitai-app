import { businessBoundsForDate, type WeekdayBusinessHour } from './weekdayBusinessHours';

/** カレンダーに表示する空白時間の最小分（これ未満は表示しない。密着0分は除く） */
export const GAP_DISPLAY_MIN_MINUTES = 5;

export type AppointmentGap = {
  id: string;
  staffKey: string;
  staffName: string;
  startTime: string;
  endTime: string;
  minutes: number;
};

export type DayTimelineItem =
  | { kind: 'reservation'; sortMin: number; reservation: ReservationLike }
  | { kind: 'gap'; sortMin: number; gap: AppointmentGap };

type ReservationLike = {
  id: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status?: string | null;
  entry_kind?: string | null;
  staff_id?: string | null;
  staff_name?: string | null;
};

export type GapComputeOptions = {
  minGapMinutes?: number;
  dateYmd?: string;
  weekdayHours?: WeekdayBusinessHour[];
};

function timeToMinutes(t: string): number {
  const [h, m] = String(t || '0:0').split(':').map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function isAppointmentEntry(r: { entry_kind?: string | null }): boolean {
  return (r.entry_kind || 'appointment') === 'appointment';
}

function pushGap(
  gaps: AppointmentGap[],
  staffKey: string,
  staffName: string,
  startM: number,
  endM: number,
  minGapMinutes: number,
  tag: string
) {
  const gapMin = endM - startM;
  if (gapMin < minGapMinutes) return;
  gaps.push({
    id: `gap-${staffKey}-${tag}-${startM}-${endM}`,
    staffKey,
    staffName,
    startTime: minutesToTime(startM),
    endTime: minutesToTime(endM),
    minutes: gapMin,
  });
}

export function computeAppointmentGapsForDay(
  reservations: ReservationLike[],
  options?: GapComputeOptions
): AppointmentGap[] {
  const minGapMinutes = options?.minGapMinutes ?? GAP_DISPLAY_MIN_MINUTES;
  const dateYmd = options?.dateYmd?.slice(0, 10);
  const bounds =
    dateYmd && options?.weekdayHours?.length
      ? businessBoundsForDate(dateYmd, options.weekdayHours)
      : null;

  const appts = reservations.filter((r) => isAppointmentEntry(r) && r.status !== 'cancelled');
  const byStaff = new Map<string, ReservationLike[]>();

  for (const r of appts) {
    const key = r.staff_id || r.staff_name || '_';
    const arr = byStaff.get(key) || [];
    arr.push(r);
    byStaff.set(key, arr);
  }

  const gaps: AppointmentGap[] = [];

  for (const [staffKey, items] of byStaff) {
    items.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    const staffName = items[0]?.staff_name || items[items.length - 1]?.staff_name || '';

    if (bounds && items.length > 0) {
      const firstStart = timeToMinutes(items[0].start_time);
      const lastEnd = timeToMinutes(items[items.length - 1].end_time);
      pushGap(gaps, staffKey, staffName, bounds.startM, firstStart, minGapMinutes, 'open');
      pushGap(gaps, staffKey, staffName, lastEnd, bounds.endM, minGapMinutes, 'close');
    }

    for (let i = 0; i < items.length - 1; i++) {
      const prev = items[i];
      const next = items[i + 1];
      const endM = timeToMinutes(prev.end_time);
      const startM = timeToMinutes(next.start_time);
      pushGap(
        gaps,
        staffKey,
        prev.staff_name || next.staff_name || staffName,
        endM,
        startM,
        minGapMinutes,
        `mid-${prev.id}-${next.id}`
      );
    }
  }

  gaps.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  return gaps;
}

export function buildAppointmentDayTimeline(
  reservations: ReservationLike[],
  options?: GapComputeOptions
): DayTimelineItem[] {
  const gaps = computeAppointmentGapsForDay(reservations, options);
  const items: DayTimelineItem[] = [];

  for (const r of reservations) {
    if (!isAppointmentEntry(r)) continue;
    items.push({
      kind: 'reservation',
      sortMin: timeToMinutes(r.start_time),
      reservation: r,
    });
  }
  for (const g of gaps) {
    items.push({ kind: 'gap', sortMin: timeToMinutes(g.startTime), gap: g });
  }

  items.sort((a, b) => a.sortMin - b.sortMin || (a.kind === 'reservation' ? 0 : 1));
  return items;
}

export function gapChipLabel(gap: AppointmentGap): string {
  const staff = gap.staffName ? ` / ${gap.staffName}` : '';
  return `Vac. ${gap.minutes}分 ${gap.startTime}-${gap.endTime}${staff}`;
}
