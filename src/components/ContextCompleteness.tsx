import { contextLabels, contextStateLabel } from '../lib/labels'
import type { BusinessTask, ContextState } from '../types'

export default function ContextCompleteness({ task, onAdd }: { task: BusinessTask; onAdd?: (key: keyof BusinessTask['contextStatus']) => void }) {
  return <section className="context-completeness" aria-labelledby="context-heading"><h2 id="context-heading">業務理解</h2><dl>{(Object.entries(task.contextStatus) as [keyof BusinessTask['contextStatus'], ContextState][]).map(([key, state]) => <div key={key}><dt>{contextLabels[key]}</dt><dd className={`context-${state.toLowerCase()}`}>{contextStateLabel(state)}{state !== 'CONFIRMED' && onAdd && <button type="button" className="inline-add" onClick={() => onAdd(key)}>情報を追加</button>}</dd></div>)}</dl></section>
}
