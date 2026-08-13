import { z } from 'zod'
import { userProfileSchema } from './profile-schema.ts'

const shortText = z.string().trim().min(1).max(240)
const sentence = z.string().trim().min(1).max(800)
const textList = z.array(shortText).max(12)

// 目的文から成果物名・ツール名を排除するスタイルガードは、生成時にだけ動的に適用する
// （businessTaskDraftSchemaForを参照）。保存済みデータの検証には使わない：一律禁止を
// businessTaskSchemaに入れると、業務自体がこれらの語を含む場合（メール対応等）に
// 生成が毎回失敗し、保存済みプロジェクトの読み込みまで落ちる。

export const workObservationSchema = z.object({
  title: z.string().trim().min(1).max(500),
  occurrences: z.number().int().min(1).max(2500),
  totalMinutes: z.number().int().min(0).max(1_000_000),
  averageMinutes: z.number().int().min(0).max(43_200),
  firstOccurredAt: z.string().datetime({ offset: true }),
  lastOccurredAt: z.string().datetime({ offset: true }),
  recurring: z.boolean(),
  // 削減トラッキングで直近のWorkGroupと突き合わせるための出所id（旧データには無い）。
  // 他カレンダー由来は`cal:<encodedCalendarId>|`接頭辞が付くため長めに取る
  sourceGroupId: z.string().trim().min(1).max(1200).optional(),
  // 他人（共有カレンダー）の業務を分析している場合のカレンダー表示名。
  // 有無が「閲覧者モード」（回答＝本人でなく閲覧者の理解）の判定に使われる
  sourceCalendarName: z.string().trim().min(1).max(500).optional(),
}).strict()

export const contextStateSchema = z.enum(['CONFIRMED', 'PARTIAL', 'UNKNOWN'])
export const roleScopeSchema = z.enum(['ALL', 'PARTIAL', 'CONDITIONAL', 'UNKNOWN'])
export const contextDimensionSchema = z.enum([
  'purpose',
  'stakeholders',
  'roles',
  'process',
  'decision',
  'exceptions',
  'constraints',
  'dependencies',
  'risks',
  'outputNeed',
])

export const optionMeaningSchema = z.object({
  outputNeed: z.enum(['ASYNC_OK', 'ON_DEMAND', 'SYNC_DISCUSSION_STILL_REQUIRED', 'CURRENT_FORMAT_REQUIRED', 'UNKNOWN']).optional(),
  // 誤りの影響の大きさ（NIST的な失敗コスト）。risksの回答が設計判断へ機械反映されるための機械可読値
  failureCost: z.enum(['HIGH', 'LOW']).optional(),
  roles: z.array(z.object({
    name: shortText,
    present: z.boolean(),
    scope: roleScopeSchema.optional(),
    scopeDetail: shortText.optional(),
  }).strict()).max(6).default([]),
  stakeholders: textList.optional(),
  processItems: textList.optional(),
  contextState: contextStateSchema.default('CONFIRMED'),
}).strict().superRefine((meaning, context) => {
  const hasRequiredRole = meaning.roles.some((role) => role.present)
  if (meaning.outputNeed === 'SYNC_DISCUSSION_STILL_REQUIRED' && !hasRequiredRole) {
    context.addIssue({ code: 'custom', path: ['roles'], message: '同期の相談が必要な選択肢には、残す役割を指定してください。' })
  }
})

export const interviewOptionSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  label: shortText,
  exclusive: z.boolean().optional(),
  meaning: optionMeaningSchema,
}).strict()

