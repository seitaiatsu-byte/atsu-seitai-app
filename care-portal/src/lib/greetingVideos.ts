export const GREETING_SLOTS = ['A', 'B', 'C'] as const;
export type GreetingSlot = (typeof GREETING_SLOTS)[number];

export const DEFAULT_GREETING_TITLES: Record<GreetingSlot, string> = {
  A: '挨拶動画A',
  B: '会員以外への動画',
  C: '挨拶動画C',
};

export const DEFAULT_GREETING_ZONE_LABEL = 'あいさつ';

export const GREETING_SLOT_MARK: Record<GreetingSlot, string> = {
  A: '🅰',
  B: '🅱',
  C: '🅲',
};

export function formatGreetingZoneLabel(slot: GreetingSlot, label?: string | null): string {
  const text = (label || DEFAULT_GREETING_ZONE_LABEL).trim() || DEFAULT_GREETING_ZONE_LABEL;
  return `${GREETING_SLOT_MARK[slot]}${text}`;
}

export type GreetingVideoItem = {
  slot_code: GreetingSlot;
  id: string;
  title: string;
  has_video: boolean;
  uploaded_at: string | null;
  is_room_override?: boolean;
};

export type GreetingVideoRow = GreetingVideoItem & {
  storage_path: string | null;
  file_size: number | null;
  is_published: boolean;
  updated_at: string;
};

export type RoomGreetingOverrideRow = {
  room_id: string;
  slot_code: GreetingSlot;
  id: string;
  title: string;
  storage_path: string | null;
  file_size: number | null;
  is_published: boolean;
  uploaded_at: string | null;
  updated_at: string;
};
