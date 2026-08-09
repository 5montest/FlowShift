import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, LoaderCircle, RefreshCcw } from 'lucide-react'
import { demoDesign, demoEvents, initialBusinessTask, interviewQuestions } from './demo-data'
import { disconnectGoogleCalendar, extractBusinessTask, generateBusinessDesign, generateInterviewOptions, getGoogleCalendarEvents, getGoogleCalendarStatus } from './api'
import type { BusinessDesign, BusinessTask, CalendarEvent, CalendarStatus, DemoEvent, InterviewOptions, OutputRequirement, Rating as RatingValue, Screen, WorkflowStep } from './types'
import WorkflowDiagram from './WorkflowDiagram'

const toolSteps: { screens: Screen[]; label: string }[] = [
  { screens: ['discovery'], label: '業務を選ぶ' },
  { screens: ['interview', 'review'], label: '内容確認' },
  { screens: ['analysis'], label: '分析' },
  { screens: ['redesign'], label: '提案' },
]

const backScreen: Partial<Record<Screen, Screen>> = {
  discovery: 'home',
  interview: 'discovery',
  review: 'interview',
  analysis: 'review',
  redesign: 'analysis',
}

type RequestStatus = 'idle' | 'loading' | 'error'
type WorkFilter = 'all' | 'repeat' | 'long'
type CalendarState = CalendarStatus & { loading: boolean }

function Logo() {
  return <span className="wordmark">FlowShift</span>
}

function eventCategory(title: string): string {
  if (/(会議|定例|ミーティング|1on1|面談)/i.test(title)) return '会議'
  if (/(レポート|報告|資料|提案書)/i.test(title)) return '資料作成'
  if (/(入力|登録|更新|転記|集計)/i.test(title)) return 'データ処理'
  if (/(顧客|問い合わせ|商談)/i.test(title)) return '顧客対応'
  return '業務'
}

function calendarEventsToWorkItems(events: CalendarEvent[]): DemoEvent[] {
  return events.map((event, index) => {
    const start = new Date(event.start)
    const category = eventCategory(event.title)
    const taskLike = category !== '会議' && category !== '業務'
    const candidate = event.recurring || taskLike
    const reason = [
      event.recurring ? '繰り返し予定' : '',
      event.durationMinutes >= 30 ? `${event.durationMinutes}分` : '',
      taskLike ? `${category}を含む業務` : '',
    ].filter(Boolean).join('・')
    return {
      id: event.id,
      day: new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(start).replace('曜日', ''),
      date: `${start.getMonth() + 1}/${start.getDate()}`,
      time: event.allDay ? '終日' : new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }).format(start),
      duration: event.durationMinutes,
      title: event.title,
      category,
      recurring: event.recurring,
      allDay: event.allDay,
      start: event.start,
      end: event.end,
      source: 'google' as const,
      ...(candidate ? { candidate: { rank: index + 1, level: event.recurring && event.durationMinutes >= 30 ? 'HIGH' as const : 'MEDIUM' as const, reason } } : {}),
    }
  })
}

function eventReasons(event: DemoEvent): string[] {
  const reasons = [
    event.recurring ? '繰り返し予定として登録されています' : '',
    event.duration >= 30 ? `1回${event.duration}分かかります` : '',
    event.category !== '会議' && event.category !== '業務' ? `${event.category}を含む業務です` : '',
  ].filter(Boolean)
  return reasons.length ? reasons : ['選択した予定の目的と工程を確認できます']
}

function eventPeriod(events: DemoEvent[]): string {
  const dates = events.flatMap((event) => event.start ? [new Date(event.start)] : [])
  if (!dates.length) return '8月3日〜7日'
  const sorted = dates.sort((left, right) => left.getTime() - right.getTime())
  const format = (date: Date) => `${date.getMonth() + 1}月${date.getDate()}日`
  return `${format(sorted[0])}〜${format(sorted.at(-1) ?? sorted[0])}`
}

function AppHeader({ screen, onBack, onReset }: { screen: Screen; onBack: () => void; onReset: () => void }) {
  const activeIndex = toolSteps.findIndex((step) => step.screens.includes(screen))

  return (
    <header className="app-header">
      <div className="header-inner">
        {screen === 'home' ? (
          <button type="button" onClick={onReset} className="brand-button" aria-label="最初の画面へ戻る"><Logo /></button>
        ) : (
          <>
            <button type="button" className="header-back" onClick={onBack} aria-label="前の画面へ戻る"><ArrowLeft size={22} /></button>
            <strong className="header-location">{toolSteps[activeIndex]?.label}</strong>
            <span className="step-count">ステップ {activeIndex + 1} / {toolSteps.length}</span>
          </>
        )}
      </div>
    </header>
  )
}

