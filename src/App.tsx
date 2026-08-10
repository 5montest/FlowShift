import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleHelp, LoaderCircle, RefreshCcw } from 'lucide-react'
import { demoDesign, demoInterviewPlan, demoWorkGroups, initialBusinessTask } from './demo-data'
import {
  createImprovementProject,
  disconnectGoogleCalendar,
  extractBusinessTask,
  generateBusinessDesign,
  generateInterviewPlan,
  getGoogleCalendarEvents,
  getGoogleCalendarStatus,
  getImprovementProjects,
  updateImprovementProjectStatus,
} from './api'
import { groupCalendarEvents, isDiscoveryCandidate, summarizeWorkGroups } from '../shared/work-group'
import type {
  BusinessDesign,
  BusinessTask,
  CalendarStatus,
  ContextState,
  ImprovementProject,
  InterviewAnswer,
  InterviewPlan,
  ProjectStatus,
  Screen,
  WorkGroup,
  WorkflowStep,
} from './types'
import WorkflowDiagram from './WorkflowDiagram'

const toolSteps: { screens: Screen[]; label: string }[] = [
  { screens: ['discovery'], label: '業務を発見' },
  { screens: ['interview'], label: 'コンテクスト収集' },
  { screens: ['review'], label: '業務を構造化' },
  { screens: ['analysis'], label: '仮説を確認' },
  { screens: ['redesign'], label: '検証・判断' },
]

const backScreen: Partial<Record<Screen, Screen>> = {
  discovery: 'home', interview: 'discovery', review: 'interview', analysis: 'review', redesign: 'analysis', projects: 'home',
}

type RequestStatus = 'idle' | 'loading' | 'error'
type WorkFilter = 'all' | 'repeat' | 'meeting'
type CalendarState = CalendarStatus & { loading: boolean }

const contextLabels: Record<keyof BusinessTask['contextStatus'], string> = {
  purpose: '目的', stakeholders: '関係者・利用者', process: '現在の工程', decisions: '人の判断', exceptions: '例外',
  constraints: '制約', dependencies: '他業務への影響', risks: '変更時のリスク', output: '成果物',
}

const validationLabels = {
  PILOT: '試行', TECHNICAL_FEASIBILITY: '技術検証', OFFLINE_EVALUATION: '過去データ評価',
  REQUIREMENT_VALIDATION: '要件確認', STAKEHOLDER_REVIEW: '関係者確認',
} as const

const projectStatusLabels: Record<ProjectStatus, string> = {
  DRAFT: '下書き', VALIDATING: '検証中', ADOPTED: '採用', REJECTED: '却下', ON_HOLD: '保留',
}

function Logo() {
  return <span className="wordmark">FlowShift</span>
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
            <strong className="header-location">{screen === 'projects' ? '保存した仮説' : toolSteps[activeIndex]?.label}</strong>
            {activeIndex >= 0 && <span className="step-count">ステップ {activeIndex + 1} / {toolSteps.length}</span>}
          </>
        )}
      </div>
    </header>
  )
}

