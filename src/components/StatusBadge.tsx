import { CircleCheck, CircleDashed, CirclePause, CircleX, FlaskConical } from 'lucide-react'
import { projectStatusLabels } from '../lib/labels'
import type { ProjectStatus } from '../types'

const statusIcons: Record<ProjectStatus, typeof CircleCheck> = {
  DRAFT: CircleDashed, VALIDATING: FlaskConical, ADOPTED: CircleCheck, ON_HOLD: CirclePause, REJECTED: CircleX,
}

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  const Icon = statusIcons[status]
  return <span className={`project-status status-${status.toLowerCase()}`}><Icon size={14} />{projectStatusLabels[status]}</span>
}
