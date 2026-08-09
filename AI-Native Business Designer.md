# FlowShift
## MVP設計書 v1.0

### 1. プロダクト概要

**FlowShift** は、日常業務をAIとの対話によって構造化し、現行業務の部分的な自動化ではなく、**AIが存在することを前提として業務そのものを再設計するAX支援アプリケーション**である。

Google Calendarなどから実際の予定を取得し、それを起点にAIがユーザーへヒアリングする。

ユーザー自身が明確に認識できていない業務内容・目的・手順・課題を整理し、

**現行業務 → 課題 → 従来型改善 → AI-Native業務設計**

までを一貫して生成する。

---

# 2. 背景となる課題

企業では、業務改善を目的としてRPA・SaaS・生成AIなどのツールが導入されることが多い。

しかし実際には、

「業務改善したい」
↓
「RPAを導入しよう」
↓
「何を自動化しますか？」
↓
「特に思いつかない」
↓
利用されない

という失敗が発生する。

原因は、ツールの性能以前に、

**「現場自身が自分たちの業務を構造化・言語化できていない」**

ことにある。

さらに従来型の業務改善では、

「現在、人間が行っている作業をどうAIやRPAに置き換えるか」

という発想になりやすい。

しかし、この方法では、人間向けに作られた非効率なプロセスそのものが温存される。

---

# 3. プロダクトの思想

本プロダクトでは、

> **AIが最初から存在していたなら、この業務はどう設計されるべきだったか？**

を中心的な問いとする。

従来型：

```text
既存業務
 ↓
作業分解
 ↓
自動化できる箇所を探す
 ↓
RPA / AIへ置換
```

AI-Native AX：

```text
業務の目的
 ↓
必要な情報
 ↓
必要な判断
 ↓
必要なアウトプット
 ↓
AI / System / Human の役割を再配置
 ↓
新しい業務フローを設計
```

目標は単なるAutomationではない。

**Business Process Redesign**

をAIによって支援する。

---

# 4. MVPで検証したい仮説

### 仮説1

ユーザーは、

「仕事上の課題を教えてください」

と聞かれても答えにくい。

一方で、

「毎週水曜日の『売上レポート作成』では具体的に何をしていますか？」

であれば答えられる。

したがって、抽象的な課題入力ではなく、

**実際の行動から逆算する方が業務分析しやすい。**

### 仮説2

カレンダーは業務そのものを完全には表していないが、

**AIヒアリングを開始するための観測データ**

として利用できる。

### 仮説3

LLMはユーザーとの対話から非構造な業務説明を構造化し、

業務目的・工程・利用システム・判断・課題として整理できる。

### 仮説4

構造化した業務情報を利用すれば、

単なる自動化提案だけでなく、

**AI前提の業務再設計案**

を生成できる。

---

# 5. MVPの成功条件

MVPでは次の体験が成立すれば成功とする。

```text
Google Calendar
        ↓
実際の予定を取得
        ↓
AIが業務候補を発見
        ↓
ユーザーが1業務を選択
        ↓
AIが3〜5問ヒアリング
        ↓
現行業務を構造化
        ↓
問題点を分析
        ↓
従来型の改善案を生成
        ↓
AI-Native Workflowを生成
```

最重要となる成果物は、

**「AI-Native Workflow」**

である。

---

# 6. ターゲットユーザー

MVPでは個人ユーザーに限定する。

想定：

- 社内DX担当者
- 情報システム担当者
- 業務改善担当者
- チームリーダー
- 自分自身の仕事を改善したい社員

組織単位での分析はMVP対象外とする。

---

# 7. MVPユーザーストーリー

ユーザーはGoogle Calendarを接続する。

↓

直近1〜2週間の予定が表示される。

↓

AIが、

- 会議
- 定型業務
- 資料作成
- 顧客対応
- 集計作業
- 企画
- その他

などに分類する。

↓

AIが改善可能性のありそうな予定を提示。

例：

```text
改善候補

1. 売上レポート作成
   毎週45分
   定型作業の可能性：高

2. 顧客データ更新
   毎日30分
   手作業の可能性：高

3. 営業定例
   毎週60分
   会議改善の可能性：中
```

