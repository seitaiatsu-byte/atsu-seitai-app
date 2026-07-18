import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Image, PlayCircle } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberPageShell from '../components/member/MemberPageShell';
import {
  fetchMaterialUrl,
  fetchPlaybackUrl,
  getMemberStudyRoom,
  listMemberGreetingVideos,
  listMemberStudyItems,
  listMemberSubRooms,
  listMemberVideos,
  listMemberWatchLayout,
  logoutRoom,
  validateSession,
  type CareVideoItem,
} from '../lib/careApi';
import type { GreetingVideoItem } from '../lib/greetingVideos';
import { formatVideoCount, showsSubRoomNumber, type SubRoomItem } from '../lib/subRooms';
import { clearSession, loadSession, saveSession } from '../lib/session';
import { DEFAULT_STUDY_ROOM_TITLE, studyItemTypeLabel, type StudyItem, type StudyRoomSummary } from '../lib/studyRoom';
import {
  DEFAULT_WATCH_LAYOUT_KEYS,
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
  onPlay,
}: {
  greeting: GreetingVideoItem;
  onPlay: (video: ActivePlayback) => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={!greeting.has_video}
        onClick={() =>
          greeting.has_video &&
          onPlay({ id: greeting.id, title: greeting.title, kind: 'greeting' })
        }
        className="member-card w-full text-left px-4 py-4 flex items-center gap-4 hover:border-member-gold/45 active:bg-member-camel-light/50 min-h-[5rem] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="shrink-0 w-10 h-10 rounded-full bg-member-gold/20 text-member-gold-deep font-bold flex items-center justify-center text-lg">
          {greeting.slot_code}
        </span>
        <div className="member-icon-badge w-12 h-12 shrink-0">
          <PlayCircle size={32} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-lg sm:text-xl text-member-text leading-snug">{greeting.title}</p>
          {greeting.has_video && greeting.uploaded_at && (
            <p className="text-base member-text-muted mt-1">{formatDate(greeting.uploaded_at)}</p>
          )}
          <p className="text-sm member-text-accent font-bold mt-1">
            {greeting.has_video ? '▶ タップして再生' : '準備中です'}
          </p>
        </div>
      </button>
    </li>
  );
}

function SubRoomCard({ subRoom, onSelect }: { subRoom: SubRoomItem; onSelect: (slot: number) => void }) {
  const showNumber = showsSubRoomNumber(subRoom.slot_number);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(subRoom.slot_number)}
        className="sub-room-card member-card w-full text-left px-4 py-4 flex items-center gap-3 hover:border-member-gold/45 active:bg-member-camel-light/50 min-h-[4.5rem] transition-colors"
      >
        {showNumber ? (
          <span className="sub-room-num shrink-0">{subRoom.slot_number}</span>
        ) : (
          <span className="shrink-0 w-7" aria-hidden />
        )}
        <div className="sub-room-play shrink-0">
          <PlayCircle size={28} className="text-member-teal" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base sm:text-lg text-member-text leading-snug line-clamp-3">
            {subRoom.title}
          </p>
          <p className="text-sm member-text-accent font-bold mt-1">▶ タップして動画一覧へ</p>
        </div>
        <div className="sub-room-count shrink-0">
          <span className="sub-room-count-num">{formatVideoCount(subRoom.video_count)}</span>
        </div>
      </button>
    </li>
  );
}