export const interviewQuestionSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  dimension: contextDimensionSchema,
  phase: z.enum(['CORE', 'FOLLOW_UP']),
  prompt: z.string().trim().min(1).max(500),
  hint: z.string().trim().min(1).max(500),
  selection: z.enum(['SINGLE', 'MULTIPLE']).optional(),
  options: z.array(interviewOptionSchema).min(3).max(6),
}).strict().superRefine((question, context) => {
  const optionIds = question.options.map((option) => option.id)
  if (new Set(optionIds).size !== optionIds.length) context.addIssue({ code: 'custom', path: ['options'], message: '選択肢IDは重複できません。' })
  if (question.dimension === 'outputNeed' && question.options.some((option) => !option.meaning.outputNeed)) {
    context.addIssue({ code: 'custom', path: ['options'], message: '成果物の必要性を聞く選択肢にはoutputNeedが必要です。' })
  }
})

export const interviewPlanSchema = z.object({
  phase: z.enum(['CORE', 'FOLLOW_UP']),
  questions: z.array(interviewQuestionSchema).max(4),
}).strict().superRefine((plan, context) => {
  const ids = plan.questions.map((question) => question.id)
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['questions'], message: '質問IDは重複できません。' })
  if (plan.questions.some((question) => question.phase !== plan.phase)) context.addIssue({ code: 'custom', path: ['questions'], message: '質問のphaseをplanと一致させてください。' })
  if (plan.phase === 'CORE') {
    const dimensions = plan.questions.map((question) => question.dimension)
    if (plan.questions.length !== 3 || !['purpose', 'decision', 'outputNeed'].every((item) => dimensions.includes(item as typeof dimensions[number]))) {
      context.addIssue({ code: 'custom', path: ['questions'], message: 'Core Interviewはpurpose・decision・outputNeedの3問にしてください。' })
    }
  }
})

export const interviewAnswerSchema = z.object({
  questionId: z.string().trim().min(1).max(100),
  dimension: contextDimensionSchema,
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(2000),
  source: z.enum(['OPTION', 'FREE_TEXT']),
  optionId: z.string().trim().min(1).max(100).optional(),
  optionIds: z.array(z.string().trim().min(1).max(100)).min(1).max(6).optional(),
  meaning: optionMeaningSchema.optional(),
}).strict().superRefine((answer, context) => {
  if (answer.source === 'OPTION' && ((!answer.optionId && !answer.optionIds) || !answer.meaning)) {
    context.addIssue({ code: 'custom', message: '選択回答にはoptionIdまたはoptionIdsとmeaningが必要です。' })
  }
  if (answer.source === 'FREE_TEXT' && (answer.optionId || answer.optionIds || answer.meaning)) {
    context.addIssue({ code: 'custom', message: '自由回答に選択肢の意味を付与しないでください。' })
  }
})

export const interviewOptionsRequestSchema = z.object({
  observation: workObservationSchema,
  profile: userProfileSchema.optional(),
}).strict()

// 文脈10次元の唯一の定義はcontextDimensionSchema。contextStatusのキーをそこから
// 生成することで、次元名とステータスキーが二度と乖離しないようにする。
export const contextStatusSchema = z.object(
  Object.fromEntries(contextDimensionSchema.options.map((dimension) => [dimension, contextStateSchema])) as Record<z.infer<typeof contextDimensionSchema>, typeof contextStateSchema>,
).strict()

export const businessRoleDetailSchema = z.object({
  name: shortText,
  present: z.boolean(),
  scope: roleScopeSchema,
  scopeDetail: shortText.optional(),
  sourceQuestionId: z.string().trim().min(1).max(100),
  sourceOptionIds: z.array(z.string().trim().min(1).max(100)).max(6).default([]),
}).strict()

export const deliveryModelSchema = z.object({
  sharingMode: z.enum(['ASYNC_POSSIBLE', 'SYNC_REQUIRED', 'UNKNOWN']),
  synchronousRole: z.enum(['NONE', 'SEPARATE_REQUIRED', 'CURRENT_FORMAT_REQUIRED', 'UNKNOWN']),
  currentFormat: z.enum(['NOT_REQUIRED', 'REQUIRED', 'UNKNOWN']),
  sourceQuestionId: z.string().trim().min(1).max(100).optional(),
  sourceOptionIds: z.array(z.string().trim().min(1).max(100)).max(6).default([]),
}).strict()

