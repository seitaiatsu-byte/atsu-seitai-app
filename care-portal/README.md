# あつ整体院 セルフケア動画ポータル

会員ごとに **鍵付きの個別ルーム** を作り、院内で撮影したセルフケア動画をスタッフがアップロードする別サイトです。

- 想定会員数: 約200人
- 動画: 会員ごとに個別（月30本程度→徐々に減少想定）
- 会員は **部屋URL + 入室パス** でスマホから視聴
- 整体院の顧客管理アプリ（`project/`）とは完全に別

## 機能

| 対象 | 内容 |
|------|------|
| 会員 | `/r/部屋コード` で入室 → 自分専用動画一覧 → タップで再生 |
| スタッフ | ルーム作成、動画アップロード、入室パス変更、公開/非公開 |

## 技術構成

- React + Vite + Tailwind（`care-portal/`）
- Supabase（DB・認証・Storage）
- Edge Function `care-video-playback`（署名付き再生URL）

## セットアップ

### 1. 依存関係

```bash
cd care-portal
npm install
cp .env.example .env
# .env に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を設定
npm run dev
```

### 2. DBマイグレーション

Supabase SQL Editor または CLI で以下を実行:

```
care-portal/supabase/migrations/20260716100000_care_portal_schema.sql
```

### 3. スタッフアカウント登録

1. Supabase Dashboard → Authentication でスタッフ用メールユーザーを作成
2. SQL Editor でスタッフに権限付与（`ユーザーUUID` を置き換え）:

```sql
INSERT INTO care_staff (user_id, display_name)
VALUES ('ユーザーUUID', '院長')
ON CONFLICT (user_id) DO NOTHING;
```

### 4. Edge Function デプロイ

```bash
cd care-portal
npx supabase functions deploy care-video-playback --project-ref YOUR_PROJECT_REF
```

動画再生にはこの Function が必須です（Storage は非公開のため）。

### 5. Vercel デプロイ（別サイト）

- **新しい Vercel プロジェクト** を作成
- Root Directory: `care-portal`
- Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- 本番ドメイン決定後: `VITE_PUBLIC_SITE_URL=https://care.atsu-seitai.jp`（手順は `DOMAIN-SETUP.md`）
- 推奨ドメイン: `https://care.atsu-seitai.jp`（整体院アプリとは別サブドメイン）

## 運用フロー

1. 管理画面 `/admin/login` でスタッフログイン
2. 「新規」で会員ルーム作成（氏名・部屋コード・入室パス）
3. 会員に **URL** と **入室パス** をお渡し（LINE・紙など）
4. ルーム詳細から動画をアップロード（院内撮影の MP4）
5. 月1回などで「入室パス変更」（既存セッションは自動無効化）

### 会員向けURL例

```
https://（本番ドメイン）/r/1234
```

顧客番号がそのまま部屋コードです（`room-` は付けません）。

## セキュリティ

- 動画バケット `care-videos` は非公開
- 再生URLは Edge Function 経由で **1時間限定の署名付きURL**
- 入室パスは bcrypt（pgcrypto）でハッシュ保存
- パス変更時は `care_room_sessions` を削除して再入室を要求

## コスト目安（200人規模）

- Supabase Storage: 動画容量に応じて（5〜8分 MP4 で 1本 50〜150MB 想定）
- 転送量: 会員の再視聴頻度による
- 本格運用で転送が増えたら Cloudflare Stream 等への移行を検討

## ディレクトリ

```
care-portal/
  src/pages/          # 会員・管理画面
  src/lib/careApi.ts  # API ラッパー
  supabase/migrations/
  supabase/functions/care-video-playback/
```
