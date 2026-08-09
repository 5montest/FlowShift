import type { BusinessDesign, BusinessTask, DemoEvent, InterviewQuestion, WorkflowStep } from './types'

export const demoEvents: DemoEvent[] = [
  { id: 'morning', day: '月', date: '8/3', time: '09:00', duration: 20, title: '朝会', category: '会議', recurring: true, source: 'demo' },
  {
    id: 'sales-report',
    day: '月',
    date: '8/3',
    time: '10:00',
    duration: 45,
    title: '売上レポート作成',
    category: '資料作成',
    recurring: true,
    source: 'demo',
    candidate: { rank: 1, level: 'HIGH', reason: '週次・45分・定型作業の可能性' },
  },
  { id: 'sales-meeting', day: '月', date: '8/3', time: '13:00', duration: 60, title: '営業定例', category: '会議', recurring: true, source: 'demo', candidate: { rank: 3, level: 'MEDIUM', reason: '毎週・会議改善の可能性' } },
  { id: 'customer-update', day: '火', date: '8/4', time: '09:30', duration: 30, title: '顧客データ更新', category: 'データ入力', recurring: true, source: 'demo', candidate: { rank: 2, level: 'HIGH', reason: '手作業による転記の可能性' } },
  { id: 'customer-meeting', day: '火', date: '8/4', time: '13:00', duration: 60, title: '顧客打ち合わせ', category: '顧客対応', source: 'demo' },
  { id: 'inquiry', day: '水', date: '8/5', time: '10:00', duration: 45, title: '問い合わせ対応', category: '顧客対応', source: 'demo' },
  { id: 'proposal', day: '木', date: '8/6', time: '14:00', duration: 90, title: '提案書レビュー', category: '資料作成', source: 'demo' },
  { id: 'one-on-one', day: '金', date: '8/7', time: '11:00', duration: 30, title: '1on1', category: '会議', recurring: true, source: 'demo' },
]

export const interviewQuestions: InterviewQuestion[] = [
  {
    id: 'purpose',
    prompt: 'この業務は、誰が何を判断するために行っていますか？',
    hint: '作業内容ではなく、最終的な目的を教えてください。',
    options: [
      '営業部長が売上の重要な変化を把握し、必要な施策を判断するため',
      '営業担当者が目標との差を確認し、次の行動を調整するため',
      '経営陣が事業計画との差を把握し、対応の優先順位を判断するため',
    ],
  },
  {
    id: 'process',
    prompt: '実際には、どのツールを使って何をしていますか？',
    hint: '開始から共有までを順番に教えてください。',
    options: [
      'SalesforceからCSVを取得し、Excelで集計してPowerPointへ貼り、Teamsで共有する',
      'Salesforceの数値をGoogleスプレッドシートへ転記し、Slackで共有する',
      'Excelで売上を集計してグラフを作り、メールで共有する',
    ],
  },
  {
    id: 'exceptions',
    prompt: 'いつ人の判断が必要になりますか？',
    hint: '人間が確認し続ける必要がある部分を探します。',
    options: [
      '前週比が大きく変わったときだけ、原因を確認してコメントする',
      '売上目標を下回ったときだけ、担当者へ状況を確認する',
      '集計は毎回同じで、例外時だけ人が判断する',
    ],
  },
  {
    id: 'outputNeed',
    prompt: '現在の成果物は本当に必要ですか？',
    hint: '定期レポートがなくても目的を達成できるか確認します。',
    options: [
      '重要な変化があるときだけ通知されればよい',
      '必要なときに確認できればよい',
      '法令・監査上、定期レポートが必要',
      '定例会議のため、毎回必要',
    ],
  },
]

export const initialBusinessTask: BusinessTask = {
  name: '売上レポート作成',
  purpose: '営業部長が売上の重要な変化を把握し、必要な施策を判断する',
  frequency: '週1回',
  duration: '45分',
  trigger: '毎週月曜日 10:00',
  consumer: '営業部長',
  tools: ['Salesforce', 'Excel', 'PowerPoint', 'Teams'],
  inputs: ['Salesforce売上データ'],
  output: '週次売上報告',
  steps: ['CSVを取得', 'Excelへ転記', '売上を集計', 'グラフを資料へ貼付', 'Teamsで共有'],
  decisionPoints: ['前週比で大きな変化があるか'],
  constraints: ['Salesforce APIの利用可否は未確認', '報告形式の変更には上司の合意が必要'],
  outputRequirement: 'NOT_REQUIRED',
  outputRequirementReason: '重要な変化と理由が分かれば、定期レポートは不要',
}

