import {
  breaksForDate,
  businessBoundsForDate,
  type BreakPeriod,
  type WeekdayBusinessHour,
} from './weekdayBusinessHours';

/** カレンダーに表示する空白時間の最小分（これ未満は表示しない。密着0分は除く） */
export const GAP_DISPLAY_MIN_MINUTES = 5;

/** Vac. を出す担当者名（このスタッフの予約枠だけで空白を計算。他担当は出さない） */
export const VAC_DISPLAY_STAFF_NAMES = ['あつ'] as const;

export type AppointmentGap = {
  id: string;
  staffKey: string;
  staffName: string;
  startTime: string;
  endTime: string;
  minutes: number;
};

export type BlockedPeriod = {
  id: string;
  startTime: string;
  endTime: string;
  minutes: number;
};

export type DayTimelineItem =
  | { kind: 'reservation'; sortMin: number; reservation: ReservationLike }
  | { kind: 'gap'; sortMin: number; gap: AppointmentGap }
  | { kind: 'blocked'; sortMin: number; blocked: BlockedPeriod };

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
  /** 未指定時は VAC_DISPLAY_STAFF_NAMES（あつ） */
  vacStaffNames?: readonly string[];
};

function isVacDisplayStaff(r: ReservationLike, names: readonly string[]): boolean {
  const n = (r.staff_name || '').trim();
  return n.length > 0 && names.includes(n);
}

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

function breakIntervalsMinutes(breaks: BreakPeriod[]): { startM: number; endM: number }[] {
  return breaks.map((b) => ({
    startM: timeToMinutes(b.start_time),
    endM: timeToMinutes(b.end_time),
  }));
}

function subtractIntervals(
  rangeStart: number,
  rangeEnd: number,
  blocks: { startM: number; endM: number }[]
): { startM: number; endM: number }[] {
  let segments = [{ startM: rangeStart, endM: rangeEnd }];
  const sorted = [...blocks].sort((a, b) => a.startM - b.startM);
  for (const b of sorted) {
    const next: { startM: number; endM: number }[] = [];
    for (const seg of segments) {
      if (b.endM <= seg.startM || b.startM >= seg.endM) {
        next.push(seg);
        continue;
      }
      if (b.startM > seg.startM) next.push({ startM: seg.startM, endM: b.startM });
      if (b.endM < seg.endM) next.push({ startM: b.endM, endM: seg.endM });
    }
    segments = next;
  }
  return segments.filter((s) => s.endM > s.startM);
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

function clipGapsExcludingBreaks(
  gaps: AppointmentGap[],
  breakMs: { startM: number; endM: number }[],
  minGapMinutes: number
): AppointmentGap[] {
  if (!breakMs.length) return gaps;
  const out: AppointmentGap[] = [];
  for (const g of gaps) {
    const startM = timeToMinutes(g.startTime);
    const endM = timeToMinutes(g.endTime);
    for (const seg of subtractIntervals(startM, endM, breakMs)) {
      pushGap(out, g.staffKey, g.staffName, seg.startM, seg.endM, minGapMinutes, `${g.id}-c`);
    }
  }
  return out;
}

export function buildBlockedPeriodsForDay(
  dateYmd: string | undefined,
  weekdayHours: WeekdayBusinessHour[] | undefined
): BlockedPeriod[] {
  if (!dateYmd || !weekdayHours?.length) return [];
  const breaks = breaksForDate(dateYmd, weekdayHours);
  return breaks.map((b, i) => {
    const startM = timeToMinutes(b.start_time);
    const endM = timeToMinutes(b.end_time);
    return {
      id: `blocked-${dateYmd}-${startM}-${endM}-${i}`,
      startTime: b.start_time,
      endTime: b.end_time,
      minutes: endM - startM,
    };
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
  const breakMs =
    dateYmd && options?.weekdayHours?.length
      ? breakIntervalsMinutes(breaksForDate(dateYmd, options.weekdayHours))
      : [];

  const vacNames = options?.vacStaffNames ?? VAC_DISPLAY_STAFF_NAMES;
  const appts = reservations.filter(
    (r) => isAppointmentEntry(r) && r.status !== 'cancelled' && isVacDisplayStaff(r, vacNames)
  );
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

  const clipped = clipGapsExcludingBreaks(gaps, breakMs, minGapMinutes);
  clipped.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  return clipped;
}

export function buildAppointmentDayTimeline(
  reservations: ReservationLike[],
  options?: GapComputeOptions
): DayTimelineItem[] {
  const dateYmd = options?.dateYmd?.slice(0, 10);
  const gaps = computeAppointmentGapsForDay(reservations, options);
  const blocked = buildBlockedPeriodsForDay(dateYmd, options?.weekdayHours);
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
  for (const b of blocked) {
    items.push({ kind: 'blocked', sortMin: timeToMinutes(b.startTime), blocked: b });
  }

  const kindOrder = (k: DayTimelineItem['kind']) => (k === 'reservation' ? 0 : k === 'blocked' ? 1 : 2);
  items.sort((a, b) => a.sortMin - b.sortMin || kindOrder(a.kind) - kindOrder(b.kind));
  return items;
}

export function gapChipLabel(gap: AppointmentGap): string {
  const staff = gap.staffName ? ` / ${gap.staffName}` : '';
  return `Vac. ${gap.minutes}分 ${gap.startTime}-${gap.endTime}${staff}`;
}

export function blockedChipLabel(blocked: BlockedPeriod): string {
  return `不可時間 ${blocked.minutes}分 ${blocked.startTime}-${blocked.endTime}`;
}

export function gapChipClass(): string {
  return 'bg-slate-200 border-slate-400 text-slate-700';
}

export function blockedChipClass(): string {
  return 'bg-zinc-800 border-zinc-950 text-zinc-100';
}