export const businessTaskDraftSchema = z.object({
  name: shortText,
  purpose: sentence,
  frequency: shortText,
  duration: shortText,
  trigger: shortText,
  stakeholders: textList,
  consumer: shortText,
  businessRoles: textList.default([]),
  businessRoleDetails: z.array(businessRoleDetailSchema).max(12).default([]),
  tools: textList,
  inputs: textList,
  output: shortText,
  steps: textList,
  decisionPoints: textList,
  exceptions: textList,
  constraints: textList,
  dependencies: textList,
  risks: textList,
  outputRequirement: z.enum(['NOT_REQUIRED', 'ON_DEMAND', 'REQUIRED', 'UNKNOWN']),
  outputRequirementReason: sentence,
  deliveryModel: deliveryModelSchema.default({
    sharingMode: 'UNKNOWN',
    synchronousRole: 'UNKNOWN',
    currentFormat: 'UNKNOWN',
    sourceOptionIds: [],
  }),
  contextStatus: contextStatusSchema,
}).strict()

const PURPOSE_ARTIFACT_WORDS = ['レポート', '報告書', '資料', 'メール', 'Excel', 'PowerPoint']

// LLM出力検証用：目的文に成果物名・ツール名を書かせないスタイルガード。
// ただしユーザー自身の語彙（業務タイトル・回答文）に含まれる語は業務の実体なので許可する。
export function businessTaskDraftSchemaFor(contextText: string) {
  const lowered = contextText.toLowerCase()
  const banned = PURPOSE_ARTIFACT_WORDS.filter((word) => !lowered.includes(word.toLowerCase()))
  if (!banned.length) return businessTaskDraftSchema
  const pattern = new RegExp(`(${banned.join('|')})`, 'i')
  return businessTaskDraftSchema.extend({
    purpose: sentence.refine(
      (value) => value === '未確認' || !pattern.test(value),
      '目的には成果物名やツール名を含めず、誰が何を把握・判断・達成するかだけを記述してください。',
    ),
  })
}

export const businessTaskSchema = businessTaskDraftSchema.extend({
  observed: workObservationSchema,
  answerEvidence: z.array(interviewAnswerSchema).max(20).default([]),
  // 最新のrisks回答meaningからfinalizeBusinessTaskが決定論で設定する（LLMには書かせない）
  failureCost: z.enum(['HIGH', 'LOW', 'UNKNOWN']).default('UNKNOWN'),
}).strict().superRefine((task, context) => {
  const latestOutputMeaning = task.answerEvidence.map((answer) => answer.meaning?.outputNeed).filter(Boolean).at(-1)
  if (latestOutputMeaning === 'SYNC_DISCUSSION_STILL_REQUIRED' && (
    task.deliveryModel.sharingMode !== 'ASYNC_POSSIBLE'
    || task.deliveryModel.synchronousRole !== 'SEPARATE_REQUIRED'
    || task.deliveryModel.currentFormat === 'REQUIRED'
  )) {
    context.addIssue({ code: 'custom', path: ['deliveryModel'], message: '予定共有の非同期化と、別途必要な相談時間を分けて保持してください。' })
  }
  if (latestOutputMeaning === 'CURRENT_FORMAT_REQUIRED' && task.outputRequirement !== 'REQUIRED') {
    context.addIssue({ code: 'custom', path: ['outputRequirement'], message: '現在形式が必要という回答を維持してください。' })
  }
  if (latestOutputMeaning === 'ASYNC_OK' && task.outputRequirement !== 'NOT_REQUIRED') {
    context.addIssue({ code: 'custom', path: ['outputRequirement'], message: '非同期共有でよいという回答を維持してください。' })
  }
  for (const detail of task.businessRoleDetails) {
    if (detail.scope === 'PARTIAL' && !detail.scopeDetail) {
      context.addIssue({ code: 'custom', path: ['businessRoleDetails'], message: '一部確認の役割には、対象となる範囲を保持してください。' })
    }
  }
})

