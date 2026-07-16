import { useCallback, useEffect, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberPageShell from '../components/member/MemberPageShell';
import {
  fetchPlaybackUrl,
  listMemberGreetingVideos,
  listMemberSubRooms,
  listMemberVideos,
  logoutRoom,
  validateSession,
  type CareVideoItem,
} from '../lib/careApi';
import type { GreetingVideoItem } from '../lib/greetingVideos';
import { formatVideoCount, type SubRoomItem } from '../lib/subRooms';
import { clearSession, loadSession, saveSession } from '../lib/session';

type Props = {
  onLogout: () => void;
};

type ActivePlayback = {
  id: string;
  title: string;
  kind: 'room' | 'greeting';
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function RoomVideosPage({ onLogout }: Props) {
  const [session, setSession] = useState(loadSession);
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

  const refreshSubRooms = useCallback(async () => {
    const token = sessionToken ?? loadSession()?.sessionToken;
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const valid = await validateSession(token);
      saveSession(valid);
      setSession((prev) =>
        prev?.sessionToken === valid.sessionToken &&
        prev.memberName === valid.memberName &&
        prev.expiresAt === valid.expiresAt
          ? prev
          : valid
      );
      const [greetings, rooms] = await Promise.all([
        listMemberGreetingVideos(token),
        listMemberSubRooms(token),
      ]);
      setGreetingVideos(greetings);
      setSubRooms(rooms);
    } catch (err) {
      clearSession();
      setSession(null);
      setError(err instanceof Error ? err.message : '読み込みに失敗しました。もう一度リンクから開き直してください。');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

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

  useEffect(() => {
    if (!sessionToken) {
      window.location.href = '/';
      return;
    }
    void refreshSubRooms();
  }, [sessionToken, refreshSubRooms]);

  useEffect(() => {
    if (selectedSlot !== null) {
      void loadVideosForSlot(selectedSlot);
    }
  }, [selectedSlot, loadVideosForSlot]);

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
    if (sessionToken) {
      try {
        await logoutRoom(sessionToken);
      } catch {
        /* ignore */
      }
    }
    clearSession();
    onLogout();
  };

  const selectedSubRoom = selectedSlot !== null ? subRooms.find((s) => s.slot_number === selectedSlot) : null;

  if (!session) return null;

  return (
    <MemberPageShell>
      <MemberBrandHeader
        sticky
        title={
          selectedSubRoom
            ? `${session.memberName} さんの動画`
            : `${session.memberName} さんの部屋`
        }
        subtitle={
          selectedSubRoom
            ? selectedSubRoom.title
            : '見たいカテゴリ（小部屋）を選んでください'
        }
      >
        <div className="flex flex-wrap gap-2">
          {selectedSlot !== null && !activeVideo && (
            <button
              type="button"
              onClick={() => {
                setSelectedSlot(null);
                setVideos([]);
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
        ) : selectedSlot === null ? (
          <>
            {greetingVideos.length > 0 && (
              <ul className="space-y-3">
                {greetingVideos.map((g) => (
                  <li key={g.slot_code}>
                    <button
                      type="button"
                      disabled={!g.has_video}
                      onClick={() =>
                        g.has_video &&
                        void handlePlay({ id: g.id, title: g.title, kind: 'greeting' })
                      }
                      className="member-card w-full text-left px-4 py-4 flex items-center gap-4 hover:border-member-gold/45 active:bg-member-camel-light/50 min-h-[5rem] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="shrink-0 w-10 h-10 rounded-full bg-member-gold/20 text-member-gold-deep font-bold flex items-center justify-center text-lg">
                        {g.slot_code}
                      </span>
                      <div className="member-icon-badge w-12 h-12 shrink-0">
                        <PlayCircle size={32} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-lg sm:text-xl text-member-text leading-snug">
                          {g.title}
                        </p>
                        {g.has_video && g.uploaded_at && (
                          <p className="text-base member-text-muted mt-1">{formatDate(g.uploaded_at)}</p>
                        )}
                        <p className="text-sm member-text-accent font-bold mt-1">
                          {g.has_video ? '▶ タップして再生' : '準備中です'}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <ul className="space-y-3">
              {subRooms.map((sr) => (
                <li key={sr.slot_number}>
                  <button
                    type="button"
                    onClick={() => setSelectedSlot(sr.slot_number)}
                    className="sub-room-card member-card w-full text-left px-4 py-4 flex items-center gap-3 hover:border-member-gold/45 active:bg-member-camel-light/50 min-h-[4.5rem] transition-colors"
                  >
                    <span className="sub-room-num shrink-0">{sr.slot_number}</span>
                    <div className="sub-room-play shrink-0">
                      <PlayCircle size={28} className="text-member-teal" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-base sm:text-lg text-member-text leading-snug line-clamp-3">
                        {sr.title}
                      </p>
                      <p className="text-sm member-text-accent font-bold mt-1">▶ タップして動画一覧へ</p>
                    </div>
                    <div className="sub-room-count shrink-0">
                      <span className="sub-room-count-num">{formatVideoCount(sr.video_count)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
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
