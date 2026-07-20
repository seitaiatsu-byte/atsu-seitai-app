export const DEFAULT_STUDY_ROOM_TITLE = '健康への勉強部屋';
export const DEFAULT_STUDY2_ROOM_TITLE = 'もうひとつの勉強部屋';
export const DEFAULT_WATCH_TOP_TITLE = 'セルフケア動画';

export type StudyRoomKey = 'study' | 'study2';

export const STUDY_ROOM_KEYS: StudyRoomKey[] = ['study', 'study2'];

export type StudyItemType = 'link' | 'image' | 'pdf';

export type StudyRoomSummary = {
  title: string;
  item_count: number;
  room_key?: StudyRoomKey;
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
  room_key?: StudyRoomKey;
  member_room_id?: string | null;
};

export function defaultStudyRoomTitle(roomKey: StudyRoomKey): string {
  return roomKey === 'study2' ? DEFAULT_STUDY2_ROOM_TITLE : DEFAULT_STUDY_ROOM_TITLE;
}

export function studyItemTypeLabel(type: StudyItemType): string {
  if (type === 'link') return 'リンク';
  if (type === 'image') return '画像';
  return 'PDF';
}
