# FlowShift

FlowShiftは、本人が持つ業務知識を質問で引き出し、構造化し、AI時代の別の設計可能性を検証するためのAX設計支援ツールです。

```text
発見 → コンテクスト収集 → 構造化 → 再設計仮説 → 検証 → 人が判断
```

Google Calendarは業務を理解するデータではなく、質問を始める索引として使います。予定の頻度だけから、業務の廃止や自動化を断定しません。

## 実装済み

- 過去28日分のCalendar取得、ページネーション、定例予定IDの保持
- 定例予定IDと正規化タイトルによる決定論的なWorkGroup集約
- 4週間の業務傾向と、観測事実に基づくDiscovery Dashboard
- 業務に応じた選択式ヒアリングと自由入力
- 目的、関係者、工程、判断、例外、制約、依存関係、リスク、成果物の構造化
- 項目別の「確認済み・一部確認・未確認」表示
- Facts / Assumptions / Unknownsを分離した条件付き再設計仮説
- 内容に応じた検証計画と、人による採用・保留・却下
- ユーザーが確認した改善プロジェクトだけをD1へ保存
- Google OAuth、暗号化トークン、ハッシュ化セッション
- Cloudflare Workers、Hono、React、Vite、Zod

## ローカル起動

必要環境はNode.js 22以降です。

1. `apikey.txt` にAI APIキーを1行で保存します。
2. Google CloudでGoogle Calendar APIを有効化します。
3. OAuth同意画面を設定し、ウェブアプリケーションのOAuthクライアントを作成します。
4. 承認済みリダイレクトURIへ `http://localhost:5173/api/google/callback` を登録します。
5. 認証情報JSONをプロジェクト直下へ `google-oauth.json` として保存します。
6. 起動します。

```powershell
npm.cmd install
npm.cmd run dev
```

`predev`がローカル用secretを生成し、D1 migrationを適用します。Google認証情報がない場合もデモは利用できます。

## データの扱い

- Calendar scopeは `calendar.events.readonly` です。
- 過去28日のタイトル、開始・終了、定例予定IDだけを取得します。
- 外部AIサービスへ送るのは、選択したWorkGroupの観測情報とヒアリング回答だけです。
- Calendar全件と会話全文は保存しません。
- 保存するのは、ユーザーが確認した業務モデル、再設計仮説、検証計画、判断状態だけです。
- Google Refresh TokenはAES-GCMで暗号化してD1へ保存します。
- ブラウザにはランダムなセッションIDだけをHttpOnly / SameSite=Lax cookieとして保存します。

## 検証

```powershell
npm.cmd run workgroups:check
npm.cmd run build
npm.cmd run smoke
npm.cmd run secret:check
npm.cmd run cf:dry-run
```

`build`はローカルsecretを削除してから成果物を作り、secretが`dist/`へ混入していないことを検査します。次回の`dev`でローカル用secretは再生成されます。

## CI/CD

`.github/workflows/ci-cd.yml`はPull Requestで型・ビルド・secret混入を検証し、`main`へのマージ後にD1 migrationとCloudflare Workersへのデプロイを実行します。

GitHubの`production` environmentには次だけを設定します。

- Environment variable `CLOUDFLARE_ACCOUNT_ID`
- Environment secret `CLOUDFLARE_API_TOKEN`

アプリのAPIキー、OAuth secret、暗号鍵はCloudflare Workers側で管理し、GitHubへ保存しません。

## 構成

```text
migrations/                  D1 schema
shared/calendar-schema.ts    Calendar API schema
shared/work-group.ts         WorkGroupの決定論的集約
shared/design-schema.ts      業務コンテクスト・仮説・検証schema
shared/project-schema.ts     保存する改善プロジェクトschema
src/App.tsx                  Dashboardと設計フロー
src/api.ts                   ブラウザからWorker APIへの通信
worker/google-calendar.ts    OAuth、暗号化Token、Calendar取得
worker/index.ts              API routesと認証ガード
wrangler.jsonc               Worker、D1、secret設定
```
