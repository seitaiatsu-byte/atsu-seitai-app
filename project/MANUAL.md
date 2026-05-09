# 🌈 あつ整体院システム運用マニュアル（本番反映手順つき）

このマニュアルは、今回追加した **売上集計・分析ページ** と **顧客登録/修正まわり** を本番で使うための手順です。

---

## ✅ まず結論

- **ブラウザ更新だけでは反映されません。**
- 理由:
  - 画面（Reactコード）を変更しているため → **Vercel再デプロイが必要**
  - DB構造/RLSを修正しているため → **Supabase SQL実行が必要（未実行の場合）**

---

## 🧭 全体フロー（最短）

1. Supabase SQL を実行（未実行なら）
2. GitHub に push
3. Vercel で再デプロイ
4. 本番画面で動作確認

---

## 👶 はじめてでもできる「貼るだけ・押すだけ」手順

### STEP 0: 先にこれを開く

- `project` フォルダを Cursor で開いておく
- ブラウザで以下2つを開く
  - Supabase ダッシュボード
  - Vercel ダッシュボード

---

### STEP 1: Supabase（SQLを貼って実行）

1. Supabase → **SQL Editor** を開く  
2. 左のファイルから次を開いて **全文コピー**  
   - `supabase/migrations/20260502200000_subscription_product_sales_schema_cache_rls.sql`
3. SQL Editor に **貼り付け**
4. 右下の **Run**（または緑の実行ボタン）を押す
5. 終わったら同じ手順で次も実行  
   - `supabase/migrations/20260502210000_ensure_customer_referral_columns.sql`

> 「Run and enable RLS」が出たら、それを押してOKです。  
> エラーが出たら、エラーメッセージ全文をそのままチャットに貼ってください。

---

### STEP 2: Git（コピペで実行）

Cursor のターミナルで、下を **上から1行ずつ** 実行:

```bash
cd "c:\Users\bodys\Downloads\project-bolt-sb1-hn64rjhq-main\project-bolt-sb1-hn64rjhq-main\project"
git status
git add .
git commit -m "feat: sales aggregation dashboard and customer edit workflow"
git push origin main
```

#### もし `main` で失敗したら

```bash
git branch
```

表示された現在ブランチ名で push:

```bash
git push origin <ここにブランチ名>
```

---

### STEP 3: Vercel（ボタン押すだけ）

1. Vercel → 対象プロジェクトを開く
2. **Deployments** タブ
3. 最新デプロイの右側メニューから **Redeploy** を押す
4. 完了まで待つ（通常1〜3分）

---

### STEP 4: 本番確認（チェックするだけ）

1. 本番URLを開く
2. 画面下ナビに **「集計分析」** があるか確認
3. 「集計分析」→「売上集計」で表が出るか確認
4. 設定 → 顧客登録で保存できるか確認
5. 設定 → 顧客名簿一覧 → 修正 で編集保存できるか確認
6. 来院入力 / 物販入力 / サブスク入力が保存できるか確認

---

### STEP 5: うまくいかない時（そのまま報告）

以下をそのまま貼ってください:

- どのSTEPで止まったか（例: STEP2）
- エラーメッセージ全文
- 可能ならスクショ1枚

---

## 1) 🛠 Supabase SQL 実行（未実行の場合のみ）

### 実行場所
- Supabase Dashboard → **SQL Editor**

### 実行するもの（このリポジトリ内）
- `supabase/migrations/20260502200000_subscription_product_sales_schema_cache_rls.sql`
- `supabase/migrations/20260502210000_ensure_customer_referral_columns.sql`

> すでに同等SQLを実行済みならスキップ可。

### 実行後
- 1〜2分待つ
- 必要に応じて `NOTIFY pgrst, 'reload schema';` を再実行

---

## 2) 📦 GitHubへ反映（push）

プロジェクトフォルダで実行:

```bash
git status
git add .
git commit -m "feat: add sales aggregation dashboard and unify customer edit workflow"
git push origin main
```

### うまくいかない時
- ブランチ名が `main` でない場合:
  - `git branch` で現在ブランチ確認
  - `git push origin <現在ブランチ名>`
- 初回upstreamが必要な場合:
  - `git push -u origin main`

---

## 3) 🚀 Vercel再デプロイ

### 自動デプロイONの場合
- `main` pushで自動反映（数分待つ）

### 手動の場合
- Vercel Dashboard → Project → Deployments → **Redeploy**

---

## 4) 🧪 反映チェック（重要）

### A. 売上集計・分析ページ
- ボトムナビに **「集計分析」** が表示される
- 開くと:
  - 「売上集計」タブ
  - 「分析メニュー」タブ
  - 日別集計表（現金/カード・日計）が見える

### B. 顧客登録/修正
- 「設定」→ 顧客登録でボタンが押せる
- 未入力時は画面下に「不足項目」が表示される
- 名簿一覧の「修正」から、新規登録と同じUIで編集できる

### C. 登録機能
- 来院入力 / 物販入力 / サブスク入力がエラーなく保存できる

---

## 🧩 画面仕様メモ（今回実装）

### 売上集計の分類
- データ元:
  - `visit_records`
  - `product_sales`
  - `subscription_records`
- 支払方法:
  - 現金
  - カード/その他
- 種別:
  - 振込
  - 都度
  - 回数券
  - サブスク
  - 物販

> 判定は `payment_method` + `payment_detail/import_kind_text/menu_name/memo` を組み合わせて実施。

---

## 📍 よくある質問

### Q. 「更新（リロード）だけ」でいける？
- **いけません。**
- 最低でも **Vercel再デプロイ** が必要です。

### Q. SQLも毎回必要？
- DB未反映なら必要。既に適用済みなら不要です。

### Q. 数字がExcelと少し違う
- 種別判定のキーワード差（例: 回数券表記ブレ）が原因になりやすいです。
- 該当日1件の差分を特定すれば調整可能です。

---

## 📂 今回の主な変更ファイル

- `src/components/SalesAggregationDashboard.tsx`（新規）
- `src/App.tsx`（「集計分析」ナビ追加）
- `src/components/NewCustomerForm.tsx`（新規/編集共通化）
- `src/components/CustomerImport.tsx`（修正導線を共通フォームへ）
- `src/lib/supabaseColumnErrors.ts`（列エラー判定ヘルパー）
- `supabase/migrations/20260502200000_subscription_product_sales_schema_cache_rls.sql`
- `supabase/migrations/20260502210000_ensure_customer_referral_columns.sql`

---

## 🎯 最終チェックリスト

- [ ] Supabase SQLを必要分実行した
- [ ] GitHubにpushした
- [ ] Vercelを再デプロイした
- [ ] 本番で「集計分析」タブが見える
- [ ] 顧客「新規登録」「修正」がどちらも動く
- [ ] 来院/物販/サブスクが保存できる

---

必要なら次版で、このマニュアルを **画面キャプチャ付き（クリック手順付き）** に拡張します。
