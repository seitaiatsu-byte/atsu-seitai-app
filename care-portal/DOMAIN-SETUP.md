# 本番ドメインの決め方

## 決めたドメイン

| 用途 | URL |
|------|-----|
| **会員向け本番（推奨）** | `https://care.atsu-seitai.jp` |
| **暫定（いま動いている）** | `https://atsu-care-portal.vercel.app` |

会員に渡すQR・URLは **顧客番号そのまま** の形です。

```
https://care.atsu-seitai.jp/r/1234
```

（`room-` は付けません。顧客番号 1234 → 部屋コード 1234）

---

## いまの状態

- Vercel の無料URL（`atsu-care-portal.vercel.app`）で本番稼働中
- `VITE_PUBLIC_SITE_URL` が未設定のため、QR・URLコピーは **今開いているドメイン** を使う
- 独自ドメインは **まだDNS未接続**（コード側の推奨ドメインだけ決めた状態）

---

## 独自ドメインを有効にする手順

### 1. ドメインを用意する

`atsu-seitai.jp`（またはお持ちのドメイン）のDNS管理画面を開く。

サブドメイン **`care`** を追加する（例: `care.atsu-seitai.jp`）。

### 2. Vercel にドメインを追加

1. https://vercel.com → プロジェクト **atsu-care-portal**
2. **Settings** → **Domains**
3. `care.atsu-seitai.jp` を追加
4. 画面に表示される **CNAME** または **Aレコード** を、ドメイン管理側に登録

### 3. 環境変数を設定して再デプロイ

Vercel → **Settings** → **Environment Variables** に追加:

```
VITE_PUBLIC_SITE_URL = https://care.atsu-seitai.jp
```

（Production にチェック）

その後、再デプロイ（main に push するか、Vercel で Redeploy）。

### 4. 確認

- `https://care.atsu-seitai.jp/admin/login` が開く
- 管理画面で QR・URLコピー → `https://care.atsu-seitai.jp/r/1234` になっている

---

## 別のドメインにしたい場合

`VITE_PUBLIC_SITE_URL` と `src/lib/siteConfig.ts` の `RECOMMENDED_PUBLIC_SITE_URL` を、決めたURLに変更してください。

---

## 注意

- すでに印刷済みのQR（vercel.app）は、ドメイン変更後も **古いURLのまま** 動きます（Vercel側で両方有効にしておけばOK）
- 新しく渡すQRから新ドメインが使われます
