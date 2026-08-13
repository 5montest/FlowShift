import { useEffect, useMemo, useState } from 'react'
import { decomposeBusinessTask, proposedTreatment, type WorkComponent } from '../../shared/work-decomposition'
import { contextStateLabel } from '../lib/labels'
import type { BusinessDesign, BusinessTask } from '../types'

const componentScopeLabels: Record<WorkComponent['scope'], string> = {
  ALL: '通常時', PARTIAL: '一部のみ', CONDITIONAL: '条件付き', UNKNOWN: '範囲未確認',
}

export default function WorkDecomposition({ task, design, onEdit }: { task: BusinessTask; design?: BusinessDesign; onEdit?: () => void }) {
  const components = useMemo(() => decomposeBusinessTask(task), [task])
  const [selectedId, setSelectedId] = useState(components[0]?.id ?? '')
  const selected = components.find((component) => component.id === selectedId) ?? components[0]
  const evidence = selected ? task.answerEvidence.filter((answer) => selected.sourceQuestionIds.includes(answer.questionId)) : []
  const treatment = selected && design ? proposedTreatment(selected, design) : []

  useEffect(() => {
    if (!components.some((component) => component.id === selectedId)) setSelectedId(components[0]?.id ?? '')
  }, [components, selectedId])

  return <section className="work-decomposition" aria-label={`${task.name}の業務分解`}>
    <header><div><h2>業務の分解</h2><p>文章ではなく、目的を支える機能として整理しています。要素を選ぶと根拠と仮説上の扱いを確認できます。</p></div>{onEdit && <button type="button" onClick={onEdit}>分け方を修正</button>}</header>
    <div className="decomposition-root"><strong>{task.name}</strong><span>{task.purpose}</span></div>
    {components.length ? <>
      <div className="decomposition-connector" aria-hidden="true" />
      <div className="decomposition-nodes">{components.map((component) => <button key={component.id} type="button" aria-pressed={selected?.id === component.id} className={`component-${component.kind.toLowerCase()}`} onClick={() => setSelectedId(component.id)}><span>{component.label}</span><strong>{component.items[0]}</strong><small>{contextStateLabel(component.state)}・{componentScopeLabels[component.scope]}</small></button>)}</div>
      {selected && <div className={`component-detail component-${selected.kind.toLowerCase()}`} aria-live="polite">
        <div><span>{selected.label}</span><h3>{selected.items[0]}</h3><p>{contextStateLabel(selected.state)}・{componentScopeLabels[selected.scope]}{selected.scopeDetail ? `（${selected.scopeDetail}）` : ''}</p></div>
        <section><h4>現在の構成</h4><ul>{selected.items.map((item) => <li key={item}>{item}</li>)}</ul></section>
        {design && <section><h4>仮説上の扱い</h4>{treatment.length ? <ul>{treatment.map((item) => <li key={item}>{item}</li>)}</ul> : <p>この機能の扱いは、まだ仮説内で明確になっていません。</p>}</section>}
        <section><h4>回答の根拠</h4>{evidence.length ? <ul>{evidence.map((answer) => <li key={answer.questionId}>{answer.answer}</li>)}</ul> : <p>直接対応する回答はなく、整理済みの業務モデルから表示しています。</p>}</section>
      </div>}
    </> : <div className="decomposition-empty"><p>現在の工程や役割を確認すると、ここに分解結果が表示されます。</p>{onEdit && <button type="button" onClick={onEdit}>工程を追加する</button>}</div>}
  </section>
}
