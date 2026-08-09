import { z } from 'zod'

export const calendarStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  email: z.string().email().optional(),
}).strict()

export const calendarEventSchema = z.object({
  id: z.string().min(1).max(1024),
  title: z.string().min(1).max(500),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(0).max(43_200),
  recurring: z.boolean(),
  allDay: z.boolean(),
}).strict()

export const calendarEventsResponseSchema = z.object({
  events: z.array(calendarEventSchema).max(100),
  range: z.object({
    timeMin: z.string().datetime({ offset: true }),
    timeMax: z.string().datetime({ offset: true }),
  }).strict(),
}).strict()

export type CalendarStatus = z.infer<typeof calendarStatusSchema>
export type CalendarEvent = z.infer<typeof calendarEventSchema>
export type CalendarEventsResponse = z.infer<typeof calendarEventsResponseSchema>