export const currentWorkflow: WorkflowStep[] = [
  { id: 'salesforce', label: 'Salesforce', detail: '売上データを開く', kind: 'system' },
  { id: 'csv', label: 'CSV取得', detail: '人がダウンロード', kind: 'human' },
  { id: 'excel', label: 'Excel集計', detail: '転記・計算・グラフ', kind: 'human' },
  { id: 'powerpoint', label: 'PowerPoint', detail: '報告資料へ貼り付け', kind: 'human' },
  { id: 'teams', label: 'Teams共有', detail: '上司へ送付', kind: 'output' },
]

export const automatedWorkflow: WorkflowStep[] = [
  { id: 'api', label: 'Salesforce API', detail: '定期データ取得', kind: 'system' },
  { id: 'aggregate', label: '自動集計', detail: 'ルールベース処理', kind: 'system' },
  { id: 'slides', label: '資料を自動生成', detail: '既存形式を維持', kind: 'system' },
  { id: 'post', label: 'Teams投稿', detail: '毎週自動送信', kind: 'output' },
]

export const nativeWorkflow: WorkflowStep[] = [
  { id: 'source', label: '売上データを常時取得', detail: 'Salesforceから更新を取得', kind: 'system' },
  { id: 'analyst', label: '変化を継続監視', detail: '目標・前週・前年との差を分析', kind: 'ai' },
  { id: 'change', label: '重要な変化あり？', detail: '閾値と文脈で判定', kind: 'decision' },
  { id: 'explain', label: '原因候補と影響を整理', detail: '判断に必要な説明をまとめる', kind: 'ai' },
  { id: 'notify', label: '必要なときだけ通知', detail: '重要な変化がある場合のみ', kind: 'output' },
  { id: 'review', label: '原因と施策を判断', detail: '人が確認し、対応を決める', kind: 'human' },
]

export const problems = [
  { value: '4', label: 'システムを横断', detail: 'SalesforceからTeamsまで' },
  { value: '3', label: '手動データ移動', detail: 'CSV・Excel・PowerPoint' },
  { value: 'HIGH', label: '反復性', detail: '毎週ほぼ同じ手順' },
  { value: 'LOW', label: '判断の複雑さ', detail: '変化時のみ人が判断' },
]

export const facts = ['毎週45分かかる', 'CSVを手動取得する', '同じ集計を繰り返す', '営業部長が重要な売上変化を把握して施策を判断する']
export const assumptions = ['Salesforce APIが利用できる', '売上変化を判定する閾値を定義できる']
export const unknowns = ['API利用権限', '上司が必要とする報告形式', '異常とみなす基準']

export const demoDesign: BusinessDesign = {
  businessTask: initialBusinessTask,
  analysis: {
    conclusion: '定期レポート作成を廃止し、重要な変化があるときだけ人が判断する業務へ見直せます。',
    purposeCheck: {
      outcome: '営業部長が売上の重要な変化を把握し、必要な施策を判断する',
      currentMeans: '週次売上レポートを作成し、Teamsで共有する',
      outputDecision: '変化と理由の通知で目的を達成できるため、定期レポートは廃止する',
    },
    problems,
    ratings: { opportunity: 'HIGH', implementation: 'MEDIUM', aiFit: 'HIGH' },
    ratingReasons: ['週次・45分の反復業務', '複数システム間の手動転記がある', '判断は変化時に限定されている'],
    facts,
    assumptions,
    unknowns,
    conventional: {
      summary: 'API取得、自動集計、資料生成、Teams投稿により、現在の報告形式を維持したまま自動化する。',
      steps: automatedWorkflow.map((step) => step.label),
    },
  },
  redesign: {
    strategy: 'ELIMINATE',
    headline: '重要な変化があるときだけ判断する',
    insight: '「毎週レポートを作る」から「変化があるときだけ原因と施策を判断する」へ移行する。',
    workflow: nativeWorkflow.map(({ label, detail, kind }) => ({ label, detail, kind })),
    roles: {
      system: ['API取得', '定期実行', 'ルール判定'],
      ai: ['変化分析', '原因候補', '要点生成'],
      human: ['最終判断', '例外対応', '施策決定'],
    },
    metrics: {
      scheduledOutputBefore: '週1回',
      scheduledOutputAfter: '原則0回',
      routineHumanWorkBefore: '毎週45分・5工程',
      routineHumanWorkAfter: '通常時なし',
      detectionBefore: '週次レポート作成時',
      detectionAfter: 'データ更新時に継続監視',
      outputBefore: '定型の週次売上レポート',
      outputAfter: '重要な変化があるときの通知と説明',
    },
    impact: {
      routineMinutesPerCycle: 0,
      exceptionMinutesMin: 5,
      exceptionMinutesMax: 10,
      confidence: 'MEDIUM',
      assumption: 'Salesforceから継続取得でき、重要な変化の基準を定義できる前提',
    },
  },
}
