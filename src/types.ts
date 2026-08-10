import type { WorkflowKind } from '../shared/design-schema'

export type { BusinessDesign, BusinessTask, ContextState, InterviewAnswer, InterviewPlan, InterviewQuestion, OutputRequirement, Rating, ValidationItem, WorkObservation } from '../shared/design-schema'
export type { CalendarEvent, CalendarEventsResponse, CalendarStatus } from '../shared/calendar-schema'
export type { ImprovementProject, ProjectStatus } from '../shared/project-schema'
export type { DiscoverySummary, WorkGroup } from '../shared/work-group'

export type Screen = 'home' | 'discovery' | 'interview' | 'review' | 'analysis' | 'redesign' | 'projects'

export type WorkflowStep = {
  id: string
  label: string
  detail: string
  kind: WorkflowKind
}
