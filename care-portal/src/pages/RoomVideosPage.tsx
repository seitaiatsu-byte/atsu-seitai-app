import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { formatVideoCount, showsSubRoomNumber, parseSubRoomTitle, subRoomTitleAlignClass, type SubRoomItem } from '../lib/subRooms';
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
  const { align, text: titleText } = parseSubRoomTitle(greeting.title);
  const titleLines = titleText.split(/\n/).slice(0, 3);
  const canPlay = !locked && greeting.has_video;
  const tone = `greeting-card--${greeting.slot_code.toLowerCase()}`;

  return (
    <li className={`greeting-item greeting-item--${greeting.slot_code.toLowerCase()}`}>
      <button
        type="button"
        disabled={!canPlay}
        onClick={() => {
          if (!canPlay) return;
          onPlay({ id: greeting.id, title: greeting.title, kind: 'greeting' });
        }}
        className={`greeting-card member-card ${tone} w-full text-left transition-colors ${
          locked
            ? 'greeting-card--locked cursor-not-allowed'
            : canPlay
              ? 'hover:brightness-[0.99] active:brightness-[0.97]'
              : 'cursor-not-allowed'
        }`}
      >
        <div className={`greeting-mascot ${locked ? 'greeting-mascot--locked' : ''}`} aria-hidden>
          {locked ? (
            <Lock size={20} strokeWidth={2.25} />
          ) : (
            <img src="/greeting-mascot.png?v=6" alt="" className="greeting-mascot-img" draggable={false} />
          )}
        </div>
        <p className={`greeting-title ${subRoomTitleAlignClass(align)} ${locked ? '!text-slate-500' : ''}`}>
          {titleLines.map((line, i) => (
            <span key={`${i}-${line}`} className={i === 0 ? 'greeting-title-lead' : 'greeting-title-body'}>
              {i > 0 ? '\n' : ''}
              {line}
            </span>
          ))}
        </p>
        <div className="sub-room-action-row greeting-action-row">
          <div className="sub-room-action-center">
            <div
              className={`sub-room-play greeting-play-btn shrink-0 ${!canPlay ? 'sub-room-play--locked' : ''}`}
              aria-hidden
            >
              {locked ? <Lock size={22} className="text-slate-500" /> : <span className="sub-room-play-triangle" />}
            </div>
            <p className={`sub-room-action-text greeting-action-text ${locked ? '!text-slate-500' : ''}`}>
              {locked ? '鍵付き（プログラム対象外）' : greeting.has_video ? 'タップして中をみる' : '準備中です'}
            </p>
          </div>
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
  const { align, text: titleText } = parseSubRoomTitle(subRoom.title);

  return (
    <li className={`sub-room-item ${showNumber ? 'sub-room-item--numbered' : ''}`}>
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          if (locked) return;
          onSelect(subRoom.slot_number);
        }}
        className={`sub-room-card member-card w-full text-left transition-colors ${
          locked
            ? 'bg-slate-200/80 border-slate-300 opacity-70 cursor-not-allowed grayscale'
            : 'hover:border-member-gold/45 active:bg-member-camel-light/50'
        }`}
      >
        {showNumber ? (
          <span className={`sub-room-num ${locked ? '!bg-slate-300 !text-slate-500' : ''}`}>
            {subRoom.slot_number}
          </span>
        ) : null}
        <p className={`sub-room-title ${subRoomTitleAlignClass(align)} ${locked ? '!text-slate-500' : ''}`}>
          {titleText}
        </p>
        <div className="sub-room-action-row">
          <div className="sub-room-action-center">
            <div className={`sub-room-play shrink-0 ${locked ? 'sub-room-play--locked' : ''}`} aria-hidden>
              {locked ? <Lock size={22} className="text-slate-500" /> : <span className="sub-room-play-triangle" />}
            </div>
            <p className={`sub-room-action-text ${locked ? '!text-slate-500' : ''}`}>
              {locked ? '鍵付き（プログラム対象外）' : 'タップして動画をみる'}
            </p>
          </div>
          {!locked && (
            <div className="sub-room-count shrink-0">
              <span className="sub-room-count-num">{formatVideoCount(subRoom.video_count)}</span>
            </div>
          )}
        </div>
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

  const renderStudyCard = (key: StudyRoomKey) => {
    const studyRoom = studyByKey[key];
    if (!studyRoom) return null;
    const locked = !isUnlocked(key);
    const { align, text: titleText } = parseSubRoomTitle(studyRoom.title || defaultStudyRoomTitle(key));
    return (
      <li key={key} className="study-room-item">
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            if (locked) return;
            setActiveStudyKey(key);
            setSelectedSlot(null);
            setVideos([]);
          }}
          className={`member-card study-room-card w-full text-left transition-colors ${
            locked
              ? 'bg-slate-200/80 border-slate-300 opacity-70 cursor-not-allowed grayscale'
              : 'hover:border-member-gold/45 active:bg-member-camel-light/50'
          }`}
        >
          <div className={`study-room-icon ${locked ? '!bg-slate-300 !text-slate-500 !border-slate-400' : ''}`}>
            {locked ? <Lock size={16} strokeWidth={2.25} /> : <BookOpen size={17} strokeWidth={2.25} />}
          </div>
          <p className={`study-room-title ${subRoomTitleAlignClass(align)} ${locked ? '!text-slate-500' : ''}`}>
            {titleText}
          </p>
          <div className="study-room-action-row">
            <p className={`study-room-hint ${locked ? '!text-slate-400' : ''}`}>
              {locked ? '鍵付き（プログラム対象外）' : 'タップしてください'}
            </p>
            {!locked && (
              <div className="sub-room-count shrink-0">
                <span className="sub-room-count-num">{Math.min(99, studyRoom.item_count)}件</span>
              </div>
            )}
          </div>
        </button>
      </li>
    );
  };

  const renderWatchEntry = (key: WatchLayoutItemKey) => {
    const locked = !isUnlocked(key);
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

  /** 全員用の勉強部屋・あいさつ動画を枠でまとめ、勉強部屋の下に TOP タイトルを置く */
  const renderWatchList = () => {
    const nodes: ReactNode[] = [];
    let i = 0;
    while (i < watchLayout.length) {
      const key = watchLayout[i];
      if (isStudyLayoutKey(key)) {
        const studyKeys: StudyRoomKey[] = [];
        while (i < watchLayout.length && isStudyLayoutKey(watchLayout[i])) {
          studyKeys.push(watchLayout[i] as StudyRoomKey);
          i += 1;
        }
        const cards = studyKeys.map((k) => renderStudyCard(k)).filter(Boolean);
        if (cards.length > 0) {
          const endsSection = studySectionEndKey != null && studyKeys.includes(studySectionEndKey);
          nodes.push(
            <div key={`study-zone-${studyKeys.join('-')}`}>
              <section className="shared-zone" aria-label="全員向けの部屋">
                <p className="shared-zone-label">全員向け</p>
                <ul className="space-y-3">{cards}</ul>
              </section>
              {endsSection &&
                (watchTopTitle.trim() ? (
                  <div className="watch-top-title-wrap">
                    <div className="watch-top-title-gap">
                      <div className="watch-top-title-ornament" aria-hidden />
                      <div className="watch-bridge-banner-card">
                        <img
                          src="/clinic-logo.png"
                          alt="a2 ReCONDITIONING STATION"
                          className="watch-bridge-banner-logo"
                          width={96}
                          height={96}
                          draggable={false}
                        />
                        <div className="watch-bridge-banner-copy">
                          <p className="watch-bridge-line">
                            <span className="watch-bridge-bullet" aria-hidden>
                              ▶
                            </span>
                            何をやれば
                            <span className="watch-bridge-accent">“正解”</span>
                            か分からない
                          </p>
                          <p className="watch-bridge-line">
                            <span className="watch-bridge-bullet" aria-hidden>
                              ▶
                            </span>
                            結局1人だと…やめちゃう
                          </p>
                          <p className="watch-bridge-closing">将来の体に不安がある、そんなあなたへ</p>
                        </div>
                      </div>
                    </div>
                    <div className="watch-top-title-bubble">
                      <h2 className="watch-top-title">{watchTopTitle.trim()}</h2>
                    </div>
                  </div>
                ) : (
                  <div className="study-room-divider" aria-hidden />
                ))}
            </div>
          );
        }
        continue;
      }

      const greetingSlot = parseGreetingSlot(key);
      if (greetingSlot) {
        const greetingKeys: WatchLayoutItemKey[] = [];
        while (i < watchLayout.length && parseGreetingSlot(watchLayout[i])) {
          greetingKeys.push(watchLayout[i]);
          i += 1;
        }
        if (greetingKeys.length > 0) {
          const firstSlot = parseGreetingSlot(greetingKeys[0]);
          const spacedTop = firstSlot === 'B' || firstSlot === 'C';
          nodes.push(
            <div
              key={`greeting-zone-${greetingKeys.join('-')}`}
              className={`greeting-zone-block${spacedTop ? ' greeting-zone-block--spaced-top' : ''}`}
            >
              <ul className="greeting-list" aria-label="あいさつ動画">
                {greetingKeys.map((gKey) => {
                  const slotCode = parseGreetingSlot(gKey);
                  if (!slotCode) return null;
                  const greeting = greetingVideos.find((g) => g.slot_code === slotCode);
                  if (!greeting) return null;
                  return (
                    <GreetingVideoCard
                      key={gKey}
                      greeting={greeting}
                      locked={!isUnlocked(gKey)}
                      onPlay={(v) => void handlePlay(v)}
                    />
                  );
                })}
              </ul>
              <div className="greeting-to-rooms-gap" aria-hidden>
                <span className="greeting-to-rooms-arrow">▽</span>
                <span className="greeting-to-rooms-arrow">▽</span>
                <span className="greeting-to-rooms-arrow">▽</span>
              </div>
            </div>
          );
        }
        continue;
      }

      nodes.push(renderWatchEntry(key));
      i += 1;
    }
    return nodes;
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
        <div className="bg-[#1a5c63]">
          <img src={previewImageUrl} alt={previewImageTitle} className="w-full max-h-[70vh] object-contain bg-black" />
          <div className="px-4 py-3 bg-[#1a5c63] text-white flex items-start gap-3 border-t border-white/15">
            <button
              type="button"
              onClick={() => {
                setPreviewImageUrl('');
                setPreviewImageTitle('');
              }}
              className="shrink-0 rounded-lg bg-pink-100 text-member-text font-black text-base px-3.5 py-2.5 leading-none shadow-sm border border-pink-200"
            >
              ✖　もどる
            </button>
            <p className="text-base sm:text-lg font-bold leading-snug flex-1 line-clamp-2 min-w-0 pt-0.5">
              {previewImageTitle}
            </p>
          </div>
        </div>
      )}

      {activeVideo && (
        <div className="bg-[#1a5c63]">
          {playbackLoading ? (
            <div className="aspect-video flex items-center justify-center text-white text-lg">動画を準備しています…</div>
          ) : playbackUrl ? (
            <VideoPlayer src={playbackUrl} title={activeVideo.title} />
          ) : null}
          <div className="px-4 py-3 bg-[#1a5c63] text-white flex items-start gap-3 border-t border-white/15">
            <button
              type="button"
              onClick={() => {
                setActiveVideo(null);
                setPlaybackUrl('');
              }}
              className="shrink-0 rounded-lg bg-pink-100 text-member-text font-black text-base px-3.5 py-2.5 leading-none shadow-sm border border-pink-200"
            >
              ✖　もどる
            </button>
            <p className="text-base sm:text-lg font-bold leading-snug flex-1 line-clamp-2 min-w-0 pt-0.5">
              {activeVideo.title}
            </p>
          </div>
        </div>
      )}

      {/* 再生中・画像プレビュー中は下の一覧を隠して動画に集中できるようにする */}
      {(activeVideo || previewImageUrl) && <div className="flex-1 min-h-[50vh]" aria-hidden />}

      {!(activeVideo || previewImageUrl) && (
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
          <div className="space-y-3">{renderWatchList()}</div>
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
      )}
    </MemberPageShell>
  );
}