function ToolTitle({ title, summary }: { title: string; summary?: string }) {
  return (
    <div className="tool-titlebar">
      <h1>{title}</h1>
      {summary && <p>{summary}</p>}
    </div>
  )
}

function HomeScreen({ calendar, busy, error, onConnect, onCalendarStart, onDisconnect, onDemoStart }: {
  calendar: CalendarState
  busy: boolean
  error: string
  onConnect: () => void
  onCalendarStart: () => Promise<void>
  onDisconnect: () => Promise<void>
  onDemoStart: () => void
}) {
  return (
    <main className="home-grid">
      <section className="home-intro">
        <div>
          <h1 className="hero-title">
            仕事をAIに置き換えるのではなく、<br />
            <span>AI前提で仕事を作り直す。</span>
          </h1>
          <p className="hero-description">
            毎週45分のレポート作成を、「重要な変化があるときだけ判断する業務」へ。目的と現在の手段を分け、成果物そのものが必要かどうかから見直します。
          </p>
          <div className="home-actions">
            {calendar.connected ? (
              <>
                <button type="button" onClick={() => void onCalendarStart()} className="primary-button" disabled={busy}>
                  {busy ? <><LoaderCircle className="animate-spin" />予定を取得中</> : <>予定から業務を探す<ArrowRight size={20} /></>}
                </button>
                <button type="button" onClick={() => void onDisconnect()} className="secondary-button" disabled={busy}>接続を解除</button>
              </>
            ) : (
              <button type="button" onClick={onConnect} className="primary-button" disabled={calendar.loading || !calendar.configured}>
                {calendar.loading ? '接続状態を確認中' : 'Google Calendarを接続'}<ArrowRight size={20} />
              </button>
            )}
            <button type="button" onClick={onDemoStart} className="secondary-button">売上レポートの例を見る</button>
          </div>
          <p className="calendar-note">
            {calendar.connected
              ? `${calendar.email ?? 'Googleアカウント'}と接続済み`
              : calendar.configured ? '予定の読み取り権限だけを使用します。' : 'Google OAuthのローカル設定が必要です。'}
          </p>
          {error && <p className="calendar-error" role="alert">{error}</p>}
          <ul className="service-notes" aria-label="データの取り扱い">
            <li>予定はタイトル・開始終了時刻・繰り返し情報だけを取得します</li>
            <li>選択した予定と回答のみ、分析のため外部AIサービスへ送信します</li>
            <li>結果は保存しません</li>
          </ul>
        </div>
      </section>

      <section className="hero-example" aria-label="売上レポート改善例">
        <header className="example-header">
          <h2>売上レポート作成</h2>
          <p>毎週月曜日・営業部長向け</p>
        </header>
        <div className="example-comparison">
          <div><span>現在</span><strong>45分</strong><small>毎週6工程</small></div>
          <ArrowRight aria-hidden="true" />
          <div className="is-after"><span>見直し後</span><strong>通常0分</strong><small>変化時のみ確認</small></div>
        </div>
        <div className="example-detail">
          <h3>残す仕事</h3>
          <ol>
            <li><span>1</span>売上データを継続監視</li>
            <li><span>2</span>重要な変化と理由だけ通知</li>
            <li><span>3</span>担当者が原因と対応を判断</li>
          </ol>
        </div>
        <p className="example-note">定期レポートは原則作らず、必要になった時点の通知と説明を成果物にします。</p>
      </section>
    </main>
  )
}

