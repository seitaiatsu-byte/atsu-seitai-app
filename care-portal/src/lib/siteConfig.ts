/** 会員に渡すURL・QRに使う本番ドメイン（VITE_PUBLIC_SITE_URL）。未設定時はブラウザの origin */
export function getPublicSiteOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** 会員の入室URL（QR・コピー用。本番ドメインが設定されていればそちらを優先） */
export function buildMemberRoomUrl(roomCode: string): string {
  const base = getPublicSiteOrigin();
  const path = `/r/${encodeURIComponent(roomCode)}`;
  return base ? `${base}${path}` : path;
}

/** マニュアル・案内用の入口URL例 */
export function formatMemberEntryExample(roomCode = '1234'): string {
  return buildMemberRoomUrl(roomCode);
}

/** 本番ドメイン（第一候補）。DNS・Vercel設定後に VITE_PUBLIC_SITE_URL に設定 */
export const RECOMMENDED_PUBLIC_SITE_URL = 'https://a2karada.jp';

/** 本番ドメイン（代替）。a2karada が取れない場合 */
export const ALTERNATE_PUBLIC_SITE_URL = 'https://a2body-care.jp';

export function isConfiguredPublicDomain(origin: string): boolean {
  return origin === RECOMMENDED_PUBLIC_SITE_URL || origin === ALTERNATE_PUBLIC_SITE_URL;
}
