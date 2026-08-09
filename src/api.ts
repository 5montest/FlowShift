import { z } from 'zod'
import { calendarEventsResponseSchema, calendarStatusSchema, type CalendarEventsResponse, type CalendarStatus } from '../shared/calendar-schema'
import { businessDesignSchema, businessTaskSchema, interviewOptionsSchema, type BusinessDesign, type BusinessTask, type InterviewOptions } from '../shared/design-schema'
import { interviewQuestions } from './demo-data'
import type { DemoEvent } from './types'

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

const interviewOptionsResponseSchema = z.object({
  options: interviewOptionsSchema,
  meta: z.object({ model: z.string(), requestId: z.string() }).passthrough(),
})

const designResponseSchema = z.object({
  design: businessDesignSchema,
  meta: z.object({ model: z.string(), requestId: z.string() }).passthrough(),
})

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

async function postJson<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network', 'APIに接続できません。通信状態を確認して再試行してください。')
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(payload)
    throw new ApiError(error.success ? error.data.error.code : 'network', error.success ? error.data.error.message : 'AI APIへの接続に失敗しました。')
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new ApiError('invalid_response', 'AI APIの応答形式を確認できませんでした。')
  return parsed.data
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError('network', 'APIに接続できません。通信状態を確認して再試行してください。')
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(payload)
    throw new ApiError(error.success ? error.data.error.code : 'network', error.success ? error.data.error.message : 'Google Calendarへ接続できませんでした。')
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new ApiError('invalid_response', 'APIの応答形式を確認できませんでした。')
  return parsed.data
}

export async function getGoogleCalendarStatus(): Promise<CalendarStatus> {
  return getJson('/api/google/status', calendarStatusSchema)
}

export async function getGoogleCalendarEvents(): Promise<CalendarEventsResponse> {
  return getJson('/api/calendar/events', calendarEventsResponseSchema)
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

type EventInput = Pick<DemoEvent, 'title' | 'duration'>

export async function extractBusinessTask(answers: string[], event: EventInput): Promise<BusinessTask> {
  const result = await postJson('/api/business-task', {
    eventTitle: event.title,
    eventDurationMinutes: event.duration,
    answers: answers.map((answer, index) => ({ question: interviewQuestions[index].prompt, answer })),
  }, businessTaskResponseSchema)
  return result.businessTask
}

export async function generateInterviewOptions(event: EventInput): Promise<InterviewOptions> {
  const result = await postJson('/api/interview-options', {
    eventTitle: event.title,
    eventDurationMinutes: event.duration,
  }, interviewOptionsResponseSchema)
  return result.options
}

export async function generateBusinessDesign(businessTask: BusinessTask): Promise<BusinessDesign> {
  const result = await postJson('/api/design', { businessTask }, designResponseSchema)
  return result.design
}
