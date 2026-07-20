import { functionsBaseUrl, supabase } from './supabase';
import type { GreetingSlot, GreetingVideoItem, GreetingVideoRow, RoomGreetingOverrideRow } from './greetingVideos';
import { DEFAULT_GREETING_TITLES } from './greetingVideos';
import type { SubRoomItem } from './subRooms';
import { loadSession, type CareSession } from './session';
import {
  DEFAULT_WATCH_TOP_TITLE,
  defaultStudyRoomTitle,
  type StudyItem,
  type StudyItemRow,
  type StudyRoomKey,
  type StudyRoomSummary,
} from './studyRoom';
import {
  DEFAULT_PROGRAM_DEFS,
  isProgramTier,
  normalizeAllowedTiers,
  PROGRAM_TIER_CODES,
  type ProgramDef,
  type ProgramItemAccess,
  type ProgramItemRule,
  type ProgramTier,
} from './programTiers';
import {
  DEFAULT_WATCH_LAYOUT_KEYS,
  normalizeWatchLayoutKeys,
  type WatchLayoutItemKey,
  type WatchLayoutRow,
} from './watchLayout';

export type CareVideoItem = {
  id: string;
  title: string;
  description: string;
  duration_seconds: number | null;
  uploaded_at: string;
  sort_order: number;
  sub_room_slot: number;
};

