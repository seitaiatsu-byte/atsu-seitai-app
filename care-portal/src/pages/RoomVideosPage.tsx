import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, LogOut, PlayCircle, RefreshCw } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import { fetchPlaybackUrl, listMemberVideos, logoutRoom, validateSession, type CareVideoItem } from '../lib/careApi';
import { clearSession, loadSession, saveSession } from '../lib/session';

type Props = {
  onLogout: () => void;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDuration(sec: number | null) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RoomVideosPage({ onLogout }: Props) {
  const [session, setSession] = useState(loadSession);
  const [videos, setVideos] = useState<CareVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeVideo, setActiveVideo] = useState<CareVideoItem | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [playbackLoading, setPlaybackLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const valid = await validateSession(session.sessionToken);
      saveSession(valid);
      setSession(valid);
      const list = await listMemberVideos(valid.sessionToken);
      setVideos(list);
    } catch (err) {
      clearSession();
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      window.location.href = '/';
      return;
    }
    void refresh();
  }, [session, refresh]);

  const handlePlay = async (video: CareVideoItem) => {
    if (!session) return;
    setActiveVideo(video);
    setPlaybackUrl('');
    setPlaybackLoading(true);
    try {
      const url = await fetchPlaybackUrl(session.sessionToken, video.id);
      setPlaybackUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '再生準備に失敗しました');
      setActiveVideo(null);
    } finally {
      setPlaybackLoading(false);
    }
  };

  const handleLogout = async () => {
    if (session) {
      try {
        await logoutRoom(session.sessionToken);
      } catch {
        /* ignore */
      }
    }
    clearSession();
    onLogout();
  };

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-20 bg-teal-700 text-white px-3 py-3 flex items-center justify-between shadow">
        <div className="min-w-0">
          <p className="text-xs text-teal-200">ようこそ</p>
          <h1 className="font-bold truncate">{session.memberName} さん</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-2 rounded-lg hover:bg-teal-600"
            aria-label="更新"
          >
            <RefreshCw size={18} />
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="p-2 rounded-lg hover:bg-teal-600"
            aria-label="退出"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {activeVideo && (
        <div className="bg-black">
          {playbackLoading ? (
            <div className="aspect-video flex items-center justify-center text-white text-sm">読み込み中…</div>
          ) : playbackUrl ? (
            <VideoPlayer src={playbackUrl} title={activeVideo.title} />
          ) : null}
          <div className="px-3 py-2 bg-slate-900 text-white flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveVideo(null);
                setPlaybackUrl('');
              }}
              className="p-1 rounded hover:bg-slate-800"
            >
              <ChevronLeft size={20} />
            </button>
            <p className="text-sm font-bold truncate flex-1">{activeVideo.title}</p>
          </div>
        </div>
      )}

      <main className="flex-1 p-3 max-w-2xl mx-auto w-full">
        {error && (
          <div className="mb-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
            {error}
            <button type="button" onClick={() => (window.location.href = '/')} className="block mt-2 underline">
              トップへ戻る
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-center text-slate-500 py-12">動画を読み込み中…</p>
        ) : videos.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <p className="font-bold">まだ動画がありません</p>
            <p className="text-sm mt-2">新しい動画がアップロードされるまでお待ちください</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => void handlePlay(v)}
                  className="w-full text-left bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 hover:border-teal-300 active:bg-teal-50"
                >
                  <PlayCircle className="text-teal-600 shrink-0" size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 truncate">{v.title || '無題'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDate(v.uploaded_at)}
                      {v.duration_seconds ? ` · ${formatDuration(v.duration_seconds)}` : ''}
                    </p>
                    {v.description && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{v.description}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
