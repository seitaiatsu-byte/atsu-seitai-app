/** 予約時間の重なり判定（同一スタッフ・同日） */

export function timeToMinutes(t: string): number {
  const [h, m] = String(t || '0:0').split(':').map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(aEnd) > timeToMinutes(bStart);
}

type OverlapReservation = {
  id: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status?: string | null;
  entry_kind?: string | null;
  staff_id?: string | null;
  staff_name?: string | null;
  customers?: {
    customer_number?: string | null;
    name?: string | null;
  } | null;
};

function isAppointmentEntry(r: { entry_kind?: string | null }): boolean {
  return (r.entry_kind || 'appointment') === 'appointment';
}

function normalizeStaffKey(name: string): string {
  return String(name || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function sameStaff(
  staffId: string,
  staffName: string,
  record: Pick<OverlapReservation, 'staff_id' | 'staff_name'>
): boolean {
  if (staffId && record.staff_id === staffId) return true;
  const a = normalizeStaffKey(staffName);
  const b = normalizeStaffKey(record.staff_name || '');
  return Boolean(a && b && a === b);
}

export function findStaffAppointmentOverlap(
  list: OverlapReservation[],
  opts: {
    staffId: string;
    staffName: string;
    dateYmd: string;
    start: string;
    end: string;
    excludeId?: string | null;
  }
): OverlapReservation | null {
  const { staffId, staffName, dateYmd, start, end, excludeId } = opts;
  const hit = list.find((r) => {
    if (excludeId && r.id === excludeId) return false;
    if (!isAppointmentEntry(r) || r.status === 'cancelled') return false;
    if (String(r.reservation_date).slice(0, 10) !== dateYmd) return false;
    if (!sameStaff(staffId, staffName, r)) return false;
    return rangesOverlap(start, end, String(r.start_time), String(r.end_time));
  });
  return hit ?? null;
}

export function formatStaffOverlapAlert(
  staffName: string,
  conflict: OverlapReservation,
  newStart: string,
  newEnd: string
): string {
  const existingStart = String(conflict.start_time).slice(0, 5);
  const existingEnd = String(conflict.end_time).slice(0, 5);
  const cn = conflict.customers?.customer_number || '';
  const name = conflict.customers?.name || '';
  const who = [cn, name].filter(Boolean).join(' ') || '（顧客）';
  return (
    `同じスタッフ（${staffName}）の予約時間が重なっています。登録できません。\n\n` +
    `既存の予約: ${existingStart}〜${existingEnd} ${who}\n` +
    `今回の予約: ${newStart}〜${newEnd}\n\n` +
    `例: 10:00〜10:45 のあとに 10:40 開始など、時間帯がかぶる登録はできません。`
  );
}
