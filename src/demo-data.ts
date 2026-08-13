import { createDeterministicTask } from '../shared/interview.ts'
import type { BusinessDesign, BusinessTask, ContextDimension, ImprovementProject, InterviewAnswer, InterviewPlan, InterviewQuestion, WorkObservation } from './types'
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
  phase: 'CORE',
  questions: [
    {
      id: 'core-purpose', dimension: 'purpose', phase: 'CORE',
      prompt: 'この業務は、誰が何を把握・判断するために行っていますか？',
      hint: '朝会を開くことではなく、その後に実現したい状態を選びます。',
      options: [
        { id: 'purpose-change', label: 'チーム全員が当日の重要な予定変更を把握し、調整の要否を判断するため', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'purpose-support', label: '責任者が作業の遅れを把握し、支援の優先順位を判断するため', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'purpose-multiple', label: '複数の目的があり、一つに絞れない', meaning: { roles: [], contextState: 'PARTIAL' } },
        { id: 'purpose-unknown', label: 'まだ分からない', meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    {
      id: 'core-decision', dimension: 'decision', phase: 'CORE',
      prompt: '現在、人が行っている重要な判断は何ですか？',
      hint: '単なる情報共有と、判断・調整を分けて考えます。',
      options: [
        { id: 'decision-schedule', label: '予定が衝突した場合の担当・時間調整', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'decision-support', label: '遅れや困りごとがある場合の支援判断', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'decision-share-only', label: '通常は判断せず、予定を共有するだけ', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'decision-unknown', label: 'まだ分からない', meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    {
      id: 'core-output', dimension: 'outputNeed', phase: 'CORE',
      prompt: '現在の会議形式は、目的達成にどの程度必要ですか？',
      hint: '予定共有以外の役割が残る場合は、その意味を失わない選択肢を選びます。',
      options: [
        { id: 'output-async', label: '重要な変化があるときだけ通知されればよい', meaning: { outputNeed: 'ASYNC_OK', roles: [{ name: '困りごとの相談と担当調整', present: false, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'output-consultation', label: '予定は非同期共有できるが、相談時間は別途必要', meaning: { outputNeed: 'SYNC_DISCUSSION_STILL_REQUIRED', roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'output-current', label: '新人教育や関係づくりのため、現在の形式が必要', meaning: { outputNeed: 'CURRENT_FORMAT_REQUIRED', roles: [{ name: '新人教育・関係づくり', present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'output-unknown', label: '現時点では判断できない', meaning: { outputNeed: 'UNKNOWN', roles: [], contextState: 'UNKNOWN' } },
      ],
    },
  ],
}

export function observationFromDemoGroup(group: WorkGroup): WorkObservation {
  return {
    title: group.title,
    occurrences: group.occurrences,
    totalMinutes: group.totalMinutes,
    averageMinutes: group.averageMinutes,
    firstOccurredAt: group.firstOccurredAt,
    lastOccurredAt: group.lastOccurredAt,
    recurring: group.evidence.recurring,
  }
}

function roleQuestion(id: string, roleName: string, prompt: string, hint: string): InterviewQuestion {
  return {
    id, dimension: 'roles', phase: 'FOLLOW_UP', prompt, hint,
    options: [
      { id: `${id}-yes`, label: `${roleName}の役割がある`, meaning: { roles: [{ name: roleName, present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
      { id: `${id}-no`, label: `${roleName}の役割はない`, meaning: { roles: [{ name: roleName, present: false, scope: 'ALL' }], contextState: 'CONFIRMED' } },
      { id: `${id}-partial`, label: '一部の回や参加者にだけ当てはまる', meaning: { roles: [{ name: roleName, present: true, scope: 'PARTIAL', scopeDetail: '一部の回または参加者のみ' }], contextState: 'PARTIAL' } },
      { id: `${id}-unknown`, label: 'まだ確認できていない', meaning: { roles: [], contextState: 'UNKNOWN' } },
    ],
  }
}

function stakeholderQuestion(): InterviewQuestion {
  return {
    id: 'follow-stakeholders', dimension: 'stakeholders', phase: 'FOLLOW_UP', selection: 'MULTIPLE',
    prompt: '朝会に参加する人と、共有結果を使う人を選んでください。',
    hint: '分かる範囲で複数選べます。具体的な対象が分からない場合は「まだ分からない」を選びます。',
    options: [
      { id: 'stakeholder-team', label: 'チームメンバー', meaning: { roles: [], stakeholders: ['チームメンバー'], contextState: 'CONFIRMED' } },
      { id: 'stakeholder-lead', label: 'チーム責任者', meaning: { roles: [], stakeholders: ['チーム責任者'], contextState: 'CONFIRMED' } },
      { id: 'stakeholder-department', label: '他部署', meaning: { roles: [], stakeholders: ['他部署'], contextState: 'CONFIRMED' } },
      { id: 'stakeholder-customer', label: '顧客', meaning: { roles: [], stakeholders: ['顧客'], contextState: 'CONFIRMED' } },
      { id: 'stakeholder-unknown', label: 'まだ分からない', meaning: { roles: [], stakeholders: [], contextState: 'UNKNOWN' } },
    ],
  }
}

function processQuestion(): InterviewQuestion {
  return {
    id: 'follow-process', dimension: 'process', phase: 'FOLLOW_UP', selection: 'MULTIPLE',
    prompt: '普段の朝会で行っていることを選んでください。',
    hint: '実際に行うものを複数選べます。選んだ工程と役割はそのまま保存します。',
    options: [
      { id: 'process-share', label: '予定共有', meaning: { roles: [], processItems: ['予定共有'], contextState: 'CONFIRMED' } },
      { id: 'process-change', label: '変更点の確認', meaning: { roles: [], processItems: ['変更点の確認'], contextState: 'CONFIRMED' } },
      { id: 'process-consult', label: '困りごとの相談', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], processItems: ['困りごとの相談'], contextState: 'CONFIRMED' } },
      { id: 'process-adjust', label: '担当調整', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], processItems: ['担当調整'], contextState: 'CONFIRMED' } },
      { id: 'process-training', label: '新人への説明', meaning: { roles: [{ name: '新人教育・関係づくり', present: true, scope: 'PARTIAL', scopeDetail: '新人が参加する回のみ' }], processItems: ['新人への説明'], contextState: 'PARTIAL' } },
      { id: 'process-unknown', label: 'まだ分からない', meaning: { roles: [], processItems: [], contextState: 'UNKNOWN' } },
    ],
  }
}

function simpleQuestion(id: string, dimension: ContextDimension, prompt: string, hint: string, labels: string[]): InterviewQuestion {
  return {
    id, dimension, phase: 'FOLLOW_UP', prompt, hint,
    options: labels.map((label, index) => ({
      id: `${id}-${index + 1}`,
      label,
      meaning: { roles: [], contextState: index === labels.length - 1 ? 'UNKNOWN' : 'CONFIRMED' },
    })),
  }
}

export function createDemoFollowUpPlan(task: BusinessTask): InterviewPlan {
  const questions: InterviewQuestion[] = []
  if (task.contextStatus.stakeholders !== 'CONFIRMED') questions.push(stakeholderQuestion())
  if (task.contextStatus.process !== 'CONFIRMED') questions.push(processQuestion())
  if (!task.businessRoleDetails.some((role) => role.name === '新人教育・関係づくり')) questions.push(roleQuestion('follow-training', '新人教育・関係づくり', '新人教育や、チームの関係づくりに使われていますか？', '一部の回だけ当てはまる場合も、その範囲を保って保存します。'))
  questions.push(simpleQuestion('follow-constraint', 'constraints', '形式を変えられない制度・責任上の条件はありますか？', '毎日の報告義務や、口頭確認が必要な情報などを確認します。', ['責任者への毎日の報告が必要', '口頭でしか扱えない情報がある', '確認できている制約はない', 'まだ確認できていない']))
  return { phase: 'FOLLOW_UP', questions: questions.slice(0, 4) }
}

function answerFrom(plan: InterviewPlan, questionIndex: number, optionIndex: number): InterviewAnswer {
  const question = plan.questions[questionIndex]
  const option = question.options[optionIndex]
  return {
    questionId: question.id,
    dimension: question.dimension,
    question: question.prompt,
    answer: option.label,
    source: 'OPTION',
    optionId: option.id,
    meaning: option.meaning,
  }
}

const initialAnswers = [answerFrom(demoInterviewPlan, 0, 0), answerFrom(demoInterviewPlan, 1, 0), answerFrom(demoInterviewPlan, 2, 3)]
export const initialBusinessTask = createDeterministicTask(observationFromDemoGroup(demoWorkGroups[0]), initialAnswers)

const unknownDetails: Record<keyof BusinessTask['contextStatus'], { id: string; dimension: ContextDimension; question: string; reason: string }> = {
  purpose: { id: 'purpose', dimension: 'purpose', question: 'この業務の目的を確認できますか？', reason: '目的を取り違えると再設計の方向が変わります。' },
  stakeholders: { id: 'stakeholders', dimension: 'stakeholders', question: '結果を必要とする人は誰ですか？', reason: '利用者を確認しないと必要な情報を落とす可能性があります。' },
  roles: { id: 'roles', dimension: 'roles', question: '予定共有以外の役割はありますか？', reason: '相談や教育の役割がある場合、通知だけには置き換えられません。' },
  process: { id: 'process', dimension: 'process', question: '現在はどのように進めていますか？', reason: '残す工程と変える工程を分けるために必要です。' },
  decisions: { id: 'decisions', dimension: 'decision', question: '人が判断している箇所はどこですか？', reason: '人に残す判断を特定するために必要です。' },
  exceptions: { id: 'exceptions', dimension: 'exceptions', question: '通常と違う対応が必要なのはどんなときですか？', reason: '例外時の安全な運用を設計するために必要です。' },
  constraints: { id: 'constraints', dimension: 'constraints', question: '形式を変えられない制約はありますか？', reason: '実行できない仮説を避けるために必要です。' },
  dependencies: { id: 'dependencies', dimension: 'dependencies', question: '変更で影響を受ける人や他部署はありますか？', reason: '他業務への影響を見落とさないために必要です。' },
  risks: { id: 'risks', dimension: 'risks', question: '変更時に避けたいリスクは何ですか？', reason: '検証時の停止条件を決めるために必要です。' },
  output: { id: 'output', dimension: 'outputNeed', question: '現在の会議形式は本当に必要ですか？', reason: '手段を残すか分けるかの判断に必要です。' },
}

export function createDemoDesign(task: BusinessTask): BusinessDesign {
  const hasConsultation = task.businessRoles.includes('困りごとの相談と担当調整')
  const requiresCurrentFormat = task.deliveryModel.currentFormat === 'REQUIRED'
  const partialRoles = task.businessRoleDetails.filter((role) => role.present && role.scope === 'PARTIAL')
  const criticalUnknowns = (Object.entries(task.contextStatus) as [keyof BusinessTask['contextStatus'], BusinessTask['contextStatus'][keyof BusinessTask['contextStatus']]][])
    .filter(([, state]) => state !== 'CONFIRMED')
    .slice(0, 6)
    .map(([key]) => unknownDetails[key])
  const unknowns = criticalUnknowns.map((item) => item.question.replace(/[？?]$/, ''))
  const assumptions = [
    '必要な予定変更を許可された範囲で取得できる',
    ...(hasConsultation ? ['予定共有と相談の時間を分けても、相談の役割を維持できる'] : ['重要な変更の基準をチームで合意できる']),
    ...partialRoles.map((role) => `${role.name}は「${role.scopeDetail}」という範囲で維持できる`),
  ]
  const headline = hasConsultation
    ? '予定共有を非同期化し、相談時間を分ける'
    : requiresCurrentFormat
      ? '現在の形式を残し、共有部分だけを見直す'
      : '予定共有を、変化があるときだけの確認へ'
  const hypothesis = hasConsultation
    ? '予定共有は非同期に移し、困りごとの相談と担当調整は別の同期時間として残せる可能性があります。相談の役割は削除しません。'
    : requiresCurrentFormat
      ? '新人教育や関係づくりの役割を残したまま、予定の読み上げ部分だけを非同期化できる可能性があります。'
      : '予定共有が主目的であり、他の重要な役割や変更できない制約がない場合、重要な予定変更だけを確認する構成へ変更できる可能性があります。'
  const facts = [
    `Calendarでは過去4週間に${task.observed.occurrences}回、合計${task.observed.totalMinutes}分が観測された`,
    ...task.answerEvidence.map((answer) => `回答「${answer.answer}」`).slice(0, 8),
    ...partialRoles.map((role) => `${role.name}は${role.scopeDetail}に限って存在する`),
  ]

  return {
    businessTask: task,
    analysis: {
      readiness: criticalUnknowns.length ? 'NEEDS_CONTEXT' : 'HYPOTHESIS_READY',
      conclusion: criticalUnknowns.length ? '未確認事項が残っているため、現時点では判断を保留します。' : '確認済みの内容を前提に、検証する仮説を作れます。',
      purposeCheck: {
        outcome: task.purpose,
        currentMeans: `${task.name}を1回平均${task.observed.averageMinutes}分行う`,
        outputDecision: task.outputRequirementReason,
      },
      problems: [
        { value: `${task.observed.occurrences}回`, label: '4週間の回数', detail: 'Calendarから観測した事実' },
        { value: `${task.observed.totalMinutes}分`, label: '合計時間', detail: '参加人数を含まない予定枠の合計' },
        { value: `${criticalUnknowns.length}件`, label: '重要な未確認事項', detail: '仮説の判断に影響する項目' },
      ],
      ratings: { opportunity: 'MEDIUM', implementation: 'MEDIUM', aiFit: 'MEDIUM' },
      ratingReasons: ['頻度は高い一方、役割と制約を確認してから設計を変える必要があります。'],
      facts,
      assumptions,
      unknowns,
      criticalUnknowns,
      nextQuestions: criticalUnknowns.map((item) => item.question),
      conventional: { summary: '会議時間を短くし、共有項目を固定する。', steps: ['共有内容を事前記入', '差分だけを発言', '責任者が調整事項を確認'] },
    },
    redesign: {
      strategy: task.outputRequirement === 'ON_DEMAND' ? 'ON_DEMAND' : 'KEEP',
      hypothesis,
      headline,
      insight: hasConsultation ? '共有と相談を同じ会議に束ねず、それぞれに合う方法へ分ける仮説です。' : '毎朝全員で探していた変化を、差分があるときだけ人が確認する仮説です。',
      workflow: hasConsultation ? [
        { label: '予定差分を取得', detail: '許可された予定から追加・削除・時刻変更を抽出する', kind: 'system' },
        { label: '必要時だけ共有', detail: '重要な変更候補を関係者へ知らせる', kind: 'ai' },
        { label: '相談事項を集める', detail: '困りごとと担当調整が必要な事項を分けて集める', kind: 'system' },
        { label: '相談して判断', detail: '人が別途確保した時間で相談し、担当や時間を決める', kind: 'human' },
      ] : [
        { label: '予定差分を取得', detail: '許可された予定から追加・削除・時刻変更を抽出する', kind: 'system' },
        { label: '影響候補を整理', detail: '関係者や調整が必要そうな理由を候補として示す', kind: 'ai' },
        { label: '必要時だけ確認', detail: '人が影響を確認し、担当や時間を決める', kind: 'human' },
      ],
      roles: {
        system: ['許可された予定の取得', '予定差分の抽出'],
        ai: ['変更の意味と影響候補の整理'],
        human: hasConsultation ? ['通知条件の承認', '困りごとの相談', '担当と時間の最終調整'] : ['通知条件の承認', '影響の確認', '担当と時間の最終調整'],
      },
      metrics: {
        scheduledOutputBefore: `${task.observed.occurrences}回 / 4週間`,
        scheduledOutputAfter: hasConsultation ? '予定共有は非同期化、相談時間は別途維持' : '条件成立時は定期開催なし',
        routineHumanWorkBefore: `1回平均${task.observed.averageMinutes}分`,
        routineHumanWorkAfter: hasConsultation ? '相談が必要なときに実施' : '変更があるときだけ確認',
        detectionBefore: '定例の場で人が変化を確認',
        detectionAfter: 'システムが差分を検知し、人が影響を判断',
        outputBefore: task.output,
        outputAfter: hasConsultation ? '変更通知と、別途確保する相談' : '重要な変化の通知',
      },
      impact: { routineMinutesPerCycle: 0, exceptionMinutesMin: 5, exceptionMinutesMax: 10, confidence: 'LOW', assumption: assumptions.join('。') },
    },
    validationPlan: {
      summary: '仮説を採用する前に、未確認事項と技術条件を順に確認します。期間は検証内容に応じて決めます。',
      items: [
        { type: 'REQUIREMENT_VALIDATION', title: '残すべき役割を確認', description: '参加者へ、現在の業務がなくなると失われる情報や関係性を確認します。', checks: ['予定共有以外の目的', '相談・教育の有無', '口頭でしか扱えない情報'] },
        { type: 'TECHNICAL_FEASIBILITY', title: '予定差分を取得できるか確認', description: '必要な予定と変更情報を、許可された範囲で取得できるか確認します。', checks: ['Calendar APIの権限', '予定未登録時の扱い', '通知先と情報公開範囲'] },
        { type: 'PILOT', title: '現在の方法と並行して確かめる', description: '現在の業務を止めずに候補通知を比較し、取りこぼしと不要通知を記録します。', checks: ['見逃した重要変更', '不要だった通知', '人が判断した場面'] },
      ],
    },
  }
}

export const demoDesign = createDemoDesign(initialBusinessTask)

const demoProjectTask = createDeterministicTask(observationFromDemoGroup(demoWorkGroups[0]), [
  answerFrom(demoInterviewPlan, 0, 0),
  answerFrom(demoInterviewPlan, 1, 0),
  answerFrom(demoInterviewPlan, 2, 1),
  {
    questionId: 'follow-stakeholders', dimension: 'stakeholders', question: '朝会に参加する人と、共有結果を使う人を選んでください。',
    answer: 'チームメンバー、チーム責任者', source: 'OPTION', optionIds: ['stakeholder-team', 'stakeholder-lead'],
    meaning: { roles: [], stakeholders: ['チームメンバー', 'チーム責任者'], contextState: 'CONFIRMED' },
  },
  {
    questionId: 'follow-process', dimension: 'process', question: '普段の朝会で行っていることを選んでください。',
    answer: '予定共有、変更点の確認、困りごとの相談、担当調整、新人への説明', source: 'OPTION',
    optionIds: ['process-share', 'process-change', 'process-consult', 'process-adjust', 'process-training'],
    meaning: {
      roles: [
        { name: '困りごとの相談と担当調整', present: true, scope: 'ALL' },
        { name: '新人教育・関係づくり', present: true, scope: 'PARTIAL', scopeDetail: '新人が参加する回のみ' },
      ],
      processItems: ['予定共有', '変更点の確認', '困りごとの相談', '担当調整', '新人への説明'],
      contextState: 'PARTIAL',
    },
  },
])
const demoProjectDesign = createDemoDesign(demoProjectTask)

export const demoProject: ImprovementProject = {
  id: 'f67d5e79-5de6-44ea-a261-f5797cd34986',
  taskName: '朝会',
  businessContext: demoProjectTask,
  proposal: demoProjectDesign,
  hypothesis: demoProjectDesign.redesign.hypothesis,
  validations: demoProjectDesign.validationPlan.items,
  status: 'DRAFT',
  contextDirty: false,
  history: [{ id: '08ef2545-b53f-45ec-b86d-c5520d0bc11f', type: 'CREATED', summary: '再設計仮説を保存', createdAt: '2026-08-11T00:00:00.000Z' }],
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
}