export const workflowKindSchema = z.enum(['human', 'system', 'ai', 'decision', 'output'])
export const workflowStepSchema = z.object({ label: shortText, detail: shortText, kind: workflowKindSchema }).strict()
// 改善の検討梯子（仕様書§16・Hammer以来のBPR思想）：上の段から順に問い、最初に成立した段を選ぶ。
// AUTOMATE=条件を明文化できるルール自動化・API連携、AI_ASSIST=AIが下書きし人が確認、AI_DELEGATE=AI単独実行。
export const redesignStrategySchema = z.enum(['ELIMINATE', 'SIMPLIFY', 'ON_DEMAND', 'AUTOMATE', 'AI_ASSIST', 'AI_DELEGATE', 'KEEP'])
export const ladderVerdictSchema = z.enum(['ADOPTED', 'REJECTED', 'DEFERRED'])
export const ladderStepSchema = z.object({
  rung: redesignStrategySchema,
  verdict: ladderVerdictSchema,
  reason: shortText,
}).strict()
export const designReadinessSchema = z.enum(['HYPOTHESIS_READY', 'NEEDS_CONTEXT'])
export const validationTypeSchema = z.enum(['PILOT', 'TECHNICAL_FEASIBILITY', 'OFFLINE_EVALUATION', 'REQUIREMENT_VALIDATION', 'STAKEHOLDER_REVIEW'])

export const validationItemSchema = z.object({
  type: validationTypeSchema,
  title: shortText,
  description: sentence,
  checks: z.array(shortText).min(1).max(8),
}).strict()

export const criticalUnknownSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  dimension: contextDimensionSchema,
  question: sentence,
  reason: sentence,
}).strict()

export const designOutputSchema = z.object({
  analysis: z.object({
    readiness: designReadinessSchema,
    conclusion: sentence,
    facts: z.array(sentence).min(2).max(12),
    assumptions: z.array(sentence).max(10),
    unknowns: z.array(sentence).max(10),
    criticalUnknowns: z.array(criticalUnknownSchema).max(6).default([]),
  }).strict(),
  redesign: z.object({
    strategy: redesignStrategySchema,
    // 検討の梯子のトレース：採用した段まで、各段の判断（採用/見送り/要検証）と理由を1行ずつ。
    // optional＝旧保存データ互換。生成時はdesignOutputSchemaForが必須化する。
    ladder: z.array(ladderStepSchema).max(7).optional(),
    hypothesis: z.string().trim().min(1).max(200),
    // 確認済み役割の維持を明記する定型文。hypothesis本文が役割に触れていない場合だけ
    // finalizeBusinessDesignが設定する（本文への機械連結は文切れを起こすためやめた）
    roleNote: sentence.optional(),
    headline: sentence,
    workflow: z.array(workflowStepSchema).min(3).max(7),
    roles: z.object({ system: textList, ai: textList, human: z.array(shortText).min(1).max(12) }).strict(),
    // 比較行は意味のあるものだけ埋める（無変化・該当なしの行はキーごと省略）。
    // 旧データは全フィールドを持つため、optional化は後方互換。
    metrics: z.object({
      scheduledOutputBefore: shortText.optional(),
      scheduledOutputAfter: shortText.optional(),
      routineHumanWorkBefore: shortText.optional(),
      routineHumanWorkAfter: shortText.optional(),
      detectionBefore: shortText.optional(),
      detectionAfter: shortText.optional(),
      outputBefore: shortText.optional(),
      outputAfter: shortText.optional(),
    }).strict(),
    impact: z.object({ assumption: sentence }).strict(),
  }).strict(),
  validationPlan: z.object({ summary: sentence, items: z.array(validationItemSchema).min(1).max(5) }).strict(),
}).strict()