export type CareRoomRow = {
  id: string;
  room_code: string;
  member_name: string;
  customer_number: string | null;
  program_tier: ProgramTier;
  is_active: boolean;
  password_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type CareRoomVideoRow = CareVideoItem & {
  room_id: string;
  storage_path: string;
  file_size: number | null;
  is_published: boolean;
};

function parseRpcError(message: string): string {
  if (message.includes('invalid credentials')) return '部屋コードまたは入室パスが正しくありません';
  if (message.includes('session expired')) return 'セッションの有効期限が切れました。再度入室パスを入力してください';
  if (message.includes('staff only')) return 'スタッフ権限が必要です';
  return message;
}

export async function peekRoomMember(roomCode: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('care_room_peek_member', {
    p_room_code: roomCode.trim(),
  });
  if (error) return null;
  const row = data as { member_name?: string | null; found?: boolean };
  if (!row?.found || !row.member_name?.trim()) return null;
  return row.member_name.trim();
}

function toCareSession(
  row: {
    session_token: string;
    member_name: string;
    room_code: string;
    expires_at: string;
    program_tier?: string;
    staff_preview?: boolean;
    admin_room_id?: string;
  },
  preserve?: Pick<CareSession, 'staffPreview' | 'adminRoomId'>
): CareSession {
  return {
    sessionToken: row.session_token,
    memberName: row.member_name,
    roomCode: row.room_code,
    expiresAt: row.expires_at,
    programTier: isProgramTier(row.program_tier) ? row.program_tier : 'E',
    staffPreview: row.staff_preview === true || preserve?.staffPreview === true,
    adminRoomId: row.admin_room_id || preserve?.adminRoomId,
  };
}

export async function loginRoom(roomCode: string, password: string): Promise<CareSession> {
  const { data, error } = await supabase.rpc('care_room_login', {
    p_room_code: roomCode.trim(),
    p_password: password.trim(),
  });
  if (error) throw new Error(parseRpcError(error.message));
  return toCareSession(
    data as {
      session_token: string;
      member_name: string;
      room_code: string;
      expires_at: string;
      program_tier?: string;
    }
  );
}

export async function validateSession(sessionToken: string): Promise<CareSession> {
  const existing = loadSession();
  const { data, error } = await supabase.rpc('care_room_validate_session', {
    p_session_token: sessionToken,
  });
  if (error) throw new Error(parseRpcError(error.message));
  return toCareSession(
    data as {
      session_token: string;
      member_name: string;
      room_code: string;
      expires_at: string;
      program_tier?: string;
    },
    {
      staffPreview: existing?.staffPreview,
      adminRoomId: existing?.adminRoomId,
    }
  );
}

export async function adminStartRoomPreview(roomId: string): Promise<CareSession> {
  const { data, error } = await supabase.rpc('care_admin_start_room_preview', {
    p_room_id: roomId,
  });
  if (error) throw new Error(parseRpcError(error.message));
  return toCareSession(
    data as {
      session_token: string;
      member_name: string;
      room_code: string;
      expires_at: string;
      program_tier?: string;
      staff_preview?: boolean;
      admin_room_id?: string;
    }
  );
}

export async function listMemberSubRooms(sessionToken: string) {
  const { data, error } = await supabase.rpc('care_room_list_sub_rooms', {
    p_session_token: sessionToken,
  });
  if (error) throw new Error(parseRpcError(error.message));
  return (data || []) as SubRoomItem[];
}

export async function listMemberVideos(sessionToken: string, subRoomSlot?: number): Promise<CareVideoItem[]> {
  const { data, error } = await supabase.rpc('care_room_list_videos', {
    p_session_token: sessionToken,
    p_sub_room_slot: subRoomSlot ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message));
  return ((data || []) as CareVideoItem[]).map((v) => ({
    ...v,
    sub_room_slot: v.sub_room_slot ?? 1,
  }));
}

export async function listMemberGreetingVideos(sessionToken: string): Promise<GreetingVideoItem[]> {
  const { data, error } = await supabase.rpc('care_room_list_greeting_videos', {
    p_session_token: sessionToken,
  });
  if (error) throw new Error(parseRpcError(error.message));
  return (data || []) as GreetingVideoItem[];
}

export async function listMemberWatchLayout(sessionToken: string): Promise<WatchLayoutItemKey[]> {
  try {
    const { data, error } = await supabase.rpc('care_room_list_watch_layout', {
      p_session_token: sessionToken,
    });
    if (error) throw error;
    return normalizeWatchLayoutKeys((data || []) as WatchLayoutRow[]);
  } catch {
    return [...DEFAULT_WATCH_LAYOUT_KEYS];
  }
}

export async function listMemberItemAccess(
  sessionToken: string
): Promise<{ programTier: ProgramTier; items: ProgramItemAccess[] }> {
  try {
    const { data, error } = await supabase.rpc('care_room_list_item_access', {
      p_session_token: sessionToken,
    });
    if (error) throw error;
    const row = data as {
      program_tier?: string;
      items?: { item_key?: string; allowed_tiers?: unknown; unlocked?: boolean }[];
    };
    const items = (row?.items || [])
      .filter((i) => i?.item_key)
      .map((i) => ({
        item_key: i.item_key as string,
        allowed_tiers: normalizeAllowedTiers(i.allowed_tiers),
        unlocked: Boolean(i.unlocked),
      }));
    return {
      programTier: isProgramTier(row?.program_tier) ? row.program_tier : 'E',
      items,
    };
  } catch {
    return {
      programTier: 'E',
      items: DEFAULT_WATCH_LAYOUT_KEYS.map((item_key) => ({
        item_key,
        allowed_tiers: [...PROGRAM_TIER_CODES],
        unlocked: true,
      })),
    };
  }
}

export async function getMemberStudyRoom(
  sessionToken: string,
  roomKey: StudyRoomKey = 'study'
): Promise<StudyRoomSummary> {
  const { data, error } = await supabase.rpc('care_room_get_study_room', {
    p_session_token: sessionToken,
    p_room_key: roomKey,
  });
  if (error) throw new Error(parseRpcError(error.message));
  const row = data as StudyRoomSummary;
  return {
    title: row?.title?.trim() || defaultStudyRoomTitle(roomKey),
    item_count: row?.item_count ?? 0,
    room_key: roomKey,
  };
}

export async function listMemberStudyItems(
  sessionToken: string,
  roomKey: StudyRoomKey = 'study'
): Promise<StudyItem[]> {
  const { data, error } = await supabase.rpc('care_room_list_study_items', {
    p_session_token: sessionToken,
    p_room_key: roomKey,
  });
  if (error) throw new Error(parseRpcError(error.message));
  return (data || []) as StudyItem[];
}

export async function getMemberWatchTopTitle(sessionToken: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('care_room_get_watch_top_title', {
      p_session_token: sessionToken,
    });
    if (error) throw error;
    return (typeof data === 'string' ? data : '').trim() || DEFAULT_WATCH_TOP_TITLE;
  } catch {
    return DEFAULT_WATCH_TOP_TITLE;
  }
}