↓

「売上レポート作成」を選択。

↓

AIヒアリング開始。

---

# 8. AIヒアリング

AIはいきなり改善策を提示しない。

まず業務理解を行う。

想定質問：

```text
この業務は何のために行っていますか？
```

```text
実際にはどのような作業をしていますか？
```

```text
どのシステムやツールを使いますか？
```

```text
毎回ほぼ同じ手順ですか？
```

```text
最終的に誰が、何を確認するためのものですか？
```

ユーザー：

```text
SalesforceからCSVを落として、
Excelに貼り付けて集計します。

そのグラフをPowerPointに貼って
上司へTeamsで送っています。
```

AIは内部的にStructured Dataへ変換する。

---

# 9. 業務構造モデル

```json
{
  "name": "売上レポート作成",
  "purpose": "上司が売上状況と異常を把握する",
  "frequency": {
    "type": "weekly",
    "count": 1
  },
  "duration_minutes": 45,
  "trigger": "毎週月曜日",
  "inputs": [
    "Salesforce売上データ"
  ],
  "tools": [
    "Salesforce",
    "Excel",
    "PowerPoint",
    "Teams"
  ],
  "steps": [
    {
      "order": 1,
      "action": "SalesforceからCSV取得",
      "actor": "human"
    },
    {
      "order": 2,
      "action": "Excelへ貼り付け",
      "actor": "human"
    },
    {
      "order": 3,
      "action": "売上集計",
      "actor": "human"
    },
    {
      "order": 4,
      "action": "PowerPointへグラフ貼付",
      "actor": "human"
    },
    {
      "order": 5,
      "action": "Teamsで上司へ共有",
      "actor": "human"
    }
  ],
  "decision_points": [
    "前週比で大きな変化があるか"
  ],
  "output": "週次売上報告",
  "pain_points": [
    "CSV転記",
    "毎回同じ集計",
    "資料作成"
  ]
}
```

---

# 10. 業務理解で重視する情報

AIは単なる「操作」を集めるのではなく、

### Purpose

なぜこの業務が存在するのか。

### Input

何を材料としているのか。

### Process

どのような処理をしているのか。

### Decision

人間はどこで判断しているのか。

### Output

何を生み出しているのか。

### Consumer

誰がその結果を必要としているのか。

### Constraint

法務・権限・システム・組織上の制約は何か。

を整理する。

---

# 11. 改善分析

現行業務について以下を評価する。

```text
Repeatability
反復性

Manual Work
手作業度

Data Transfer
転記・データ移動量

Decision Complexity
判断の複雑さ

Exception Rate
例外発生率

Human Value
人間が介在する価値

Frequency
頻度

Time Cost
所要時間
```

LLMだけで適当に点数を決めず、

構造化した情報からアプリケーション側でも計算する。

---

# 12. 改善スコア

例：

```text
Opportunity Score =
 Frequency
 × Time Cost
 × Repeatability
 × Manual Work
```

ただし最終的な優先順位には、

- 実装難易度
- 例外率
- リスク
- 人間による判断の必要性

を加味する。

表示：

```text
改善価値      85 / 100
実装容易性    72 / 100
AI適合度      91 / 100

総合優先度
HIGH
```

---

# 13. 従来型改善案

まず現在のフローを維持した場合の改善案を提示する。

### CURRENT

```text
Salesforce
 ↓
CSV取得
 ↓
Excel転記
 ↓
集計
 ↓
PowerPoint
 ↓
Teams共有
```

### AUTOMATED

```text
Salesforce API
 ↓
自動集計
 ↓
PowerPoint自動生成
 ↓
Teams投稿
```

結果：

```text
45分 / 週
↓
5分 / 週

年間約35時間削減
```

---

# 14. AI-Native Redesign

その後、

**「この業務が存在する目的」**

まで戻る。

目的：

```text
上司が売上の異常・重要な変化を把握する
```

AI：

```text
週次レポートそのものが
必須ではない可能性があります。
```