function DiscoveryScreen({ events, selectedEvent, onSelectEvent, onSelect }: {
  events: DemoEvent[]
  selectedEvent: DemoEvent
  onSelectEvent: (event: DemoEvent) => void
  onSelect: () => Promise<void>
}) {
  const [filter, setFilter] = useState<WorkFilter>('all')
  const [showMobileDetail, setShowMobileDetail] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const candidates = events.filter((event) => event.candidate)
  const visibleEvents = events.filter((event) => {
    if (filter === 'repeat') return Boolean(event.recurring)
    if (filter === 'long') return event.duration >= 30
    return true
  })

  async function selectWork() {
    if (preparing) return
    setPreparing(true)
    await onSelect()
  }

  return (
    <main className="tool-main">
      <ToolTitle title="業務を選ぶ" summary={`${candidates.length}件の確認候補`} />

      <div className="work-toolbar" aria-label="表示条件">
        <strong>{eventPeriod(events)}</strong>
        <div className="filter-buttons">
          {([
            ['all', 'すべて'],
            ['repeat', '繰り返し'],
            ['long', '30分以上'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className={`work-browser ${showMobileDetail ? 'show-detail' : ''}`}>
        <section className="work-list" aria-labelledby="work-list-heading">
          <h2 id="work-list-heading">予定・業務一覧</h2>
          {visibleEvents.map((event) => (
            <WorkRow key={event.id} event={event} selected={event.id === selectedEvent.id} onOpen={() => { onSelectEvent(event); setShowMobileDetail(true) }} />
          ))}
          {!visibleEvents.length && <p className="empty-work-list">この条件に合う予定はありません。</p>}
        </section>

        <aside className="selection-pane" aria-labelledby="selected-work-heading">
          <button type="button" className="mobile-list-back" onClick={() => setShowMobileDetail(false)}><ArrowLeft size={18} />一覧へ戻る</button>
          <h2 id="selected-work-heading">{selectedEvent.title}</h2>
          <p className="work-meta">{selectedEvent.recurring ? '繰り返し' : '単発'}・{selectedEvent.allDay ? '終日' : `${selectedEvent.duration}分`}・{selectedEvent.category}</p>
          <div className="selection-reasons">
            <h3>確認候補になった理由</h3>
            <ul>{eventReasons(selectedEvent).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </div>
          <details className="help-details">
            <summary>候補の選び方</summary>
            <p>頻度、所要時間、定型作業の有無から、確認する価値が高い業務を表示しています。</p>
          </details>
          {(selectedEvent.allDay || selectedEvent.duration > 1440) && <p className="calendar-error">開始・終了時刻が1日以内の予定を選んでください。</p>}
          <button type="button" className="primary-button full-width" onClick={() => void selectWork()} disabled={preparing || selectedEvent.allDay || selectedEvent.duration > 1440}>
            {preparing ? <><LoaderCircle className="animate-spin" />回答候補を準備中</> : <>この業務を確認する<ArrowRight size={20} /></>}
          </button>
        </aside>
      </div>
    </main>
  )
}

function WorkRow({ event, selected, onOpen }: { event: DemoEvent; selected: boolean; onOpen: () => void }) {
  const content = (
    <>
      <div className="work-time"><strong>{event.day} {event.time}</strong><span>{event.date}</span></div>
      <div className="work-name"><h3>{event.title}</h3><p>{event.recurring ? '繰り返し' : '単発'}・{event.allDay ? '終日' : `${event.duration}分`}・{event.category}</p></div>
      {event.candidate && <span className="candidate-text">確認候補</span>}
    </>
  )
  return <button type="button" className={`work-row${selected ? ' is-selected' : ''}`} onClick={onOpen}>{content}</button>
}

type InterviewProps = {
  eventTitle: string
  answers: string[]
  setAnswers: (answers: string[]) => void
  options: InterviewOptions | null
  onExtract: (answers: string[]) => Promise<void>
  onDemoFallback: () => void
}

function InterviewScreen({ eventTitle, answers, setAnswers, options, onExtract, onDemoFallback }: InterviewProps) {
  const [draft, setDraft] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const complete = answers.length === interviewQuestions.length
  const questionIndex = Math.min(answers.length, interviewQuestions.length - 1)
  const currentQuestion = interviewQuestions[questionIndex]
  const currentOptions = options?.[currentQuestion.id] ?? currentQuestion.options

  async function requestExtract(nextAnswers: string[]) {
    setStatus('loading')
    setErrorMessage('')
    try {
      await onExtract(nextAnswers)
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '回答内容を整理できませんでした。')
    }
  }

  async function submitAnswer(event: React.FormEvent) {
    event.preventDefault()
    const value = draft.trim()
    if (!value || complete) return
    const nextAnswers = [...answers, value]
    setAnswers(nextAnswers)
    setDraft('')
    setCustomMode(false)
    if (nextAnswers.length === interviewQuestions.length) await requestExtract(nextAnswers)
  }

  function reviseLastAnswer() {
    const previousAnswers = answers.slice(0, -1)
    setDraft(answers.at(-1) ?? '')
    setCustomMode(true)
    setAnswers(previousAnswers)
    setStatus('idle')
    setErrorMessage('')
  }

  return (
    <main className="tool-main narrow-tool">
      <ToolTitle title={eventTitle} summary={`質問 ${Math.min(answers.length + 1, interviewQuestions.length)} / ${interviewQuestions.length}`} />

      {answers.length > 0 && (
        <details className="previous-answers">
          <summary>回答済みの内容（{answers.length}件）</summary>
          <ol>{answers.map((answer, index) => <li key={interviewQuestions[index].id}><strong>{interviewQuestions[index].prompt}</strong><p>{answer}</p></li>)}</ol>
        </details>
      )}

      {status === 'loading' ? (
        <div className="request-state" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>回答内容を整理しています</strong><p>完了すると確認画面へ進みます。</p></div></div>
      ) : status === 'error' ? (
        <div className="request-error" role="alert">
          <strong>回答内容を整理できませんでした</strong>
          <p>{errorMessage}</p>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => void requestExtract(answers)}>再試行</button>
            <button type="button" className="secondary-button" onClick={onDemoFallback}>固定デモで続ける</button>
            <button type="button" className="text-button" onClick={reviseLastAnswer}>最後の回答を修正</button>
          </div>
        </div>
      ) : complete ? (
        <div className="question-form">
          <h2>{interviewQuestions.length}件の回答が完了しています</h2>
          <p>回答から整理した内容をもう一度確認できます。</p>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => void requestExtract(answers)}>内容を確認する<ArrowRight size={20} /></button>
            <button type="button" className="secondary-button" onClick={reviseLastAnswer}>最後の回答を修正</button>
          </div>
        </div>
      ) : (
        <form className="question-form" onSubmit={submitAnswer}>
          <h2><span>質問 {answers.length + 1}</span>{currentQuestion.prompt}</h2>
          <p>{currentQuestion.hint}</p>
          <p className="option-caption">近いものを1つ選んでください</p>
          <fieldset className="answer-options">
            <legend className="sr-only">{currentQuestion.prompt}への回答候補</legend>
            {currentOptions.map((option) => (
              <label key={option} className="answer-option">
                <input type="radio" name={`answer-${currentQuestion.id}`} checked={!customMode && draft === option} onChange={() => { setDraft(option); setCustomMode(false) }} />
                <span>{option}</span>
              </label>
            ))}
            <label className="answer-option">
              <input type="radio" name={`answer-${currentQuestion.id}`} checked={customMode} onChange={() => { setDraft(currentOptions.includes(draft) ? '' : draft); setCustomMode(true) }} />
              <span>その他（自由入力）</span>
            </label>
          </fieldset>
          {customMode && <textarea className="custom-answer" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} placeholder="当てはまる内容を入力してください" aria-label="その他の回答" autoFocus />}
          <div className="form-actions only-primary">
            <button type="submit" className="primary-button" disabled={!draft.trim()}>
              {answers.length === interviewQuestions.length - 1 ? '内容を整理する' : '次へ'}<ArrowRight size={20} />
            </button>
          </div>
        </form>
      )}
    </main>
  )
}

function ReviewScreen({ task, setTask, onAnalyze, onDemoFallback }: {
  task: BusinessTask
  setTask: (task: BusinessTask) => void
  onAnalyze: (task: BusinessTask) => Promise<void>
  onDemoFallback: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const purposeIncludesMeans = /(レポート|報告書|資料|メール|Excel|PowerPoint)/i.test(task.purpose)
  const valid = Boolean(task.purpose.trim() && !purposeIncludesMeans && task.frequency.trim() && task.duration.trim() && task.tools.length && task.steps.length && task.decisionPoints.length && task.outputRequirementReason.trim())

  function updateText(field: 'purpose' | 'frequency' | 'duration' | 'output' | 'outputRequirementReason', value: string) {
    setTask({ ...task, [field]: value })
  }

  function updateList(field: 'steps' | 'decisionPoints', value: string) {
    setTask({ ...task, [field]: value.split(/\n+/).map((item) => item.trim()).filter(Boolean) })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    setStatus('loading')
    setErrorMessage('')
    try {
      await onAnalyze(task)
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '分析結果を生成できませんでした。')
    }
  }

  return (
    <main className="tool-main form-tool">
      <ToolTitle title="内容を確認" summary="回答から以下を整理しました。必要な項目は直接修正できます。" />
      <form className="review-form" onSubmit={submit}>
        {editing ? (
          <div className="review-edit-fields">
            <EditableField label="目的" help="成果物名やツール名を含めず、達成したい結果を記載" value={task.purpose} onChange={(value) => updateText('purpose', value)} multiline />
            {purposeIncludesMeans && <p className="form-validation" role="alert">目的からレポート・資料・ツール名を外し、誰が何を把握・判断するかに書き換えてください。</p>}
            <div className="form-grid">
              <FrequencyField value={task.frequency} onChange={(value) => updateText('frequency', value)} />
              <DurationField value={task.duration} onChange={(value) => updateText('duration', value)} />
            </div>
            <ToolPicker value={task.tools} onChange={(value) => setTask({ ...task, tools: value })} />
            <EditableField label="工程" help="1行に1工程" value={task.steps.join('\n')} onChange={(value) => updateList('steps', value)} multiline />
            <EditableField label="判断が必要な箇所" help="1行に1項目" value={task.decisionPoints.join('\n')} onChange={(value) => updateList('decisionPoints', value)} multiline />
            <EditableField label="成果物" value={task.output} onChange={(value) => updateText('output', value)} />
            <OutputRequirementField value={task.outputRequirement} onChange={(value) => setTask({ ...task, outputRequirement: value })} />
            <EditableField label="判断理由" value={task.outputRequirementReason} onChange={(value) => updateText('outputRequirementReason', value)} multiline />
          </div>
        ) : <ReviewSummary task={task} />}
        {status === 'error' && (
          <div className="request-error" role="alert"><strong>分析結果を生成できませんでした</strong><p>{errorMessage}</p><button type="button" className="secondary-button" onClick={onDemoFallback}>固定デモの分析で続ける</button></div>
        )}
        <div className="review-actions">
          <p>この操作で、確認した内容だけを分析に送信します。</p>
          <div className="review-buttons">
            <button type="button" className="secondary-button" onClick={() => setEditing(!editing)}>{editing ? '修正を完了' : '内容を修正する'}</button>
            <button type="submit" className="primary-button" disabled={!valid || status === 'loading'}>
              {status === 'loading' ? <><LoaderCircle className="animate-spin" />分析しています</> : <>この内容で分析<ArrowRight size={20} /></>}
            </button>
          </div>
        </div>
      </form>
    </main>
  )
}

function ReviewSummary({ task }: { task: BusinessTask }) {
  return (
    <dl className="review-summary">
      <div><dt>目的</dt><dd>{task.purpose}</dd></div>
      <div className="summary-pair"><dt>頻度</dt><dd>{task.frequency}</dd><dt>所要時間</dt><dd>{task.duration}</dd></div>
      <div><dt>使用ツール</dt><dd>{task.tools.join('、')}</dd></div>
      <div><dt>工程</dt><dd><ol>{task.steps.map((step) => <li key={step}>{step}</li>)}</ol></dd></div>
      <div><dt>判断が必要な箇所</dt><dd><ul>{task.decisionPoints.map((point) => <li key={point}>{point}</li>)}</ul></dd></div>
      <div><dt>成果物</dt><dd>{task.output}</dd></div>
      <div><dt>成果物の必要性</dt><dd><strong>{outputRequirementLabel[task.outputRequirement]}</strong><p>{task.outputRequirementReason}</p></dd></div>
    </dl>
  )
}

const outputRequirementLabel: Record<OutputRequirement, string> = {
  NOT_REQUIRED: '定期成果物は不要',
  ON_DEMAND: '必要なときだけ',
  REQUIRED: '定期的に必要',
  UNKNOWN: '未確認',
}

function OutputRequirementField({ value, onChange }: { value: OutputRequirement; onChange: (value: OutputRequirement) => void }) {
  return (
    <label className="editable-field select-field" htmlFor="field-output-requirement">
      <span>成果物の必要性<small>定期レポートを残す必要があるか</small></span>
      <select id="field-output-requirement" value={value} onChange={(event) => onChange(event.target.value as OutputRequirement)}>
        {(Object.entries(outputRequirementLabel) as [OutputRequirement, string][]).map(([option, label]) => <option key={option} value={option}>{label}</option>)}
      </select>
    </label>
  )
}

function FrequencyField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = Array.from(new Set([value, '毎日', '週1回', '隔週', '月1回', '不定期']))
  return (
    <label className="editable-field select-field" htmlFor="field-frequency">
      <span>頻度</span>
      <select id="field-frequency" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>
    </label>
  )
}

