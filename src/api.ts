import { z } from 'zod'
import { calendarEventsResponseSchema, calendarStatusSchema, type CalendarEventsResponse, type CalendarStatus } from '../shared/calendar-schema'
import {
  businessDesignSchema,
  businessTaskSchema,
  interviewPlanSchema,
  type BusinessDesign,
  type BusinessTask,
  type InterviewAnswer,
  type InterviewPlan,
  type WorkObservation,
} from '../shared/design-schema'
import {
  improvementProjectSchema,
  projectListSchema,
  type ImprovementProject,
  type ProjectStatus,
} from '../shared/project-schema'
import { normalizeWorkTitle, toObservation, workCategorySchema, type WorkCategory, type WorkGroup } from '../shared/work-group'

const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
})

const businessTaskResponseSchema = z.object({
  businessTask: businessTaskSchema,
  meta: z.object({ model: z.string(), requestId: z.string() }).passthrough(),
})

const interviewPlanResponseSchema = z.object({
  options: interviewPlanSchema,
  meta: z.object({ model: z.string(), requestId: z.string() }).passthrough(),
})

const followUpPlanResponseSchema = z.object({
  plan: interviewPlanSchema,
  meta: z.object({ model: z.string(), requestId: z.string() }).passthrough(),
})

const designResponseSchema = z.object({
  design: businessDesignSchema,
  meta: z.object({ model: z.string(), requestId: z.string() }).passthrough(),
})

const projectResponseSchema = z.object({ project: improvementProjectSchema }).strict()

const classifyResponseSchema = z.object({
  categories: z.array(z.object({ title: z.string(), category: workCategorySchema }).passthrough()).max(100),
  meta: z.object({ model: z.string(), requestId: z.string() }).passthrough(),
})

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

async function requestJson<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError('network', 'APIに接続できません。通信状態を確認して再試行してください。')
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(payload)
    throw new ApiError(error.success ? error.data.error.code : 'network', error.success ? error.data.error.message : 'APIへの接続に失敗しました。')
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new ApiError('invalid_response', 'サーバーの応答を読み取れませんでした。もう一度お試しください。')
  return parsed.data
}

function postJson<T>(path: string, body: unknown, schema: z.ZodType<T>, method = 'POST'): Promise<T> {
  return requestJson(path, schema, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function getGoogleCalendarStatus(): Promise<CalendarStatus> {
  return requestJson('/api/google/status', calendarStatusSchema)
}

export async function getGoogleCalendarEvents(): Promise<CalendarEventsResponse> {
  return requestJson('/api/calendar/events', calendarEventsResponseSchema)
}

export async function disconnectGoogleCalendar(): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/google/disconnect', { method: 'POST' })
  } catch {
    throw new ApiError('network', 'APIに接続できません。通信状態を確認して再試行してください。')
  }
  if (response.ok) return
  const payload: unknown = await response.json().catch(() => null)
  const error = apiErrorSchema.safeParse(payload)
  throw new ApiError(error.success ? error.data.error.code : 'network', error.success ? error.data.error.message : 'Google Calendarとの接続を解除できませんでした。')
}

export async function classifyWork(titles: string[]): Promise<Record<string, WorkCategory>> {
  const result = await postJson('/api/classify-work', { titles }, classifyResponseSchema)
  const map: Record<string, WorkCategory> = {}
  for (const item of result.categories) map[normalizeWorkTitle(item.title)] = item.category
  return map
}

export async function generateInterviewPlan(group: WorkGroup): Promise<InterviewPlan> {
  const result = await postJson('/api/interview-options', { observation: toObservation(group) }, interviewPlanResponseSchema)
  return result.options
}

export async function extractBusinessTask(answers: InterviewAnswer[], group: WorkGroup): Promise<BusinessTask> {
  return extractBusinessTaskFromObservation(answers, toObservation(group))
}

export async function extractBusinessTaskFromObservation(answers: InterviewAnswer[], observation: WorkObservation): Promise<BusinessTask> {
  const result = await postJson('/api/business-task', { observation, answers }, businessTaskResponseSchema)
  return result.businessTask
}

export async function generateFollowUpPlan(businessTask: BusinessTask): Promise<InterviewPlan> {
  const result = await postJson('/api/follow-up-questions', { businessTask }, followUpPlanResponseSchema)
  return result.plan
}

export async function generateBusinessDesign(businessTask: BusinessTask): Promise<BusinessDesign> {
  const result = await postJson('/api/design', { businessTask }, designResponseSchema)
  return result.design
}

export async function getImprovementProjects(): Promise<ImprovementProject[]> {
  const result = await requestJson('/api/projects', projectListSchema)
  return result.projects
}

export async function createImprovementProject(design: BusinessDesign): Promise<ImprovementProject> {
  const result = await postJson('/api/projects', { proposal: design }, projectResponseSchema)
  return result.project
}

export async function updateImprovementProjectStatus(id: string, status: ProjectStatus): Promise<ImprovementProject> {
  const result = await postJson(`/api/projects/${encodeURIComponent(id)}`, { action: 'status', status }, projectResponseSchema, 'PATCH')
  return result.project
}

export async function updateImprovementProject(id: string, design: BusinessDesign, revisionSummary?: string): Promise<ImprovementProject> {
  const result = await postJson(`/api/projects/${encodeURIComponent(id)}`, {
    action: 'proposal',
    proposal: design,
    ...(revisionSummary ? { revisionSummary } : {}),
  }, projectResponseSchema, 'PATCH')
  return result.project
}

export async function deleteImprovementProject(id: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch {
    throw new ApiError('network', 'APIに接続できません。通信状態を確認して再試行してください。')
  }
  if (response.ok) return
  const payload: unknown = await response.json().catch(() => null)
  const error = apiErrorSchema.safeParse(payload)
  throw new ApiError(error.success ? error.data.error.code : 'network', error.success ? error.data.error.message : '仮説を削除できませんでした。')
}

export async function updateImprovementProjectContext(id: string, pendingContext: BusinessTask, revisionSummary: string): Promise<ImprovementProject> {
  const result = await postJson(`/api/projects/${encodeURIComponent(id)}`, {
    action: 'context',
    pendingContext,
    revisionSummary,
  }, projectResponseSchema, 'PATCH')
  return result.project
}