function ToolTitle({ title, summary }: { title: string; summary?: string }) {
  return <div className="tool-titlebar"><h1>{title}</h1>{summary && <p>{summary}</p>}</div>
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}時間${remainder}分` : `${hours}時間`
}

function formatPeriod(group: WorkGroup): string {
  const format = (value: string) => new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(value))
  return `${format(group.firstOccurredAt)}〜${format(group.lastOccurredAt)}`
}

function HomeScreen({ calendar, busy, error, onConnect, onCalendarStart, onDisconnect, onDemoStart, onProjects }: {
  calendar: CalendarState
  busy: boolean
  error: string
  onConnect: () => void
  onCalendarStart: () => Promise<void>
  onDisconnect: () => Promise<void>
  onDemoStart: () => void
  onProjects: () => Promise<void>
}) {
  return (
    <main className="home-grid">
      <section className="home-intro">
        <div>
          <h1 className="hero-title">業務を見つけ、<br /><span>理解してから作り直す。</span></h1>
          <p className="hero-description">カレンダーから繰り返し業務の存在を見つけます。その予定だけで結論を出さず、あなたへの質問から目的・判断・制約を整理し、検証できる再設計仮説を作ります。</p>
          <div className="home-actions">
            {calendar.connected ? (
              <>
                <button type="button" onClick={() => void onCalendarStart()} className="primary-button" disabled={busy}>
                  {busy ? <><LoaderCircle className="animate-spin" />過去4週間を取得中</> : <>業務傾向を見る<ArrowRight size={20} /></>}
                </button>
                <button type="button" onClick={() => void onProjects()} className="secondary-button" disabled={busy}>保存した仮説</button>
                <button type="button" onClick={() => void onDisconnect()} className="text-button" disabled={busy}>接続を解除</button>
              </>
            ) : (
              <button type="button" onClick={onConnect} className="primary-button" disabled={calendar.loading || !calendar.configured}>
                {calendar.loading ? '接続状態を確認中' : 'Google Calendarを接続'}<ArrowRight size={20} />
              </button>
            )}
            <button type="button" onClick={onDemoStart} className="secondary-button">朝会の例を見る</button>
          </div>
          <p className="calendar-note">{calendar.connected ? `${calendar.email ?? 'Googleアカウント'}と接続済み` : calendar.configured ? '予定の読み取り権限だけを使用します。' : 'Google OAuthのローカル設定が必要です。'}</p>
          {error && <p className="calendar-error" role="alert">{error}</p>}
          <ul className="service-notes" aria-label="データの取り扱い">
            <li>Calendarは業務について質問を始める索引として使います</li>
            <li>選択した業務の観測情報と回答だけを分析のため外部AIサービスへ送信します</li>
            <li>Calendar全件や会話全文は保存せず、あなたが保存した仮説だけを残します</li>
          </ul>
        </div>
      </section>

      <section className="hero-example" aria-label="FlowShiftの進め方">
        <header className="example-header"><h2>朝会</h2><p>過去4週間・20回・合計5時間</p></header>
        <ol className="product-flow">
          <li><strong>1</strong><span>観測する<small>存在と傾向を確認</small></span></li>
          <li><strong>2</strong><span>聞き出す<small>目的・判断・制約を質問</small></span></li>
          <li><strong>3</strong><span>仮説を作る<small>前提と不明点を分離</small></span></li>
          <li><strong>4</strong><span>検証する<small>最後は人が判断</small></span></li>
        </ol>
        <p className="example-note">予定が多いという理由だけで、会議の廃止や自動化を断定しません。</p>
      </section>
    </main>
  )
}

function DiscoveryScreen({ groups, selectedGroup, onSelectGroup, onSelect }: {
  groups: WorkGroup[]
  selectedGroup: WorkGroup
  onSelectGroup: (group: WorkGroup) => void
  onSelect: () => Promise<void>
}) {
  const [filter, setFilter] = useState<WorkFilter>('all')
  const [showMobileDetail, setShowMobileDetail] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const summary = useMemo(() => summarizeWorkGroups(groups), [groups])
  const candidates = groups.filter(isDiscoveryCandidate)
  const baseGroups = candidates.length ? candidates : groups
  const visibleGroups = baseGroups.filter((group) => filter === 'all' || (filter === 'repeat' && group.evidence.recurring) || (filter === 'meeting' && group.category === '会議'))

  async function selectWork() {
    if (preparing) return
    setPreparing(true)
    try { await onSelect() } finally { setPreparing(false) }
  }

  return (
    <main className="tool-main">
      <ToolTitle title="過去4週間の業務傾向" summary="Calendarから観測できた事実です。業務内容や改善方法はまだ判断していません。" />
      <section className="discovery-summary" aria-label="過去4週間の集計">
        <div><span>カレンダー上の業務</span><strong>{formatMinutes(summary.calendarMinutes)}</strong></div>
        <div><span>繰り返し予定</span><strong>{formatMinutes(summary.recurringMinutes)}</strong></div>
        <div><span>会議</span><strong>{formatMinutes(summary.meetingMinutes)}</strong></div>
        <div><span>確認候補</span><strong>{summary.candidateCount}業務</strong></div>
      </section>

      <div className="work-toolbar" aria-label="表示条件">
        <strong>{candidates.length ? '今、詳しく聞く価値がありそうな業務' : '繰り返し候補がないため、観測した業務を表示'}</strong>
        <div className="filter-buttons">
          {([['all', 'すべて'], ['repeat', '繰り返し'], ['meeting', '会議']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className={`work-browser ${showMobileDetail ? 'show-detail' : ''}`}>
        <section className="work-list" aria-labelledby="work-list-heading">
          <h2 id="work-list-heading">業務</h2>
          <div className="work-table-head"><span>業務</span><span>回数</span><span>合計時間</span></div>
          {visibleGroups.map((group) => (
            <button key={group.id} type="button" className={`work-group-row${group.id === selectedGroup.id ? ' is-selected' : ''}`} onClick={() => { onSelectGroup(group); setShowMobileDetail(true) }}>
              <span><strong>{group.title}</strong><small>{group.category}・平均{formatMinutes(group.averageMinutes)}</small></span>
              <span>{group.occurrences}回</span><span>{formatMinutes(group.totalMinutes)}</span>
            </button>
          ))}
          {!visibleGroups.length && <p className="empty-work-list">この条件に合う業務はありません。</p>}
        </section>

        <aside className="selection-pane" aria-labelledby="selected-work-heading">
          <button type="button" className="mobile-list-back" onClick={() => setShowMobileDetail(false)}><ArrowLeft size={18} />一覧へ戻る</button>
          <p className="eyebrow">観測できたこと</p>
          <h2 id="selected-work-heading">{selectedGroup.title}</h2>
          <p className="work-meta">{selectedGroup.category}・{formatPeriod(selectedGroup)}</p>
          <dl className="evidence-list">
            <div><dt>回数</dt><dd>{selectedGroup.occurrences}回</dd></div>
            <div><dt>合計時間</dt><dd>{formatMinutes(selectedGroup.totalMinutes)}</dd></div>
            <div><dt>1回あたり</dt><dd>平均{formatMinutes(selectedGroup.averageMinutes)}</dd></div>
            <div><dt>登録</dt><dd>{selectedGroup.evidence.recurring ? '同一の定例予定' : '同じタイトルの予定'}</dd></div>
          </dl>
          <div className="observation-note"><CircleHelp size={20} /><p>この情報だけでは、目的や必要性は分かりません。次に、あなたが知っている業務の背景を確認します。</p></div>
          <button type="button" className="primary-button full-width" onClick={() => void selectWork()} disabled={preparing}>
            {preparing ? <><LoaderCircle className="animate-spin" />質問を準備中</> : <>この業務について答える<ArrowRight size={20} /></>}
          </button>
        </aside>
      </div>
    </main>
  )
}

function InterviewScreen({ group, plan, answers, setAnswers, onExtract }: {
  group: WorkGroup
  plan: InterviewPlan
  answers: InterviewAnswer[]
  setAnswers: (answers: InterviewAnswer[]) => void
  onExtract: (answers: InterviewAnswer[]) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const question = plan.questions[Math.min(answers.length, plan.questions.length - 1)]
  const complete = answers.length === plan.questions.length

  async function submitAnswer(event: FormEvent) {
    event.preventDefault()
    const value = draft.trim()
    if (!value || complete || status === 'loading') return
    const nextAnswers = [...answers, { dimension: question.id, question: question.prompt, answer: value }]
    setAnswers(nextAnswers)
    setDraft('')
    setCustomMode(false)
    if (nextAnswers.length === plan.questions.length) {
      setStatus('loading')
      setErrorMessage('')
      try { await onExtract(nextAnswers) } catch (error) {
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : '回答内容を整理できませんでした。')
      }
    }
  }

  async function retry() {
    setStatus('loading')
    setErrorMessage('')
    try { await onExtract(answers) } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '回答内容を整理できませんでした。')
    }
  }

  function reviseLastAnswer() {
    const last = answers.at(-1)
    if (!last) return
    setAnswers(answers.slice(0, -1))
    setDraft(last.answer)
    setCustomMode(true)
    setStatus('idle')
  }

  return (
    <main className="tool-main narrow-tool">
      <ToolTitle title={group.title} summary={`質問 ${Math.min(answers.length + 1, plan.questions.length)} / ${plan.questions.length}`} />
      <div className="observation-strip"><span>Calendarで確認</span><strong>{group.occurrences}回</strong><strong>合計{formatMinutes(group.totalMinutes)}</strong><strong>平均{formatMinutes(group.averageMinutes)}</strong></div>

      {answers.length > 0 && <details className="previous-answers"><summary>回答済みの内容（{answers.length}件）</summary><ol>{answers.map((answer) => <li key={answer.dimension}><strong>{answer.question}</strong><p>{answer.answer}</p></li>)}</ol></details>}

      {status === 'loading' ? (
        <div className="request-state" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>回答を業務モデルへ整理しています</strong><p>推測で埋めず、確認済み・一部確認・未確認に分けます。</p></div></div>
      ) : status === 'error' ? (
        <div className="request-error" role="alert"><strong>回答内容を整理できませんでした</strong><p>{errorMessage}</p><div className="button-row"><button type="button" className="primary-button" onClick={() => void retry()}>再試行</button><button type="button" className="text-button" onClick={reviseLastAnswer}>最後の回答を修正</button></div></div>
      ) : !complete ? (
        <form className="interview-form" onSubmit={(event) => void submitAnswer(event)}>
          <div className="question-block"><h2>{question.prompt}</h2><p>{question.hint}</p></div>
          <div className="answer-options" role="group" aria-label="回答候補">
            {question.options.map((option) => <button key={option} type="button" className={draft === option && !customMode ? 'is-selected' : ''} onClick={() => { setDraft(option); setCustomMode(false) }}>{option}{draft === option && !customMode && <Check size={18} />}</button>)}
          </div>
          <button type="button" className="text-button custom-answer-toggle" onClick={() => { setCustomMode(true); setDraft('') }}>自分の言葉で入力する</button>
          {customMode && <textarea className="answer-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} maxLength={2000} autoFocus placeholder="分かる範囲で入力してください" />}
          <button type="submit" className="primary-button full-width" disabled={!draft.trim()}>{answers.length === plan.questions.length - 1 ? '内容を整理する' : '次へ'}<ArrowRight size={20} /></button>
        </form>
      ) : null}
    </main>
  )
}

function ContextCompleteness({ task }: { task: BusinessTask }) {
  return (
    <section className="context-completeness" aria-labelledby="context-heading">
      <h2 id="context-heading">業務理解</h2>
      <dl>{(Object.entries(task.contextStatus) as [keyof BusinessTask['contextStatus'], ContextState][]).map(([key, state]) => (
        <div key={key}><dt>{contextLabels[key]}</dt><dd className={`context-${state.toLowerCase()}`}>{state === 'CONFIRMED' ? '✓ 確認済み' : state === 'PARTIAL' ? '△ 一部確認' : '未確認'}</dd></div>
      ))}</dl>
    </section>
  )
}

function ReviewScreen({ task, setTask, onAnalyze }: { task: BusinessTask; setTask: (task: BusinessTask) => void; onAnalyze: (task: BusinessTask) => Promise<void> }) {
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  function setText<K extends keyof BusinessTask>(key: K, value: BusinessTask[K], statusKey?: keyof BusinessTask['contextStatus']) {
    setTask({
      ...task,
      [key]: value,
      ...(statusKey ? { contextStatus: { ...task.contextStatus, [statusKey]: String(value).trim() && value !== '未確認' && value !== 'UNKNOWN' ? 'CONFIRMED' : 'UNKNOWN' } } : {}),
    })
  }
  function setList(key: 'stakeholders' | 'tools' | 'inputs' | 'steps' | 'decisionPoints' | 'exceptions' | 'constraints' | 'dependencies' | 'risks', value: string, statusKey?: keyof BusinessTask['contextStatus']) {
    const items = value.split('\n').map((item) => item.trim()).filter(Boolean)
    setTask({
      ...task,
      [key]: items,
      ...(statusKey ? { contextStatus: { ...task.contextStatus, [statusKey]: items.length ? 'CONFIRMED' : 'UNKNOWN' } } : {}),
    })
  }
  async function analyze() {
    setStatus('loading')
    setErrorMessage('')
    try { await onAnalyze(task) } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '業務モデルを分析できませんでした。')
    }
  }

  return (
    <main className="tool-main">
      <ToolTitle title="内容を確認" summary="回答から整理した内容です。誤りを直し、不明な項目は未確認のまま残してください。" />
      <section className="observed-facts"><h2>Calendarで観測した事実</h2><div><span>{task.observed.occurrences}回</span><span>合計{formatMinutes(task.observed.totalMinutes)}</span><span>平均{formatMinutes(task.observed.averageMinutes)}</span></div></section>
      <div className="review-layout">
        <section className="review-form" aria-label="業務モデル編集">
          <label><span>業務名</span><input value={task.name} onChange={(event) => setText('name', event.target.value)} /></label>
          <label><span>開始条件・タイミング</span><input value={task.trigger} onChange={(event) => setText('trigger', event.target.value)} /></label>
          <label className="full"><span>目的</span><textarea rows={3} value={task.purpose} onChange={(event) => setText('purpose', event.target.value, 'purpose')} /><small>成果物ではなく、誰が何を把握・判断するか</small></label>
          <label><span>結果を利用する人</span><input value={task.consumer} onChange={(event) => setText('consumer', event.target.value, 'stakeholders')} /></label>
          <label><span>関係者（1行に1人・役割）</span><textarea rows={3} value={task.stakeholders.join('\n')} onChange={(event) => setList('stakeholders', event.target.value, 'stakeholders')} /></label>
          <label><span>使用ツール（1行に1つ）</span><textarea rows={3} value={task.tools.join('\n')} onChange={(event) => setList('tools', event.target.value)} placeholder="未確認なら空欄" /></label>
          <label><span>入力情報（1行に1つ）</span><textarea rows={3} value={task.inputs.join('\n')} onChange={(event) => setList('inputs', event.target.value)} placeholder="未確認なら空欄" /></label>
          <label><span>現在の成果物・手段</span><input value={task.output} onChange={(event) => setText('output', event.target.value, 'output')} /></label>
          <label><span>成果物の必要性</span><select value={task.outputRequirement} onChange={(event) => setText('outputRequirement', event.target.value as BusinessTask['outputRequirement'], 'output')}><option value="NOT_REQUIRED">定期成果物は不要</option><option value="ON_DEMAND">必要時だけ必要</option><option value="REQUIRED">定期的に必要</option><option value="UNKNOWN">未確認</option></select></label>
          <label className="full"><span>成果物の必要性について分かっていること</span><textarea rows={2} value={task.outputRequirementReason} onChange={(event) => setText('outputRequirementReason', event.target.value, 'output')} /></label>
          <label className="full"><span>現在の工程（1行に1つ）</span><textarea rows={5} value={task.steps.join('\n')} onChange={(event) => setList('steps', event.target.value, 'process')} /></label>
          <label className="full"><span>人が判断する箇所</span><textarea rows={3} value={task.decisionPoints.join('\n')} onChange={(event) => setList('decisionPoints', event.target.value, 'decisions')} /></label>
          <label><span>例外</span><textarea rows={4} value={task.exceptions.join('\n')} onChange={(event) => setList('exceptions', event.target.value, 'exceptions')} placeholder="未確認なら空欄" /></label>
          <label><span>制約</span><textarea rows={4} value={task.constraints.join('\n')} onChange={(event) => setList('constraints', event.target.value, 'constraints')} placeholder="未確認なら空欄" /></label>
          <label><span>依存関係</span><textarea rows={4} value={task.dependencies.join('\n')} onChange={(event) => setList('dependencies', event.target.value, 'dependencies')} placeholder="未確認なら空欄" /></label>
          <label><span>変更時のリスク</span><textarea rows={4} value={task.risks.join('\n')} onChange={(event) => setList('risks', event.target.value, 'risks')} placeholder="未確認なら空欄" /></label>
        </section>
        <ContextCompleteness task={task} />
      </div>
      {status === 'error' && <p className="calendar-error" role="alert">{errorMessage}</p>}
      <div className="bottom-action"><button type="button" className="primary-button" onClick={() => void analyze()} disabled={status === 'loading'}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />仮説を整理中</> : <>この内容で仮説を作る<ArrowRight size={20} /></>}</button></div>
    </main>
  )
}

function EvidenceColumn({ title, items, tone, empty }: { title: string; items: string[]; tone: string; empty: string }) {
  return <section className={`evidence-column ${tone}`}><h3>{title}</h3>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}</section>
}

function AnalysisScreen({ task, design, onNext }: { task: BusinessTask; design: BusinessDesign; onNext: () => void }) {
  const needsContext = design.analysis.readiness === 'NEEDS_CONTEXT'
  return (
    <main className="tool-main">
      <ToolTitle title="業務モデルと判断材料" summary="確認できたことと、まだ分からないことを分けて表示します。" />
      <section className={`readiness-banner ${needsContext ? 'needs-context' : 'ready'}`}>
        <strong>{needsContext ? '追加確認が必要です' : '再設計仮説を検討できます'}</strong><p>{design.analysis.conclusion}</p>
      </section>
      <section className="purpose-check"><h2>目的と現在の手段</h2><dl><div><dt>達成したいこと</dt><dd>{design.analysis.purposeCheck.outcome}</dd></div><div><dt>現在の手段</dt><dd>{design.analysis.purposeCheck.currentMeans}</dd></div><div><dt>現時点の判断</dt><dd>{design.analysis.purposeCheck.outputDecision}</dd></div></dl></section>
      <div className="evidence-grid">
        <EvidenceColumn title="確認できていること" items={design.analysis.facts} tone="facts" empty="確認済み情報はありません" />
        <EvidenceColumn title="成立のための仮定" items={design.analysis.assumptions} tone="assumptions" empty="仮定はありません" />
        <EvidenceColumn title="まだ分からないこと" items={design.analysis.unknowns} tone="unknowns" empty="重大な未確認事項はありません" />
      </div>
      {design.analysis.nextQuestions.length > 0 && <section className="next-questions"><h2>次に確認すること</h2><ol>{design.analysis.nextQuestions.map((item) => <li key={item}>{item}</li>)}</ol></section>}
      <ContextCompleteness task={task} />
      <div className="bottom-action"><button type="button" className="primary-button" onClick={onNext}>{needsContext ? '条件付き仮説を見る' : '再設計仮説を見る'}<ArrowRight size={20} /></button></div>
    </main>
  )
}

function workflowSteps(design: BusinessDesign): WorkflowStep[] {
  return design.redesign.workflow.map((step, index) => ({ id: `${index}-${step.label}`, ...step }))
}

function RedesignScreen({ design, connected, savedProject, onSave, onStatus }: {
  design: BusinessDesign
  connected: boolean
  savedProject: ImprovementProject | null
  onSave: () => Promise<void>
  onStatus: (status: ProjectStatus) => Promise<void>
}) {
  const [showValidation, setShowValidation] = useState(false)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const needsContext = design.analysis.readiness === 'NEEDS_CONTEXT'
  const metrics = design.redesign.metrics
  const comparisons = [
    ['定期業務', metrics.scheduledOutputBefore, metrics.scheduledOutputAfter],
    ['人の定期作業', metrics.routineHumanWorkBefore, metrics.routineHumanWorkAfter],
    ['変化の検知', metrics.detectionBefore, metrics.detectionAfter],
    ['成果物', metrics.outputBefore, metrics.outputAfter],
  ]

  async function run(action: () => Promise<void>) {
    setStatus('loading'); setErrorMessage('')
    try { await action(); setStatus('idle') } catch (error) { setStatus('error'); setErrorMessage(error instanceof Error ? error.message : '保存できませんでした。') }
  }

  return (
    <main className="tool-main">
      <ToolTitle title="再設計仮説" summary="答えではなく、前提を確認しながら検証するための仮説です。" />
      <section className="hypothesis-hero"><span>{needsContext ? '判断保留' : '検証候補'}</span><h2>{design.redesign.headline}</h2><p>{design.redesign.hypothesis}</p></section>
      {needsContext && <div className="readiness-banner needs-context"><strong>この仮説をそのまま採用しないでください</strong><p>重大な未確認事項があります。先に「次に確認すること」と検証計画を実施してください。</p></div>}

      <section className="comparison-section"><h2>現在と仮説上の見直し後</h2><div className="comparison-table"><div className="comparison-head"><span></span><strong>現在</strong><strong>仮説上の見直し後</strong></div>{comparisons.map(([label, before, after]) => <div key={label}><span>{label}</span><p>{before}</p><p>{after}</p></div>)}</div><p className="comparison-assumption">前提：{design.redesign.impact.assumption}</p></section>
      <section className="workflow-section"><h2>仮説上の工程</h2><WorkflowDiagram steps={workflowSteps(design)} ariaLabel="再設計仮説の工程" /></section>
      <section className="role-section"><h2>担当する役割</h2><div className="role-grid"><div><h3>システム</h3><ul>{design.redesign.roles.system.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>AI</h3><ul>{design.redesign.roles.ai.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>人</h3><ul>{design.redesign.roles.human.map((item) => <li key={item}>{item}</li>)}</ul></div></div></section>

      {!showValidation ? <div className="bottom-action"><button type="button" className="primary-button" onClick={() => setShowValidation(true)}>この案を検証する<ArrowRight size={20} /></button></div> : (
        <section className="validation-section"><header><h2>検証方法</h2><p>{design.validationPlan.summary}</p></header>{design.validationPlan.items.map((item) => <article key={`${item.type}-${item.title}`}><span>{validationLabels[item.type]}</span><h3>{item.title}</h3><p>{item.description}</p><ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></article>)}</section>
      )}

      {showValidation && <section className="decision-section"><h2>あなたの判断</h2><p>AIは採用を決めません。仮説と検証計画を保存し、検証後に状態を更新できます。</p>{!connected ? <p className="calendar-note">デモの仮説を保存するにはGoogle Calendarへ接続してください。</p> : !savedProject ? <button type="button" className="primary-button" disabled={status === 'loading'} onClick={() => void run(onSave)}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />保存中</> : '検証する仮説として保存'}</button> : <><p className="saved-message"><Check size={18} />保存済み：{projectStatusLabels[savedProject.status]}</p><div className="decision-buttons">{(['VALIDATING', 'ADOPTED', 'ON_HOLD', 'REJECTED'] as const).map((value) => <button key={value} type="button" disabled={status === 'loading' || savedProject.status === value} onClick={() => void run(() => onStatus(value))}>{projectStatusLabels[value]}</button>)}</div></>}{status === 'error' && <p className="calendar-error" role="alert">{errorMessage}</p>}</section>}
    </main>
  )
}

function ProjectsScreen({ projects, onOpen }: { projects: ImprovementProject[]; onOpen: (project: ImprovementProject) => void }) {
  return <main className="tool-main"><ToolTitle title="保存した仮説" summary="確認・承認した業務モデルと検証計画だけを保存しています。" />{projects.length ? <div className="project-list">{projects.map((project) => <button key={project.id} type="button" onClick={() => onOpen(project)}><span><strong>{project.taskName}</strong><small>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(project.updatedAt))}</small></span><span className={`project-status status-${project.status.toLowerCase()}`}>{projectStatusLabels[project.status]}</span><ArrowRight size={20} /></button>)}</div> : <div className="empty-projects"><h2>保存した仮説はありません</h2><p>再設計案を正解としてではなく、検証する仮説として保存できます。</p></div>}</main>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [calendar, setCalendar] = useState<CalendarState>({ configured: false, connected: false, loading: true })
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [groups, setGroups] = useState<WorkGroup[]>(demoWorkGroups)
  const [selectedGroup, setSelectedGroup] = useState<WorkGroup>(demoWorkGroups[0])
  const [source, setSource] = useState<'demo' | 'google'>('demo')
  const [plan, setPlan] = useState<InterviewPlan>(demoInterviewPlan)
  const [answers, setAnswers] = useState<InterviewAnswer[]>([])
  const [task, setTask] = useState<BusinessTask>(initialBusinessTask)
  const [design, setDesign] = useState<BusinessDesign>(demoDesign)
  const [projects, setProjects] = useState<ImprovementProject[]>([])
  const [savedProject, setSavedProject] = useState<ImprovementProject | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.has('calendar')) window.history.replaceState({}, '', window.location.pathname)
    void refreshCalendarStatus(query.get('calendar') === 'error')
  }, [])

  async function refreshCalendarStatus(callbackError = false) {
    setCalendar((current) => ({ ...current, loading: true }))
    if (callbackError) setCalendarError('Google Calendarとの接続を完了できませんでした。設定と権限を確認してください。')
    try {
      const status = await getGoogleCalendarStatus()
      setCalendar({ ...status, loading: false })
    } catch (error) {
      setCalendar((current) => ({ ...current, loading: false }))
      setCalendarError(error instanceof Error ? error.message : '接続状態を確認できませんでした。')
    }
  }

  function resetFlow() {
    setScreen('home'); setGroups(demoWorkGroups); setSelectedGroup(demoWorkGroups[0]); setSource('demo')
    setPlan(demoInterviewPlan); setAnswers([]); setTask(initialBusinessTask); setDesign(demoDesign); setSavedProject(null); setCalendarError('')
  }

  function startDemo() {
    resetFlow(); setScreen('discovery')
  }

  async function startFromCalendar() {
    setCalendarBusy(true); setCalendarError('')
    try {
      const result = await getGoogleCalendarEvents()
      const nextGroups = groupCalendarEvents(result.events)
      if (!nextGroups.length) throw new Error('過去28日間に、時間のある予定が見つかりませんでした。')
      const first = nextGroups.find(isDiscoveryCandidate) ?? nextGroups[0]
      setGroups(nextGroups); setSelectedGroup(first); setSource('google'); setAnswers([]); setSavedProject(null); setScreen('discovery')
    } catch (error) {
      if ((error as { code?: string }).code === 'authentication_required' || (error as { code?: string }).code === 'google_not_connected') await refreshCalendarStatus()
      setCalendarError(error instanceof Error ? error.message : '予定を取得できませんでした。')
    } finally { setCalendarBusy(false) }
  }

  async function startInterview() {
    const nextPlan = source === 'demo' ? demoInterviewPlan : await generateInterviewPlan(selectedGroup)
    setPlan(nextPlan); setAnswers([]); setScreen('interview')
  }

  async function completeInterview(nextAnswers: InterviewAnswer[]) {
    const nextTask = source === 'demo' ? initialBusinessTask : await extractBusinessTask(nextAnswers, selectedGroup)
    setTask(nextTask); setScreen('review')
  }

  async function completeReview(approvedTask: BusinessTask) {
    const nextDesign = source === 'demo' ? { ...demoDesign, businessTask: approvedTask } : await generateBusinessDesign(approvedTask)
    setDesign(nextDesign); setSavedProject(null); setScreen('analysis')
  }

  async function showProjects() {
    setCalendarBusy(true); setCalendarError('')
    try { setProjects(await getImprovementProjects()); setScreen('projects') } catch (error) { setCalendarError(error instanceof Error ? error.message : '保存した仮説を取得できませんでした。') } finally { setCalendarBusy(false) }
  }

  async function saveProject() {
    const project = await createImprovementProject(design)
    setSavedProject(project); setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)])
  }

  async function updateProjectStatus(status: ProjectStatus) {
    if (!savedProject) return
    const project = await updateImprovementProjectStatus(savedProject.id, status)
    setSavedProject(project); setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  function openProject(project: ImprovementProject) {
    setTask(project.businessContext); setDesign(project.proposal); setSavedProject(project); setScreen('redesign')
  }

  async function disconnect() {
    setCalendarBusy(true); setCalendarError('')
    try { await disconnectGoogleCalendar(); setCalendar({ configured: calendar.configured, connected: false, loading: false }); resetFlow() } catch (error) { setCalendarError(error instanceof Error ? error.message : '接続を解除できませんでした。') } finally { setCalendarBusy(false) }
  }

  const previous = backScreen[screen]
  return (
    <div className="app-shell">
      <AppHeader screen={screen} onBack={() => setScreen(previous ?? 'home')} onReset={resetFlow} />
      {screen === 'home' && <HomeScreen calendar={calendar} busy={calendarBusy} error={calendarError} onConnect={() => { window.location.href = '/api/google/connect' }} onCalendarStart={startFromCalendar} onDisconnect={disconnect} onDemoStart={startDemo} onProjects={showProjects} />}
      {screen === 'discovery' && <DiscoveryScreen groups={groups} selectedGroup={selectedGroup} onSelectGroup={setSelectedGroup} onSelect={startInterview} />}
      {screen === 'interview' && <InterviewScreen group={selectedGroup} plan={plan} answers={answers} setAnswers={setAnswers} onExtract={completeInterview} />}
      {screen === 'review' && <ReviewScreen task={task} setTask={setTask} onAnalyze={completeReview} />}
      {screen === 'analysis' && <AnalysisScreen task={task} design={design} onNext={() => setScreen('redesign')} />}
      {screen === 'redesign' && <RedesignScreen design={design} connected={calendar.connected} savedProject={savedProject} onSave={saveProject} onStatus={updateProjectStatus} />}
      {screen === 'projects' && <ProjectsScreen projects={projects} onOpen={openProject} />}
      {screen !== 'home' && <button type="button" className="restart-button" onClick={resetFlow}><RefreshCcw size={16} />最初からやり直す</button>}
    </div>
  )
}
