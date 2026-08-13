import { useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import ContextCompleteness from '../components/ContextCompleteness'
import SummaryItem from '../components/SummaryItem'
import ToolTitle from '../components/ToolTitle'
import WorkDecomposition from '../components/WorkDecomposition'
import { formatMinutes } from '../lib/format'
import { contextLabels, deliveryLabels } from '../lib/labels'
import { useAsyncAction } from '../lib/useAsync'
import type { BusinessTask, ContextState } from '../types'

export default function ReviewScreen({ task, setTask, followUpCount, onFollowUp, onAddContext, onAnalyze }: {
  task: BusinessTask
  setTask: (task: BusinessTask) => void
  followUpCount: number
  onFollowUp: () => void
  onAddContext: (key: keyof BusinessTask['contextStatus']) => void
  onAnalyze: (task: BusinessTask) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const { status, errorMessage, run } = useAsyncAction('業務モデルを分析できませんでした。')
  const unknownLabels = (Object.entries(task.contextStatus) as [keyof BusinessTask['contextStatus'], ContextState][]).filter(([, state]) => state !== 'CONFIRMED').map(([key]) => contextLabels[key])

  function setText<K extends keyof BusinessTask>(key: K, value: BusinessTask[K], statusKey?: keyof BusinessTask['contextStatus']) {
    setTask({ ...task, [key]: value, ...(statusKey ? { contextStatus: { ...task.contextStatus, [statusKey]: String(value).trim() && value !== '未確認' ? 'CONFIRMED' : 'UNKNOWN' } } : {}) })
  }
  function setList(key: 'stakeholders' | 'businessRoles' | 'tools' | 'inputs' | 'steps' | 'decisionPoints' | 'exceptions' | 'constraints' | 'dependencies' | 'risks', value: string, statusKey?: keyof BusinessTask['contextStatus']) {
    const items = value.split('\n').map((item) => item.trim()).filter(Boolean)
    setTask({
      ...task,
      [key]: items,
      ...(key === 'businessRoles' ? { businessRoleDetails: items.map((name) => ({ name, present: true, scope: 'ALL' as const, sourceQuestionId: 'manual-edit', sourceOptionIds: [] })) } : {}),
      ...(statusKey ? { contextStatus: { ...task.contextStatus, [statusKey]: items.length ? 'CONFIRMED' : 'UNKNOWN' } } : {}),
    })
  }
  function openEditing() {
    setEditing(true)
    window.setTimeout(() => document.querySelector('.advanced-edit-groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  return <main className="tool-main">
    <ToolTitle title="いまの整理" summary="回答の要点を確認します。判断に影響する項目だけ、追加で質問します。" />
    <section className="observed-facts"><h2>カレンダーで分かったこと</h2><div><span>{task.observed.occurrences}回 / 4週間</span><span>合計{formatMinutes(task.observed.totalMinutes)}</span><span>1回平均{formatMinutes(task.observed.averageMinutes)}</span></div></section>
    <WorkDecomposition task={task} onEdit={openEditing} />
    <div className="review-layout">
      <div>
        <dl className="model-summary">
          <SummaryItem title="業務の目的">{task.purpose}</SummaryItem>
          <SummaryItem title="人が判断すること">{task.decisionPoints.length ? <ul>{task.decisionPoints.map((item) => <li key={item}>{item}</li>)}</ul> : '未確認'}</SummaryItem>
           <SummaryItem title="確認できている役割">{task.businessRoleDetails.some((role) => role.present) ? <ul>{task.businessRoleDetails.filter((role) => role.present).map((role) => <li key={role.name}>{role.name}{role.scope !== 'ALL' && <small> — {role.scopeDetail ?? '条件付き'}</small>}</li>)}</ul> : '予定共有以外の役割は未確認'}</SummaryItem>
           <SummaryItem title="共有方法と同期の役割">{(() => { const labels = deliveryLabels(task); return <dl className="delivery-summary"><div><dt>予定共有</dt><dd>{labels.sharing}</dd></div><div><dt>相談・調整</dt><dd>{labels.synchronous}</dd></div><div><dt>現在の形式</dt><dd>{labels.currentFormat}</dd></div></dl> })()}<p>{task.outputRequirementReason}</p></SummaryItem>
          <SummaryItem title="まだ確認したいこと">{unknownLabels.length ? <ul>{unknownLabels.map((item) => <li key={item}>{item}</li>)}</ul> : '再設計判断に影響する未確認の項目はありません'}</SummaryItem>
        </dl>
        <button type="button" className="secondary-button edit-toggle" onClick={() => setEditing((value) => !value)}>{editing ? '編集を閉じる' : '整理内容を修正する'}</button>
        {editing && <div className="advanced-edit-groups">
          <details className="advanced-edit" open><summary>目的と判断</summary><section className="review-form">
            <label className="full"><span>業務の目的</span><textarea rows={3} value={task.purpose} onChange={(event) => setText('purpose', event.target.value, 'purpose')} /><small>成果物名ではなく、誰が何を把握・判断するかを記述します。</small></label>
            <label className="full"><span>人が判断すること（1行に1つ）</span><textarea rows={3} value={task.decisionPoints.join('\n')} onChange={(event) => setList('decisionPoints', event.target.value, 'decisions')} /></label>
          </section></details>
          <details className="advanced-edit" open={task.contextStatus.stakeholders !== 'CONFIRMED' || task.contextStatus.process !== 'CONFIRMED'}><summary>関係者と現在工程</summary><section className="review-form">
            <label className="full"><span>現在の重要な役割（1行に1つ）</span><textarea rows={3} value={task.businessRoles.join('\n')} onChange={(event) => setList('businessRoles', event.target.value, 'roles')} /></label>
            <label><span>関係者</span><textarea rows={3} value={task.stakeholders.join('\n')} onChange={(event) => setList('stakeholders', event.target.value, 'stakeholders')} /></label>
            <label><span>現在の工程</span><textarea rows={3} value={task.steps.join('\n')} onChange={(event) => setList('steps', event.target.value, 'process')} /></label>
          </section></details>
          <details className="advanced-edit" open={['exceptions', 'constraints', 'dependencies', 'risks'].some((key) => task.contextStatus[key as keyof BusinessTask['contextStatus']] !== 'CONFIRMED')}><summary>例外・制約・リスク</summary><section className="review-form">
            <label><span>例外</span><textarea rows={3} value={task.exceptions.join('\n')} onChange={(event) => setList('exceptions', event.target.value, 'exceptions')} /></label>
            <label><span>制約</span><textarea rows={3} value={task.constraints.join('\n')} onChange={(event) => setList('constraints', event.target.value, 'constraints')} /></label>
            <label><span>他業務への影響</span><textarea rows={3} value={task.dependencies.join('\n')} onChange={(event) => setList('dependencies', event.target.value, 'dependencies')} /></label>
            <label><span>変更時のリスク</span><textarea rows={3} value={task.risks.join('\n')} onChange={(event) => setList('risks', event.target.value, 'risks')} /></label>
          </section></details>
        </div>}
        <details className="answer-trace"><summary>どの回答から整理したか</summary><ol>{task.answerEvidence.map((answer) => <li key={`${answer.questionId}-${answer.answer}`}><strong>{answer.question}</strong><p>{answer.answer}</p></li>)}</ol></details>
      </div>
      <ContextCompleteness task={task} onAdd={onAddContext} />
    </div>
    {status === 'error' && <p className="calendar-error" role="alert">{errorMessage}</p>}
    <div className="bottom-action">{followUpCount > 0 ? <button type="button" className="primary-button" onClick={onFollowUp}>判断に必要な{followUpCount}件を追加確認<ArrowRight size={20} /></button> : <button type="button" className="primary-button" onClick={() => void run(() => onAnalyze(task))} disabled={status === 'loading'}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />仮説を整理中</> : <>この内容で仮説を作る<ArrowRight size={20} /></>}</button>}</div>
  </main>
}
