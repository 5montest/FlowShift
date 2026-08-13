import { useState, type FormEvent } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import type { InterviewAnswer, InterviewOption, InterviewQuestion, OptionMeaning } from '../types'

// 質問への回答UIはアプリ全体でこのカード1種類。
// 選択肢のmeaningを機械的に保持し、自由入力は常にエスケープハッチとして残す。
export default function QuestionCard({ question, submitLabel = '次へ', busy = false, onSubmit }: {
  question: InterviewQuestion
  submitLabel?: string
  busy?: boolean
  onSubmit: (answer: InterviewAnswer) => void
}) {
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [customMode, setCustomMode] = useState(false)

  function toggleOption(option: InterviewOption) {
    // 自由入力の下書きは消さない（選択肢を試した後に戻れるように）
    setCustomMode(false)
    if ((question.selection ?? 'SINGLE') === 'SINGLE') {
      setSelectedOptionIds([option.id])
      return
    }
    setSelectedOptionIds((current) => {
      if (current.includes(option.id)) return current.filter((id) => id !== option.id)
      if (option.exclusive || option.meaning.contextState === 'UNKNOWN') return [option.id]
      const exclusiveIds = new Set(question.options.filter((item) => item.exclusive || item.meaning.contextState === 'UNKNOWN').map((item) => item.id))
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

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const options = question.options.filter((option) => selectedOptionIds.includes(option.id))
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
    onSubmit(answer)
  }

  return <form className="interview-form question-card" onSubmit={submit}>
    <div className="question-block"><h2>{question.prompt}</h2><p>{question.hint}</p></div>
    {(question.selection ?? 'SINGLE') === 'MULTIPLE' && <p className="multi-select-note">複数選択できます</p>}
    <fieldset className="answer-options"><legend className="sr-only">回答候補</legend>{question.options.map((option) => { const selected = selectedOptionIds.includes(option.id) && !customMode; return <label key={option.id} className={selected ? 'is-selected' : ''}><input type={(question.selection ?? 'SINGLE') === 'MULTIPLE' ? 'checkbox' : 'radio'} name={question.id} checked={selected} onChange={() => toggleOption(option)} /><span>{option.label}</span>{selected && <Check size={18} aria-hidden="true" />}</label> })}</fieldset>
    <button type="button" className="text-button custom-answer-toggle" onClick={() => { setCustomMode(true); setSelectedOptionIds([]) }}>選択肢にない内容を入力</button>
    {customMode && <textarea className="answer-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} maxLength={2000} autoFocus placeholder="分かる範囲で入力してください" />}
    <button type="submit" className="primary-button full-width" disabled={busy || (customMode ? !draft.trim() : !selectedOptionIds.length)}>{submitLabel}<ArrowRight size={20} /></button>
  </form>
}
