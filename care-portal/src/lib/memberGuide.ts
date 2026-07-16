export type MemberGuideStep = {
  number: number;
  title: string;
  body: string;
};

export const MEMBER_GUIDE_STEPS: MemberGuideStep[] = [
  {
    number: 1,
    title: 'お渡しのリンクを開く',
    body: 'お渡ししたインターネットのアドレス（URL）やQRコードを、スマホまたはパソコンで開いてください。青くなっている文字をタップ（クリック）すると開きます。',
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

export const MEMBER_LOGIN_ERROR_FALLBACK = '入室に失敗しました。LINEや、直接来院時にお尋ねください。';

export const MEMBER_PASSWORD_HINT = 'お渡しした「入室パスワード」（数字など）をそのまま入れてください';

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
  body: 'あつ整体院の会員さんが、ご自宅などで「あなた専用のセルフケア動画」を安全に見るためのサイトです。お一人ひとりだけが見られる動画をお届けします。',
};

export const MEMBER_ENTRY_EXPLAIN = {
  title: '会員さんはどこから入る？（とても大切）',
  points: [
    'トップページ（サイトの表紙）から入る必要はありません。普段、会員さんが開くのはお渡しした「あなた専用のリンク」またはQRコードだけです。',
    'リンクの形の例：https://atsu-care-portal.vercel.app/r/room-xxxx（room-xxxx はお一人おひとり違います）',
    'QRコードを読み取ると、自動的にその専用ページが開きます。',
    'トップページに来てしまった場合は、お渡しのリンクやQRをもう一度開いてください。',
  ],
};

export const MEMBER_FULL_FLOW: ManualFlowStep[] = [
  {
    who: 'スタッフ',
    when: '動画を渡すとき',
    where: '管理画面',
    what: '会員ルームを作り、動画をアップロードし、専用URL・QR・入室パスワードを準備する',
  },
  {
    who: 'スタッフ → 会員さん',
    when: 'LINE・来院時など',
    where: 'お手持ちのスマホ',
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
  body: '会員向けのトップページではなく、別の「スタッフ管理画面」です。パソコンやタブレットからログインして使います。',
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
    what: 'QR画像をLINE送信・印刷、またはURLをコピー。入室パスワードは別途LINE・口頭・紙で伝える',
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

/** 受付スタッフ向け・はじめてガイド（トップページ用） */
export type ReceptionGuideStep = {
  number: number;
  title: string;
  body: string;
  detail?: string[];
};

export const STAFF_RECEPTION_INTRO = {
  title: '受付スタッフ向け・はじめてガイド',
  subtitle: '会員さんが動画を見るまでの流れを、最初から順番に',
  note: 'このページは会員さんの入り口ではありません。受付・スタッフが操作を覚えるための案内です。',
};

export const STAFF_RECEPTION_STEPS: ReceptionGuideStep[] = [
  {
    number: 1,
    title: '会員さんが来院したら',
    body: 'セルフケア動画を渡す必要がある会員さんが来たら、まずスタッフ用の管理画面を開きます。会員さんはこのトップページ（/）からは動画を見られません。',
    detail: [
      '会員さんには「お渡しした専用リンク」と「入室パスワード」の2つが必要です',
      'その2つを渡す前に、スタッフが管理画面で「会員ルーム」を作っておきます',
    ],
  },
  {
    number: 2,
    title: 'スタッフ用サイトに入る',
    body: '院内のパソコンまたはタブレットで、次のアドレスを開き、スタッフ用メールとパスワードでログインします。',
    detail: ['入口：/admin/login', 'ログイン後は「会員ルーム管理」画面が開きます'],
  },
  {
    number: 3,
    title: '管理画面の基本操作',
    body: 'ログインすると会員ルームの一覧が見えます。「新規」でルームを作り、一覧からルームを開いて動画をアップロードできます。',
    detail: [
      '「新規」… 新しい会員ルームを作成',
      '「開く」… その会員のルーム詳細（動画・QR・URL）',
      'ルーム詳細で動画をアップロードし、QRやURLを会員にお渡しします',
    ],
  },
  {
    number: 4,
    title: '会員ルームを作る（くわしく）',
    body: '「新規」を押して、次のルールで入力します。作成後、自動的にルーム詳細画面に進みます。',
    detail: [
      '会員氏名 … カルテのお名前',
      '顧客番号 … 院内の顧客番号（例：7a53）',
      '部屋コード … room-＋顧客番号（例：顧客番号7a53 → room-7a53）',
      '入室パス … 生年月日の月日4桁（例：3月19日 → 0319）',
    ],
  },
  {
    number: 5,
    title: 'QRコードを作って渡す',
    body: 'ルーム詳細画面でQRコードが表示されます。LINEで送る、印刷する、またはURLをコピーして渡せます。',
    detail: [
      '「QR」ボタン … 一覧からもQRを表示できます',
      '「URLコピー」… 会員の入口リンク（/r/部屋コード）をコピー',
      '「PNG保存」… QR画像を保存してLINE送信などに使えます',
      '入室パスワードはURLとは別に、口頭・LINE・紙などでお渡ししてください',
    ],
  },
  {
    number: 6,
    title: '会員さんへの渡し方（おさらい）',
    body: '会員さんには①専用URLまたはQR、②入室パスワードの2つをお渡しします。会員は /r/部屋コード を開き、パスワードを入れて動画を見ます。',
    detail: [
      '入口の例：https://atsu-care-portal.vercel.app/r/room-7a53',
      '会員向けのくわしい見方は /manual（印刷用）または /guide（個別印刷）を参照',
      '困ったときは「LINEや、直接来院時にお尋ねください」と伝えてください',
    ],
  },
];

export const STAFF_ROOM_CONVENTION = {
  title: '部屋コードと入室パスの決め方（必ず守る）',
  rules: [
    {
      label: '部屋コード（URLに使う）',
      rule: 'room-＋顧客番号',
      example: '顧客番号 7a53 → 部屋コード room-7a53 → URL …/r/room-7a53',
    },
    {
      label: '入室パスワード',
      rule: '生年月日の月日4桁',
      example: '3月19日生まれ → 0319　／　12月5日生まれ → 1205',
    },
  ],
  note: '顧客番号を入力すると部屋コードが自動で入ります。会員さんには「リンク（またはQR）」と「パスワード」を別々にお渡ししてください。',
};

/** 顧客番号から部屋コードを生成（room-7a53 形式） */
export function buildRoomCodeFromCustomerNumber(customerNumber: string): string {
  const sanitized = customerNumber
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  if (!sanitized) return '';
  return sanitized.startsWith('room-') ? sanitized : `room-${sanitized}`;
}

/** 生年月日（月日）から入室パス候補を生成 */
export function buildPasswordFromBirthMonthDay(month: number, day: number): string {
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

export const MEMBER_MANUAL_PATH = '/manual';
