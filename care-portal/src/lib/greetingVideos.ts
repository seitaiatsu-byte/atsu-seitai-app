export const GREETING_SLOTS = ['A', 'B'] as const;
export type GreetingSlot = (typeof GREETING_SLOTS)[number];

export const DEFAULT_GREETING_TITLES: Record<GreetingSlot, string> = {
  A: '挨拶動画A',
  B: '会員以外への動画',
};

export type GreetingVideoItem = {
  slot_code: GreetingSlot;
  id: string;
  title: string;
  has_video: boolean;
  uploaded_at: string | null;
};

export type GreetingVideoRow = GreetingVideoItem & {
  storage_path: string | null;
  file_size: number | null;
  is_published: boolean;
  updated_at: string;
};
