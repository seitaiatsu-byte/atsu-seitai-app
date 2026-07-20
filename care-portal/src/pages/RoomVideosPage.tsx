import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Image, Lock, PlayCircle } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberPageShell from '../components/member/MemberPageShell';
import {
  fetchMaterialUrl,
  fetchPlaybackUrl,
  getMemberStudyRoom,
  getMemberWatchTopTitle,
  listMemberGreetingVideos,
  listMemberItemAccess,
  listMemberStudyItems,
  listMemberSubRooms,
  listMemberVideos,
  listMemberWatchLayout,
  logoutRoom,
  validateSession,
  type CareVideoItem,
} from '../lib/careApi';
import type { GreetingVideoItem } from '../lib/greetingVideos';
import { LOCKED_ITEM_MESSAGE } from '../lib/programTiers';
import { formatVideoCount, showsSubRoomNumber, type SubRoomItem } from '../lib/subRooms';
import { clearSession, loadLastRoomCode, loadSession, rememberLastRoomCode, saveSession } from '../lib/session';
import {
  DEFAULT_VIDEO_TITLE,
  DEFAULT_WATCH_TOP_TITLE,
  STUDY_ROOM_KEYS,
  defaultStudyRoomTitle,
  studyItemTypeLabel,
  type StudyItem,
  type StudyRoomKey,
  type StudyRoomSummary,
} from '../lib/studyRoom';
import {
  DEFAULT_WATCH_LAYOUT_KEYS,
  isStudyLayoutKey,
  lastStudyLayoutKey,
  parseGreetingSlot,
  parseSubRoomSlot,
  type WatchLayoutItemKey,
} from '../lib/watchLayout';

type Props = {
  onLogout: (roomCode?: string) => void;
};

type ActivePlayback = {
  id: string;
  title: string;
  kind: 'room' | 'greeting';
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

function GreetingVideoCard({
  greeting,
  locked,
  onPlay,
}: {
  greeting: GreetingVideoItem;
  locked?: boolean;
  onPlay: (video: ActivePlayback) => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={locked || !greeting.has_video}
        onClick={() => {
          if (locked || !greeting.has_video) return;
          onPlay({ id: greeting.id, title: greeting.title, kind: 'greeting' });
        }}
        className={`member-card w-full text-left px-4 py-4 flex items-center gap-4 min-h-[5rem] transition-colors ${
          locked
            ? 'bg-slate-200/80 border-slate-300 opacity-70 cursor-not-allowed grayscale'
            : 'hover:border-member-gold/45 active:bg-member-camel-light/50 disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        <span
          className={`shrink-0 w-10 h-10 rounded-full font-bold flex items-center justify-center text-lg ${
            locked ? 'bg-slate-300 text-slate-500' : 'bg-member-gold/20 text-member-gold-deep'
          }`}
        >
          {greeting.slot_code}
        </span>
        <div className={`member-icon-badge w-12 h-12 shrink-0 ${locked ? '!bg-slate-300 !text-slate-500' : ''}`}>
          {locked ? <Lock size={28} /> : <PlayCircle size={32} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-lg sm:text-xl leading-snug ${locked ? 'text-slate-500' : 'text-member-text'}`}>
            {greeting.title}
          </p>
          {!locked && greeting.has_video && greeting.uploaded_at && (
            <p className="text-base member-text-muted mt-1">{formatDate(greeting.uploaded_at)}</p>
          )}
          <p className={`text-sm font-bold mt-1 ${locked ? 'text-slate-500' : 'member-text-accent'}`}>
            {locked ? '鍵付き（プログラム対象外）' : greeting.has_video ? '▶ タップして再生' : '準備中です'}
          </p>
        </div>
      </button>
    </li>
  );
}

function SubRoomCard({
  subRoom,
  locked,
  onSelect,
}: {
  subRoom: SubRoomItem;
  locked?: boolean;
  onSelect: (slot: number) => void;
}) {
  const showNumber = showsSubRoomNumber(subRoom.slot_number);

  return (
    <li>
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          if (locked) return;
          onSelect(subRoom.slot_number);
        }}
        className={`sub-room-card member-card w-full text-left px-4 py-4 flex items-center gap-3 min-h-[4.5rem] transition-colors ${
          locked
            ? 'bg-slate-200/80 border-slate-300 opacity-70 cursor-not-allowed grayscale'
            : 'hover:border-member-gold/45 active:bg-member-camel-light/50'
        }`}
      >
        {showNumber ? (
          <span className={`sub-room-num shrink-0 ${locked ? '!bg-slate-300 !text-slate-500' : ''}`}>
            {subRoom.slot_number}
          </span>
        ) : (
          <span className="shrink-0 w-7" aria-hidden />
        )}
        <div className="sub-room-play shrink-0">
          {locked ? (
            <Lock size={26} className="text-slate-500" />
          ) : (
            <PlayCircle size={28} className="text-member-teal" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`font-bold text-base sm:text-lg leading-snug line-clamp-3 ${
              locked ? 'text-slate-500' : 'text-member-text'
            }`}
          >
            {subRoom.title}
          </p>
          <p className={`text-sm font-bold mt-1 ${locked ? 'text-slate-500' : 'member-text-accent'}`}>
            {locked ? '鍵付き（プログラム対象外）' : '▶ タップして動画一覧へ'}
          </p>
        </div>
        {!locked && (
          <div className="sub-room-count shrink-0">
            <span className="sub-room-count-num">{formatVideoCount(subRoom.video_count)}</span>
          </div>
        )}
      </button>
    </li>
  );
}

