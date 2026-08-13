import { ArrowRight, Bot, CircleAlert, CircleCheck, CircleHelp, Cog, FlaskConical, Info, LoaderCircle, UserRound } from 'lucide-react'
import ToolTitle from '../components/ToolTitle'
import WorkflowDiagram from '../components/WorkflowDiagram'
import { formatMinutes } from '../lib/format'
import { contextLabels, validationLabels } from '../lib/labels'
import { useAsyncAction } from '../lib/useAsync'
import type { BusinessDesign, BusinessTask, ImprovementProject } from '../types'

// 仮説画面。遷移直後に「現在」側（手元の決定論データ）を即描画し、
// 仮説側だけ生成を待つ。スピナー単独画面は作らない。
export default function HypothesisScreen({ task, design, designError, savedProject, onBackToSession, onRetry, onSave, onOpenSaved }: {
  task: BusinessTask
  design: BusinessDesign | null
  designError: string
  savedProject: ImprovementProject | null
  onBackToSession: () => void
  onRetry: () => void
  onSave: () => Promise<void>
  onOpenSaved: () => void
}) {
  const { status, errorMessage, run } = useAsyncAction()
  const needsContext = design?.analysis.readiness === 'NEEDS_CONTEXT'
  const blockingKeys = (['constraints', 'dependencies', 'risks'] as const).filter((key) => task.contextStatus[key] === 'UNKNOWN')
  const comparisons = design ? [
    ['定期業務', design.redesign.metrics.scheduledOutputBefore, design.redesign.metrics.scheduledOutputAfter],
    ['人の定期作業', design.redesign.metrics.routineHumanWorkBefore, design.redesign.metrics.routineHumanWorkAfter],
    ['変化の検知', design.redesign.metrics.detectionBefore, design.redesign.metrics.detectionAfter],
    ['成果物', design.redesign.metrics.outputBefore, design.redesign.metrics.outputAfter],
  ] as const : []

  return <main className="tool-main">
    <ToolTitle title={`再設計仮説：${task.name}`} summary="これは決定ではありません。前提を確かめながら、あなたが直していく仮説です。" />
    <section className="result-overview">
      {!design && <div className="metric-compare">
        <div className="metric-head"><span></span><strong>現在</strong><strong>仮説</strong></div>
        <div><span>観測</span><p>{task.observed.occurrences}回 / 4週間・合計{formatMinutes(task.observed.totalMinutes)}</p><p className="hypothesis-pending-cell" aria-live="polite">{designError ? '' : '組み立て中…'}</p></div>
      </div>}
      {!design && (designError
        ? <div className="request-state" role="alert"><div><strong>仮説を作成できませんでした</strong><p>{designError}</p><button type="button" className="primary-button" onClick={onRetry}>もう一度作る</button></div></div>
        : <div className="hypothesis-pending" aria-live="polite"><LoaderCircle className="animate-spin" /><p>見直し案を組み立てています。最大1分ほどかかることがあります。</p></div>)}
      {design && <>
        <div className={`judgement ${needsContext ? 'needs-context' : ''}`}>
          {needsContext ? <CircleAlert size={20} /> : <FlaskConical size={20} />}
          <strong>{needsContext ? '判断保留' : '検証候補'}</strong>
          <div>
            <p>{design.analysis.conclusion}</p>
            {needsContext && blockingKeys.length > 0 && <p className="judgement-hint">{blockingKeys.map((key) => contextLabels[key]).join('・')}を確認すると、判断できるようになります。<button type="button" className="text-button" onClick={onBackToSession}>整理に戻って追加する</button></p>}
          </div>
        </div>
        <div className="result-headline"><h2>{design.redesign.headline}</h2><p>{design.redesign.hypothesis}</p></div>
        <div className="metric-compare">
          <div className="metric-head"><span></span><strong>現在</strong><strong>仮説</strong></div>
          <div><span>観測</span><p>{task.observed.occurrences}回 / 4週間・合計{formatMinutes(task.observed.totalMinutes)}</p><p>—</p></div>
          {comparisons.map(([label, before, after]) => <div key={label}><span>{label}</span><p>{before}</p><p className="metric-after">{after}</p></div>)}
        </div>
        <div className="result-conditions">
          <section><h3><Info size={16} className="heading-icon" />成り立つ前提</h3>{design.analysis.assumptions.length ? <ul>{design.analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>追加の前提はありません。</p>}</section>
          <section><h3><CircleHelp size={16} className="heading-icon" />まだ分からないこと</h3>{design.analysis.unknowns.length ? <ul>{design.analysis.unknowns.map((item) => <li key={item}>{item}</li>)}</ul> : <p>重大な未確認の項目はありません。</p>}</section>
        </div>
      </>}
    </section>

    {design && <>
      <details className="report-section" open><summary>根拠と工程<small>確認できたこと・仮説上の工程と役割</small></summary>
        <section className="workflow-section"><h2><CircleCheck size={18} className="heading-icon" />確認できたこと</h2><ul className="facts-list">{design.analysis.facts.map((item) => <li key={item}>{item}</li>)}</ul><h2>仮説上の工程</h2><WorkflowDiagram steps={design.redesign.workflow} ariaLabel="再設計仮説の工程" /></section>
        <section className="role-section"><h2>担当する役割</h2><div className="role-grid"><div><h3><Cog size={16} className="heading-icon" />システム</h3><ul>{design.redesign.roles.system.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3><Bot size={16} className="heading-icon" />AI</h3><ul>{design.redesign.roles.ai.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3><UserRound size={16} className="heading-icon" />人</h3><ul>{design.redesign.roles.human.map((item) => <li key={item}>{item}</li>)}</ul></div></div><p className="comparison-assumption">前提：{design.redesign.impact.assumption}</p></section>
      </details>
      <details className="report-section"><summary>検証のはじめ方<small>{design.validationPlan.items[0]?.title}など{design.validationPlan.items.length}件</small></summary>
        <section className="validation-section"><header><p>{design.validationPlan.summary}</p></header>{design.validationPlan.items.map((item) => <article key={`${item.type}-${item.title}`}><span>{validationLabels[item.type]}</span><h3>{item.title}</h3><p>{item.description}</p><ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></article>)}</section>
      </details>
    </>}
    <div className="action-bar">
      <div className="action-bar-hint">
        <span>保存すると、ワークスペースの「進行中の仮説」から検証を続けられます。</span>
        {status === 'error' && <span className="calendar-error" role="alert">{errorMessage}</span>}
      </div>
      {savedProject
        ? <button type="button" className="primary-button" onClick={onOpenSaved}>保存した業務を開く<ArrowRight size={20} /></button>
        : designError && !design
          ? <button type="button" className="primary-button" onClick={onRetry}>もう一度作る</button>
          : <button type="button" className="primary-button" disabled={!design || status === 'loading'} onClick={() => void run(onSave)}>
            {!design ? <><LoaderCircle className="animate-spin" />仮説を準備中</> : status === 'loading' ? <><LoaderCircle className="animate-spin" />保存中</> : '仮説を保存して検証を始める'}
          </button>}
    </div>
  </main>
}