function DurationField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const minutes = Number(value.match(/\d+/)?.[0] ?? '')
  return (
    <fieldset className="editable-field duration-field">
      <legend>所要時間</legend>
      <div>
        <div className="preset-buttons" aria-label="所要時間の候補">
          {[15, 30, 45, 60, 90].map((option) => <button key={option} type="button" aria-pressed={minutes === option} onClick={() => onChange(`${option}分`)}>{option}分</button>)}
        </div>
        <label className="number-input"><span>その他</span><input type="number" min="1" max="1440" step="5" inputMode="numeric" value={Number.isFinite(minutes) ? minutes : ''} onChange={(event) => onChange(event.target.value ? `${event.target.value}分` : '')} /><span>分</span></label>
      </div>
    </fieldset>
  )
}

function ToolPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [customTool, setCustomTool] = useState('')
  const options = Array.from(new Set([...value, 'Salesforce', 'Excel', 'Google スプレッドシート', 'PowerPoint', 'Teams', 'Slack']))

  function toggle(tool: string) {
    onChange(value.includes(tool) ? value.filter((item) => item !== tool) : [...value, tool])
  }

  function addCustomTool() {
    const tool = customTool.trim()
    if (!tool || value.includes(tool)) return
    onChange([...value, tool])
    setCustomTool('')
  }

  return (
    <fieldset className="editable-field tool-picker">
      <legend>使用ツール</legend>
      <div>
        <div className="tool-options">{options.map((tool) => <label key={tool}><input type="checkbox" checked={value.includes(tool)} onChange={() => toggle(tool)} /><span>{tool}</span></label>)}</div>
        <div className="custom-tool"><input value={customTool} onChange={(event) => setCustomTool(event.target.value)} placeholder="その他のツール" /><button type="button" className="secondary-button" onClick={addCustomTool} disabled={!customTool.trim()}>追加</button></div>
      </div>
    </fieldset>
  )
}