AI-Native Workflow：

```text
Salesforce
     ↓
データ取得
     ↓
AI Analyst
 ├ 売上変化分析
 ├ 異常検知
 ├ 原因候補分析
 └ コメント生成
     ↓
重要な変化あり？
   ↓       ↓
 YES       NO
 ↓         ↓
Teams      終了
通知
 ↓
必要な場合のみ
人間が確認
```

つまり、

**「週次売上レポート作成」という仕事そのものを廃止する。**

ここをMVP最大の見せ場とする。

---

# 15. Human / AI / System Allocation

AI-Native業務設計では、各工程を以下へ割り当てる。

### System

決定論的に処理できるもの。

例：

- API取得
- データ保存
- ルール判定
- システム連携

### AI

曖昧性を含むが、大量処理可能なもの。

例：

- 分類
- 要約
- 異常理由の説明
- 文書生成
- 自然言語理解

### Human

責任・価値判断・例外対応を必要とするもの。

例：

- 最終判断
- 対外的な重要意思決定
- AIの例外処理
- 新しい問題の発見
- 合意形成

目標は人間を排除することではなく、

**人間が担当すべき仕事を再定義すること。**

---

# 16. 改善フレームワーク

AIは以下の順番で業務を再考する。

```text
1. REMOVE
その業務・工程自体が必要か

2. REDUCE
頻度・量を減らせないか

3. REDESIGN
目的からプロセスを再構成できないか

4. INTEGRATE
システム同士を直接接続できないか

5. AUTOMATE
決定論的な処理を自動化できないか

6. DELEGATE TO AI
AIへ判断・生成を委譲できないか

7. HUMANIZE
人間が担当する価値の高い仕事は何か
```

「Automate」が最初ではないことを重要な設計思想とする。

---

# 17. Fact / Assumption分離

AIの提案には必ず根拠と仮定を表示する。

例：

### Confirmed Facts

```text
✓ 毎週実施
✓ 45分必要
✓ CSVを手動取得
✓ Excelで同じ集計を行う
✓ 上司への報告が目的
```

### Assumptions

```text
△ Salesforce APIが利用可能
△ リアルタイムデータ取得が許可される
△ 異常検知による報告へ変更可能
```

### Unknown

```text
? API利用権限
? 社内セキュリティポリシー
? 上司側の報告要件
```

AIの推論と事実を混同させない。

---

# 18. MVP画面構成

画面は5画面に限定する。

## Screen 1
### Home

```text
FlowShift

あなたの日常業務から
AI時代の新しい業務フローを設計します。

[ Google Calendarを接続 ]

[ デモデータで試す ]
```

---

## Screen 2
### Calendar / Work Discovery

```text
8/3 - 8/7

月曜日
09:00 朝会
10:00 売上レポート作成     ★改善候補
13:00 営業定例

火曜日
09:30 顧客データ登録       ★改善候補
13:00 顧客打ち合わせ

水曜日
10:00 問い合わせ対応       ★分析候補
```

AI：

```text
定期的に実施されており、
改善余地がありそうな業務を
3件見つけました。
```

---

## Screen 3
### AI Interview

左：

AIチャット

右：

リアルタイム業務モデル

```text
目的
上司への売上報告

頻度
週1回

所要時間
45分

ツール
Salesforce
Excel
PowerPoint
Teams
```

会話が進むほど右側が埋まる。

---

## Screen 4
### Current Workflow Analysis

```text
CURRENT WORKFLOW

Salesforce
 ↓
CSV
 ↓
Excel
 ↓
PowerPoint
 ↓
Teams
```

表示：

```text
課題

・4システムを跨ぐ
・3回の手動データ移動
・高い反復性
・定型処理が中心
```

---

## Screen 5
### AI-Native Workflow

画面を左右比較にする。

```text
CURRENT                 AI-NATIVE

Salesforce              Salesforce
 ↓                       ↓
CSV                     AI Analyst
 ↓                       ↓
Excel                   異常検知
 ↓                       ↓
PowerPoint              必要時のみ通知
 ↓                       ↓
Teams                   Human Review
```

