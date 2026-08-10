import type { BusinessDesign, BusinessTask, InterviewPlan } from './types'
import type { WorkGroup } from '../shared/work-group'

export const demoWorkGroups: WorkGroup[] = [
  {
    id: 'recurring:morning', title: '朝会', occurrences: 20, totalMinutes: 300, averageMinutes: 15,
    firstOccurredAt: '2026-07-13T00:00:00.000Z', lastOccurredAt: '2026-08-07T00:00:00.000Z', recurringEventId: 'morning', category: '会議',
    evidence: { recurring: true, occurrenceCount: 20, totalMinutes: 300 },
  },
  {
    id: 'recurring:sales-meeting', title: '営業定例', occurrences: 4, totalMinutes: 240, averageMinutes: 60,
    firstOccurredAt: '2026-07-13T04:00:00.000Z', lastOccurredAt: '2026-08-03T04:00:00.000Z', recurringEventId: 'sales-meeting', category: '会議',
    evidence: { recurring: true, occurrenceCount: 4, totalMinutes: 240 },
  },
  {
    id: 'recurring:sales-report', title: '売上レポート作成', occurrences: 4, totalMinutes: 180, averageMinutes: 45,
    firstOccurredAt: '2026-07-13T01:00:00.000Z', lastOccurredAt: '2026-08-03T01:00:00.000Z', recurringEventId: 'sales-report', category: '資料作成',
    evidence: { recurring: true, occurrenceCount: 4, totalMinutes: 180 },
  },
  {
    id: 'recurring:customer-update', title: '顧客データ更新', occurrences: 4, totalMinutes: 120, averageMinutes: 30,
    firstOccurredAt: '2026-07-14T00:30:00.000Z', lastOccurredAt: '2026-08-04T00:30:00.000Z', recurringEventId: 'customer-update', category: 'データ処理',
    evidence: { recurring: true, occurrenceCount: 4, totalMinutes: 120 },
  },
]

export const demoInterviewPlan: InterviewPlan = {
  questions: [
    {
      id: 'purpose',
      prompt: 'この朝会は、誰が何を把握・判断するために行っていますか？',
      hint: '会議を開くこと自体ではなく、終わった後に実現したい状態を選びます。',
      options: ['チーム全員が当日の重要な予定変更を把握し、調整の要否を判断するため', '責任者が作業の遅れを把握し、支援の優先順位を判断するため', '複数の役割があり、一つに絞れない', 'まだ分からない'],
    },
    {
      id: 'stakeholders',
      prompt: '参加者と、共有結果を必要とする人は誰ですか？',
      hint: '参加していなくても結果を使う人がいれば含めます。',
      options: ['チームメンバーと直属の責任者', '複数部署の担当者と調整責任者', '参加者だけ', 'まだ整理できていない'],
    },
    {
      id: 'process',
      prompt: '朝会では実際に何をしていますか？',
      hint: '通常の進め方に最も近いものを選びます。',
      options: ['各自が今日の予定と変更点を順番に口頭共有する', '予定共有に加えて、困りごとの相談と担当調整を行う', '進捗確認と上長からの指示が中心', '回によって大きく異なる'],
    },
    {
      id: 'decision',
      prompt: 'その場で人が判断していることは何ですか？',
      hint: '単なる共有と、判断・調整を分けます。',
      options: ['予定が衝突した場合の担当・時間調整', '遅れや問題がある場合の支援判断', '通常は判断せず、予定を共有するだけ', 'まだ分からない'],
    },
    {
      id: 'exceptions',
      prompt: '通常と違う対応が必要になるのはどんなときですか？',
      hint: '通知だけでは足りない場面を確認します。',
      options: ['予定変更や担当の重複があるとき', '緊急案件や遅延が発生したとき', '新人参加や引き継ぎがあるとき', '例外を整理できていない'],
    },
    {
      id: 'constraints',
      prompt: '朝会を変えるうえで守る必要がある条件はありますか？',
      hint: '制度、責任、情報管理、チーム運営上の条件を確認します。',
      options: ['特に確認できていない', '責任者への毎日の報告が必要', '口頭でしか共有できない情報がある', '新人教育やチーム形成の役割がある'],
    },
    {
      id: 'outputNeed',
      prompt: '毎朝集まることは、目的達成に必須ですか？',
      hint: '会議以外の役割がないかも含めて判断します。',
      options: ['重要な変化があるときだけ通知されればよい', '予定は非同期共有できるが、相談の時間は別途必要', '新人教育や関係づくりのため毎回必要', '現時点では判断できない'],
    },
  ],
}

const observed = {
  title: '朝会', occurrences: 20, totalMinutes: 300, averageMinutes: 15,
  firstOccurredAt: '2026-07-13T00:00:00.000Z', lastOccurredAt: '2026-08-07T00:00:00.000Z', recurring: true,
}

export const initialBusinessTask: BusinessTask = {
  name: '朝会',
  observed,
  purpose: 'チーム全員が当日の重要な予定変更を把握し、調整の要否を判断する',
  frequency: '過去4週間で20回',
  duration: '1回平均15分、合計5時間',
  trigger: '平日の始業時',
  stakeholders: ['チームメンバー', '直属の責任者'],
  consumer: 'チームメンバーと直属の責任者',
  tools: ['Google Calendar', '口頭共有'],
  inputs: ['各メンバーの当日の予定', '前日からの変更'],
  output: '今日の作業予定の共有（口頭）',
  steps: ['参加者が集まる', '各自が当日の予定を共有する', '変更があれば担当や時間を調整する'],
  decisionPoints: ['予定の衝突や重要な変更がある場合に調整する'],
  exceptions: ['予定変更や担当の重複がある場合'],
  constraints: [],
  dependencies: [],
  risks: [],
  outputRequirement: 'NOT_REQUIRED',
  outputRequirementReason: '回答では重要な変化があるときの通知でよいとされたが、朝会の他の役割は未確認',
  contextStatus: {
    purpose: 'CONFIRMED', stakeholders: 'PARTIAL', process: 'CONFIRMED', decisions: 'CONFIRMED', exceptions: 'PARTIAL',
    constraints: 'UNKNOWN', dependencies: 'UNKNOWN', risks: 'UNKNOWN', output: 'CONFIRMED',
  },
}

