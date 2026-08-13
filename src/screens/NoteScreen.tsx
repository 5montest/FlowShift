import { useState } from 'react'
import { Check, TrendingDown } from 'lucide-react'
import QuestionCard from '../components/QuestionCard'
import SummaryItem from '../components/SummaryItem'
import WorkDecomposition from '../components/WorkDecomposition'
import { questionForContext } from '../../shared/context-questions'
import { projectContext, projectName } from '../../shared/project-schema'
import { computeReduction } from '../../shared/work-group'
import { formatMinutes } from '../lib/format'
import { projectStatusLabels, validationLabels } from '../lib/labels'
import { useAsyncAction } from '../lib/useAsync'
import type { ImprovementProject, InterviewAnswer, ProjectStatus, WorkGroup } from '../types'

// 保存した仮説の検証ノート。未確認の項目は他の画面と同じ質問カードで答える。
export default function NoteScreen({ project, currentGroups, onAddContext, onUpdateHypothesis, onStatus, onDelete }: {
  project: ImprovementProject
  currentGroups: WorkGroup[]
  onAddContext: (id: string, answer: InterviewAnswer) => Promise<void>
  onUpdateHypothesis: () => Promise<void>
  onStatus: (status: ProjectStatus) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [activeUnknownId, setActiveUnknownId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'reject' | 'delete' | null>(null)
  const { status, errorMessage, run } = useAsyncAction('更新できませんでした。')
  const context = projectContext(project)
  const contextDirty = Boolean(project.pendingContext)
  const resolvedIds = new Set(context.answerEvidence.filter((answer) => answer.questionId.startsWith('project-')).map((answer) => answer.questionId.slice('project-'.length)))
  const unknowns = project.proposal.analysis.criticalUnknowns.filter((unknown) => !resolvedIds.has(unknown.id))
  const roleDetails = context.businessRoleDetails.filter((role) => role.present)
  const reduction = project.status === 'ADOPTED' ? computeReduction(context.observed, currentGroups) : null
  const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })

  return <main className="project-detail-main">
    <header className="project-title"><div><span className="badge-row"><span className={`project-status status-${project.status.toLowerCase()}`}>{projectStatusLabels[project.status]}</span>{contextDirty && <span className="project-status status-dirty">更新待ち</span>}</span><h1>{projectName(project)}</h1><p>保存時点（{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(project.createdAt))}）：過去4週間で{context.observed.occurrences}回 / {formatMinutes(context.observed.totalMinutes)}</p></div><small>最終更新 {dateFormat.format(new Date(project.updatedAt))}</small></header>
    {reduction && (reduction.matched
      ? <section className="reduction-banner"><TrendingDown size={20} /><div><strong>4週間 {reduction.baselineOccurrences}回/{formatMinutes(reduction.baselineMinutes)} → {reduction.currentOccurrences}回/{formatMinutes(reduction.currentMinutes)}{reduction.deltaMinutes > 0 ? `（−${formatMinutes(reduction.deltaMinutes)}）` : reduction.deltaMinutes < 0 ? `（+${formatMinutes(-reduction.deltaMinutes)}）` : '（±0）'}</strong><p>保存時点と直近4週間の、同じ業務のカレンダー実測の比較です。</p></div></section>
      : <section className="reduction-banner"><TrendingDown size={20} /><div><strong>直近4週間のカレンダーにこの業務が見当たりません</strong><p>廃止できた場合のほか、予定の名前を変えた場合や長期休暇でも表示されます。</p></div></section>)}
    {contextDirty && <section className="hypothesis-update-banner"><div><strong>業務モデルが更新されました</strong><p>保存中の仮説はまだ更新前の内容です。追加した情報を反映して、仮説を見直せます。</p></div><button type="button" className="primary-button" disabled={status === 'loading'} onClick={() => void run(onUpdateHypothesis)}>{status === 'loading' ? '更新中' : '仮説を更新する'}</button></section>}
    {errorMessage && <p className="calendar-error" role="alert">{errorMessage}</p>}
    <WorkDecomposition task={context} design={project.proposal} />
    <div className="project-detail-grid">
      <section className="project-context"><h2>現在の業務</h2><dl className="model-summary">
        <SummaryItem title="目的">{context.purpose}</SummaryItem>
        <SummaryItem title="人が判断すること">{context.decisionPoints.length ? <ul>{context.decisionPoints.map((item) => <li key={item}>{item}</li>)}</ul> : '未確認'}</SummaryItem>
        <SummaryItem title="関係者">{context.stakeholders.length ? context.stakeholders.join('、') : '未確認'}</SummaryItem>
        <SummaryItem title="確認済みの役割">{roleDetails.length ? <ul>{roleDetails.map((role) => <li key={role.name}>{role.name}{role.scope !== 'ALL' ? ` — ${role.scopeDetail ?? '条件付き'}` : ''}</li>)}</ul> : '未確認'}</SummaryItem>
      </dl></section>
      <section className="project-hypothesis-panel"><h2>再設計仮説</h2><h3>{project.proposal.redesign.headline}</h3><p>{project.proposal.redesign.hypothesis}</p></section>
    </div>
    <section className="project-unknowns"><header><h2>先に確認したいこと</h2><p>現場で分かったことを追加します。追加した内容は「仮説を更新する」で反映されます。</p></header>
      {unknowns.length ? unknowns.map((unknown) => {
        const question = { ...questionForContext(unknown.dimension).questions[0], id: unknown.id }
        return <article key={unknown.id}>
          <div><strong>{unknown.question}</strong><p>{unknown.reason}</p></div>
          {activeUnknownId === unknown.id
            ? <div className="unknown-card"><QuestionCard question={question} submitLabel="業務情報へ反映" busy={status === 'loading'} onSubmit={(answer) => { void run(async () => { await onAddContext(unknown.id, answer); setActiveUnknownId(null) }) }} /><button type="button" className="text-button" onClick={() => setActiveUnknownId(null)}>閉じる</button></div>
            : <button type="button" className="secondary-button" onClick={() => setActiveUnknownId(unknown.id)}>答える</button>}
        </article>
      }) : <p className="all-resolved"><Check size={18} />表示中の未確認の項目はありません。</p>}
    </section>
    <section className="project-validations"><header><h2>検証</h2><p>{project.proposal.validationPlan.summary}</p></header>{project.proposal.validationPlan.items.map((item) => <article key={`${item.type}-${item.title}`}><span>{validationLabels[item.type]}</span><div><strong>{item.title}</strong><p>{item.description}</p><ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></div></article>)}</section>
    <section className="project-history"><h2>履歴</h2>{project.history.length ? <ol>{[...project.history].reverse().map((item) => <li key={item.id}><time>{dateFormat.format(new Date(item.createdAt))}</time><span>{item.summary}</span></li>)}</ol> : <p>履歴はまだありません。</p>}</section>
    <section className="project-decision"><h2>この仮説の扱い</h2><div className="decision-select">
      <select aria-label="この仮説の扱いを選ぶ" value={project.status === 'DRAFT' ? '' : project.status} disabled={status === 'loading'} onChange={(event) => { const value = event.target.value as ProjectStatus; if (!value) return; if (value === 'REJECTED') { setConfirmAction('reject'); event.target.value = project.status === 'DRAFT' ? '' : project.status; return } void run(() => onStatus(value)) }}>
        {project.status === 'DRAFT' && <option value="">選んでください</option>}
        {(['VALIDATING', 'ADOPTED', 'ON_HOLD', 'REJECTED'] as const).map((value) => <option key={value} value={value}>{projectStatusLabels[value]}</option>)}
      </select>
      <p>採用にすると、この業務の時間の変化を「カレンダーを更新」のたびにワークスペースで確認できます。保留・却下・採用にした仮説は「保存した仮説をすべて見る」から開けます。却下した業務は、また声かけの候補に戻ります。</p>
      <button type="button" className="text-button delete-project" onClick={() => setConfirmAction('delete')}>この仮説を削除する</button>
    </div></section>
    {confirmAction && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="note-confirm-heading">
      <h2 id="note-confirm-heading">{confirmAction === 'delete' ? '仮説を削除しますか？' : '却下にしますか？'}</h2>
      <p>{confirmAction === 'delete' ? `「${projectName(project)}」の仮説・回答・履歴を完全に削除します。元に戻せません。` : 'この仮説は一覧の「保存した仮説をすべて見る」へ移動し、この業務はまた声かけの候補に戻ります。'}</p>
      <div><button type="button" className="secondary-button" onClick={() => setConfirmAction(null)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { const action = confirmAction; setConfirmAction(null); void run(() => action === 'delete' ? onDelete() : onStatus('REJECTED')) }}>{confirmAction === 'delete' ? '削除する' : '却下にする'}</button></div>
    </section></div>}
  </main>
}
