export type MemberGuideStep = {
  number: number;
  title: string;
  body: string;
};

export const MEMBER_GUIDE_STEPS: MemberGuideStep[] = [
  {
    number: 1,
    title: 'お渡しのリンクを開く',
    body: '院内でお渡ししたインターネットのアドレス（URL）やQRコードを、スマホまたはパソコンで開いてください。青くなっている文字をタップ（クリック）すると開きます。',
  },
  {
    number: 2,
    title: '入室パスを入れる',
    body: '画面の枠に、お渡しした「入室パスワード」（数字など）を入力し、「動画を見る」ボタンを押してください。',
  },
  {
    number: 3,
    title: '動画をタップして再生',
    body: '一覧に出ている動画の名前をタップ（クリック）すると、上に動画が出て再生されます。▶のマークがついています。',
  },
];

export const MEMBER_HANDOUT_TITLE = 'あなたへお渡しするもの（2つ）';

export const MEMBER_HANDOUT_ITEMS = [
  '① あなた専用のページアドレス（またはQRコード）',
  '② 入室パス（数字など、当院からお渡し）',
] as const;

export const MEMBER_PASSWORD_NOTE =
  '入室パスワードは定期的に変わります。新しいパスワードは直接スタッフへお問い合わせください。';

export const MEMBER_HELP_TITLE = 'Ｑ. わからないときは';

export const MEMBER_HELP_BODY = 'LINEや、直接来院時にお尋ねください。';

/** @deprecated 互換用。新文言は MEMBER_HELP_BODY を使用 */
export const CLINIC_HELP_LINE = MEMBER_HELP_BODY;

export function buildMemberRoomUrl(roomCode: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/r/${encodeURIComponent(roomCode)}`;
  }
  return `/r/${roomCode}`;
}

export type ManualFlowStep = {
  who: string;
  when: string;
  where: string;
  what: string;
};

export const MEMBER_SITE_PURPOSE = {
  title: 'このサイトは何のため？',
  body: 'あつ整体院の会員さんが、ご自宅などで「あなた専用のセルフケア動画」を安全に見るためのサイトです。院内で撮影・アップロードした動画を、会員一人ひとりだけが見られます。',
};

export const MEMBER_ENTRY_EXPLAIN = {
  title: '会員さんはどこから入る？（とても大切）',
  points: [
    'トップページ（サイトの表紙）から入る必要はありません。普段、会員さんが開くのは当院からお渡しした「あなた専用のリンク」またはQRコードだけです。',
    'リンクの形の例：https://atsu-care-portal.vercel.app/r/room-xxxx（room-xxxx はお一人おひとり違います）',
    'QRコードを読み取ると、自動的にその専用ページが開きます。',
    'トップページに来てしまった場合は、お渡しのリンクやQRをもう一度開いてください。',
  ],
};

export const MEMBER_FULL_FLOW: ManualFlowStep[] = [
  {
    who: 'スタッフ（当院）',
    when: '来院時・動画を渡すとき',
    where: '管理画面（パソコン・院内）',
    what: '会員ルームを作り、動画をアップロードし、専用URL・QR・入室パスワードを準備する',
  },
  {
    who: 'スタッフ → 会員さん',
    when: 'その場で、またはLINEなど',
    where: '院内・お手持ちのスマホ',
    what: '①専用URLまたはQR ②入室パスワード の2つをお渡しする',
  },
  {
    who: '会員さん',
    when: 'ご自宅など、見たいとき',
    where: 'お渡しのリンク／QRから',
    what: '専用ページを開く → 入室パスワードを入力 → 動画一覧から再生',
  },
];

export const STAFF_SITE_PURPOSE = {
  title: 'スタッフが使うのはどこ？',
  body: '会員向けのトップページではなく、別の「スタッフ管理画面」です。院内のパソコンやタブレットからログインして使います。',
};

export const STAFF_ENTRY_URL = '/admin/login';

export const STAFF_FULL_FLOW: ManualFlowStep[] = [
  {
    who: 'スタッフ',
    when: '初回・動画を会員に渡す前',
    where: '/admin/login → ルーム一覧',
    what: 'ログインし、「新規」で会員ルームを作成（氏名・部屋コード・入室パスワード）',
  },
  {
    who: 'スタッフ',
    when: '動画を追加・更新するとき',
    where: 'ルーム詳細画面',
    what: '動画ファイルをアップロード。必要なら入室パスワードを変更',
  },
  {
    who: 'スタッフ',
    when: '会員にお渡しするとき',
    where: 'ルーム詳細の「QR」「URLコピー」',
    what: 'QR画像をLINE送信・印刷、またはURLをコピー。入室パスワードは別途口頭・LINE・紙で伝える',
  },
  {
    who: '会員さん（参考）',
    when: '自宅など',
    where: 'お渡しの /r/部屋コード',
    what: 'パスワード入力後、/watch で動画視聴（スタッフは同じ流れを会員に説明）',
  },
];

export const STAFF_CHECKLIST = [
  '会員ルームを作成した（氏名・部屋コード・入室パスワード）',
  '動画を1本以上アップロードした（または「後で追加」と伝えた）',
  'QRまたはURLを会員に渡した',
  '入室パスワードを別途伝えた（URLと同時に渡さない運用でも可）',
  '困ったときはLINEまたは来院時に聞いてほしいと伝えた',
] as const;