function EditableField({ label, help, value, onChange, multiline = false }: { label: string; help?: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  const id = `field-${label}`
  return (
    <label className="editable-field" htmlFor={id}>
      <span>{label}{help && <small>{help}</small>}</span>
      {multiline
        ? <textarea id={id} value={value} rows={Math.max(3, value.split('\n').length + 1)} onChange={(event) => onChange(event.target.value)} />
        : <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />}
    </label>
  )
}

const ratingLabel: Record<RatingValue, string> = { HIGH: '高い', MEDIUM: '中程度', LOW: '低い' }

function currentStepsFromTask(task: BusinessTask): WorkflowStep[] {
  return task.steps.map((step, index) => ({
    id: `current-${index}`,
    label: step,
    detail: index === 0 ? '入力・情報を取得' : index === task.steps.length - 1 ? task.output : '現在は人が対応',
    kind: index === 0 ? 'system' : index === task.steps.length - 1 ? 'output' : 'human',
  }))
}

function displayProblemValue(value: string) {
  if (value === 'HIGH') return '高い'
  if (value === 'MEDIUM') return '中程度'
  if (value === 'LOW') return '低い'
  return value
}

function AnalysisScreen({ task, design, onNext }: { task: BusinessTask; design: BusinessDesign; onNext: () => void }) {
  const analysis = design.analysis
  const currentSteps = currentStepsFromTask(task)

  return (
    <main className="tool-main report-tool">
      <ToolTitle title="分析結果" summary={analysis.conclusion} />

      <section className="purpose-check" aria-labelledby="purpose-check-heading">
        <h2 id="purpose-check-heading">目的と現在の手段</h2>
        <dl>
          <div><dt>達成したいこと</dt><dd>{analysis.purposeCheck.outcome}</dd></div>
          <div><dt>現在の手段</dt><dd>{analysis.purposeCheck.currentMeans}</dd></div>
          <div><dt>成果物の判断</dt><dd>{analysis.purposeCheck.outputDecision}</dd></div>
        </dl>
      </section>

      <div className="report-sections">
        <details className="report-section">
          <summary><span>現在の工程</span><small>{task.steps.length}工程</small></summary>
          <WorkflowDiagram steps={currentSteps} ariaLabel="現在の業務工程" />
        </details>

        <details className="report-section" open>
          <summary><span>改善候補</span><small>{analysis.problems.length}件</small></summary>
          <div className="issue-table-wrap">
            <table className="issue-table"><thead><tr><th>課題</th><th>根拠</th><th>状態</th></tr></thead><tbody>
              {analysis.problems.map((problem) => <tr key={problem.label}><th>{problem.label}</th><td>{problem.detail}</td><td>{displayProblemValue(problem.value)}</td></tr>)}
            </tbody></table>
          </div>
          <dl className="rating-list">
            <div><dt>改善効果</dt><dd>{ratingLabel[analysis.ratings.opportunity]}</dd></div>
            <div><dt>実行しやすさ</dt><dd>{ratingLabel[analysis.ratings.implementation]}</dd></div>
            <div><dt>定型処理との相性</dt><dd>{ratingLabel[analysis.ratings.aiFit]}</dd></div>
          </dl>
        </details>

        <details className="report-section">
          <summary><span>根拠</span><small>事実と仮定</small></summary>
          <div className="evidence-columns">
            <EvidenceList label="事実" items={analysis.facts} />
            <EvidenceList label="仮定" items={analysis.assumptions} />
          </div>
        </details>

        <details className="report-section">
          <summary><span>未確認事項</span><small>{analysis.unknowns.length}件</small></summary>
          <ul className="plain-list">{analysis.unknowns.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      </div>

      <div className="analysis-actions">
        <div><h2>現在の成果物を維持する自動化案</h2><p>{analysis.conventional.summary}</p></div>
        <button type="button" className="primary-button" onClick={onNext}>再設計案を見る<ArrowRight size={20} /></button>
      </div>
    </main>
  )
}

function EvidenceList({ label, items }: { label: string; items: string[] }) {
  return <section className="evidence-list"><h3>{label}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>
}

function RedesignScreen({ design, onReset }: { design: BusinessDesign; onReset: () => void }) {
  const task = design.businessTask
  const redesignedSteps: WorkflowStep[] = design.redesign.workflow.map((step, index) => ({ ...step, id: `redesigned-${index}` }))
  const impact = design.redesign.impact
  const conditions = Array.from(new Set([...task.constraints, ...design.analysis.unknowns]))

  return (
    <main className="tool-main report-tool">
      <ToolTitle title="改善案" summary={design.redesign.headline} />

      <section className="comparison-section" aria-labelledby="comparison-heading">
        <h2 id="comparison-heading">現在と見直し後</h2>
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead><tr><th /><th>現在</th><th>見直し後</th></tr></thead>
            <tbody>
              <tr><th>定期成果物</th><td>{design.redesign.metrics.scheduledOutputBefore}</td><td>{design.redesign.metrics.scheduledOutputAfter}</td></tr>
              <tr><th>人の定期作業</th><td>{design.redesign.metrics.routineHumanWorkBefore}</td><td>{design.redesign.metrics.routineHumanWorkAfter}</td></tr>
              <tr><th>変化の検知</th><td>{design.redesign.metrics.detectionBefore}</td><td>{design.redesign.metrics.detectionAfter}</td></tr>
              <tr><th>成果物</th><td>{design.redesign.metrics.outputBefore}</td><td>{design.redesign.metrics.outputAfter}</td></tr>
              <tr><th>所要時間</th><td>{task.duration}／{task.frequency}</td><td>通常 {impact.routineMinutesPerCycle}分、変化時 {impact.exceptionMinutesMin}〜{impact.exceptionMinutesMax}分</td></tr>
            </tbody>
          </table>
        </div>
        <p className="result-note">{design.redesign.insight}</p>
      </section>

      <section className="plain-section">
        <h2>新しい工程</h2>
        <WorkflowDiagram steps={redesignedSteps} ariaLabel="見直し後の業務工程" />
      </section>

      <section className="plain-section">
        <h2>担当する役割</h2>
        <div className="role-table">
          <div><strong>システム</strong><span>正確に繰り返す</span><ul>{design.redesign.roles.system.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><strong>AI</strong><span>変化の意味を整理する</span><ul>{design.redesign.roles.ai.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><strong>人</strong><span>確認し、判断する</span><ul>{design.redesign.roles.human.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
      </section>

      <section className="plain-section conditions-section">
        <div><h2>実装前に確認すること</h2><ul className="plain-list">{conditions.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div className="impact-summary"><strong>通常 {impact.routineMinutesPerCycle}分</strong><span>定期作業</span><p>変化発生時のみ {impact.exceptionMinutesMin}〜{impact.exceptionMinutesMax}分を確認する想定です。{impact.assumption}</p></div>
      </section>

      <div className="finish-bar">
        <div><strong>改善案の確認は完了です</strong><p>入力内容は分析のため外部AIサービスへ送信されますが、このアプリには保存されません。</p></div>
        <button type="button" className="secondary-button" onClick={onReset}><RefreshCcw size={18} />最初から試す</button>
      </div>
    </main>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [task, setTask] = useState<BusinessTask>(initialBusinessTask)
  const [answers, setAnswers] = useState<string[]>([])
  const [interviewOptions, setInterviewOptions] = useState<InterviewOptions | null>(null)
  const [design, setDesign] = useState<BusinessDesign | null>(null)
  const [events, setEvents] = useState<DemoEvent[]>(demoEvents)
  const [selectedEvent, setSelectedEvent] = useState<DemoEvent>(demoEvents.find((event) => event.id === 'sales-report') ?? demoEvents[0])
  const [calendar, setCalendar] = useState<CalendarState>({ configured: false, connected: false, loading: true })
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [calendarError, setCalendarError] = useState('')

  useEffect(() => {
    let active = true
    const url = new URL(window.location.href)
    const callbackResult = url.searchParams.get('calendar')
    if (callbackResult === 'error') setCalendarError('Google Calendarを接続できませんでした。設定とアクセス許可を確認してください。')
    if (callbackResult) {
      url.searchParams.delete('calendar')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
    void getGoogleCalendarStatus()
      .then((status) => { if (active) setCalendar({ ...status, loading: false }) })
      .catch((error) => {
        if (!active) return
        setCalendar({ configured: false, connected: false, loading: false })
        setCalendarError(error instanceof Error ? error.message : 'Google Calendarの接続状態を確認できませんでした。')
      })
    return () => { active = false }
  }, [])

  function reset() {
    setTask(initialBusinessTask)
    setAnswers([])
    setInterviewOptions(null)
    setDesign(null)
    setScreen('home')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function moveTo(next: Screen) {
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startDemo() {
    setEvents(demoEvents)
    setSelectedEvent(demoEvents.find((event) => event.id === 'sales-report') ?? demoEvents[0])
    setAnswers([])
    setInterviewOptions(null)
    setCalendarError('')
    moveTo('discovery')
  }

  function connectCalendar() {
    window.location.assign('/api/google/connect')
  }

  async function startFromCalendar() {
    if (calendarBusy) return
    setCalendarBusy(true)
    setCalendarError('')
    try {
      const result = await getGoogleCalendarEvents()
      const calendarEvents = calendarEventsToWorkItems(result.events)
      if (!calendarEvents.length) throw new Error('前後1週間に表示できる予定がありません。')
      setEvents(calendarEvents)
      setSelectedEvent(calendarEvents.find((event) => event.candidate && !event.allDay) ?? calendarEvents.find((event) => !event.allDay) ?? calendarEvents[0])
      setAnswers([])
      setInterviewOptions(null)
      moveTo('discovery')
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : 'Google Calendarから予定を取得できませんでした。')
      const status = await getGoogleCalendarStatus().catch(() => null)
      if (status) setCalendar({ ...status, loading: false })
    } finally {
      setCalendarBusy(false)
    }
  }

  async function disconnectCalendar() {
    if (calendarBusy) return
    setCalendarBusy(true)
    setCalendarError('')
    try {
      await disconnectGoogleCalendar()
      setCalendar({ configured: calendar.configured, connected: false, loading: false })
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : 'Google Calendarとの接続を解除できませんでした。')
    } finally {
      setCalendarBusy(false)
    }
  }

  function goBack() {
    const previous = backScreen[screen]
    if (previous) moveTo(previous)
  }

  async function startInterview() {
    if (!interviewOptions) {
      try {
        setInterviewOptions(await generateInterviewOptions(selectedEvent))
      } catch {
        setInterviewOptions(null)
      }
    }
    moveTo('interview')
  }

  async function completeQuestions(nextAnswers: string[]) {
    const extractedTask = await extractBusinessTask(nextAnswers, selectedEvent)
    setTask(extractedTask)
    moveTo('review')
  }

  function continueWithDemoTask() {
    setTask(initialBusinessTask)
    moveTo('review')
  }

  async function completeReview(approvedTask: BusinessTask) {
    const generatedDesign = await generateBusinessDesign(approvedTask)
    setTask(approvedTask)
    setDesign(generatedDesign)
    moveTo('analysis')
  }

  function continueWithDemoDesign() {
    setTask(demoDesign.businessTask)
    setDesign(demoDesign)
    moveTo('analysis')
  }

  return (
    <div className="app-shell">
      <AppHeader screen={screen} onBack={goBack} onReset={reset} />
      {screen === 'home' && <HomeScreen calendar={calendar} busy={calendarBusy} error={calendarError} onConnect={connectCalendar} onCalendarStart={startFromCalendar} onDisconnect={disconnectCalendar} onDemoStart={startDemo} />}
      {screen === 'discovery' && <DiscoveryScreen events={events} selectedEvent={selectedEvent} onSelectEvent={(event) => { setSelectedEvent(event); setAnswers([]); setInterviewOptions(null) }} onSelect={startInterview} />}
      {screen === 'interview' && <InterviewScreen eventTitle={selectedEvent.title} answers={answers} setAnswers={setAnswers} options={interviewOptions} onExtract={completeQuestions} onDemoFallback={continueWithDemoTask} />}
      {screen === 'review' && <ReviewScreen task={task} setTask={setTask} onAnalyze={completeReview} onDemoFallback={continueWithDemoDesign} />}
      {screen === 'analysis' && design && <AnalysisScreen task={task} design={design} onNext={() => moveTo('redesign')} />}
      {screen === 'redesign' && design && <RedesignScreen design={design} onReset={reset} />}
    </div>
  )
}
