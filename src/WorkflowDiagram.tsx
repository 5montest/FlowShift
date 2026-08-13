import type { WorkflowStepInput } from '../shared/design-schema'

type Props = {
  steps: WorkflowStepInput[]
  ariaLabel: string
}

const kindLabel = {
  human: '人が対応',
  system: 'システム',
  ai: 'AI',
  decision: '判断',
  output: '出力',
}

export default function WorkflowDiagram({ steps, ariaLabel }: Props) {
  return (
    <ol className="workflow-list" aria-label={ariaLabel}>
      {steps.map((step, index) => (
        <li key={`${index}-${step.label}`} className={`workflow-step workflow-step-${step.kind}`}>
          <span className="workflow-number">{index + 1}</span>
          <div><small>{kindLabel[step.kind]}</small><strong>{step.label}</strong><p>{step.detail}</p></div>
        </li>
      ))}
    </ol>
  )
}
