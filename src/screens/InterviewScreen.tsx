import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Check, LoaderCircle } from 'lucide-react'
import ToolTitle from '../components/ToolTitle'
import { formatMinutes } from '../lib/format'
import type { RequestStatus } from '../lib/useAsync'
import type { InterviewAnswer, InterviewOption, InterviewPlan, OptionMeaning, WorkGroup } from '../types'

export default function InterviewScreen({ group, plan, answers, setAnswers, onComplete }: {
  group: WorkGroup
  plan: InterviewPlan
  answers: InterviewAnswer[]
  setAnswers: (answers: InterviewAnswer[]) => void
  onComplete: (answers: InterviewAnswer[]) => Promise<void>
}) {
  const answeredIds = new Set(answers.map((answer) => answer.questionId))
  const questionIndex = plan.questions.findIndex((question) => !answeredIds.has(question.id))
  const question = questionIndex >= 0 ? plan.questions[questionIndex] : undefined
  const answeredInPlan = plan.questions.filter((item) => answeredIds.has(item.id)).length
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => { setSelectedOptionIds([]); setDraft(''); setCustomMode(false); setStatus('idle'); setErrorMessage('') }, [question?.id])

  function selectedAnswerOptions(): InterviewOption[] {
    return question?.options.filter((option) => selectedOptionIds.includes(option.id)) ?? []
  }

  function toggleOption(option: InterviewOption) {
    setCustomMode(false); setDraft('')
    if ((question?.selection ?? 'SINGLE') === 'SINGLE') {
      setSelectedOptionIds([option.id])
      return
    }
    setSelectedOptionIds((current) => {
      if (current.includes(option.id)) return current.filter((id) => id !== option.id)
      if (option.exclusive || option.meaning.contextState === 'UNKNOWN') return [option.id]
      const exclusiveIds = new Set(question?.options.filter((item) => item.exclusive || item.meaning.contextState === 'UNKNOWN').map((item) => item.id) ?? [])
      return [...current.filter((id) => !exclusiveIds.has(id)), option.id]
    })
  }

  function mergeMeanings(options: InterviewOption[]): OptionMeaning {
    const roleMap = new Map<string, NonNullable<OptionMeaning['roles']>[number]>()
    for (const option of options) for (const role of option.meaning.roles ?? []) roleMap.set(role.name, role)
    return {
      ...(options.map((option) => option.meaning.outputNeed).filter(Boolean).at(-1) ? { outputNeed: options.map((option) => option.meaning.outputNeed).filter(Boolean).at(-1) } : {}),
      roles: [...roleMap.values()],
      stakeholders: [...new Set(options.flatMap((option) => option.meaning.stakeholders ?? []))],
      processItems: [...new Set(options.flatMap((option) => option.meaning.processItems ?? []))],
      contextState: options.some((option) => option.meaning.contextState === 'UNKNOWN') ? 'UNKNOWN' : options.some((option) => option.meaning.contextState === 'PARTIAL') ? 'PARTIAL' : 'CONFIRMED',
    }
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault()
    if (!question || status === 'loading') return
    const options = selectedAnswerOptions()
    const value = customMode ? draft.trim() : options.map((option) => option.label).join('、')
    if (!value) return
    const answer: InterviewAnswer = customMode
      ? { questionId: question.id, dimension: question.dimension, question: question.prompt, answer: value, source: 'FREE_TEXT' }
      : {
        questionId: question.id,
        dimension: question.dimension,
        question: question.prompt,
        answer: value,
        source: 'OPTION',
        ...((question.selection ?? 'SINGLE') === 'MULTIPLE' ? { optionIds: options.map((option) => option.id) } : { optionId: options[0].id }),
        meaning: mergeMeanings(options),
      }
    const nextAnswers = [...answers.filter((item) => item.questionId !== question.id), answer]
    setAnswers(nextAnswers)
    if (answeredInPlan + 1 === plan.questions.length) {
      setStatus('loading'); setErrorMessage('')
      try { await onComplete(nextAnswers) } catch (error) {
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : '回答内容を整理できませんでした。')
      }
    }
  }

  async function retry() {
    setStatus('loading'); setErrorMessage('')
    try { await onComplete(answers) } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '回答内容を整理できませんでした。')
    }
  }

  return (
    <main className="tool-main narrow-tool">
      <ToolTitle title={group.title} summary={plan.phase === 'CORE' ? `質問 ${Math.min(answeredInPlan + 1, plan.questions.length)} / ${plan.questions.length}` : `追加の質問 ${Math.min(answeredInPlan + 1, plan.questions.length)} / ${plan.questions.length}`} />
      <div className="observation-strip"><span>Calendarで確認</span><strong>{group.occurrences}回</strong><strong>合計{formatMinutes(group.totalMinutes)}</strong><strong>平均{formatMinutes(group.averageMinutes)}</strong></div>
      {answers.length > 0 && <details className="previous-answers"><summary>回答済みの内容（{answers.length}件）</summary><ol>{answers.map((answer) => <li key={`${answer.questionId}-${answer.answer}`}><strong>{answer.question}</strong><p>{answer.answer}</p></li>)}</ol></details>}
      {status === 'loading' ? <div className="request-state" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>{plan.phase === 'CORE' ? '回答を整理しています' : '追加した内容を反映しています'}</strong><p>回答の意味は変えずに、確認済み・一部確認・未確認に分けます。</p></div></div>
        : status === 'error' ? <div className="request-error" role="alert"><strong>回答内容を整理できませんでした</strong><p>{errorMessage}</p><button type="button" className="primary-button" onClick={() => void retry()}>再試行</button></div>
          : question ? <form className="interview-form" onSubmit={(event) => void submitAnswer(event)}>
            <div className="question-block"><h2 id="question-heading">{question.prompt}</h2><p id="question-hint">{question.hint}</p></div>
            {(question.selection ?? 'SINGLE') === 'MULTIPLE' && <p className="multi-select-note">複数選択できます</p>}
            <fieldset className="answer-options" aria-labelledby="question-heading" aria-describedby="question-hint"><legend className="sr-only">回答候補</legend>{question.options.map((option) => { const selected = selectedOptionIds.includes(option.id) && !customMode; return <label key={option.id} className={selected ? 'is-selected' : ''}><input type={(question.selection ?? 'SINGLE') === 'MULTIPLE' ? 'checkbox' : 'radio'} name={question.id} checked={selected} onChange={() => toggleOption(option)} /><span>{option.label}</span>{selected && <Check size={18} aria-hidden="true" />}</label> })}</fieldset>
            <button type="button" className="text-button custom-answer-toggle" onClick={() => { setCustomMode(true); setSelectedOptionIds([]) }}>選択肢にない内容を入力</button>
            {customMode && <textarea className="answer-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} maxLength={2000} autoFocus placeholder="分かる範囲で入力してください" />}
            <button type="submit" className="primary-button full-width" disabled={customMode ? !draft.trim() : !selectedOptionIds.length}>{answeredInPlan + 1 === plan.questions.length ? '整理を確認' : '次へ'}<ArrowRight size={20} /></button>
          </form> : null}
    </main>
  )
}
