import { z } from 'zod'

export const calendarStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  email: z.string().email().optional(),
  picture: z.string().url().max(4096).optional(),
}).strict()

export const calendarEventSchema = z.object({
  id: z.string().min(1).max(1024),
  title: z.string().min(1).max(500),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(0).max(43_200),
  recurringEventId: z.string().min(1).max(1024).optional(),
  allDay: z.boolean(),
}).strict()

// アクセス可能なカレンダーの一覧（自分＋共有）。表示名と選択に必要な最小限だけ
export const calendarEntrySchema = z.object({
  id: z.string().trim().min(1).max(512),
  summary: z.string().trim().min(1).max(500),
  primary: z.boolean().optional(),
  accessRole: z.string().max(100).optional(),
}).strict()

export const calendarListResponseSchema = z.object({
  calendars: z.array(calendarEntrySchema).max(250),
}).strict()

export const calendarEventsResponseSchema = z.object({
  events: z.array(calendarEventSchema).max(2500),
  range: z.object({
    timeMin: z.string().datetime({ offset: true }),
    timeMax: z.string().datetime({ offset: true }),
  }).strict(),
}).strict()

export type CalendarStatus = z.infer<typeof calendarStatusSchema>
export type CalendarEntry = z.infer<typeof calendarEntrySchema>
export type CalendarListResponse = z.infer<typeof calendarListResponseSchema>
export type CalendarEvent = z.infer<typeof calendarEventSchema>
export type CalendarEventsResponse = z.infer<typeof calendarEventsResponseSchema>
