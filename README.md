# FlowShift

予定から繰り返し業務を見つけ、現在の作業をそのまま自動化するのではなく、目的と人の判断から業務を再設計するWebアプリです。

Google Calendarの読み取り、DeepSeek V4 Flashによるヒアリング候補・業務モデル・改善案の生成まで実装しています。

## 実装済み

- Google OAuth 2.0 Authorization Code + PKCE
- Google Calendarの予定一覧取得（タイトル、開始・終了、繰り返し情報のみ）
- 候補を1件選んでからDeepSeekへ送るデータ最小化
- D1のユーザー、暗号化OAuthトークン、ハッシュ化セッション保存
- 読み取り専用Calendar scopeと接続解除時のToken revoke
- 選択式ヒアリング、BusinessTask確認、目的からの業務再設計
- Cloudflare Workers、Hono、React、Vite、Zod

## ローカル起動

必要環境はNode.js 22以降です。

1. `apikey.txt` にDeepSeek APIキーを1行で保存します。
2. Google CloudでGoogle Calendar APIを有効化します。
3. OAuth同意画面を設定し、「ウェブ アプリケーション」のOAuthクライアントを作成します。
4. 承認済みリダイレクトURIに `http://localhost:5173/api/google/callback` を完全一致で登録します。
5. ダウンロードした認証情報JSONをプロジェクト直下へ `google-oauth.json` という名前で保存します。
6. 起動します。

```powershell
npm.cmd install
npm.cmd run dev
```

`predev` が次を自動で行います。

- `apikey.txt` と `google-oauth.json` からGit対象外の `.dev.vars` を生成
- 初回だけ `token-encryption-key.txt` を生成
- ローカルD1へ `migrations/` を適用

Google認証情報がない場合もデモモードとDeepSeek連携は利用できます。Google連携ボタンは、設定不足が分かる無効状態になります。

## データの扱い

- Calendar scopeは `calendar.events.readonly` です。
- 一覧取得時は、予定のタイトル、開始・終了時刻、繰り返し情報だけをGoogleへ要求します。
- DeepSeekへ送るのは、ユーザーが選択した予定のタイトル・所要時間とヒアリング回答だけです。
- Calendar予定と分析結果は保存しません。
- Google Refresh TokenはAES-GCMで暗号化してD1へ保存します。
- ブラウザにはランダムなセッションIDだけをHttpOnly / SameSite=Lax cookieとして保存します。
- 接続解除時はGoogle Tokenをrevokeし、D1の認証情報とセッションを削除します。

## 検証

```powershell
# 型検査、production build、secret混入検査
npm.cmd run build

# dev起動中のCalendar認証ガードとDeepSeek実API疎通
npm.cmd run smoke

# Cloudflareへのアップロード内容をdry-run
npm.cmd run cf:dry-run
```

`build` は `.dev.vars` を削除してから成果物を作り、ローカルのAPIキー、Google OAuth secret、Token暗号鍵が `dist/` に含まれないことを検査します。次回の `dev` で `.dev.vars` は再生成されます。

## Cloudflare本番設定

本番用OAuthクライアントには、実際のオリジンを使った `https://<your-domain>/api/google/callback` を登録してください。次の値はファイルや `wrangler.jsonc` へ書かず、Cloudflare secretとして設定します。

```powershell
npx.cmd wrangler secret put DEEPSEEK_API_KEY
npx.cmd wrangler secret put GOOGLE_CLIENT_ID
npx.cmd wrangler secret put GOOGLE_CLIENT_SECRET
npx.cmd wrangler secret put TOKEN_ENCRYPTION_KEY
```

`TOKEN_ENCRYPTION_KEY` には32バイト以上のランダム値を使います。D1を本番環境へプロビジョニングし、公開前に次を実行します。

```powershell
npm.cmd run db:migrate:remote
npm.cmd run deploy
```

OAuth同意画面がTestingの場合はテストユーザーを登録してください。一般公開時は、Googleの審査要件も確認してください。

## 構成

```text
migrations/                 D1 schema
shared/calendar-schema.ts   Calendar APIの共有schema
shared/design-schema.ts     業務設計の共有schema
src/App.tsx                 画面と接続・選択フロー
src/api.ts                  ブラウザからWorker APIへの通信
worker/google-calendar.ts   OAuth、暗号化Token、Calendar取得
worker/deepseek.ts          DeepSeek呼び出しと出力検証
worker/index.ts             Hono routesと認証ガード
wrangler.jsonc              Worker、D1、secret設定
```

詳細なコンセプトとセキュリティ要件は `AI-Native Business Designer_v1.2.md` を参照してください。
