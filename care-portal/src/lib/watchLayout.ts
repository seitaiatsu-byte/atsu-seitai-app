import { DEFAULT_GREETING_TITLES, type GreetingSlot } from './greetingVideos';
import {
  DEFAULT_STUDY2_ROOM_TITLE,
  DEFAULT_STUDY_ROOM_TITLE,
  type StudyRoomKey,
} from './studyRoom';
import { DEFAULT_SUB_ROOM_TITLES, SUB_ROOM_COUNT, showsSubRoomNumber } from './subRooms';

export type WatchLayoutItemKey =
  | StudyRoomKey
  | `greeting_${GreetingSlot}`
  | `sub_${number}`;

export type WatchLayoutRow = {
  item_key: string;
  sort_order: number;
  updated_at?: string;
};

/** 現行UIと同じ初期並び（勉強部屋の直後に勉強部屋②） */
export const DEFAULT_WATCH_LAYOUT_KEYS: WatchLayoutItemKey[] = [
  'study',
  'study2',
  'greeting_A',
  ...Array.from({ length: 12 }, (_, i) => `sub_${i + 1}` as WatchLayoutItemKey),
  'greeting_C',
  ...Array.from({ length: 5 }, (_, i) => `sub_${16 + i}` as WatchLayoutItemKey),
  'greeting_B',
  'sub_13',
  'sub_14',
  'sub_15',
];

export function isStudyLayoutKey(key: string): key is StudyRoomKey {
  return key === 'study' || key === 'study2';
}

export function isWatchLayoutItemKey(key: string): key is WatchLayoutItemKey {
  if (isStudyLayoutKey(key)) return true;
  if (key === 'greeting_A' || key === 'greeting_B' || key === 'greeting_C') return true;
  const m = /^sub_(\d+)$/.exec(key);
  if (!m) return false;
  const n = Number(m[1]);
  return n >= 1 && n <= SUB_ROOM_COUNT;
}

export function parseSubRoomSlot(key: string): number | null {
  const m = /^sub_(\d+)$/.exec(key);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= SUB_ROOM_COUNT ? n : null;
}

export function parseGreetingSlot(key: string): GreetingSlot | null {
  if (key === 'greeting_A') return 'A';
  if (key === 'greeting_B') return 'B';
  if (key === 'greeting_C') return 'C';
  return null;
}

export function watchLayoutLabel(
  key: string,
  opts?: {
    studyTitle?: string;
    study2Title?: string;
    greetingTitles?: Partial<Record<GreetingSlot, string>>;
    subRoomTitles?: Record<number, string>;
  }
): string {
  if (key === 'study') return opts?.studyTitle?.trim() || DEFAULT_STUDY_ROOM_TITLE;
  if (key === 'study2') return opts?.study2Title?.trim() || DEFAULT_STUDY2_ROOM_TITLE;
  const g = parseGreetingSlot(key);
  if (g) return opts?.greetingTitles?.[g] || DEFAULT_GREETING_TITLES[g];
  const slot = parseSubRoomSlot(key);
  if (slot != null) {
    const title = opts?.subRoomTitles?.[slot] || DEFAULT_SUB_ROOM_TITLES[slot] || `小部屋${slot}`;
    if (showsSubRoomNumber(slot)) return `${slot}. ${title}`;
    return title;
  }
  return key;
}

export function watchLayoutKindLabel(key: string): string {
  if (key === 'study') return '勉強部屋';
  if (key === 'study2') return '勉強部屋②';
  const g = parseGreetingSlot(key);
  if (g) return `挨拶${g}`;
  const slot = parseSubRoomSlot(key);
  if (slot != null) return showsSubRoomNumber(slot) ? `小部屋${slot}` : `枠${slot}`;
  return '項目';
}

export function normalizeWatchLayoutKeys(rows: WatchLayoutRow[]): WatchLayoutItemKey[] {
  const fromDb = rows
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.item_key.localeCompare(b.item_key))
    .map((r) => r.item_key)
    .filter(isWatchLayoutItemKey);

  if (fromDb.length === 0) return [...DEFAULT_WATCH_LAYOUT_KEYS];

  const result = [...fromDb];
  for (const key of DEFAULT_WATCH_LAYOUT_KEYS) {
    if (result.includes(key)) continue;
    const defaultIndex = DEFAULT_WATCH_LAYOUT_KEYS.indexOf(key);
    let insertAt = result.length;
    for (let i = defaultIndex - 1; i >= 0; i--) {
      const prev = DEFAULT_WATCH_LAYOUT_KEYS[i];
      const idx = result.indexOf(prev);
      if (idx >= 0) {
        insertAt = idx + 1;
        break;
      }
    }
    result.splice(insertAt, 0, key);
  }
  return result;
}

/** 勉強部屋グループの最後のキー（区切り線を1本だけ引く用） */
export function lastStudyLayoutKey(keys: WatchLayoutItemKey[]): StudyRoomKey | null {
  let last: StudyRoomKey | null = null;
  for (const key of keys) {
    if (isStudyLayoutKey(key)) last = key;
  }
  return last;
}
