export const DEFAULT_STUDY_ROOM_TITLE = '健康への勉強部屋';

export type StudyItemType = 'link' | 'image' | 'pdf';

export type StudyRoomSummary = {
  title: string;
  item_count: number;
};

export type StudyItem = {
  id: string;
  item_type: StudyItemType;
  title: string;
  external_url: string | null;
  has_file: boolean;
  created_at: string;
  sort_order: number;
};

export type StudyItemRow = {
  id: string;
  item_type: StudyItemType;
  title: string;
  external_url: string | null;
  storage_path: string | null;
  file_size: number | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export function studyItemTypeLabel(type: StudyItemType): string {
  if (type === 'link') return 'リンク';
  if (type === 'image') return '画像';
  return 'PDF';
}