export default function RoomVideosPage({ onLogout }: Props) {
  const [session, setSession] = useState(loadSession);
  const [studyRoom, setStudyRoom] = useState<StudyRoomSummary | null>(null);
  const [studyItems, setStudyItems] = useState<StudyItem[]>([]);
  const [showStudyRoom, setShowStudyRoom] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewImageTitle, setPreviewImageTitle] = useState('');
  const [watchLayout, setWatchLayout] = useState<WatchLayoutItemKey[]>([...DEFAULT_WATCH_LAYOUT_KEYS]);
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

  const goToRoomLogin = useCallback((roomCode?: string) => {
    const code = roomCode?.trim() || loadSession()?.roomCode?.trim();
    if (code) {
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
      saveSession(valid);
      setSession(valid);
      const [greetings, rooms, layout] = await Promise.all([
        listMemberGreetingVideos(token),
        listMemberSubRooms(token),
        listMemberWatchLayout(token),
      ]);
      setGreetingVideos(greetings);
      setSubRooms(rooms);
      setWatchLayout(layout);
      // 勉強部屋は未マイグレーションでも部屋全体を落とさない
      try {
        setStudyRoom(await getMemberStudyRoom(token));
      } catch {
        setStudyRoom(null);
      }
    } catch (err) {
      const roomCode = existing?.roomCode;
      clearSession();
      setSession(null);
      if (roomCode) {
        goToRoomLogin(roomCode);
        return;
      }
      setError(err instanceof Error ? err.message : '読み込みに失敗しました。もう一度リンクから開き直してください。');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, goToRoomLogin]);

  const loadVideosForSlot = useCallback(
    async (slot: number) => {
      const token = sessionToken ?? loadSession()?.sessionToken;
      if (!token) return;
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
    [sessionToken]
  );

  const loadStudyItems = useCallback(async () => {
    const token = sessionToken ?? loadSession()?.sessionToken;
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      setStudyItems(await listMemberStudyItems(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : '資料の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

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
    if (showStudyRoom) {
      void loadStudyItems();
    }
  }, [showStudyRoom, loadStudyItems]);

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
    const roomCode = session?.roomCode || loadSession()?.roomCode;
    if (sessionToken) {
      try {
        await logoutRoom(sessionToken);
      } catch {
        /* ignore */
      }
    }
    clearSession();
    onLogout(roomCode);
  };

  const selectedSubRoom = selectedSlot !== null ? subRooms.find((s) => s.slot_number === selectedSlot) : null;

  const renderWatchEntry = (key: WatchLayoutItemKey) => {
    if (key === 'study') {
      if (!studyRoom) return null;
      return (
        <div key={key} className="space-y-4">
          <ul className="space-y-3">
            <li>
              <button
                type="button"
                onClick={() => {
                  setShowStudyRoom(true);
                  setSelectedSlot(null);
                  setVideos([]);
                }}
                className="member-card w-full text-left px-4 py-4 flex items-center gap-4 hover:border-member-gold/45 active:bg-member-camel-light/50 min-h-[5rem] transition-colors"
              >
                <div className="study-room-icon shrink-0">
                  <BookOpen size={28} strokeWidth={2.25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-lg sm:text-xl text-member-text leading-snug">
                    {studyRoom.title || DEFAULT_STUDY_ROOM_TITLE}
                  </p>
                  <p className="text-sm member-text-accent font-bold mt-1">▶ タップして資料一覧へ</p>
                </div>
                <div className="sub-room-count shrink-0">
                  <span className="sub-room-count-num">{Math.min(99, studyRoom.item_count)}件</span>
                </div>
              </button>
            </li>
          </ul>
          <div className="study-room-divider" aria-hidden />
        </div>
      );
    }

    const greetingSlot = parseGreetingSlot(key);
    if (greetingSlot) {
      const greeting = greetingVideos.find((g) => g.slot_code === greetingSlot);
      if (!greeting) return null;
      return (
        <ul key={key} className="space-y-3">
          <GreetingVideoCard greeting={greeting} onPlay={(v) => void handlePlay(v)} />
        </ul>
      );
    }

    const slot = parseSubRoomSlot(key);
    if (slot == null) return null;
    const subRoom = subRooms.find((s) => s.slot_number === slot);
    if (!subRoom) return null;
    return (
      <ul key={key} className="space-y-3">
        <SubRoomCard subRoom={subRoom} onSelect={setSelectedSlot} />
      </ul>
    );
  };

  if (!session) {
    return (
      <MemberPageShell>
        <MemberBrandHeader title="入室し直してください" subtitle="お渡しの専用リンクから開いてください" />
        <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
          {error && (
            <div className="rounded-xl bg-red-50 border-2 border-red-200 text-red-900 text-base px-4 py-4 leading-relaxed">
              {error}
            </div>
          )}
          <p className="text-base member-text-muted mt-4 leading-relaxed">
            トップページ（スタッフ案内）ではなく、お渡しした <strong>/r/顧客番号</strong> のリンクから入ります。
          </p>
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
            ? studyRoom?.title || DEFAULT_STUDY_ROOM_TITLE
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
                setShowStudyRoom(false);
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
            終了する
          </button>
        </div>
      </MemberBrandHeader>

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
                  onClick={() => void handlePlay({ id: v.id, title: v.title || 'セルフケア動画', kind: 'room' })}
                  className="member-card w-full text-left px-4 py-4 flex items-center gap-4 hover:border-member-gold/45 active:bg-member-camel-light/50 min-h-[5rem] transition-colors"
                >
                  <div className="member-icon-badge w-12 h-12">
                    <PlayCircle size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-lg sm:text-xl text-member-text leading-snug">
                      {v.title || 'セルフケア動画'}
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
