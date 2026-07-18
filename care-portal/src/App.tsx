import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from './lib/supabase';
import HomePage from './pages/HomePage';
import RoomLoginPage from './pages/RoomLoginPage';
import RoomVideosPage from './pages/RoomVideosPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRoomsPage from './pages/admin/AdminRoomsPage';
import AdminRoomDetailPage from './pages/admin/AdminRoomDetailPage';
import MemberGuidePage from './pages/MemberGuidePage';
import MemberManualPage from './pages/MemberManualPage';
import AdminSubRoomsMasterPage from './pages/admin/AdminSubRoomsMasterPage';
import StaffManualPage from './pages/admin/StaffManualPage';
import { clearSession, loadSession, sessionMatchesRoomCode } from './lib/session';

type Route =
  | { name: 'home' }
  | { name: 'room-login'; roomCode: string }
  | { name: 'room-videos' }
  | { name: 'member-guide'; memberName?: string; roomCode?: string }
  | { name: 'member-manual' }
  | { name: 'staff-manual' }
  | { name: 'admin-login' }
  | { name: 'admin-rooms' }
  | { name: 'admin-sub-rooms' }
  | { name: 'admin-room'; roomId: string };

function parseGuideQuery(search: string) {
  const params = new URLSearchParams(search);
  return {
    memberName: params.get('member') || params.get('name') || undefined,
    roomCode: params.get('room') || undefined,
  };
}

function parseRoute(pathname: string, search = ''): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'manual') return { name: 'member-manual' };
  if (parts[0] === 'guide') {
    const q = parseGuideQuery(search);
    return { name: 'member-guide', memberName: q.memberName, roomCode: q.roomCode };
  }
  if (parts[0] === 'r' && parts[1]) return { name: 'room-login', roomCode: decodeURIComponent(parts[1]) };
  if (parts[0] === 'watch') return { name: 'room-videos' };
  if (parts[0] === 'admin') {
    if (parts[1] === 'login') return { name: 'admin-login' };
    if (parts[1] === 'manual') return { name: 'staff-manual' };
    if (parts[1] === 'rooms' && parts[2]) return { name: 'admin-room', roomId: parts[2] };
    if (parts[1] === 'rooms') return { name: 'admin-rooms' };
    if (parts[1] === 'sub-rooms') return { name: 'admin-sub-rooms' };
    return { name: 'admin-login' };
  }
  return { name: 'home' };
}

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search)
  );

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname, window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (route.name !== 'room-login') return;
    const session = loadSession();
    if (!session) return;
    if (sessionMatchesRoomCode(session, route.roomCode)) {
      navigate('/watch');
      setRoute({ name: 'room-videos' });
      return;
    }
    clearSession();
  }, [route.name, route.name === 'room-login' ? route.roomCode : '']);

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
      return (
        <HomePage
          onOpenAdminLogin={() => {
            navigate('/admin/login');
            setRoute({ name: 'admin-login' });
          }}
          onOpenStaffManual={() => {
            navigate('/admin/manual');
            setRoute({ name: 'staff-manual' });
          }}
          onOpenMemberManual={() => {
            navigate('/manual');
            setRoute({ name: 'member-manual' });
          }}
        />
      );
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
          onLogout={(roomCode) => {
            if (roomCode) {
              navigate(`/r/${encodeURIComponent(roomCode)}`);
              setRoute({ name: 'room-login', roomCode });
              return;
            }
            navigate('/');
            setRoute({ name: 'home' });
          }}
        />
      );
    case 'member-guide':
      return (
        <MemberGuidePage memberName={route.memberName} roomCode={route.roomCode} />
      );
    case 'member-manual':
      return <MemberManualPage />;
    case 'staff-manual':
      return (
        <StaffManualPage
          onGoLogin={() => {
            navigate('/admin/login');
            setRoute({ name: 'admin-login' });
          }}
          onGoHome={() => {
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
          onOpenManual={() => {
            navigate('/admin/manual');
            setRoute({ name: 'staff-manual' });
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
          onOpenSubRoomsMaster={() => {
            navigate('/admin/sub-rooms');
            setRoute({ name: 'admin-sub-rooms' });
          }}
          onLogout={() => {
            navigate('/');
            setRoute({ name: 'home' });
          }}
        />
      );
    case 'admin-sub-rooms':
      return (
        <AdminSubRoomsMasterPage
          onBack={() => {
            navigate('/admin/rooms');
            setRoute({ name: 'admin-rooms' });
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
          onPreviewMemberRoom={() => {
            navigate('/watch');
            setRoute({ name: 'room-videos' });
          }}
        />
      );
    default:
      return (
        <HomePage
          onOpenAdminLogin={() => {
            navigate('/admin/login');
            setRoute({ name: 'admin-login' });
          }}
          onOpenStaffManual={() => {
            navigate('/admin/manual');
            setRoute({ name: 'staff-manual' });
          }}
          onOpenMemberManual={() => {
            navigate('/manual');
            setRoute({ name: 'member-manual' });
          }}
        />
      );
  }
}
