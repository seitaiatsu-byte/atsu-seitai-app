import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, PlayCircle } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberStepGuide from '../components/member/MemberStepGuide';
import { fetchPlaybackUrl, listMemberVideos, logoutRoom, validateSession, type CareVideoItem } from '../lib/careApi';
import { MEMBER_GUIDE_STEPS } from '../lib/memberGuide';
import { clearSession, loadSession, saveSession } from '../lib/session';

type Props = {
  onLogout: () => void;
};

const WATCH_STEP = MEMBER_GUIDE_STEPS.filter((s) => s.number === 3);

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function RoomVideosPage({ onLogout }: Props) {
  const [session, setSession] = useState(loadSession);
  const [videos, setVideos] = useState<CareVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeVideo, setActiveVideo] = useState<CareVideoItem | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [playbackLoading, setPlaybackLoading] = useState(false);

  const sessionToken = session?.sessionToken;

  const refresh = useCallback(async () => {
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
      const list = await listMemberVideos(token);
      setVideos(list);
    } catch (err) {
      clearSession();
      setSession(null);
      setError(err instanceof Error ? err.message : '読み込みに失敗しました。もう一度リンクから開き直してください。');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      window.location.href = '/';
      return;
    }
    void refresh();
  }, [sessionToken, refresh]);

  const handlePlay = async (video: CareVideoItem) => {
    const token = sessionToken ?? loadSession()?.sessionToken;
    if (!token) return;
    setActiveVideo(video);
    setPlaybackUrl('');
    setPlaybackLoading(true);
    setError('');
    try {
      const url = await fetchPlaybackUrl(token, video.id);
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

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-20 bg-teal-700 text-white px-4 py-4 shadow">
        <p className="text-sm text-teal-100">ステップ3：動画を選んで再生</p>
        <h1 className="font-bold text-xl sm:text-2xl mt-0.5">{session.memberName} さんの動画</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => void refresh()}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-base border border-teal-400"
          >
            新しい動画を確認
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-base border border-white/30"
          >
            終了する
          </button>
        </div>
      </header>

      {activeVideo && (
        <div className="bg-black">
          {playbackLoading ? (
            <div className="aspect-video flex items-center justify-center text-white text-lg">動画を準備しています…</div>
          ) : playbackUrl ? (
            <VideoPlayer src={playbackUrl} title={activeVideo.title} />
          ) : null}
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveVideo(null);
                setPlaybackUrl('');
              }}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-base font-bold shrink-0"
            >
              ← 一覧へ
            </button>
            <p className="text-base font-bold truncate flex-1">{activeVideo.title}</p>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-4">
        {!activeVideo && <MemberStepGuide currentStep={3} steps={WATCH_STEP} compact />}

        {error && (
          <div className="rounded-xl bg-red-50 border-2 border-red-300 text-red-900 text-base px-4 py-4 leading-relaxed">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-slate-600 text-lg py-12">動画を読み込んでいます…</p>
        ) : videos.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-2xl bg-white border-2 border-slate-200">
            <p className="font-bold text-xl text-slate-800">まだ動画がありません</p>
            <p className="text-base text-slate-600 mt-3 leading-relaxed">
              新しい動画がアップロードされるまでお待ちください。
              <br />
              あとで同じリンクから、もう一度開いてください。
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-5 px-6 py-3 rounded-xl bg-teal-600 text-white font-bold text-lg"
            >
              もう一度確認する
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => void handlePlay(v)}
                  className="w-full text-left bg-white rounded-2xl border-2 border-slate-200 shadow-sm px-4 py-4 flex items-center gap-4 hover:border-teal-400 active:bg-teal-50 min-h-[5rem]"
                >
                  <div className="shrink-0 w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                    <PlayCircle className="text-teal-700" size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-lg sm:text-xl text-slate-900 leading-snug">
                      {v.title || 'セルフケア動画'}
                    </p>
                    <p className="text-base text-slate-600 mt-1">{formatDate(v.uploaded_at)}</p>
                    <p className="text-sm text-teal-700 font-bold mt-1">▶ タップして再生</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <MemberHelpFooter large />
      </main>
    </div>
  );
}
