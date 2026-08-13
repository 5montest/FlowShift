import { useState } from 'react'
import { Check } from 'lucide-react'
import SummaryItem from '../components/SummaryItem'
import WorkDecomposition from '../components/WorkDecomposition'
import { formatMinutes } from '../lib/format'
import { projectStatusLabels, validationLabels } from '../lib/labels'
import { useAsyncAction } from '../lib/useAsync'
import type { ContextDimension, ImprovementProject, ProjectStatus } from '../types'

export default function ProjectDetailScreen({ project, onAddContext, onUpdateHypothesis, onStatus }: {
  project: ImprovementProject
  onAddContext: (id: string, dimension: ContextDimension, question: string, detail: string) => Promise<void>
  onUpdateHypothesis: () => Promise<void>
  onStatus: (status: ProjectStatus) => Promise<void>
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const { status, errorMessage, run } = useAsyncAction('更新できませんでした。')
  const resolvedIds = new Set(project.businessContext.answerEvidence.filter((answer) => answer.questionId.startsWith('project-')).map((answer) => answer.questionId.slice('project-'.length)))
  const unknowns = project.proposal.analysis.criticalUnknowns.filter((unknown) => !resolvedIds.has(unknown.id))
  const roleDetails = project.businessContext.businessRoleDetails.filter((role) => role.present)

  return <main className="project-detail-main">
    <header className="project-title"><div><span className={`project-status status-${project.status.toLowerCase()}`}>{project.contextDirty ? '業務情報を更新済み' : projectStatusLabels[project.status]}</span><h1>{project.taskName}</h1><p>過去4週間：{project.businessContext.observed.occurrences}回 / {formatMinutes(project.businessContext.observed.totalMinutes)}</p></div><small>最終更新 {new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(project.updatedAt))}</small></header>
    {project.contextDirty && <section className="hypothesis-update-banner"><div><strong>業務モデルが更新されました</strong><p>保存中の仮説はまだ更新前の内容です。追加した情報を反映して、仮説を見直せます。</p></div><button type="button" className="primary-button" disabled={status === 'loading'} onClick={() => void run(onUpdateHypothesis)}>{status === 'loading' ? '更新中' : '仮説を更新する'}</button></section>}
    {errorMessage && <p className="calendar-error" role="alert">{errorMessage}</p>}
    <WorkDecomposition task={project.businessContext} design={project.proposal} />
    <div className="project-detail-grid">
      <section className="project-context"><h2>現在の業務</h2><dl className="model-summary">
        <SummaryItem title="目的">{project.businessContext.purpose}</SummaryItem>
        <SummaryItem title="人が判断すること">{project.businessContext.decisionPoints.length ? <ul>{project.businessContext.decisionPoints.map((item) => <li key={item}>{item}</li>)}</ul> : '未確認'}</SummaryItem>
        <SummaryItem title="関係者">{project.businessContext.stakeholders.length ? project.businessContext.stakeholders.join('、') : '未確認'}</SummaryItem>
        <SummaryItem title="確認済みの役割">{roleDetails.length ? <ul>{roleDetails.map((role) => <li key={role.name}>{role.name}{role.scope !== 'ALL' ? ` — ${role.scopeDetail ?? '条件付き'}` : ''}</li>)}</ul> : '未確認'}</SummaryItem>
      </dl></section>
      <section className="project-hypothesis-panel"><h2>再設計仮説</h2><h3>{project.proposal.redesign.headline}</h3><p>{project.hypothesis}</p></section>
    </div>
    <section className="project-unknowns"><header><h2>先に確認したいこと</h2><p>現場で分かったことを追加します。追加した内容は「仮説を更新する」で反映されます。</p></header>
      {unknowns.length ? unknowns.map((unknown) => <article key={unknown.id}><div><strong>{unknown.question}</strong><p>{unknown.reason}</p></div><form onSubmit={(event) => { event.preventDefault(); const detail = drafts[unknown.id]?.trim(); if (detail) void run(() => onAddContext(unknown.id, unknown.dimension, unknown.question, detail)) }}><input value={drafts[unknown.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [unknown.id]: event.target.value }))} placeholder="確認した具体的な内容" /><button type="submit" disabled={status === 'loading' || !drafts[unknown.id]?.trim()}>業務情報へ反映</button></form></article>) : <p className="all-resolved"><Check size={18} />表示中の未確認の項目はすべて更新済みです。</p>}
    </section>
    <section className="project-validations"><header><h2>検証</h2><p>{project.proposal.validationPlan.summary}</p></header>{project.validations.map((item) => <article key={`${item.type}-${item.title}`}><span>{validationLabels[item.type]}</span><div><strong>{item.title}</strong><p>{item.description}</p><ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></div></article>)}</section>
    <section className="project-history"><h2>履歴</h2>{project.history.length ? <ol>{[...project.history].reverse().map((item) => <li key={item.id}><time>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.createdAt))}</time><span>{item.summary}</span></li>)}</ol> : <p>履歴はまだありません。</p>}</section>
    <section className="project-decision"><h2>この仮説の判断</h2><div className="decision-buttons">{(['VALIDATING', 'ADOPTED', 'ON_HOLD', 'REJECTED'] as const).map((value) => <button key={value} type="button" disabled={status === 'loading' || project.status === value} onClick={() => void run(() => onStatus(value))}>{projectStatusLabels[value]}</button>)}</div></section>
  </main>
}
