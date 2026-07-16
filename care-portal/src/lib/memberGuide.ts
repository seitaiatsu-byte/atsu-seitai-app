export type MemberGuideStep = {
  number: number;
  title: string;
  body: string;
};

export const MEMBER_GUIDE_STEPS: MemberGuideStep[] = [
  {
    number: 1,
    title: 'お渡しのリンクを開く',
    body: '院内でお渡ししたインターネットの住所（URL）を、スマホまたはパソコンで開いてください。青いリンクをタップ（クリック）すると開きます。',
  },
  {
    number: 2,
    title: '入室パスを入れる',
    body: '画面の枠に、院内でお渡しした「入室パス」（数字など）を入力し、「動画を見る」ボタンを押してください。',
  },
  {
    number: 3,
    title: '動画をタップして再生',
    body: '一覧に出ている動画の名前をタップ（クリック）すると、上に動画が出て再生されます。▶のマークがついています。',
  },
];

export const CLINIC_HELP_LINE =
  (import.meta.env.VITE_CLINIC_HELP_PHONE as string | undefined)?.trim() ||
  'あつ整体院（操作がわからないときは院内スタッフにお声がけください）';

export function buildMemberRoomUrl(roomCode: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/r/${encodeURIComponent(roomCode)}`;
  }
  return `/r/${roomCode}`;
}
