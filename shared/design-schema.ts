import { z } from 'zod'

const shortText = z.string().trim().min(1).max(240)
const sentence = z.string().trim().min(1).max(800)
const textList = z.array(shortText).max(12)

const purposeText = sentence.refine(
  (value) => value === '未確認' || !/(レポート|報告書|資料|メール|Excel|PowerPoint)/i.test(value),
  '目的には成果物名やツール名を含めず、誰が何を把握・判断・達成するかだけを記述してください。',
)

export const workObservationSchema = z.object({
  title: z.string().trim().min(1).max(500),
  occurrences: z.number().int().min(1).max(2500),
  totalMinutes: z.number().int().min(0).max(1_000_000),
  averageMinutes: z.number().int().min(0).max(43_200),
  firstOccurredAt: z.string().datetime({ offset: true }),
  lastOccurredAt: z.string().datetime({ offset: true }),
  recurring: z.boolean(),
}).strict()

export const contextDimensionSchema = z.enum([
  'purpose',
  'stakeholders',
  'process',
  'decision',
  'exceptions',
  'constraints',
  'dependencies',
  'risks',
  'outputNeed',
])

export const interviewQuestionSchema = z.object({
  id: contextDimensionSchema,
  prompt: z.string().trim().min(1).max(500),
  hint: z.string().trim().min(1).max(500),
  options: z.array(shortText).min(3).max(4),
}).strict()

export const interviewPlanSchema = z.object({
  questions: z.array(interviewQuestionSchema).min(4).max(8).superRefine((questions, context) => {
    const ids = questions.map((question) => question.id)
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: '質問項目は重複できません。' })
    for (const required of ['purpose', 'process', 'decision', 'outputNeed'] as const) {
      if (!ids.includes(required)) context.addIssue({ code: 'custom', message: `${required}の質問が必要です。` })
    }
  }),
}).strict()

export const interviewOptionsRequestSchema = z.object({
  observation: workObservationSchema,
}).strict()

export const contextStateSchema = z.enum(['CONFIRMED', 'PARTIAL', 'UNKNOWN'])

export const contextStatusSchema = z.object({
  purpose: contextStateSchema,
  stakeholders: contextStateSchema,
  process: contextStateSchema,
  decisions: contextStateSchema,
  exceptions: contextStateSchema,
  constraints: contextStateSchema,
  dependencies: contextStateSchema,
  risks: contextStateSchema,
  output: contextStateSchema,
}).strict()

export const businessTaskSchema = z.object({
  name: shortText,
  observed: workObservationSchema,
  purpose: purposeText,
  frequency: shortText,
  duration: shortText,
  trigger: shortText,
  stakeholders: textList,
  consumer: shortText,
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
  contextStatus: contextStatusSchema,
}).strict()

export const ratingSchema = z.enum(['HIGH', 'MEDIUM', 'LOW'])
export const workflowKindSchema = z.enum(['human', 'system', 'ai', 'decision', 'output'])

export const workflowStepSchema = z.object({
  label: shortText,
  detail: shortText,
  kind: workflowKindSchema,
}).strict()

export const redesignStrategySchema = z.enum(['ELIMINATE', 'ON_DEMAND', 'AUTOMATE', 'KEEP'])
export const designReadinessSchema = z.enum(['HYPOTHESIS_READY', 'NEEDS_CONTEXT'])
export const validationTypeSchema = z.enum([
  'PILOT',
  'TECHNICAL_FEASIBILITY',
  'OFFLINE_EVALUATION',
  'REQUIREMENT_VALIDATION',
  'STAKEHOLDER_REVIEW',
])

export const validationItemSchema = z.object({
  type: validationTypeSchema,
  title: shortText,
  description: sentence,
  checks: z.array(shortText).min(1).max(8),
}).strict()

