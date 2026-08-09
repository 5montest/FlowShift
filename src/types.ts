import type { WorkflowKind } from '../shared/design-schema'

export type { BusinessDesign, BusinessTask, InterviewOptions, OutputRequirement, Rating } from '../shared/design-schema'
export type { CalendarEvent, CalendarEventsResponse, CalendarStatus } from '../shared/calendar-schema'

export type Screen = 'home' | 'discovery' | 'interview' | 'review' | 'analysis' | 'redesign'

export type DemoEvent = {
  id: string
  day: string
  date: string
  time: string
  duration: number
  title: string
  category: string
  recurring?: boolean
  allDay?: boolean
  start?: string
  end?: string
  source?: 'demo' | 'google'
  candidate?: {
    rank: number
    level: 'HIGH' | 'MEDIUM'
    reason: string
  }
}

export type InterviewQuestion = {
  id: 'purpose' | 'process' | 'exceptions' | 'outputNeed'
  prompt: string
  hint: string
  options: string[]
}

export type WorkflowStep = {
  id: string
  label: string
  detail: string
  kind: WorkflowKind
}
