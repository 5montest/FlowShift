import { useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import ContextCompleteness from '../components/ContextCompleteness'
import QuestionCard from '../components/QuestionCard'
import SummaryItem from '../components/SummaryItem'
import ToolTitle from '../components/ToolTitle'
import WorkDecomposition from '../components/WorkDecomposition'
import { questionForContext } from '../../shared/context-questions'
import { formatMinutes } from '../lib/format'
import { deliveryLabels } from '../lib/labels'
import { useAsyncAction } from '../lib/useAsync'
import type { BusinessTask, ContextState, InterviewAnswer, InterviewPlan, InterviewQuestion, WorkGroup } from '../types'

// 「聞く」と「確認する」を1画面で行う。コア3問→同じ画面が確認モードへ切り替わり、
// 追加質問はインラインのカードで答える。前の画面へ戻る往復は無い。
export default function SessionScreen({ group, plan, answers, task, pendingQuestions, refining, onAnswer, onProceed }: {
  group: WorkGroup
  plan: InterviewPlan | null
  answers: InterviewAnswer[]
  task: BusinessTask | null
  pendingQuestions: InterviewQuestion[]
  refining: boolean
  onAnswer: (answer: InterviewAnswer) => void
  onProceed: () => Promise<void>
}) {
  const [activeContextKey, setActiveContextKey] = useState<keyof BusinessTask['contextStatus'] | null>(null)
  const { status, errorMessage, run } = useAsyncAction('仮説を作成できませんでした。')
  const answeredIds = new Set(answers.map((answer) => answer.questionId))
  const currentQuestion = plan?.questions.find((question) => !answeredIds.has(question.id))
  const answeredInPlan = plan?.questions.filter((item) => answeredIds.has(item.id)).length ?? 0
  const confirming = Boolean(plan) && !currentQuestion
  const counts = task ? countStates(task) : null

  function submitContextAnswer(answer: InterviewAnswer) {
    onAnswer(answer)
    setActiveContextKey(null)
  }

  if (!plan) {
    return <main className="tool-main narrow-tool">
      <ToolTitle title={group.title} summary="質問を準備しています" />
      <div className="observation-strip"><span>カレンダーで確認</span><strong>{group.occurrences}回</strong><strong>合計{formatMinutes(group.totalMinutes)}</strong><strong>平均{formatMinutes(group.averageMinutes)}</strong></div>
      <div className="request-state" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>質問を準備中</strong><p>この業務について、3つの質問に答えると整理ができます。</p></div></div>
    </main>
  }

  if (!confirming) {
    return <main className="tool-main narrow-tool">
      <ToolTitle title={group.title} summary={`質問 ${Math.min(answeredInPlan + 1, plan.questions.length)} / ${plan.questions.length}`} />
      <div className="observation-strip"><span>カレンダーで確認</span><strong>{group.occurrences}回</strong><strong>合計{formatMinutes(group.totalMinutes)}</strong><strong>平均{formatMinutes(group.averageMinutes)}</strong></div>
      {counts && <p className="understanding-strip" aria-live="polite"><span>いまの整理</span><b className="context-confirmed">✓ {counts.confirmed}</b><b className="context-partial">△ {counts.partial}</b><b className="context-unknown">? {counts.unknown}</b><small>答えるほど整理が進みます</small></p>}
      {answers.length > 0 && <details className="previous-answers"><summary>回答済みの内容（{answers.length}件）</summary><ol>{answers.map((answer) => <li key={`${answer.questionId}-${answer.answer}`}><strong>{answer.question}</strong><p>{answer.answer}</p></li>)}</ol></details>}
      {currentQuestion && <QuestionCard key={currentQuestion.id} question={currentQuestion} submitLabel={answeredInPlan + 1 === plan.questions.length ? '整理を確認' : '次へ'} onSubmit={onAnswer} />}
    </main>
  }

  return <main className="tool-main">
    <ToolTitle title="いまの整理" summary="回答の要点です。足りないところがあれば、この場で追加できます。" />
    <section className="observed-facts"><h2>カレンダーで分かったこと</h2><div><span>{group.occurrences}回 / 4週間</span><span>合計{formatMinutes(group.totalMinutes)}</span><span>1回平均{formatMinutes(group.averageMinutes)}</span></div></section>
    {task ? <>
      <WorkDecomposition task={task} />
      <div className="review-layout">
        <div>
          <dl className="model-summary">
            <SummaryItem title="業務の目的">{task.purpose}</SummaryItem>
            <SummaryItem title="人が判断すること">{task.decisionPoints.length ? <ul>{task.decisionPoints.map((item) => <li key={item}>{item}</li>)}</ul> : '未確認'}</SummaryItem>
            <SummaryItem title="確認できている役割">{task.businessRoleDetails.some((role) => role.present) ? <ul>{task.businessRoleDetails.filter((role) => role.present).map((role) => <li key={role.name}>{role.name}{role.scope !== 'ALL' && <small> — {role.scopeDetail ?? '条件付き'}</small>}</li>)}</ul> : '共有以外の役割は未確認'}</SummaryItem>
            <SummaryItem title="共有方法と同期の役割">{(() => { const labels = deliveryLabels(task); return <dl className="delivery-summary"><div><dt>共有</dt><dd>{labels.sharing}</dd></div><div><dt>相談・調整</dt><dd>{labels.synchronous}</dd></div><div><dt>現在の形式</dt><dd>{labels.currentFormat}</dd></div></dl> })()}<p>{task.outputRequirementReason}</p></SummaryItem>
          </dl>
          {pendingQuestions.length > 0 && <section className="pending-questions" aria-label="追加の質問">
            <h2>あと{pendingQuestions.length}問だけ確認させてください</h2>
            <p>判断に影響する項目だけを聞いています。分からなければ「まだ分からない」のままで構いません。</p>
            <QuestionCard key={pendingQuestions[0].id} question={pendingQuestions[0]} submitLabel="回答を反映" onSubmit={onAnswer} />
          </section>}
          {refining && !pendingQuestions.length && <p className="refining-note" aria-live="polite"><LoaderCircle size={16} className="animate-spin" />回答を裏で整理しています。このまま進めても構いません。</p>}
        </div>
        <ContextCompleteness task={task} onAdd={(key) => setActiveContextKey((current) => current === key ? null : key)} />
      </div>
      {activeContextKey && <section className="pending-questions" aria-label="情報の追加">
        <QuestionCard key={`context-${activeContextKey}`} question={questionForContext(activeContextKey).questions[0]} submitLabel="回答を反映" onSubmit={submitContextAnswer} />
      </section>}
      {status === 'error' && <p className="calendar-error" role="alert">{errorMessage}</p>}
      <div className="bottom-action"><button type="button" className="primary-button" disabled={status === 'loading'} onClick={() => void run(onProceed)}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />仮説を準備中</> : <>この内容で仮説を見る<ArrowRight size={20} /></>}</button></div>
    </> : <div className="request-state" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>回答を整理しています</strong><p>回答の意味は変えずに、確認済み・一部確認・未確認に分けます。</p></div></div>}
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
