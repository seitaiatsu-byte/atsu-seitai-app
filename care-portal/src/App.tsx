import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from './lib/supabase';
import HomePage from './pages/HomePage';
import RoomLoginPage from './pages/RoomLoginPage';
import RoomVideosPage from './pages/RoomVideosPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRoomsPage from './pages/admin/AdminRoomsPage';
import AdminRoomDetailPage from './pages/admin/AdminRoomDetailPage';
import { loadSession } from './lib/session';

type Route =
  | { name: 'home' }
  | { name: 'room-login'; roomCode: string }
  | { name: 'room-videos' }
  | { name: 'admin-login' }
  | { name: 'admin-rooms' }
  | { name: 'admin-room'; roomId: string };

function parseRoute(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'r' && parts[1]) return { name: 'room-login', roomCode: decodeURIComponent(parts[1]) };
  if (parts[0] === 'watch') return { name: 'room-videos' };
  if (parts[0] === 'admin') {
    if (parts[1] === 'login') return { name: 'admin-login' };
    if (parts[1] === 'rooms' && parts[2]) return { name: 'admin-room', roomId: parts[2] };
    if (parts[1] === 'rooms') return { name: 'admin-rooms' };
    return { name: 'admin-login' };
  }
  return { name: 'home' };
}

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (route.name === 'room-login' && loadSession()) {
      navigate('/watch');
      setRoute({ name: 'room-videos' });
    }
  }, [route.name]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-bold mb-2">環境変数が未設定です</p>
          <p>
            <code className="text-xs">care-portal/.env</code> に <code>VITE_SUPABASE_URL</code> と{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> を設定してください。
          </p>
        </div>
      </div>
    );
  }

  switch (route.name) {
    case 'home':
      return <HomePage onOpenAdmin={() => navigate('/admin/login')} />;
    case 'room-login':
      return (
        <RoomLoginPage
          roomCode={route.roomCode}
          onLoggedIn={() => {
            navigate('/watch');
            setRoute({ name: 'room-videos' });
          }}
        />
      );
    case 'room-videos':
      return (
        <RoomVideosPage
          onLogout={() => {
            navigate('/');
            setRoute({ name: 'home' });
          }}
        />
      );
    case 'admin-login':
      return (
        <AdminLoginPage
          onLoggedIn={() => {
            navigate('/admin/rooms');
            setRoute({ name: 'admin-rooms' });
          }}
        />
      );
    case 'admin-rooms':
      return (
        <AdminRoomsPage
          onOpenRoom={(id) => {
            navigate(`/admin/rooms/${id}`);
            setRoute({ name: 'admin-room', roomId: id });
          }}
          onLogout={() => {
            navigate('/');
            setRoute({ name: 'home' });
          }}
        />
      );
    case 'admin-room':
      return (
        <AdminRoomDetailPage
          roomId={route.roomId}
          onBack={() => {
            navigate('/admin/rooms');
            setRoute({ name: 'admin-rooms' });
          }}
        />
      );
    default:
      return <HomePage onOpenAdmin={() => navigate('/admin/login')} />;
  }
}