export const demoDesign: BusinessDesign = {
  businessTask: initialBusinessTask,
  analysis: {
    readiness: 'NEEDS_CONTEXT',
    conclusion: '現時点では、この朝会を廃止できるとは判断できません。予定共有以外の役割と制約を先に確認する必要があります。',
    purposeCheck: {
      outcome: 'チーム全員が重要な予定変更を把握し、必要な調整を判断する',
      currentMeans: '毎朝15分集まり、各自が予定を口頭で共有する',
      outputDecision: '通知への置き換え可能性はあるが、教育・相談・他部署調整の役割が未確認のため判断を保留する',
    },
    problems: [
      { value: '20回', label: '繰り返し', detail: '過去4週間に同じ定例予定がある' },
      { value: '5時間', label: '合計時間', detail: '参加人数を除いた予定枠だけの合計' },
      { value: '未確認', label: '隠れた役割', detail: '予定共有以外の役割が分かっていない' },
    ],
    ratings: { opportunity: 'MEDIUM', implementation: 'MEDIUM', aiFit: 'MEDIUM' },
    ratingReasons: ['高頻度の定例業務だが、会議が担う非公式な役割を確認できていない'],
    facts: ['過去4週間で20回開催されている', '1回平均15分、予定枠の合計は5時間', 'ユーザー回答では当日の予定共有を行っている'],
    assumptions: ['メンバーの予定変更をデジタルに取得できる可能性がある', '重要な変更の基準をチームで定義できる可能性がある'],
    unknowns: ['新人教育の役割があるか', '他部署との調整に使われているか', '朝会を変更できない制度・責任上の制約があるか'],
    nextQuestions: ['朝会がなくなると困る人と理由を確認する', '直近4週間で予定共有以外に役立った場面を確認する', 'カレンダーに登録されない共有事項を確認する'],
    conventional: {
      summary: '会議時間を短くする、発言順を固定するなど、朝会を残したまま効率化する。',
      steps: ['共有内容を事前記入', '朝会で差分だけ発言', '責任者が調整事項を確認'],
    },
  },
  redesign: {
    strategy: 'KEEP',
    hypothesis: '予定共有が主目的であり、新人教育・相談・他部署調整などの重要な役割が存在しない場合、定期朝会をなくし、重要な予定変更だけを通知する構成へ変更できる可能性があります。',
    headline: '予定共有を、変化があるときだけの確認へ',
    insight: '毎朝全員が予定を読み上げる仕事から、変化が発生したときだけ人が調整を判断する仕事へ変える仮説です。',
    workflow: [
      { label: '予定を取得', detail: 'メンバーが許可したカレンダーから予定を集約する', kind: 'system' },
      { label: '前回との差分を検出', detail: '追加・削除・時刻変更を決定論的に抽出する', kind: 'system' },
      { label: '影響候補を整理', detail: '関係者や調整が必要そうな理由を候補として示す', kind: 'ai' },
      { label: '必要時だけ通知', detail: '合意した条件に該当する変化だけを通知する', kind: 'output' },
      { label: '確認して調整', detail: '人が影響を確認し、担当や時間を決める', kind: 'human' },
    ],
    roles: {
      system: ['許可された予定の取得', '予定差分の抽出', '通知の配信'],
      ai: ['変更の意味と影響候補の整理', '通知文の下書き'],
      human: ['通知条件の承認', '影響の確認', '担当や予定の最終調整'],
    },
    metrics: {
      scheduledOutputBefore: '毎日1回の朝会（15分）', scheduledOutputAfter: '仮説上は0回（定期開催なし）',
      routineHumanWorkBefore: '毎日15分の会議参加', routineHumanWorkAfter: '仮説上は通常なし',
      detectionBefore: '毎朝の会議で変化を確認', detectionAfter: '予定更新時に変化を検知',
      outputBefore: '今日の作業予定の共有（口頭）', outputAfter: '重要な変化の通知（自動生成）',
    },
    impact: {
      routineMinutesPerCycle: 0, exceptionMinutesMin: 5, exceptionMinutesMax: 10, confidence: 'LOW',
      assumption: '予定共有以外の重要な役割がなく、必要な予定がデジタル化されている場合の推定',
    },
  },
  validationPlan: {
    summary: '会議を止める前に、利用者要件と技術条件を順に確認します。期間は検証内容の合意後に決めます。',
    items: [
      { type: 'REQUIREMENT_VALIDATION', title: '朝会の隠れた役割を確認', description: '参加者へ、朝会がなくなると失われる情報や関係性を確認します。', checks: ['予定共有以外の利用目的', '新人教育・相談の有無', '口頭でしか扱えない情報'] },
      { type: 'TECHNICAL_FEASIBILITY', title: '予定差分を取得できるか確認', description: '必要な予定と変更情報を、許可された範囲で取得できるか確認します。', checks: ['Calendar APIの権限', '予定未登録時の扱い', '通知先と情報公開範囲'] },
      { type: 'PILOT', title: '一部メンバーで並行運用', description: '朝会を残したまま通知を並行し、取りこぼしと不要通知を記録します。', checks: ['見逃した重要変更', '不要だった通知', '人が調整した場面'] },
    ],
  },
}
