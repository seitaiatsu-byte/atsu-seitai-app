# 本番ドメインの決め方

## 決めたドメイン

| 優先 | URL |
|------|-----|
| **第一候補** | `https://a2karada.jp` |
| **代替（a2karada が取れない場合）** | `https://a2body-care.jp` |
| **暫定（いま動いている）** | `https://atsu-care-portal.vercel.app` |

会員に渡すQR・URLは **顧客番号そのまま** の形です。

```
https://a2karada.jp/r/1234
```

（顧客番号 1234 → 部屋コード 1234）

---

## いまの状態

- Vercel の無料URL（`atsu-care-portal.vercel.app`）で本番稼働中
- `VITE_PUBLIC_SITE_URL` が未設定のため、QR・URLコピーは **今開いているドメイン** を使う
- 独自ドメインは **まだDNS未接続**

---

## 独自ドメインを有効にする手順

### 1. ドメインを取得・用意する

1. まず **`a2karada.jp`** が取得できるか確認
2. 取れなければ **`a2body-care.jp`** を取得

（お名前.com、ムームードメイン、Vercel Domains など）

### 2. Vercel にドメインを追加

1. https://vercel.com → プロジェクト **atsu-care-portal**
2. **Settings** → **Domains**
3. `a2karada.jp`（または `a2body-care.jp`）を追加
4. 表示される **DNSレコード** を、ドメイン管理側に登録

`www` も使う場合は `www.a2karada.jp` も追加可。

### 3. 環境変数を設定して再デプロイ

Vercel → **Settings** → **Environment Variables**:

```
VITE_PUBLIC_SITE_URL = https://a2karada.jp
```

（代替ドメインの場合は `https://a2body-care.jp`）

Production にチェック → 再デプロイ。

### 4. 確認

- `https://a2karada.jp/admin/login` が開く
- 管理画面で QR・URLコピー → `https://a2karada.jp/r/1234` になっている

---

## コード上の設定場所

| ファイル | 内容 |
|----------|------|
| `src/lib/siteConfig.ts` | `RECOMMENDED_PUBLIC_SITE_URL` / `ALTERNATE_PUBLIC_SITE_URL` |
| `.env` / Vercel 環境変数 | `VITE_PUBLIC_SITE_URL`（実際にQRに使う値） |

---

## 注意

- DNS反映前に `VITE_PUBLIC_SITE_URL` だけ先に入れると、QRが未開通のURLを指します。**DNSが通ってから** 設定してください
- すでに印刷済みのQR（vercel.app）も、Vercelで旧ドメインを残せば引き続き動きます
