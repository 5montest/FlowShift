import { z } from 'zod'
import { businessDesignSchema, businessTaskSchema, validationItemSchema } from './design-schema.ts'

export const projectStatusSchema = z.enum(['DRAFT', 'VALIDATING', 'ADOPTED', 'REJECTED', 'ON_HOLD'])
export const projectHistoryTypeSchema = z.enum(['CREATED', 'CONTEXT_UPDATED', 'HYPOTHESIS_UPDATED', 'STATUS_UPDATED'])

export const projectHistoryItemSchema = z.object({
  id: z.string().uuid(),
  type: projectHistoryTypeSchema,
  summary: z.string().trim().min(1).max(500),
  createdAt: z.string().datetime({ offset: true }),
}).strict()

export const improvementProjectSchema = z.object({
  id: z.string().uuid(),
  taskName: z.string().trim().min(1).max(240),
  businessContext: businessTaskSchema,
  proposal: businessDesignSchema,
  hypothesis: z.string().trim().min(1).max(800),
  validations: z.array(validationItemSchema).min(1).max(5),
  status: projectStatusSchema,
  contextDirty: z.boolean().default(false),
  history: z.array(projectHistoryItemSchema).max(200).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict()

export const createProjectRequestSchema = improvementProjectSchema.pick({
  taskName: true,
  businessContext: true,
  proposal: true,
  hypothesis: true,
  validations: true,
}).strict()

export const updateProjectContentRequestSchema = createProjectRequestSchema.extend({
  revisionSummary: z.string().trim().min(1).max(500).optional(),
}).strict()

export const updateProjectContextRequestSchema = z.object({
  businessContext: businessTaskSchema,
  revisionSummary: z.string().trim().min(1).max(500),
}).strict()

export const updateProjectStatusRequestSchema = z.object({
  status: projectStatusSchema,
}).strict()

export const projectListSchema = z.object({
  projects: z.array(improvementProjectSchema).max(200),
}).strict()

// 保存済み行には旧スキーマ（reviewAtや、UIが表示しないためスキーマから削除した設計フィールド）が
// 残っている可能性があるため、パース前に取り除く。
const legacyAnalysisKeys = ['purposeCheck', 'problems', 'ratings', 'ratingReasons', 'nextQuestions', 'conventional']

export function stripLegacyProjectFields(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const project = value as Record<string, unknown>
  delete project.reviewAt
  const proposal = project.proposal as Record<string, unknown> | undefined
  const analysis = proposal?.analysis as Record<string, unknown> | undefined
  if (analysis) for (const key of legacyAnalysisKeys) delete analysis[key]
  const redesign = proposal?.redesign as Record<string, unknown> | undefined
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
  return project
}

export type ImprovementProject = z.infer<typeof improvementProjectSchema>
export type ProjectStatus = z.infer<typeof projectStatusSchema>
