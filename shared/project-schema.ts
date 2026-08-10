import { z } from 'zod'
import { businessDesignSchema, businessTaskSchema, validationItemSchema } from './design-schema'

export const projectStatusSchema = z.enum(['DRAFT', 'VALIDATING', 'ADOPTED', 'REJECTED', 'ON_HOLD'])

export const improvementProjectSchema = z.object({
  id: z.string().uuid(),
  taskName: z.string().trim().min(1).max(240),
  businessContext: businessTaskSchema,
  proposal: businessDesignSchema,
  hypothesis: z.string().trim().min(1).max(800),
  validations: z.array(validationItemSchema).min(1).max(5),
  status: projectStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  reviewAt: z.string().datetime({ offset: true }).optional(),
}).strict()

export const createProjectRequestSchema = improvementProjectSchema.pick({
  taskName: true,
  businessContext: true,
  proposal: true,
  hypothesis: true,
  validations: true,
}).strict()

export const updateProjectStatusRequestSchema = z.object({
  status: projectStatusSchema,
  reviewAt: z.string().datetime({ offset: true }).optional(),
}).strict()

export const projectListSchema = z.object({
  projects: z.array(improvementProjectSchema).max(200),
}).strict()

export type ImprovementProject = z.infer<typeof improvementProjectSchema>
export type ProjectStatus = z.infer<typeof projectStatusSchema>
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>
