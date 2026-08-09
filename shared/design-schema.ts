import { z } from 'zod'

const shortText = z.string().trim().min(1).max(240)
const sentence = z.string().trim().min(1).max(800)
const textList = z.array(shortText).min(1).max(12)
const optionList = z.array(shortText).length(3)
const outputNeedOptionList = z.array(shortText).length(4)
const purposeOptionList = z.array(shortText.refine(
  (value) => !/(レポート|報告書|資料|メール|Excel|PowerPoint)/i.test(value),
  '目的候補には成果物名やツール名を含めないでください。',
)).length(3)

const purposeText = sentence.refine(
  (value) => !/(レポート|報告書|資料|メール|Excel|PowerPoint)/i.test(value),
  '目的には成果物名やツール名を含めず、誰が何を把握・判断・達成するかだけを記述してください。',
)

export const interviewOptionsSchema = z.object({
  purpose: purposeOptionList,
  process: optionList,
  exceptions: optionList,
  outputNeed: outputNeedOptionList,
}).strict()

export const interviewOptionsRequestSchema = z.object({
  eventTitle: z.string().trim().min(1).max(120),
  eventDurationMinutes: z.number().int().min(1).max(1440),
}).strict()

export const businessTaskSchema = z.object({
  name: shortText,
  purpose: purposeText,
  frequency: shortText,
  duration: shortText,
  trigger: shortText,
  consumer: shortText,
  tools: textList,
  inputs: textList,
  output: shortText,
  steps: textList,
  decisionPoints: textList,
  constraints: textList,
  outputRequirement: z.enum(['NOT_REQUIRED', 'ON_DEMAND', 'REQUIRED', 'UNKNOWN']),
  outputRequirementReason: sentence,
}).strict()

export const ratingSchema = z.enum(['HIGH', 'MEDIUM', 'LOW'])
export const workflowKindSchema = z.enum(['human', 'system', 'ai', 'decision', 'output'])

export const workflowStepSchema = z.object({
  label: shortText,
  detail: shortText,
  kind: workflowKindSchema,
}).strict()

export const redesignStrategySchema = z.enum(['ELIMINATE', 'ON_DEMAND', 'AUTOMATE', 'KEEP'])

export const designOutputSchema = z.object({
  analysis: z.object({
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
    }).strict()).min(3).max(5),
    ratings: z.object({
      opportunity: ratingSchema,
      implementation: ratingSchema,
      aiFit: ratingSchema,
    }).strict(),
    ratingReasons: z.array(sentence).min(1).max(5),
    facts: z.array(sentence).min(2).max(8),
    assumptions: z.array(sentence).min(1).max(8),
    unknowns: z.array(sentence).min(1).max(8),
    conventional: z.object({
      summary: sentence,
      steps: textList,
    }).strict(),
  }).strict(),
  redesign: z.object({
    strategy: redesignStrategySchema,
    headline: sentence,
    insight: sentence,
    workflow: z.array(workflowStepSchema).min(3).max(7),
    roles: z.object({
      system: textList,
      ai: textList,
      human: textList,
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
}).strict()

const recurringArtifactPattern = /(?:定期|毎回|毎週|毎月).{0,16}(?:レポート|報告書|資料|メール|レビュー|承認)|(?:レポート|報告書|資料).{0,16}(?:作成|生成|配信|送信|共有|レビュー|承認)|(?:定期メール|メール配信|毎回レビュー|毎回承認)/

export function designOutputSchemaFor(task: BusinessTask) {
  return designOutputSchema.superRefine((design, context) => {
    const { outputRequirement } = task
    const { strategy, workflow, metrics, impact } = design.redesign
    const workflowText = workflow.map((step) => `${step.label} ${step.detail}`).join('\n')

    if (outputRequirement === 'NOT_REQUIRED') {
      if (strategy !== 'ELIMINATE') {
        context.addIssue({ code: 'custom', path: ['redesign', 'strategy'], message: '定期成果物が不要なため、strategyはELIMINATEにしてください。' })
      }
      if (recurringArtifactPattern.test(workflowText)) {
        context.addIssue({ code: 'custom', path: ['redesign', 'workflow'], message: '定期成果物が不要なため、レポート生成・定期配信・毎回レビューを新工程から削除してください。' })
      }
      if (impact.routineMinutesPerCycle !== 0) {
        context.addIssue({ code: 'custom', path: ['redesign', 'impact', 'routineMinutesPerCycle'], message: '定期成果物が不要な場合、通常時の定期作業は0分にしてください。' })
      }
      if (!/(0|なし|廃止|不要|作らない)/.test(metrics.scheduledOutputAfter)) {
        context.addIssue({ code: 'custom', path: ['redesign', 'metrics', 'scheduledOutputAfter'], message: '見直し後の定期成果物は0回・なし・廃止のいずれかを明記してください。' })
      }
    }

    if (outputRequirement === 'ON_DEMAND') {
      if (!['ON_DEMAND', 'ELIMINATE'].includes(strategy)) {
        context.addIssue({ code: 'custom', path: ['redesign', 'strategy'], message: '必要時のみの成果物なので、strategyはON_DEMANDまたはELIMINATEにしてください。' })
      }
      if (impact.routineMinutesPerCycle !== 0) {
        context.addIssue({ code: 'custom', path: ['redesign', 'impact', 'routineMinutesPerCycle'], message: '必要時のみの成果物なので、通常時の定期作業は0分にしてください。' })
      }
      if (!/(0|なし|必要時|オンデマンド)/.test(metrics.scheduledOutputAfter)) {
        context.addIssue({ code: 'custom', path: ['redesign', 'metrics', 'scheduledOutputAfter'], message: '見直し後の定期成果物がなく、必要時のみであることを明記してください。' })
      }
    }

    if (['REQUIRED', 'UNKNOWN'].includes(outputRequirement) && ['ELIMINATE', 'ON_DEMAND'].includes(strategy)) {
      context.addIssue({ code: 'custom', path: ['redesign', 'strategy'], message: '定期成果物の廃止が確認できていないため、strategyはAUTOMATEまたはKEEPにしてください。' })
    }

    if (impact.exceptionMinutesMin > impact.exceptionMinutesMax) {
      context.addIssue({ code: 'custom', path: ['redesign', 'impact', 'exceptionMinutesMin'], message: '例外時の最小時間は最大時間以下にしてください。' })
    }
  })
}

export const businessDesignSchema = designOutputSchema.extend({
  businessTask: businessTaskSchema,
}).strict()

export const interviewRequestSchema = z.object({
  eventTitle: z.string().trim().min(1).max(120),
  eventDurationMinutes: z.number().int().min(1).max(1440),
  answers: z.array(z.object({
    question: z.string().trim().min(1).max(500),
    answer: z.string().trim().min(1).max(2000),
  }).strict()).min(4).max(5),
}).strict()

export const designRequestSchema = z.object({
  businessTask: businessTaskSchema,
}).strict()

export type BusinessTask = z.infer<typeof businessTaskSchema>
export type BusinessDesign = z.infer<typeof businessDesignSchema>
export type DesignOutput = z.infer<typeof designOutputSchema>
export type InterviewOptions = z.infer<typeof interviewOptionsSchema>
export type Rating = z.infer<typeof ratingSchema>
export type WorkflowKind = z.infer<typeof workflowKindSchema>
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>
export type OutputRequirement = z.infer<typeof businessTaskSchema.shape.outputRequirement>
export type RedesignStrategy = z.infer<typeof redesignStrategySchema>
