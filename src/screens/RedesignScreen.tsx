import { useRef, useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import EvidenceColumn from '../components/EvidenceColumn'
import ToolTitle from '../components/ToolTitle'
import WorkDecomposition from '../components/WorkDecomposition'
import WorkflowDiagram from '../components/WorkflowDiagram'
import { validationLabels } from '../lib/labels'
import { useAsyncAction } from '../lib/useAsync'
import type { BusinessDesign, ImprovementProject } from '../types'

export default function RedesignScreen({ design, connected, savedProject, onSave, onOpenSaved }: {
  design: BusinessDesign
  connected: boolean
  savedProject: ImprovementProject | null
  onSave: () => Promise<void>
  onOpenSaved: () => void
}) {
  const [showValidation, setShowValidation] = useState(false)
  const { status, errorMessage, run } = useAsyncAction()
  const validationRef = useRef<HTMLElement>(null)
  const needsContext = design.analysis.readiness === 'NEEDS_CONTEXT'
  const metrics = design.redesign.metrics
  const comparisons = [
    ['定期業務', metrics.scheduledOutputBefore, metrics.scheduledOutputAfter],
    ['人の定期作業', metrics.routineHumanWorkBefore, metrics.routineHumanWorkAfter],
    ['変化の検知', metrics.detectionBefore, metrics.detectionAfter],
    ['成果物', metrics.outputBefore, metrics.outputAfter],
  ]

  function toggleValidation() {
    if (showValidation) { setShowValidation(false); return }
    setShowValidation(true)
    window.setTimeout(() => validationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  return <main className="tool-main">
    <ToolTitle title="再設計仮説" summary="これは決定ではありません。前提を確かめながら、あなたが直していく仮説です。" />
    <section className="result-overview">
      <div className={`judgement ${needsContext ? 'needs-context' : ''}`}><strong>{needsContext ? '判断保留' : '検証候補'}</strong><p>{design.analysis.conclusion}</p></div>
      <div className="result-headline"><h2>{design.redesign.headline}</h2><p>{design.redesign.hypothesis}</p></div>
      <div className="result-compare">
        <section><h3>現在</h3><strong>{metrics.routineHumanWorkBefore}</strong><p>{metrics.scheduledOutputBefore}</p><p>{metrics.detectionBefore}</p></section>
        <section><h3>仮説</h3><strong>{metrics.routineHumanWorkAfter}</strong><p>{metrics.scheduledOutputAfter}</p><p>{metrics.detectionAfter}</p></section>
      </div>
      <div className="result-conditions">
        <section><h3>成り立つ前提</h3>{design.analysis.assumptions.length ? <ul>{design.analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>追加の前提はありません。</p>}</section>
        <section><h3>未確認</h3>{design.analysis.unknowns.length ? <ul>{design.analysis.unknowns.map((item) => <li key={item}>{item}</li>)}</ul> : <p>重大な未確認の項目はありません。</p>}</section>
      </div>
      <div className="result-actions"><button type="button" className="secondary-button" onClick={toggleValidation}>{showValidation ? '検証方法を閉じる' : 'この仮説を検証する'}<ArrowRight size={20} /></button>{!connected ? <span>保存するにはGoogle Calendarへ接続してください。</span> : savedProject ? <button type="button" className="primary-button" onClick={onOpenSaved}>保存した業務を開く<ArrowRight size={20} /></button> : <button type="button" className="primary-button" disabled={status === 'loading'} onClick={() => void run(onSave)}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />保存中</> : '仮説を保存してワークスペースへ'}</button>}</div>
      {status === 'error' && <p className="calendar-error" role="alert">{errorMessage}</p>}
    </section>

    <WorkDecomposition task={design.businessTask} design={design} />

    <details className="report-section"><summary>現在と仮説の比較</summary><section className="comparison-section"><div className="comparison-table"><div className="comparison-head"><span></span><strong>現在</strong><strong>仮説</strong></div>{comparisons.map(([label, before, after]) => <div key={label}><span>{label}</span><p>{before}</p><p>{after}</p></div>)}</div><p className="comparison-assumption">前提：{design.redesign.impact.assumption}</p></section></details>
    <details className="report-section"><summary>工程と役割</summary><section className="workflow-section"><h2>現在の工程</h2>{design.businessTask.steps.length ? <ol className="plain-workflow">{design.businessTask.steps.map((step) => <li key={step}>{step}</li>)}</ol> : <p>現在の工程は未確認です。</p>}<h2>仮説上の工程</h2><WorkflowDiagram steps={design.redesign.workflow} ariaLabel="再設計仮説の工程" /></section><section className="role-section"><h2>担当する役割</h2><div className="role-grid"><div><h3>システム</h3><ul>{design.redesign.roles.system.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>AI</h3><ul>{design.redesign.roles.ai.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>人</h3><ul>{design.redesign.roles.human.map((item) => <li key={item}>{item}</li>)}</ul></div></div></section></details>
    <details className="report-section"><summary>根拠と不確実性</summary><div className="evidence-grid"><EvidenceColumn title="確認できていること" items={design.analysis.facts} tone="facts" empty="確認済みの情報はありません" /><EvidenceColumn title="成り立つ前提" items={design.analysis.assumptions} tone="assumptions" empty="前提はありません" /><EvidenceColumn title="まだ分からないこと" items={design.analysis.unknowns} tone="unknowns" empty="重大な未確認の項目はありません" /></div></details>

    {showValidation && <section ref={validationRef} className="validation-section"><header><h2>検証方法</h2><p>{design.validationPlan.summary}</p></header>{design.validationPlan.items.map((item) => <article key={`${item.type}-${item.title}`}><span>{validationLabels[item.type]}</span><h3>{item.title}</h3><p>{item.description}</p><ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></article>)}</section>}
  </main>
}