export default function RoomVideosPage({ onLogout }: Props) {
  const [session, setSession] = useState(loadSession);
  const [studyByKey, setStudyByKey] = useState<Partial<Record<StudyRoomKey, StudyRoomSummary>>>({});
  const [activeStudyKey, setActiveStudyKey] = useState<StudyRoomKey | null>(null);
  const [studyItems, setStudyItems] = useState<StudyItem[]>([]);
  const [watchTopTitle, setWatchTopTitle] = useState(DEFAULT_WATCH_TOP_TITLE);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewImageTitle, setPreviewImageTitle] = useState('');
  const [watchLayout, setWatchLayout] = useState<WatchLayoutItemKey[]>([...DEFAULT_WATCH_LAYOUT_KEYS]);
  const [itemUnlocked, setItemUnlocked] = useState<Record<string, boolean>>({});
  const [greetingVideos, setGreetingVideos] = useState<GreetingVideoItem[]>([]);
  const [subRooms, setSubRooms] = useState<SubRoomItem[]>([]);
  const [videos, setVideos] = useState<CareVideoItem[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeVideo, setActiveVideo] = useState<ActivePlayback | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [playbackLoading, setPlaybackLoading] = useState(false);

  const sessionToken = session?.sessionToken;
  const showStudyRoom = activeStudyKey !== null;
  const activeStudyRoom = activeStudyKey ? studyByKey[activeStudyKey] : null;
  const studySectionEndKey = useMemo(() => lastStudyLayoutKey(watchLayout), [watchLayout]);

  const isUnlocked = useCallback(
    (key: string) => itemUnlocked[key] !== false,
    [itemUnlocked]
  );

  const unlockedMapReady = useMemo(() => Object.keys(itemUnlocked).length > 0, [itemUnlocked]);

  const goToRoomLogin = useCallback((roomCode?: string) => {
    const code =
      roomCode?.trim() || loadSession()?.roomCode?.trim() || loadLastRoomCode() || undefined;
    if (code) {
      rememberLastRoomCode(code);
      window.location.href = `/r/${encodeURIComponent(code)}`;
      return;
    }
    setError('セッションが切れました。お渡しの専用リンク（/r/顧客番号）から開き直してください。');
  }, []);

  const refreshSubRooms = useCallback(async () => {
    const existing = loadSession();
    const token = sessionToken ?? existing?.sessionToken;
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const valid = await validateSession(token);
      const merged = {
        ...valid,
        staffPreview: existing?.staffPreview === true || valid.staffPreview === true,
        adminRoomId: existing?.adminRoomId || valid.adminRoomId,
      };
      saveSession(merged);
      setSession(merged);

      const [greetingsResult, roomsResult, layout, access] = await Promise.all([
        listMemberGreetingVideos(token).catch(() => [] as GreetingVideoItem[]),
        listMemberSubRooms(token).catch(() => [] as SubRoomItem[]),
        listMemberWatchLayout(token),
        listMemberItemAccess(token),
      ]);
      setGreetingVideos(greetingsResult);
      setSubRooms(roomsResult);
      setWatchLayout(layout);
      const unlockMap: Record<string, boolean> = {};
      for (const key of DEFAULT_WATCH_LAYOUT_KEYS) unlockMap[key] = true;
      for (const item of access.items) unlockMap[item.item_key] = item.unlocked;
      setItemUnlocked(unlockMap);
      if (access.programTier && merged.programTier !== access.programTier) {
        const next = { ...merged, programTier: access.programTier };
        saveSession(next);
        setSession(next);
      }
      try {
        const [studyResults, topTitle] = await Promise.all([
          Promise.all(
            STUDY_ROOM_KEYS.map(async (key) => {
              try {
                return [key, await getMemberStudyRoom(token, key)] as const;
              } catch {
                return [key, null] as const;
              }
            })
          ),
          getMemberWatchTopTitle(token),
        ]);
        const next: Partial<Record<StudyRoomKey, StudyRoomSummary>> = {};
        for (const [key, summary] of studyResults) {
          if (summary) next[key] = summary;
        }
        setStudyByKey(next);
        setWatchTopTitle(topTitle);
      } catch {
        setStudyByKey({});
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const isAuthError =
        message.includes('セッション') ||
        message.includes('入室パス') ||
        message.includes('expired') ||
        message.includes('inactive') ||
        message.includes('credentials');
      if (isAuthError) {
        const roomCode = existing?.roomCode || loadLastRoomCode() || undefined;
        const adminRoomId = existing?.adminRoomId;
        if (roomCode) rememberLastRoomCode(roomCode);
        clearSession();
        setSession(null);
        if (existing?.staffPreview && adminRoomId) {
          window.location.href = `/admin/rooms/${adminRoomId}`;
          return;
        }
        if (roomCode) {
          goToRoomLogin(roomCode);
          return;
        }
      }
      setError(message || '読み込みに失敗しました。もう一度リンクから開き直してください。');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, goToRoomLogin]);

  const loadVideosForSlot = useCallback(
    async (slot: number) => {
      const token = sessionToken ?? loadSession()?.sessionToken;
      if (!token) return;
      if (unlockedMapReady && !isUnlocked(`sub_${slot}`)) {
        setError(LOCKED_ITEM_MESSAGE);
        setSelectedSlot(null);
        setVideos([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        setVideos(await listMemberVideos(token, slot));
      } catch (err) {
        setError(err instanceof Error ? err.message : '動画の読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    },
    [sessionToken, unlockedMapReady, isUnlocked]
  );

  const loadStudyItems = useCallback(async () => {
    const token = sessionToken ?? loadSession()?.sessionToken;
    if (!token || !activeStudyKey) return;
    if (unlockedMapReady && !isUnlocked(activeStudyKey)) {
      setError(LOCKED_ITEM_MESSAGE);
      setActiveStudyKey(null);
      setStudyItems([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setStudyItems(await listMemberStudyItems(token, activeStudyKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : '資料の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, unlockedMapReady, isUnlocked, activeStudyKey]);

  useEffect(() => {
    if (!sessionToken) {
      goToRoomLogin();
      return;
    }
    void refreshSubRooms();
  }, [sessionToken, refreshSubRooms, goToRoomLogin]);

  useEffect(() => {
    if (selectedSlot !== null) {
      void loadVideosForSlot(selectedSlot);
    }
  }, [selectedSlot, loadVideosForSlot]);

  useEffect(() => {
    if (activeStudyKey) {
      void loadStudyItems();
    }
  }, [activeStudyKey, loadStudyItems]);

  const handleOpenStudyItem = async (item: StudyItem) => {
    const token = sessionToken ?? loadSession()?.sessionToken;
    if (!token) return;
    setError('');
    try {
      if (item.item_type === 'link') {
        if (!item.external_url) throw new Error('リンクがありません');
        window.open(item.external_url, '_blank', 'noopener,noreferrer');
        return;
      }
      const url = await fetchMaterialUrl(token, item.id);
      if (item.item_type === 'pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      setPreviewImageUrl(url);
      setPreviewImageTitle(item.title);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '資料を開けませんでした');
    }
  };

  const handlePlay = async (video: ActivePlayback) => {
    const token = sessionToken ?? loadSession()?.sessionToken;
    if (!token) return;
    setActiveVideo(video);
    setPlaybackUrl('');
    setPlaybackLoading(true);
    setError('');
    try {
      const url = await fetchPlaybackUrl(token, video.id, video.kind);
      setPlaybackUrl(url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '動画の準備に失敗しました。しばらくしてからもう一度タップしてください。');
      setActiveVideo(null);
    } finally {
      setPlaybackLoading(false);
    }
  };

  const handleLogout = async () => {
    const current = session || loadSession();
    const roomCode = current?.roomCode;
    const adminRoomId = current?.adminRoomId;
    const wasPreview = current?.staffPreview === true;
    if (sessionToken) {
      try {
        await logoutRoom(sessionToken);
      } catch {
        /* ignore */
      }
    }
    clearSession();
    if (wasPreview && adminRoomId) {
      window.location.href = `/admin/rooms/${adminRoomId}`;
      return;
    }
    onLogout(roomCode);
  };

  const handleBackToAdminEdit = async () => {
    const current = session || loadSession();
    const adminRoomId = current?.adminRoomId;
    if (sessionToken) {
      try {
        await logoutRoom(sessionToken);
      } catch {
        /* ignore */
      }
    }
    clearSession();
    if (adminRoomId) {
      window.location.href = `/admin/rooms/${adminRoomId}`;
      return;
    }
    window.location.href = '/admin/rooms';
  };

  const selectedSubRoom = selectedSlot !== null ? subRooms.find((s) => s.slot_number === selectedSlot) : null;

  const renderWatchEntry = (key: WatchLayoutItemKey) => {
    const locked = !isUnlocked(key);

    if (isStudyLayoutKey(key)) {
      const studyRoom = studyByKey[key];
      if (!studyRoom) return null;
      const isLastStudy = key === studySectionEndKey;
      return (
        <div key={key} className="space-y-4">
          <ul className="space-y-3">
            <li>
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (locked) return;
                  setActiveStudyKey(key);
                  setSelectedSlot(null);
                  setVideos([]);
                }}
                className={`member-card w-full text-left px-4 py-4 flex items-center gap-4 min-h-[5rem] transition-colors ${
                  locked
                    ? 'bg-slate-200/80 border-slate-300 opacity-70 cursor-not-allowed grayscale'
                    : 'hover:border-member-gold/45 active:bg-member-camel-light/50'
                }`}
              >
                <div className={`study-room-icon shrink-0 ${locked ? '!bg-slate-300 !text-slate-500' : ''}`}>
                  {locked ? <Lock size={26} strokeWidth={2.25} /> : <BookOpen size={28} strokeWidth={2.25} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-bold text-lg sm:text-xl leading-snug ${
                      locked ? 'text-slate-500' : 'text-member-text'
                    }`}
                  >
                    {studyRoom.title || defaultStudyRoomTitle(key)}
                  </p>
                  <p className={`text-sm font-bold mt-1 ${locked ? 'text-slate-500' : 'member-text-accent'}`}>
                    {locked ? '鍵付き（プログラム対象外）' : '▶ タップして資料一覧へ'}
                  </p>
                </div>
                {!locked && (
                  <div className="sub-room-count shrink-0">
                    <span className="sub-room-count-num">{Math.min(99, studyRoom.item_count)}件</span>
                  </div>
                )}
              </button>
            </li>
          </ul>
          {isLastStudy && (
            <>
              <div className="study-room-divider" aria-hidden />
              {watchTopTitle.trim() ? <h2 className="watch-top-title">{watchTopTitle.trim()}</h2> : null}
            </>
          )}
        </div>
      );
    }

    const greetingSlot = parseGreetingSlot(key);
    if (greetingSlot) {
      const greeting = greetingVideos.find((g) => g.slot_code === greetingSlot);
      if (!greeting) return null;
      return (
        <ul key={key} className="space-y-3">
          <GreetingVideoCard greeting={greeting} locked={locked} onPlay={(v) => void handlePlay(v)} />
        </ul>
      );
    }

    const slot = parseSubRoomSlot(key);
    if (slot == null) return null;
    const subRoom = subRooms.find((s) => s.slot_number === slot);
    if (!subRoom) return null;
    return (
      <ul key={key} className="space-y-3">
        <SubRoomCard subRoom={subRoom} locked={locked} onSelect={setSelectedSlot} />
      </ul>
    );
  };

  if (!session) {
    const lastRoomCode = loadLastRoomCode();
    return (
      <MemberPageShell>
        <MemberBrandHeader title="入室し直してください" subtitle="パスワードを入れ直して部屋へ入れます" />
        <main className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border-2 border-red-200 text-red-900 text-base px-4 py-4 leading-relaxed">
              {error}
            </div>
          )}
          <p className="text-base member-text-muted leading-relaxed">
            入室の有効期限は<strong>ログインから30日間</strong>です。切れたときは、もう一度パスワードを入れてください。
          </p>
          {lastRoomCode ? (
            <button
              type="button"
              onClick={() => goToRoomLogin(lastRoomCode)}
              className="member-btn-primary w-full py-4 text-lg"
            >
              ログイン画面へ（パスワード入力）
            </button>
          ) : (
            <p className="text-base member-text-muted leading-relaxed">
              お渡しした <strong>/r/顧客番号</strong> のリンクから開き直してください。
            </p>
          )}
        </main>
      </MemberPageShell>
    );
  }

  return (
    <MemberPageShell>
      <MemberBrandHeader
        sticky
        title={
          showStudyRoom
            ? activeStudyRoom?.title || (activeStudyKey ? defaultStudyRoomTitle(activeStudyKey) : '')
            : selectedSubRoom
              ? `${session.memberName} さんの動画`
              : `${session.memberName} さんの部屋`
        }
        subtitle={
          showStudyRoom
            ? '資料を選んでご覧ください'
            : selectedSubRoom
              ? selectedSubRoom.title
              : '見たいカテゴリ（小部屋）を選んでください'
        }
      >
        <div className="flex flex-wrap gap-2">
          {(selectedSlot !== null || showStudyRoom) && !activeVideo && (
            <button
              type="button"
              onClick={() => {
                setSelectedSlot(null);
                setVideos([]);
                setActiveStudyKey(null);
                setStudyItems([]);
                setPreviewImageUrl('');
                setPreviewImageTitle('');
              }}
              className="member-btn-secondary px-4 py-2.5 text-base"
            >
              ← 小部屋一覧へ
            </button>
          )}
          <button type="button" onClick={() => void refreshSubRooms()} className="member-btn-primary px-4 py-2.5 text-base">
            更新する
          </button>
          <button type="button" onClick={() => void handleLogout()} className="member-btn-secondary px-4 py-2.5 text-base">
            {session.staffPreview ? '確認を終了' : '終了する'}
          </button>
        </div>
      </MemberBrandHeader>

      {session.staffPreview && (
        <div className="bg-indigo-700 text-white px-4 py-3 safe-area-x">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <p className="text-sm font-bold flex-1">
              スタッフ確認中：{session.memberName} さんの部屋（会員と同じ見え方）
            </p>
            <button
              type="button"
              onClick={() => void handleBackToAdminEdit()}
              className="shrink-0 rounded-lg bg-white text-indigo-800 font-bold text-sm px-4 py-2"
            >
              ← スタッフの編集画面へ戻る
            </button>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div className="bg-member-gold-deep">
          <img src={previewImageUrl} alt={previewImageTitle} className="w-full max-h-[70vh] object-contain bg-black" />
          <div className="px-4 py-3 bg-member-gold-deep text-white flex items-center gap-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                setPreviewImageUrl('');
                setPreviewImageTitle('');
              }}
              className="member-btn-secondary px-3 py-2 text-base shrink-0 !text-member-gold-deep"
            >
              ← 一覧へ
            </button>
            <p className="text-base font-bold truncate flex-1">{previewImageTitle}</p>
          </div>
        </div>
      )}

      {activeVideo && (
        <div className="bg-member-gold-deep">
          {playbackLoading ? (
            <div className="aspect-video flex items-center justify-center text-white text-lg">動画を準備しています…</div>
          ) : playbackUrl ? (
            <VideoPlayer src={playbackUrl} title={activeVideo.title} />
          ) : null}
          <div className="px-4 py-3 bg-member-gold-deep text-white flex items-center gap-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                setActiveVideo(null);
                setPlaybackUrl('');
              }}
              className="member-btn-secondary px-3 py-2 text-base shrink-0 !text-member-gold-deep"
            >
              ← 一覧へ
            </button>
            <p className="text-base font-bold truncate flex-1">{activeVideo.title}</p>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 border-2 border-red-200 text-red-900 text-base px-4 py-4 leading-relaxed">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center member-text-muted text-lg py-12">読み込んでいます…</p>
        ) : showStudyRoom ? (
          studyItems.length === 0 ? (
            <div className="text-center py-10 px-4 member-card">
              <p className="font-bold text-xl text-member-text">まだ資料がありません</p>
              <p className="text-base member-text-muted mt-3 leading-relaxed">
                スタッフが資料を追加するまでお待ちください。
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {studyItems.map((item) => {
                const Icon =
                  item.item_type === 'link' ? ExternalLink : item.item_type === 'image' ? Image : FileText;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleOpenStudyItem(item)}
                      className="member-card w-full text-left px-4 py-4 flex items-center gap-4 hover:border-member-gold/45 active:bg-member-camel-light/50 min-h-[5rem] transition-colors"
                    >
                      <div className="member-icon-badge w-12 h-12 shrink-0">
                        <Icon size={28} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold member-text-accent">{studyItemTypeLabel(item.item_type)}</p>
                        <p className="font-bold text-lg sm:text-xl text-member-text leading-snug mt-0.5">
                          {item.title}
                        </p>
                        <p className="text-sm member-text-accent font-bold mt-1">
                          {item.item_type === 'link'
                            ? '▶ タップして記事を開く'
                            : item.item_type === 'pdf'
                              ? '▶ タップしてPDFを開く'
                              : '▶ タップして画像を見る'}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : selectedSlot === null ? (
          <div className="space-y-3">{watchLayout.map((key) => renderWatchEntry(key))}</div>
        ) : videos.length === 0 ? (
          <div className="text-center py-10 px-4 member-card">
            <p className="font-bold text-xl text-member-text">この小部屋にはまだ動画がありません</p>
            <p className="text-base member-text-muted mt-3 leading-relaxed">
              スタッフが動画を追加するまでお待ちください。
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedSlot(null);
                setVideos([]);
              }}
              className="member-btn-primary mt-5 px-6 py-3 text-lg"
            >
              小部屋一覧へ戻る
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => void handlePlay({ id: v.id, title: v.title || DEFAULT_VIDEO_TITLE, kind: 'room' })}
                  className="member-card w-full text-left px-4 py-4 flex items-center gap-4 hover:border-member-gold/45 active:bg-member-camel-light/50 min-h-[5rem] transition-colors"
                >
                  <div className="member-icon-badge w-12 h-12">
                    <PlayCircle size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-lg sm:text-xl text-member-text leading-snug">
                      {v.title || DEFAULT_VIDEO_TITLE}
                    </p>
                    <p className="text-base member-text-muted mt-1">{formatDate(v.uploaded_at)}</p>
                    <p className="text-sm member-text-accent font-bold mt-1">▶ タップして再生</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </MemberPageShell>
  );
}
