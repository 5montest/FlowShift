import { useState } from 'react'
import { ArrowRight, Check, LoaderCircle, Pencil } from 'lucide-react'
import ContextCompleteness from '../components/ContextCompleteness'
import QuestionCard from '../components/QuestionCard'
import QuestionDialog from '../components/QuestionDialog'
import SummaryItem from '../components/SummaryItem'
import ToolTitle from '../components/ToolTitle'
import WorkDecomposition from '../components/WorkDecomposition'
import { questionForContext } from '../../shared/context-questions'
import { formatMinutes } from '../lib/format'
import { contextLabels, deliveryLabels } from '../lib/labels'
import { useAsyncAction } from '../lib/useAsync'
import type { BusinessTask, ContextState, InterviewAnswer, InterviewPlan, InterviewQuestion, WorkGroup } from '../types'

// 追加の入力（修正・情報を追加・追加質問）はすべて中央ダイアログで行う。
// ページには何も注入しない＝「押して→スクロール」を作らない。
type SessionDialog =
  | { kind: 'answers' }
  | { kind: 'edit'; question: InterviewQuestion }
  | { kind: 'pending' }
  | { kind: 'context'; key: keyof BusinessTask['contextStatus'] }

// 「聞く」と「確認する」を1画面で行う。Q&Aは1ビューポートに収まり、
// 確認モードは主要CTAが下部バーに常時見えている。
export default function SessionScreen({ group, plan, planSource, answers, task, pendingQuestions, askedQuestions, refining, onAnswer, onRetryRefine, onProceed }: {
  group: WorkGroup
  plan: InterviewPlan | null
  planSource: 'ai' | 'generic' | null
  answers: InterviewAnswer[]
  task: BusinessTask | null
  pendingQuestions: InterviewQuestion[]
  askedQuestions: InterviewQuestion[]
  refining: boolean
  onAnswer: (answer: InterviewAnswer) => void
  onRetryRefine: () => void
  onProceed: () => Promise<void>
}) {
  const [dialog, setDialog] = useState<SessionDialog | null>(null)
  const [contextUpdated, setContextUpdated] = useState('')
  const { status, errorMessage, run } = useAsyncAction('仮説を作成できませんでした。')
  const answeredIds = new Set(answers.map((answer) => answer.questionId))
  const firstUnanswered = plan?.questions.find((question) => !answeredIds.has(question.id))
  const answeredInPlan = plan?.questions.filter((item) => answeredIds.has(item.id)).length ?? 0
  const confirming = Boolean(plan) && !firstUnanswered
  const counts = task ? countStates(task) : null

  function questionFor(answer: InterviewAnswer): InterviewQuestion {
    return askedQuestions.find((question) => question.id === answer.questionId)
      ?? { ...questionForContext(answer.dimension).questions[0], id: answer.questionId }
  }

  function toast(questionText: string) {
    setContextUpdated(questionText)
    window.setTimeout(() => setContextUpdated(''), 4000)
  }

  const sessionDialogs = <>
    {dialog?.kind === 'answers' && <QuestionDialog title={`回答済みの内容（${answers.length}件）`} description="修正すると、前の回答をその内容で上書きします。" onClose={() => setDialog(null)}>
      <ol className="answered-list">{answers.map((answer) => <li key={`${answer.questionId}-${answer.answer}`}>
        <strong>{answer.question}</strong><p>{answer.answer}</p>
        <button type="button" className="text-button inline-edit" onClick={() => setDialog({ kind: 'edit', question: questionFor(answer) })}><Pencil size={14} />修正</button>
      </li>)}</ol>
    </QuestionDialog>}
    {dialog?.kind === 'edit' && <QuestionDialog title="回答を修正する" description="送信すると、前の回答をこの内容で上書きします。" onClose={() => setDialog(null)}>
      <QuestionCard key={`edit-${dialog.question.id}`} question={dialog.question} submitLabel="回答を上書きする" onSubmit={(answer) => { onAnswer(answer); setDialog(null); toast(answer.question) }} />
    </QuestionDialog>}
    {dialog?.kind === 'pending' && pendingQuestions.length > 0 && <QuestionDialog title={`追加の質問（あと${pendingQuestions.length}問）`} description="判断に影響する項目だけを聞いています。分からなければ「まだ分からない」のままで構いません。" onClose={() => setDialog(null)}>
      <QuestionCard key={pendingQuestions[0].id} question={pendingQuestions[0]} submitLabel="回答を反映" onSubmit={onAnswer} />
    </QuestionDialog>}
    {dialog?.kind === 'context' && <QuestionDialog title={`${contextLabels[dialog.key]}について`} onClose={() => setDialog(null)}>
      <QuestionCard key={`context-${dialog.key}`} question={questionForContext(dialog.key).questions[0]} submitLabel="回答を反映" onSubmit={(answer) => { onAnswer(answer); setDialog(null); toast(answer.question) }} />
    </QuestionDialog>}
  </>

  if (!plan) {
    return <main className="tool-main narrow-tool">
      <ToolTitle title={group.title} summary="質問を準備しています" />
      <div className="observation-strip"><span>カレンダーで確認</span><strong>{group.occurrences}回</strong><strong>合計{formatMinutes(group.totalMinutes)}</strong><strong>平均{formatMinutes(group.averageMinutes)}</strong></div>
      <div className="request-state" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>質問を準備中</strong><p>この業務について、3つの質問に答えると整理ができます。最大1分ほどかかることがあります。</p></div></div>
    </main>
  }

  if (!confirming) {
    return <main className="tool-main narrow-tool session-qa">
      <header className="qa-header">
        <div className="qa-header-top">
          <h1>{group.title}</h1>
          <span className="qa-progress">質問 {Math.min(answeredInPlan + 1, plan.questions.length)} / {plan.questions.length}</span>
        </div>
        <p className="qa-meta">
          <span>4週間で{group.occurrences}回・合計{formatMinutes(group.totalMinutes)}</span>
          {counts && <span aria-live="polite"><b className="context-confirmed">✓ 確認 {counts.confirmed}</b> <b className="context-partial">△ 一部 {counts.partial}</b> <b className="context-unknown">? 未確認 {counts.unknown}</b></span>}
          {answers.length > 0 && <button type="button" className="text-button" onClick={() => setDialog({ kind: 'answers' })}>回答済み {answers.length}件</button>}
        </p>
        {planSource === 'generic' && <p className="plan-source-note">この業務専用の質問を用意できなかったため、一般的な質問から始めています。</p>}
      </header>
      {firstUnanswered && <QuestionCard key={firstUnanswered.id} question={firstUnanswered} submitLabel={answeredInPlan + 1 === plan.questions.length ? '回答を整理する' : '次へ'} onSubmit={onAnswer} />}
      {sessionDialogs}
    </main>
  }

  return <main className="tool-main">
    <ToolTitle title={`いまの整理：${group.title}`} summary="回答の要点です。足りないところや直したいところがあれば、この場で変更できます。" />
    <section className="observed-facts"><h2>カレンダーで分かったこと</h2><div><span>{group.occurrences}回 / 4週間</span><span>合計{formatMinutes(group.totalMinutes)}</span><span>1回平均{formatMinutes(group.averageMinutes)}</span></div></section>
    {task ? <>
      <div className="review-layout">
        <div>
          <dl className="model-summary">
            <SummaryItem title="業務の目的">{task.purpose}</SummaryItem>
            <SummaryItem title="人が判断すること">{task.decisionPoints.length ? <ul>{task.decisionPoints.map((item) => <li key={item}>{item}</li>)}</ul> : '未確認'}</SummaryItem>
            <SummaryItem title="確認できている役割">{task.businessRoleDetails.some((role) => role.present) ? <ul>{task.businessRoleDetails.filter((role) => role.present).map((role) => <li key={role.name}>{role.name}{role.scope !== 'ALL' && <small> — {role.scopeDetail ?? '条件付き'}</small>}</li>)}</ul> : '共有以外の役割は未確認'}</SummaryItem>
            <SummaryItem title="共有方法と同期の役割">{(() => { const labels = deliveryLabels(task); return <dl className="delivery-summary"><div><dt>共有</dt><dd>{labels.sharing}</dd></div><div><dt>相談・調整</dt><dd>{labels.synchronous}</dd></div><div><dt>現在の形式</dt><dd>{labels.currentFormat}</dd></div></dl> })()}<p>{task.outputRequirementReason}</p></SummaryItem>
          </dl>
          <button type="button" className="text-button inline-edit" onClick={() => setDialog({ kind: 'answers' })}><Pencil size={14} />回答済みの内容を見る・修正する（{answers.length}件）</button>
          <details className="decomposition-fold"><summary>業務の分解を見る<small>機能ごとの根拠と扱い</small></summary><WorkDecomposition task={task} /></details>
        </div>
        <ContextCompleteness task={task} onAdd={(key) => setDialog({ kind: 'context', key })} />
      </div>
      <div className="action-bar">
        <div className="action-bar-hint" aria-live="polite">
          {pendingQuestions.length > 0 && <button type="button" className="text-button" onClick={() => setDialog({ kind: 'pending' })}>あと{pendingQuestions.length}問答えられます</button>}
          {refining && !pendingQuestions.length && <span className="refining-note"><LoaderCircle size={16} className="animate-spin" />回答を裏で整理しています</span>}
          {contextUpdated && <span className="context-updated" role="status"><Check size={16} />「{contextUpdated}」を反映しました</span>}
          {status === 'error' && <span className="calendar-error" role="alert">{errorMessage}</span>}
        </div>
        <button type="button" className="primary-button" disabled={status === 'loading'} onClick={() => void run(onProceed)}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />仮説を準備中</> : <>この内容で仮説を見る<ArrowRight size={20} /></>}</button>
      </div>
    </> : refining ? (
      <div className="request-state" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>回答を整理しています</strong><p>回答の意味は変えずに、確認済み・一部確認・未確認に分けます。</p></div></div>
    ) : (
      <div className="request-state" role="alert"><div><strong>回答の整理に失敗しました</strong><p>通信状態を確認して、もう一度お試しください。回答は失われていません。</p><button type="button" className="primary-button" onClick={onRetryRefine}>再試行</button></div></div>
    )}
    {sessionDialogs}
  </main>
}

function countStates(task: BusinessTask) {
  const states = Object.values(task.contextStatus) as ContextState[]
  return {
    confirmed: states.filter((state) => state === 'CONFIRMED').length,
    partial: states.filter((state) => state === 'PARTIAL').length,
    unknown: states.filter((state) => state === 'UNKNOWN').length,
  }
}
