import { LoaderCircle, ArrowRight } from 'lucide-react'
import ToolTitle from '../components/ToolTitle'
import WorkflowDiagram from '../components/WorkflowDiagram'
import { formatMinutes } from '../lib/format'
import { validationLabels } from '../lib/labels'
import { useAsyncAction } from '../lib/useAsync'
import type { BusinessDesign, BusinessTask, ImprovementProject } from '../types'

// 仮説画面。遷移直後に「現在」側（手元の決定論データ）を即描画し、
// 仮説側だけ生成を待つ。スピナー単独画面は作らない。
export default function HypothesisScreen({ task, design, designError, connected, savedProject, onRetry, onSave, onOpenSaved }: {
  task: BusinessTask
  design: BusinessDesign | null
  designError: string
  connected: boolean
  savedProject: ImprovementProject | null
  onRetry: () => void
  onSave: () => Promise<void>
  onOpenSaved: () => void
}) {
  const { status, errorMessage, run } = useAsyncAction()
  const roles = task.businessRoleDetails.filter((role) => role.present)

  return <main className="tool-main">
    <ToolTitle title="再設計仮説" summary="これは決定ではありません。前提を確かめながら、あなたが直していく仮説です。" />
    <section className="result-overview">
      <div className="result-compare">
        <section><h3>現在</h3><strong>{task.observed.occurrences}回 / 4週間</strong><p>1回平均{formatMinutes(task.observed.averageMinutes)}・合計{formatMinutes(task.observed.totalMinutes)}</p>{roles.length > 0 && <p>役割：{roles.map((role) => role.name).join('・')}</p>}</section>
        {design ? <section><h3>仮説</h3><strong>{design.redesign.metrics.routineHumanWorkAfter}</strong><p>{design.redesign.metrics.scheduledOutputAfter}</p><p>{design.redesign.metrics.detectionAfter}</p></section>
          : <section className="hypothesis-pending" aria-live="polite"><h3>仮説</h3>{designError ? <><p className="calendar-error" role="alert">{designError}</p><button type="button" className="secondary-button" onClick={onRetry}>もう一度作る</button></> : <><LoaderCircle className="animate-spin" /><p>見直し案を組み立てています。20秒ほどかかります。</p></>}</section>}
      </div>
      {design && <>
        <div className={`judgement ${design.analysis.readiness === 'NEEDS_CONTEXT' ? 'needs-context' : ''}`}><strong>{design.analysis.readiness === 'NEEDS_CONTEXT' ? '判断保留' : '検証候補'}</strong><p>{design.analysis.conclusion}</p></div>
        <div className="result-headline"><h2>{design.redesign.headline}</h2><p>{design.redesign.hypothesis}</p></div>
        <div className="result-conditions">
          <section><h3>成り立つ前提</h3>{design.analysis.assumptions.length ? <ul>{design.analysis.assumptions.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul> : <p>追加の前提はありません。</p>}</section>
          <section><h3>まだ分からないこと</h3>{design.analysis.unknowns.length ? <ul>{design.analysis.unknowns.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul> : <p>重大な未確認の項目はありません。</p>}</section>
        </div>
        <div className="result-actions">{!connected ? <span>保存するにはGoogle Calendarへ接続してください。</span> : savedProject ? <button type="button" className="primary-button" onClick={onOpenSaved}>保存した業務を開く<ArrowRight size={20} /></button> : <button type="button" className="primary-button" disabled={status === 'loading'} onClick={() => void run(onSave)}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />保存中</> : '仮説を保存して検証を始める'}</button>}</div>
        {status === 'error' && <p className="calendar-error" role="alert">{errorMessage}</p>}
      </>}
    </section>

    {design && <>
      <details className="report-section"><summary>根拠と工程<small>確認できたこと・仮説上の工程と役割</small></summary>
        <section className="workflow-section"><h2>確認できたこと</h2><ul className="facts-list">{design.analysis.facts.map((item) => <li key={item}>{item}</li>)}</ul><h2>仮説上の工程</h2><WorkflowDiagram steps={design.redesign.workflow} ariaLabel="再設計仮説の工程" /></section>
        <section className="role-section"><h2>担当する役割</h2><div className="role-grid"><div><h3>システム</h3><ul>{design.redesign.roles.system.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>AI</h3><ul>{design.redesign.roles.ai.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>人</h3><ul>{design.redesign.roles.human.map((item) => <li key={item}>{item}</li>)}</ul></div></div><p className="comparison-assumption">前提：{design.redesign.impact.assumption}</p></section>
      </details>
      <details className="report-section"><summary>検証のはじめ方<small>{design.validationPlan.items[0]?.title}など{design.validationPlan.items.length}件</small></summary>
        <section className="validation-section"><header><p>{design.validationPlan.summary}</p></header>{design.validationPlan.items.map((item) => <article key={`${item.type}-${item.title}`}><span>{validationLabels[item.type]}</span><h3>{item.title}</h3><p>{item.description}</p><ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></article>)}</section>
      </details>
    </>}
  </main>
}
