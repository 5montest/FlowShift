import { z } from 'zod'
import { businessDesignSchema, businessTaskSchema, contextDimensionSchema, type BusinessTask } from './design-schema.ts'

export const projectStatusSchema = z.enum(['DRAFT', 'VALIDATING', 'ADOPTED', 'REJECTED', 'ON_HOLD'])
export const projectHistoryTypeSchema = z.enum(['CREATED', 'CONTEXT_UPDATED', 'HYPOTHESIS_UPDATED', 'STATUS_UPDATED'])

export const projectHistoryItemSchema = z.object({
  id: z.string().uuid(),
  type: projectHistoryTypeSchema,
  summary: z.string().trim().min(1).max(500),
  createdAt: z.string().datetime({ offset: true }),
}).strict()

// v2: 業務コンテクストの正本はproposal.businessTask。
// 情報を追加して仮説がまだ追いついていない間だけpendingContextが存在する
// （旧スキーマのcontextDirty + businessContextの置き換え）。
export const improvementProjectSchema = z.object({
  id: z.string().uuid(),
  status: projectStatusSchema,
  proposal: businessDesignSchema,
  pendingContext: businessTaskSchema.optional(),
  history: z.array(projectHistoryItemSchema).max(200).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict()

export const createProjectRequestSchema = z.object({
  proposal: businessDesignSchema,
}).strict()

export const updateProjectProposalRequestSchema = z.object({
  proposal: businessDesignSchema,
  revisionSummary: z.string().trim().min(1).max(500).optional(),
}).strict()

export const updateProjectContextRequestSchema = z.object({
  pendingContext: businessTaskSchema,
  revisionSummary: z.string().trim().min(1).max(500),
}).strict()

export const updateProjectStatusRequestSchema = z.object({
  status: projectStatusSchema,
}).strict()

export const projectListSchema = z.object({
  projects: z.array(improvementProjectSchema).max(200),
}).strict()

export type ImprovementProject = z.infer<typeof improvementProjectSchema>
export type ProjectStatus = z.infer<typeof projectStatusSchema>

export function projectContext(project: ImprovementProject): BusinessTask {
  return project.pendingContext ?? project.proposal.businessTask
}

export function projectName(project: ImprovementProject): string {
  return projectContext(project).name
}

// ---- 保存済み行の読み時アップグレード（v1 -> v2） ----------------------------

const legacyAnalysisKeys = ['purposeCheck', 'problems', 'ratings', 'ratingReasons', 'nextQuestions', 'conventional']

function upgradeContextStatus(task: unknown) {
  if (!task || typeof task !== 'object') return
  const status = (task as Record<string, unknown>).contextStatus as Record<string, unknown> | undefined
  if (!status) return
  if ('decisions' in status) { status.decision = status.decisions; delete status.decisions }
  if ('output' in status) { status.outputNeed = status.output; delete status.output }
  for (const dimension of contextDimensionSchema.options) {
    if (!(dimension in status)) status[dimension] = 'UNKNOWN'
  }
}

function upgradeDesign(design: unknown) {
  if (!design || typeof design !== 'object') return
  const proposal = design as Record<string, unknown>
  const analysis = proposal.analysis as Record<string, unknown> | undefined
  if (analysis) for (const key of legacyAnalysisKeys) delete analysis[key]
  const redesign = proposal.redesign as Record<string, unknown> | undefined
  if (redesign) {
    delete redesign.insight
    if (typeof redesign.hypothesis === 'string' && redesign.hypothesis.length > 200) {
      redesign.hypothesis = `${redesign.hypothesis.slice(0, 199)}…`
    }
    const impact = redesign.impact as Record<string, unknown> | undefined
    if (impact && ('routineMinutesPerCycle' in impact || 'confidence' in impact)) {
      redesign.impact = { assumption: impact.assumption }
    }
  }
  upgradeContextStatus(proposal.businessTask)
}

// D1のproject_json（v1またはv2）をパースする。v1の冗長フィールド
// （businessContext / hypothesis / validations / taskName / contextDirty / reviewAt）と
// UI非表示のため削除した設計フィールドを吸収し、contextStatusのキー名を新形へ揃える。
export function parseStoredProject(value: unknown): ImprovementProject | null {
  if (!value || typeof value !== 'object') return null
  const project = { ...(value as Record<string, unknown>) }
  delete project.reviewAt
  upgradeDesign(project.proposal)
  const businessContext = project.businessContext as Record<string, unknown> | undefined
  if (businessContext) upgradeContextStatus(businessContext)
  if (project.pendingContext) upgradeContextStatus(project.pendingContext)
  if (project.contextDirty && businessContext && !project.pendingContext) {
    project.pendingContext = businessContext
  }
  delete project.businessContext
  delete project.hypothesis
  delete project.validations
  delete project.taskName
  delete project.contextDirty
  const parsed = improvementProjectSchema.safeParse(project)
  return parsed.success ? parsed.data : null
}