export const designOutputSchema = z.object({
  analysis: z.object({
    readiness: designReadinessSchema,
    conclusion: sentence,
    purposeCheck: z.object({
      outcome: sentence,
      currentMeans: sentence,
      outputDecision: sentence,
    }).strict(),
    problems: z.array(z.object({
      value: shortText,
      label: shortText,
      detail: shortText,
    }).strict()).min(1).max(5),
    ratings: z.object({
      opportunity: ratingSchema,
      implementation: ratingSchema,
      aiFit: ratingSchema,
    }).strict(),
    ratingReasons: z.array(sentence).min(1).max(5),
    facts: z.array(sentence).min(2).max(10),
    assumptions: z.array(sentence).max(10),
    unknowns: z.array(sentence).max(10),
    nextQuestions: z.array(sentence).max(8),
    conventional: z.object({
      summary: sentence,
      steps: z.array(shortText).min(1).max(12),
    }).strict(),
  }).strict(),
  redesign: z.object({
    strategy: redesignStrategySchema,
    hypothesis: sentence,
    headline: sentence,
    insight: sentence,
    workflow: z.array(workflowStepSchema).min(3).max(7),
    roles: z.object({
      system: textList,
      ai: textList,
      human: z.array(shortText).min(1).max(12),
    }).strict(),
    metrics: z.object({
      scheduledOutputBefore: shortText,
      scheduledOutputAfter: shortText,
      routineHumanWorkBefore: shortText,
      routineHumanWorkAfter: shortText,
      detectionBefore: shortText,
      detectionAfter: shortText,
      outputBefore: shortText,
      outputAfter: shortText,
    }).strict(),
    impact: z.object({
      routineMinutesPerCycle: z.number().int().min(0).max(10000),
      exceptionMinutesMin: z.number().int().min(0).max(10000),
      exceptionMinutesMax: z.number().int().min(0).max(10000),
      confidence: ratingSchema,
      assumption: sentence,
    }).strict(),
  }).strict(),
  validationPlan: z.object({
    summary: sentence,
    items: z.array(validationItemSchema).min(1).max(5),
  }).strict(),
}).strict()

export function designOutputSchemaFor(task: BusinessTask) {
  return designOutputSchema.superRefine((design, context) => {
    if (design.redesign.impact.exceptionMinutesMin > design.redesign.impact.exceptionMinutesMax) {
      context.addIssue({ code: 'custom', path: ['redesign', 'impact', 'exceptionMinutesMin'], message: '例外時の最小時間は最大時間以下にしてください。' })
    }

    const criticalContext = [task.contextStatus.constraints, task.contextStatus.dependencies, task.contextStatus.risks]
    if (criticalContext.includes('UNKNOWN') && design.analysis.readiness !== 'NEEDS_CONTEXT') {
      context.addIssue({ code: 'custom', path: ['analysis', 'readiness'], message: '重大な制約・依存関係・リスクが未確認の場合は、追加確認が必要です。' })
    }
    if (design.analysis.readiness === 'NEEDS_CONTEXT' && design.redesign.strategy === 'ELIMINATE') {
      context.addIssue({ code: 'custom', path: ['redesign', 'strategy'], message: '追加確認が必要な段階では業務廃止を断定できません。' })
    }
  })
}

export const businessDesignSchema = designOutputSchema.extend({
  businessTask: businessTaskSchema,
}).strict()

export const interviewRequestSchema = z.object({
  observation: workObservationSchema,
  answers: z.array(z.object({
    dimension: contextDimensionSchema,
    question: z.string().trim().min(1).max(500),
    answer: z.string().trim().min(1).max(2000),
  }).strict()).min(4).max(8),
}).strict()

export const designRequestSchema = z.object({
  businessTask: businessTaskSchema,
}).strict()

export type BusinessTask = z.infer<typeof businessTaskSchema>
export type BusinessDesign = z.infer<typeof businessDesignSchema>
export type DesignOutput = z.infer<typeof designOutputSchema>
export type InterviewPlan = z.infer<typeof interviewPlanSchema>
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>
export type InterviewAnswer = z.infer<typeof interviewRequestSchema.shape.answers.element>
export type WorkObservation = z.infer<typeof workObservationSchema>
export type ContextState = z.infer<typeof contextStateSchema>
export type Rating = z.infer<typeof ratingSchema>
export type WorkflowKind = z.infer<typeof workflowKindSchema>
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>
export type ValidationItem = z.infer<typeof validationItemSchema>
export type ValidationType = z.infer<typeof validationTypeSchema>
export type OutputRequirement = z.infer<typeof businessTaskSchema.shape.outputRequirement>
export type RedesignStrategy = z.infer<typeof redesignStrategySchema>