最下部：

```text
Removed Steps       4
Human Time          45m → 3m
Annual Saving       約36h

Business Process
「週次レポート作成」
→ 原則廃止
```

---

# 19. Google Calendarの位置づけ

Google Calendarは、

**業務分析データベース**

として扱わない。

あくまで、

**業務発見のためのConversation Starter**

とする。

カレンダーだけでは業務実態を理解できないため、

Calendar

＋

AI Interview

の組み合わせを前提とする。

---

# 20. 技術構成

### Frontend

Next.js  
TypeScript  
Tailwind CSS

### Backend

Next.js Server Actions / API Routes

### Authentication

Google OAuth

### External API

Google Calendar API

### Database

Supabase / PostgreSQL

### AI

LLM API

Structured Outputを基本とする。

### Hosting

Vercel

---

# 21. AI構成

MVPでは巨大な単一Agentにしない。

3つの責務へ分ける。

## Observer

入力：

Calendar Event

出力：

```text
業務らしいか
カテゴリ
反復性
分析候補か
```

---

## Interviewer

入力：

現在のBusinessTask

役割：

不足情報を判断し、

次に聞くべき質問を1つ生成。

原則3〜5問。

---

## Business Designer

入力：

構造化されたBusinessTask

出力：

```text
Current Workflow
Problems
Conventional Improvements
AI-Native Workflow
Human / AI / System Allocation
Expected Benefit
Facts
Assumptions
Unknowns
```

---

# 22. AI利用方針

AIには自由文を直接大量生成させない。

基本フロー：

```text
Natural Language
 ↓
Structured Output
 ↓
Validation
 ↓
Business Logic
 ↓
UI Rendering
```

とする。

LLM：

意味理解・仮説生成

アプリ：

計算・状態管理・検証

という責務分離を行う。

---

# 23. データモデル

### CalendarEvent

```text
id
externalEventId
title
startAt
endAt
durationMinutes
category
analysisCandidate
```

### BusinessTask

```text
id
name
purpose
frequency
duration
trigger
inputs
outputs
tools
steps
decisions
consumers
constraints
painPoints
```

### Analysis

```text
id
businessTaskId

repeatability
manualWork
dataTransfer
decisionComplexity
humanValue

opportunityScore
implementationScore

currentProblems
conventionalImprovements
aiNativeDesign
expectedBenefits

facts
assumptions
unknowns
```

---

# 24. MVP対象外

以下は実装しない。

```text
Microsoft 365連携
Gmail分析
Slack分析
Teams API連携
Google Drive分析
RAG
社内文書検索
組織単位分析
上司・部下管理
実際のRPA実行
AI Agentによる業務実行
HULFT連携
複雑な権限管理
課金
スマートフォンアプリ
```

将来構想には含めてもMVPには含めない。

---

# 25. デモデータ機能

Google OAuth/API障害に備え、

**デモモードを必須実装する。**

デモシナリオ：

営業担当者

```text
月
10:00 売上レポート作成
13:00 営業定例

火
09:00 顧客データ更新
15:00 問い合わせ対応

水
10:00 売上レポート確認
```

面接では原則このデータを利用する。

Google Calendar実連携も見せられるが、

デモ成功を外部APIへ依存させない。

---

# 26. 面接用デモシナリオ

所要時間：

約3〜5分。

### ① 問題説明

「RPA導入の現場では、ツールを導入しても、そもそも何を改善すればよいか現場が言語化できず、使われなくなるケースを見てきました。」

### ② Calendar

「そこで抽象的に『困っている仕事は？』と聞くのではなく、実際の日常業務から分析を始めます。」

### ③ AI Interview

売上レポートを選択。

AIと3問程度対話。

### ④ Current Workflow

Salesforce → Excel → PowerPoint → Teams

を表示。

「ここまでなら従来型の業務改善です。」

### ⑤ AI-Native Workflow

AI Analystによる異常検知へ変更。

「でも、この作業を自動化すること自体が目的ではありません。」