export async function fetchMaterialUrl(sessionToken: string, itemId: string): Promise<string> {
  const base = functionsBaseUrl();
  const res = await fetch(`${base}/care-material-access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ session_token: sessionToken, item_id: itemId }),
  });
  const json = (await res.json()) as { signed_url?: string; error?: string };
  if (!res.ok || !json.signed_url) {
    throw new Error(json.error || '資料URLの取得に失敗しました');
  }
  return json.signed_url;
}

export async function logoutRoom(sessionToken: string) {
  await supabase.rpc('care_room_logout', { p_session_token: sessionToken });
}

export async function fetchPlaybackUrl(
  sessionToken: string,
  videoId: string,
  videoKind: 'room' | 'greeting' = 'room'
): Promise<string> {
  const base = functionsBaseUrl();
  const res = await fetch(`${base}/care-video-playback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ session_token: sessionToken, video_id: videoId, video_kind: videoKind }),
  });
  const json = (await res.json()) as { signed_url?: string; error?: string };
  if (!res.ok || !json.signed_url) {
    throw new Error(json.error || '動画URLの取得に失敗しました');
  }
  return json.signed_url;
}

export async function isStaffUser(): Promise<boolean> {
  const { data, error } = await supabase.rpc('care_is_staff');
  if (error) return false;
  return Boolean(data);
}

export async function adminListRooms(): Promise<CareRoomRow[]> {
  const withTier = await supabase
    .from('care_member_rooms')
    .select(
      'id, room_code, member_name, customer_number, program_tier, is_active, password_updated_at, created_at, updated_at'
    )
    .order('member_name');

  if (!withTier.error) {
    return ((withTier.data || []) as CareRoomRow[]).map((r) => ({
      ...r,
      program_tier: isProgramTier(r.program_tier) ? r.program_tier : 'E',
    }));
  }

  // program_tier 列未適用時のフォールバック
  const { data, error } = await supabase
    .from('care_member_rooms')
    .select('id, room_code, member_name, customer_number, is_active, password_updated_at, created_at, updated_at')
    .order('member_name');
  if (error) throw new Error(error.message);
  return ((data || []) as Omit<CareRoomRow, 'program_tier'>[]).map((r) => ({
    ...r,
    program_tier: 'E' as ProgramTier,
  }));
}

export async function adminListRoomVideos(roomId: string): Promise<CareRoomVideoRow[]> {
  const { data, error } = await supabase
    .from('care_room_videos')
    .select('*')
    .eq('room_id', roomId)
    .order('sort_order', { ascending: false })
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as CareRoomVideoRow[];
}

export async function adminCreateRoom(
  memberName: string,
  roomCode: string,
  password: string,
  customerNumber?: string,
  programTier: ProgramTier = 'E'
): Promise<string> {
  const { data, error } = await supabase.rpc('care_admin_create_room', {
    p_member_name: memberName,
    p_room_code: roomCode,
    p_password: password,
    p_customer_number: customerNumber || null,
    p_program_tier: programTier,
  });
  if (error) throw new Error(parseRpcError(error.message));
  return data as string;
}