export function designOutputSchemaFor(task: BusinessTask) {
  return designOutputSchema.superRefine((design, context) => {
    const criticalContext = [task.contextStatus.constraints, task.contextStatus.dependencies, task.contextStatus.risks]
    if (criticalContext.includes('UNKNOWN') && design.analysis.readiness !== 'NEEDS_CONTEXT') {
      context.addIssue({ code: 'custom', path: ['analysis', 'readiness'], message: '重大な制約・依存関係・リスクが未確認の場合は、追加確認が必要です。' })
    }
    if (design.analysis.readiness === 'NEEDS_CONTEXT' && design.redesign.strategy === 'ELIMINATE') {
      context.addIssue({ code: 'custom', path: ['redesign', 'strategy'], message: '追加確認が必要な段階では業務廃止を断定できません。' })
    }
    if (task.outputRequirement === 'REQUIRED' && design.redesign.strategy === 'ELIMINATE') {
      context.addIssue({ code: 'custom', path: ['redesign', 'strategy'], message: '必要と確認された同期機能・成果物を廃止できません。' })
    }
    // 生成時は検討の梯子のトレースを必須にする（保存データはoptionalのまま＝旧データ互換）
    if (!design.redesign.ladder?.length) {
      context.addIssue({ code: 'custom', path: ['redesign', 'ladder'], message: '検討の梯子（各段の判断と理由）をladderへ記録してください。' })
    } else if (!design.redesign.ladder.some((step) => step.verdict === 'ADOPTED' && step.rung === design.redesign.strategy)) {
      context.addIssue({ code: 'custom', path: ['redesign', 'ladder'], message: 'ladderには選んだstrategyの段をverdict=ADOPTEDで含めてください。' })
    }
    // 誤りの影響が大きいと回答済みなら、AI単独実行を提案しない（人の確認を挟むAI_ASSISTへ）
    if (task.failureCost === 'HIGH' && design.redesign.strategy === 'AI_DELEGATE') {
      context.addIssue({ code: 'custom', path: ['redesign', 'strategy'], message: '誤りの影響が大きいと回答済みのため、AI単独実行ではなく人の確認を挟む構成にしてください。' })
    }
  })
}

export const businessDesignSchema = designOutputSchema.extend({ businessTask: businessTaskSchema }).strict()

export const interviewRequestSchema = z.object({
  observation: workObservationSchema,
  answers: z.array(interviewAnswerSchema).min(3).max(20),
}).strict()

export const followUpRequestSchema = z.object({ businessTask: businessTaskSchema }).strict()
export const designRequestSchema = z.object({
  businessTask: businessTaskSchema,
  profile: userProfileSchema.optional(),
}).strict()

export type BusinessTaskDraft = z.infer<typeof businessTaskDraftSchema>
export type BusinessTask = z.infer<typeof businessTaskSchema>
export type BusinessDesign = z.infer<typeof businessDesignSchema>
export type DesignOutput = z.infer<typeof designOutputSchema>
export type InterviewPlan = z.infer<typeof interviewPlanSchema>
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>
export type InterviewOption = z.infer<typeof interviewOptionSchema>
export type InterviewAnswer = z.infer<typeof interviewAnswerSchema>
export type InterviewRequest = z.infer<typeof interviewRequestSchema>
export type OptionMeaning = z.infer<typeof optionMeaningSchema>
export type RoleScope = z.infer<typeof roleScopeSchema>
export type WorkObservation = z.infer<typeof workObservationSchema>
export type ContextState = z.infer<typeof contextStateSchema>
export type ContextDimension = z.infer<typeof contextDimensionSchema>
export type WorkflowKind = z.infer<typeof workflowKindSchema>
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>
export type ValidationItem = z.infer<typeof validationItemSchema>