「目的は上司が売上変化を把握することなので、AIが存在する前提なら、週次レポートを作るという業務そのものをなくせる可能性があります。」

ここをデモのクライマックスとする。

---

# 27. MVP開発工程

## Phase 1
### UX Prototype

最初にデモデータだけで5画面を完成させる。

AIもCalendar APIも接続しない。

目的：

**価値仮説とユーザー体験を先に完成させる。**

---

## Phase 2
### AI Structured Analysis

LLMを接続。

自然言語からBusinessTaskを生成。

Business Designerを実装。

---

## Phase 3
### AI Interview

不足項目をAIに判断させ、

追加質問を生成する。

---

## Phase 4
### Google Calendar

OAuth

↓

Calendar Events取得

↓

Observerによる分類

↓

業務候補表示

---

## Phase 5
### Polish

- エラー処理
- デモモード
- UX改善
- README
- Architecture Diagram
- 開発記録

---

# 28. 開発優先順位

最優先：

```text
AI Interview
↓
Current Workflow
↓
AI-Native Workflow
```

次点：

```text
Calendar
```

Calendar連携よりも、

**業務再設計体験の完成度を優先する。**

---

# 29. 完成条件

MVP完成と判断する条件：

- Googleまたはデモデータから予定を表示できる
- 業務候補を選択できる
- AIが3〜5問ヒアリングできる
- BusinessTaskをStructured Dataで生成できる
- Current Workflowを表示できる
- 課題を3件以上提示できる
- Conventional Improvementを提示できる
- AI-Native Workflowを提示できる
- Human / AI / Systemの役割を表示できる
- Facts / Assumptionsを分離できる
- 年間削減時間を概算できる
- デモモードだけで全体フローを完走できる

---

# 30. 将来構想

MVP：

```text
Calendar
 ↓
AI Interview
 ↓
Business Modeling
 ↓
AI-Native Redesign
```

将来：

```text
Calendar
Gmail
Slack
Teams
Drive
ERP
CRM
   ↓
Activity Discovery
   ↓
Organization Business Graph
   ↓
AI Business Architect
   ↓
AI-Native Process Design
   ↓
Human / AI / System Allocation
   ↓
Agent / API / iPaaS / RPA
   ↓
Execution
   ↓
Measure
   ↓
Continuous Redesign
```

最終的には、

**業務分析 → 業務設計 → 実行 → 効果測定**

までを循環させるAX基盤を目指す。

---

# 31. このMVPで表現したいAX

従来：

```text
Human Workflow
      ↓
Find repetitive tasks
      ↓
Replace with technology
```

本プロダクト：

```text
Business Purpose
       ↓
AI-Native Design
       ↓
┌───────────────┐
│ Human │ AI │ System │
└───────────────┘
       ↓
Optimal Workflow
```

つまり、

**人間が行うことを前提とした業務へAIを追加するのではない。**

**AIが存在することを前提に、業務そのものを設計し直す。**

これを本プロダクトにおけるAXの定義とする。

---

# 32. ポートフォリオとして伝えるポイント

本作品でアピールするのは、

「Google Calendar APIを使った」

「LLM APIを使った」

という技術要素そのものではない。

アピールするのは、

**実務上の課題を発見し、抽象化し、AIによって解決できる仮説へ変換し、自らMVPとして実装・検証したこと。**

さらに開発自体についても、

```text
課題定義
↓
AIとの設計議論
↓
UXプロトタイプ
↓
AI Coding
↓
自動テスト
↓
AI Code Review
↓
改善
```

というAI前提の開発プロセスを採用する。

したがって本作品は、

**AIを使ったプロダクト**

であると同時に、

**AIを前提として一人で高速にプロダクト開発する方法の実証**

でもある。

---

# 33. 一文で説明する場合

> **日常業務をAIとの対話で構造化し、現在の作業をそのまま自動化するのではなく、AIが最初から存在することを前提に業務目的からプロセスを再設計するAX支援ツールです。**

短縮版：

> **「人間の仕事をAIに置き換える」のではなく、「AI前提で仕事そのものを作り直す」ための業務設計AIです。**
