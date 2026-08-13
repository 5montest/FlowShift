# FlowShift

FlowShiftは、本人が持つ業務知識を質問で引き出し、構造化し、AI時代の別の設計可能性を検証するためのAX設計支援ツールです。

「何かRPAにしたい仕事はありますか？」と聞かれても現場は答えられません。だからFlowShiftが先に話しかけます。

```text
過去4週間のカレンダーを見ると、
売上レポート作成を4回（合計3時間）行っています。
まず「売上レポート作成」について、実際には何をしているか教えてください。
```

```text
声かけ（発見） → 質問に答える（理解） → 内容を確認 → 再設計仮説 → 検証 → 人が判断
```

Google Calendarは業務を理解するデータではなく、質問を始める索引として使います。予定の頻度だけから、業務の廃止や自動化を断定しません。

## 実装済み

- 過去28日分のCalendar取得、ページネーション、定例予定IDの保持
- 定例予定IDと正規化タイトルによる決定論的なWorkGroup集約
- 固定7分類（会議／資料作成／データ処理／顧客対応／開発・制作／休憩・私用／その他）へのAI割り当て（regexフォールバック・ブラウザキャッシュ付き）
- ワークスペース最上部の「声かけ」：繰り返し業務を選定し、アプリから質問を始める（質問は表示中に先読み）
- 選択式の質問カード（意味を機械的に保持）と自由入力のエスケープ
- 回答途中の自動下書き（業務ごとに複数並行、いつでも中断・再開。ブラウザ内にのみ保存）
- 回答のたびに決定論で更新される業務モデル（確認済み・一部確認・未確認）
- 追加質問とLLM整理は確認画面の裏で非同期実行（ブロッキングのAI待ちは仮説生成の1回だけ）
- Facts / Assumptions / Unknownsを分離した条件付き再設計仮説（段階表示）
- 検証ノート：未確認事項への回答、仮説更新、採用・保留・却下・削除
- 回答の修正（回答済みの内容はどこからでも上書きできる）
- 採用した仮説の削減トラッキング（保存時点と直近4週間のカレンダー実測の比較、回数と合計時間、全体合計）
- 業務の読み取り専用詳細パネル（内訳から回数・時間・下書き/仮説の有無を確認してから答える）
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

`predev`がローカル用secretを生成し、D1 migrationを適用します。

## データの扱い

- Calendar scopeは `calendar.events.readonly` です。あわせて `openid email profile` を要求し、メールアドレスとプロフィール画像URLをログイン表示のために保存します。
- 過去28日のタイトル、開始・終了、定例予定IDだけを取得します。
- 外部AIサービスへ送るのは、選択したWorkGroupの観測情報とヒアリング回答、および業務分類のための予定タイトルです（予定の本文・参加者は取得していません）。分類結果はブラウザにキャッシュされ、同じタイトルは再送信されません。
- Calendar全件は保存しません。サーバー（D1）に残すのは、ユーザーが確認して保存した業務モデル・回答（answerEvidence）・仮説・検証計画だけです。
- 回答途中のセッションはブラウザのlocalStorageにのみ下書き保存します。サーバーへは送信せず、仮説の保存・明示的な破棄・30日経過で削除されます。
- 保存するのは、ユーザーが確認した業務モデル、再設計仮説、検証計画、判断状態、および任意で設定したプロフィール（職種・役職・勤務形態）です。プロフィールは質問生成・分類・仮説生成の精度向上のため、分析時にAIへ送信されます。
- Google Refresh TokenはAES-GCMで暗号化してD1へ保存します。
- ブラウザにはランダムなセッションIDだけをHttpOnly / SameSite=Lax cookieとして保存します。

## 検証

```powershell
npm.cmd run check        # 決定論ロジックの回帰テスト（WorkGroup・回答忠実性・プロジェクトv1→v2・業務分解）
npm.cmd run build
npm.cmd run smoke:http   # devサーバー起動中に。認証境界とOriginの検査（AIキー不要）
npm.cmd run smoke        # devサーバー起動中に。実LLM込みの通し検査
npm.cmd run secret:check
npm.cmd run cf:dry-run
```

`build`はローカルsecretを削除してから成果物を作り、secretが`dist/`へ混入していないことを検査します。次回の`dev`でローカル用secretは再生成されます。

## CI/CD

`.github/workflows/ci-cd.yml`はPull Requestで回帰テスト（`npm run check`）・型・ビルド・secret混入を検証し、`main`へのマージ後にD1 migrationとCloudflare Workersへのデプロイを実行します。

GitHubの`production` environmentには次だけを設定します。

- Environment variable `CLOUDFLARE_ACCOUNT_ID`
- Environment secret `CLOUDFLARE_API_TOKEN`

アプリのAPIキー、OAuth secret、暗号鍵はCloudflare Workers側で管理し、GitHubへ保存しません。

## 構成

```text
migrations/                  D1 schema
shared/calendar-schema.ts    Calendar API schema
shared/work-group.ts         WorkGroup集約・声かけ候補の選定・削減の計算
shared/design-schema.ts      業務コンテクスト・仮説・検証schema（文脈次元が唯一の定義）
shared/project-schema.ts     改善プロジェクトschema（v1→v2読み時アップグレード含む）
shared/context-questions.ts  決定論的な質問カタログ（フォールバック・情報追加）
shared/interview.ts          回答meaningを正本とする決定論的な構造化
shared/demo-fixtures.ts      チェックスクリプト用フィクスチャ
src/App.tsx                  状態シェル（セッションflow・先読みキャッシュ）
src/screens/                 connect / workspace / session / hypothesis / note の5画面
src/components/              QuestionCard・WorkDecomposition など共有部品
src/api.ts                   ブラウザからWorker APIへの通信
worker/deepseek.ts           LLM呼び出し（プロンプト形式はZodから生成）
worker/google-calendar.ts    OAuth、暗号化Token、Calendar取得
worker/index.ts              API routes（テーブル駆動AIルート・統合PATCH）
wrangler.jsonc               Worker、D1、secret設定
```
