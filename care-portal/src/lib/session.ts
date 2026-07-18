import type { ProgramTier } from './programTiers';
import { buildMemberRoomUrl } from './siteConfig';

const SESSION_KEY = 'care_portal_session';

export type CareSession = {
  sessionToken: string;
  memberName: string;
  roomCode: string;
  expiresAt: string;
  /** 未設定の古いセッションは E（全開放寄り）扱い */
  programTier?: ProgramTier;
  /** スタッフが会員部屋を確認中 */
  staffPreview?: boolean;
  adminRoomId?: string;
};

export function loadSession(): CareSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CareSession;
    if (!parsed.sessionToken || !parsed.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: CareSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function roomUrl(roomCode: string): string {
  return buildMemberRoomUrl(roomCode);
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toLowerCase();
}

export function sessionMatchesRoomCode(session: CareSession, roomCode: string): boolean {
  return normalizeRoomCode(session.roomCode) === normalizeRoomCode(roomCode);
}
