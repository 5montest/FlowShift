import type { WorkflowKind } from '../shared/design-schema'

export type { BusinessDesign, BusinessTask, ContextDimension, ContextState, InterviewAnswer, InterviewOption, InterviewPlan, InterviewQuestion, OptionMeaning, OutputRequirement, Rating, ValidationItem, WorkObservation } from '../shared/design-schema'
export type { CalendarEvent, CalendarEventsResponse, CalendarStatus } from '../shared/calendar-schema'
export type { ImprovementProject, ProjectHistoryItem, ProjectStatus } from '../shared/project-schema'
export type { DiscoverySummary, WorkGroup } from '../shared/work-group'

export type Screen = 'home' | 'dashboard' | 'discovery' | 'interview' | 'review' | 'analysis' | 'redesign' | 'projects' | 'project'

export type WorkflowStep = {
  id: string
  label: string
  detail: string
  kind: WorkflowKind
}