export async function adminGenerateRoomCode(memberName: string): Promise<string> {
  const { data, error } = await supabase.rpc('care_admin_generate_room_code', {
    p_member_name: memberName,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function adminSetRoomPassword(roomId: string, password: string) {
  const { error } = await supabase.rpc('care_admin_set_room_password', {
    p_room_id: roomId,
    p_password: password,
  });
  if (error) throw new Error(parseRpcError(error.message));
}

export async function adminUpdateRoom(
  roomId: string,
  patch: Partial<Pick<CareRoomRow, 'member_name' | 'customer_number' | 'is_active' | 'room_code' | 'program_tier'>>
) {
  const { error } = await supabase.from('care_member_rooms').update(patch).eq('id', roomId);
  if (error) throw new Error(error.message);
}

export async function adminListProgramDefs(): Promise<ProgramDef[]> {
  try {
    const { data, error } = await supabase.rpc('care_admin_list_program_defs');
    if (error) throw error;
    const rows = (data || []) as ProgramDef[];
    if (!rows.length) return [...DEFAULT_PROGRAM_DEFS];
    return PROGRAM_TIER_CODES.map((code) => {
      const found = rows.find((r) => r.code === code);
      return {
        code,
        display_name: found?.display_name?.trim() || code,
        sort_order: found?.sort_order,
        updated_at: found?.updated_at,
      };
    });
  } catch {
    return [...DEFAULT_PROGRAM_DEFS];
  }
}

export async function adminSaveProgramDefs(defs: { code: ProgramTier; display_name: string }[]) {
  const { error } = await supabase.rpc('care_admin_save_program_defs', {
    p_defs: defs,
  });
  if (error) throw new Error(parseRpcError(error.message));
}

export async function adminListProgramRules(): Promise<ProgramItemRule[]> {
  try {
    const { data, error } = await supabase.rpc('care_admin_list_program_rules');
    if (error) throw error;
    return ((data || []) as { item_key?: string; allowed_tiers?: unknown; updated_at?: string }[])
      .filter((r) => r?.item_key)
      .map((r) => ({
        item_key: r.item_key as string,
        allowed_tiers: normalizeAllowedTiers(r.allowed_tiers),
        updated_at: r.updated_at,
      }));
  } catch {
    return DEFAULT_WATCH_LAYOUT_KEYS.map((item_key) => ({
      item_key,
      allowed_tiers: [...PROGRAM_TIER_CODES],
    }));
  }
}

export async function adminSaveProgramRules(rules: { item_key: string; allowed_tiers: ProgramTier[] }[]) {
  const { error } = await supabase.rpc('care_admin_save_program_rules', {
    p_rules: rules,
  });
  if (error) throw new Error(parseRpcError(error.message));
}

export async function adminDeleteRoom(roomId: string) {
  const videos = await adminListRoomVideos(roomId);
  const paths = videos.map((v) => v.storage_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from('care-videos').remove(paths);
  }
  const { error } = await supabase.from('care_member_rooms').delete().eq('id', roomId);
  if (error) throw new Error(error.message);
}

export async function adminUpdateVideoMeta(
  videoId: string,
  patch: Partial<Pick<CareRoomVideoRow, 'title' | 'description'>>
) {
  const update: Record<string, string> = {};
  if (patch.title !== undefined) update.title = patch.title.trim() || 'セルフケア動画';
  if (patch.description !== undefined) update.description = patch.description.trim();
  const { error } = await supabase.from('care_room_videos').update(update).eq('id', videoId);
  if (error) throw new Error(error.message);
}

export async function adminListSubRoomMaster() {
  const { data, error } = await supabase.rpc('care_admin_list_sub_room_master');
  if (error) throw new Error(parseRpcError(error.message));
  return (data || []) as { slot_number: number; title: string; updated_at: string }[];
}

export async function adminUpdateSubRoomTitle(slotNumber: number, title: string) {
  const { error } = await supabase.rpc('care_admin_update_sub_room_title', {
    p_slot_number: slotNumber,
    p_title: title,
  });
  if (error) throw new Error(parseRpcError(error.message));
}

export async function adminListGreetingVideos(): Promise<GreetingVideoRow[]> {
  const { data, error } = await supabase
    .from('care_greeting_videos')
    .select('slot_code, id, title, storage_path, file_size, is_published, uploaded_at, updated_at')
    .order('slot_code');
  if (error) throw new Error(error.message);
  return (data || []) as GreetingVideoRow[];
}

export async function adminUpdateGreetingTitle(slot: GreetingSlot, title: string) {
  const { error } = await supabase
    .from('care_greeting_videos')
    .update({ title: title.trim(), updated_at: new Date().toISOString() })
    .eq('slot_code', slot);
  if (error) throw new Error(error.message);
}

export async function adminUploadGreetingVideo(slot: GreetingSlot, file: File, title: string) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const videoId = crypto.randomUUID();
  const storagePath = `greeting/${slot}/${videoId}.${ext}`;

  const existing = await adminListGreetingVideos();
  const row = existing.find((g) => g.slot_code === slot);
  const oldPath = row?.storage_path;

  const { error: upErr } = await supabase.storage.from('care-videos').upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'video/mp4',
  });
  if (upErr) throw new Error(upErr.message);

  const { error: dbErr } = await supabase
    .from('care_greeting_videos')
    .update({
      id: videoId,
      title: title.trim() || DEFAULT_GREETING_TITLES[slot],
      storage_path: storagePath,
      file_size: file.size,
      is_published: true,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('slot_code', slot);

  if (dbErr) {
    await supabase.storage.from('care-videos').remove([storagePath]);
    throw new Error(dbErr.message);
  }

  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from('care-videos').remove([oldPath]);
  }
}

export async function adminDeleteGreetingVideo(slot: GreetingSlot) {
  const rows = await adminListGreetingVideos();
  const row = rows.find((g) => g.slot_code === slot);
  if (!row?.storage_path) return;

  const { error } = await supabase
    .from('care_greeting_videos')
    .update({
      storage_path: null,
      file_size: null,
      is_published: false,
      uploaded_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('slot_code', slot);
  if (error) throw new Error(error.message);
  await supabase.storage.from('care-videos').remove([row.storage_path]);
}

export async function adminListWatchLayout(): Promise<WatchLayoutItemKey[]> {
  try {
    const { data, error } = await supabase.rpc('care_admin_list_watch_layout');
    if (error) throw error;
    return normalizeWatchLayoutKeys((data || []) as WatchLayoutRow[]);
  } catch {
    return [...DEFAULT_WATCH_LAYOUT_KEYS];
  }
}

export async function adminSaveWatchLayout(itemKeys: WatchLayoutItemKey[]) {
  const { error } = await supabase.rpc('care_admin_save_watch_layout', {
    p_item_keys: itemKeys,
  });
  if (error) throw new Error(parseRpcError(error.message));
}

const STUDY_SETTING_IDS: Record<StudyRoomKey, number> = { study: 1, study2: 2 };

export async function adminGetStudyRoomTitle(roomKey: StudyRoomKey = 'study'): Promise<string> {
  const { data, error } = await supabase
    .from('care_study_settings')
    .select('title')
    .eq('room_key', roomKey)
    .maybeSingle();
  if (error) {
    // room_key 列がまだない環境向けフォールバック
    if (roomKey === 'study') {
      const fallback = await supabase.from('care_study_settings').select('title').eq('id', 1).maybeSingle();
      if (fallback.error) throw new Error(fallback.error.message);
      return fallback.data?.title?.trim() || defaultStudyRoomTitle(roomKey);
    }
    throw new Error(error.message);
  }
  return data?.title?.trim() || defaultStudyRoomTitle(roomKey);
}

export async function adminUpdateStudyRoomTitle(roomKey: StudyRoomKey, title: string) {
  const trimmed = title.trim() || defaultStudyRoomTitle(roomKey);
  const { error } = await supabase.from('care_study_settings').upsert({
    id: STUDY_SETTING_IDS[roomKey],
    room_key: roomKey,
    title: trimmed,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function adminGetWatchTopTitle(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('care_watch_ui_settings')
      .select('top_title')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return data?.top_title?.trim() || DEFAULT_WATCH_TOP_TITLE;
  } catch {
    return DEFAULT_WATCH_TOP_TITLE;
  }
}

export async function adminUpdateWatchTopTitle(title: string) {
  const trimmed = title.trim() || DEFAULT_WATCH_TOP_TITLE;
  const { error } = await supabase.from('care_watch_ui_settings').upsert({
    id: 1,
    top_title: trimmed,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function adminListStudyItems(
  roomKey: StudyRoomKey = 'study',
  memberRoomId?: string | null
): Promise<StudyItemRow[]> {
  let query = supabase
    .from('care_study_items')
    .select('*')
    .eq('room_key', roomKey)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (memberRoomId) {
    query = query.eq('member_room_id', memberRoomId);
  } else {
    query = query.is('member_room_id', null);
  }

  const { data, error } = await query;
  if (error) {
    // member_room_id / room_key 未適用時は study マスターのみ全件
    if (!memberRoomId && roomKey === 'study') {
      const fallback = await supabase
        .from('care_study_items')
        .select('*')
        .order('sort_order', { ascending: false })
        .order('created_at', { ascending: false });
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data || []) as StudyItemRow[];
    }
    throw new Error(error.message);
  }
  return (data || []) as StudyItemRow[];
}

export async function adminCreateStudyLink(
  roomKey: StudyRoomKey,
  title: string,
  externalUrl: string,
  memberRoomId?: string | null
) {
  const url = externalUrl.trim();
  if (!title.trim()) throw new Error('タイトルを入力してください');
  if (!url) throw new Error('URLを入力してください');
  if (!/^https?:\/\//i.test(url)) throw new Error('URLは http:// または https:// で始めてください');

  const { error } = await supabase.from('care_study_items').insert({
    item_type: 'link',
    title: title.trim(),
    external_url: url,
    room_key: roomKey,
    member_room_id: memberRoomId || null,
    is_published: true,
    sort_order: Date.now() % 1000000000,
  });
  if (error) throw new Error(error.message);
}

export async function adminUploadStudyFile(
  roomKey: StudyRoomKey,
  itemType: 'image' | 'pdf',
  title: string,
  file: File,
  memberRoomId?: string | null
) {
  if (!title.trim()) throw new Error('タイトルを入力してください');
  if (!file) throw new Error('ファイルを選択してください');
  if (file.size > 50 * 1024 * 1024) throw new Error('ファイルは50MB以下にしてください');

  const ext = file.name.split('.').pop()?.toLowerCase() || (itemType === 'pdf' ? 'pdf' : 'jpg');
  const itemId = crypto.randomUUID();
  const storagePath = memberRoomId
    ? `room/${memberRoomId}/${itemType}/${itemId}.${ext}`
    : `${itemType}/${itemId}.${ext}`;

  const { error: upErr } = await supabase.storage.from('care-materials').upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || (itemType === 'pdf' ? 'application/pdf' : 'image/jpeg'),
  });
  if (upErr) throw new Error(upErr.message);

  const { error: dbErr } = await supabase.from('care_study_items').insert({
    id: itemId,
    item_type: itemType,
    title: title.trim() || file.name,
    storage_path: storagePath,
    file_size: file.size,
    room_key: roomKey,
    member_room_id: memberRoomId || null,
    is_published: true,
    sort_order: Date.now() % 1000000000,
  });
  if (dbErr) {
    await supabase.storage.from('care-materials').remove([storagePath]);
    throw new Error(dbErr.message);
  }
}

export async function adminUpdateStudyItem(
  itemId: string,
  patch: Partial<Pick<StudyItemRow, 'title' | 'external_url' | 'is_published' | 'sort_order'>>
) {
  const update: Record<string, string | number | boolean | null> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) update.title = patch.title.trim() || '資料';
  if (patch.external_url !== undefined) {
    const url = patch.external_url?.trim() || null;
    if (url && !/^https?:\/\//i.test(url)) throw new Error('URLは http:// または https:// で始めてください');
    update.external_url = url;
  }
  if (patch.is_published !== undefined) update.is_published = patch.is_published;
  if (patch.sort_order !== undefined) update.sort_order = patch.sort_order;

  const { error } = await supabase.from('care_study_items').update(update).eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function adminDeleteStudyItem(item: StudyItemRow) {
  const { error } = await supabase.from('care_study_items').delete().eq('id', item.id);
  if (error) throw new Error(error.message);
  if (item.storage_path) {
    await supabase.storage.from('care-materials').remove([item.storage_path]);
  }
}

export async function adminMoveStudyItem(
  roomKey: StudyRoomKey,
  itemId: string,
  direction: 'up' | 'down',
  memberRoomId?: string | null
) {
  const items = await adminListStudyItems(roomKey, memberRoomId);
  const index = items.findIndex((i) => i.id === itemId);
  if (index < 0) return;
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= items.length) return;

  const a = items[index];
  const b = items[swapWith];
  await Promise.all([
    adminUpdateStudyItem(a.id, { sort_order: b.sort_order }),
    adminUpdateStudyItem(b.id, { sort_order: a.sort_order }),
  ]);
}

export async function adminListRoomGreetingOverrides(roomId: string): Promise<RoomGreetingOverrideRow[]> {
  const { data, error } = await supabase
    .from('care_room_greeting_overrides')
    .select('*')
    .eq('room_id', roomId);
  if (error) throw new Error(error.message);
  return (data || []) as RoomGreetingOverrideRow[];
}

export async function adminUploadRoomGreetingOverride(
  roomId: string,
  slot: GreetingSlot,
  file: File,
  title: string
) {
  if (!file) throw new Error('動画ファイルを選択してください');
  if (file.size > 500 * 1024 * 1024) throw new Error('ファイルは500MB以下にしてください');

  const existing = (await adminListRoomGreetingOverrides(roomId)).find((r) => r.slot_code === slot);
  const oldPath = existing?.storage_path || null;
  const videoId = existing?.id || crypto.randomUUID();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const storagePath = `greeting-override/${roomId}/${slot}/${videoId}.${ext}`;

  const { error: upErr } = await supabase.storage.from('care-videos').upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'video/mp4',
  });
  if (upErr) throw new Error(upErr.message);

  const payload = {
    room_id: roomId,
    slot_code: slot,
    id: videoId,
    title: title.trim() || DEFAULT_GREETING_TITLES[slot],
    storage_path: storagePath,
    file_size: file.size,
    is_published: true,
    uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('care_room_greeting_overrides').upsert(payload, {
    onConflict: 'room_id,slot_code',
  });
  if (error) {
    await supabase.storage.from('care-videos').remove([storagePath]);
    throw new Error(error.message);
  }
  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from('care-videos').remove([oldPath]);
  }
}

export async function adminDeleteRoomGreetingOverride(roomId: string, slot: GreetingSlot) {
  const rows = await adminListRoomGreetingOverrides(roomId);
  const row = rows.find((r) => r.slot_code === slot);
  if (!row) return;

  const { error } = await supabase
    .from('care_room_greeting_overrides')
    .delete()
    .eq('room_id', roomId)
    .eq('slot_code', slot);
  if (error) throw new Error(error.message);
  if (row.storage_path) {
    await supabase.storage.from('care-videos').remove([row.storage_path]);
  }
}

export async function adminUpdateVideoSubRoom(videoId: string, subRoomSlot: number) {
  const { error } = await supabase
    .from('care_room_videos')
    .update({ sub_room_slot: subRoomSlot })
    .eq('id', videoId);
  if (error) throw new Error(error.message);
}

export async function adminUploadVideo(
  roomId: string,
  file: File,
  meta: { title: string; description?: string; sortOrder?: number; subRoomSlot?: number }
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const videoId = crypto.randomUUID();
  const storagePath = `${roomId}/${videoId}.${ext}`;

  const { error: upErr } = await supabase.storage.from('care-videos').upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'video/mp4',
  });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from('care_room_videos')
    .insert({
      id: videoId,
      room_id: roomId,
      title: meta.title.trim() || file.name,
      description: meta.description?.trim() || '',
      storage_path: storagePath,
      file_size: file.size,
      sort_order: meta.sortOrder ?? 0,
      sub_room_slot: meta.subRoomSlot ?? 1,
      is_published: true,
    })
    .select('id')
    .single();

  if (error) {
    await supabase.storage.from('care-videos').remove([storagePath]);
    throw new Error(error.message);
  }
  return data.id as string;
}

export async function adminToggleVideoPublish(videoId: string, isPublished: boolean) {
  const { error } = await supabase.from('care_room_videos').update({ is_published: isPublished }).eq('id', videoId);
  if (error) throw new Error(error.message);
}

export async function adminDeleteVideo(video: CareRoomVideoRow) {
  const { error: dbErr } = await supabase.from('care_room_videos').delete().eq('id', video.id);
  if (dbErr) throw new Error(dbErr.message);
  await supabase.storage.from('care-videos').remove([video.storage_path]);
}

export async function adminSignIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function adminSignOut() {
  await supabase.auth.signOut();
}
