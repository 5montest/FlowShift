import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleHelp, House, LoaderCircle, Menu, Plus } from 'lucide-react'
import { createDeterministicTask } from '../shared/interview'
import { decomposeBusinessTask, proposedTreatment, type WorkComponent } from '../shared/work-decomposition'
import { groupCalendarEvents, isDiscoveryCandidate, summarizeWorkGroups } from '../shared/work-group'
import {
  createImprovementProject,
  disconnectGoogleCalendar,
  extractBusinessTask,
  extractBusinessTaskFromObservation,
  generateBusinessDesign,
  generateFollowUpPlan,
  generateInterviewPlan,
  getGoogleCalendarEvents,
  getGoogleCalendarStatus,
  getImprovementProjects,
  updateImprovementProject,
  updateImprovementProjectContext,
  updateImprovementProjectStatus,
} from './api'
import { createDemoDesign, createDemoFollowUpPlan, demoDesign, demoInterviewPlan, demoProject, demoWorkGroups, initialBusinessTask, observationFromDemoGroup } from './demo-data'
import type {
  BusinessDesign,
  BusinessTask,
  CalendarStatus,
  ContextDimension,
  ContextState,
  ImprovementProject,
  InterviewAnswer,
  InterviewOption,
  InterviewPlan,
  OptionMeaning,
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
  { screens: ['redesign', 'analysis'], label: '仮説を検証' },
]

type RequestStatus = 'idle' | 'loading' | 'error'
type WorkFilter = 'all' | 'repeat' | 'meeting'
type CalendarState = CalendarStatus & { loading: boolean }

const contextLabels: Record<keyof BusinessTask['contextStatus'], string> = {
  purpose: '目的', stakeholders: '関係者・利用者', roles: '確認できている役割', process: '現在の工程', decisions: '人の判断', exceptions: '例外',
  constraints: '制約', dependencies: '他業務への影響', risks: '変更時のリスク', output: '成果物・会議形式の必要性',
}

const validationLabels = {
  PILOT: '試行', TECHNICAL_FEASIBILITY: '技術検証', OFFLINE_EVALUATION: '過去データ評価',
  REQUIREMENT_VALIDATION: '要件確認', STAKEHOLDER_REVIEW: '関係者確認',
} as const

const projectStatusLabels: Record<ProjectStatus, string> = {
  DRAFT: '下書き', VALIDATING: '検証中', ADOPTED: '採用', REJECTED: '却下', ON_HOLD: '保留',
}

function Logo() {
  return <span className="wordmark"><i aria-hidden="true">F</i><b>FlowShift</b></span>
}

function AppHeader({ screen, onBack, onHome, onRestart }: { screen: Screen; onBack: () => void; onHome: () => void; onRestart: () => void }) {
  const activeIndex = toolSteps.findIndex((step) => step.screens.includes(screen))
  const location = screen === 'dashboard' ? 'ワークスペース' : screen === 'projects' ? '保存した業務' : screen === 'project' ? '業務の詳細' : toolSteps[activeIndex]?.label
  return (
    <header className="app-header">
      <div className="header-inner">
        {screen === 'home' ? (
          <button type="button" onClick={onHome} className="brand-button" aria-label="最初の画面へ戻る"><Logo /></button>
        ) : screen === 'dashboard' ? (
          <button type="button" onClick={onHome} className="brand-button" aria-label="ワークスペースへ戻る"><Logo /></button>
        ) : (
          <>
            <button type="button" className="header-back" onClick={onBack} aria-label="前の画面へ戻る"><ArrowLeft size={22} /></button>
            <strong className="header-location">{location}</strong>
            {activeIndex >= 0 && <span className="step-count">ステップ {activeIndex + 1} / {toolSteps.length}</span>}
          </>
        )}
        {screen !== 'home' && <details className="header-menu"><summary aria-label="メニュー"><Menu size={22} /></summary><div>
          <button type="button" onClick={onHome}><House size={18} />ワークスペース</button>
          {screen !== 'dashboard' && <button type="button" onClick={onRestart}>最初からやり直す</button>}
        </div></details>}
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
      <section className="home-intro"><div>
        <p className="hero-kicker">WORK DESIGN WORKSPACE</p>
        <h1 className="hero-title">業務を見つけ、<br /><span>理解してから作り直す。</span></h1>
        <p className="hero-description">カレンダーから繰り返し業務の存在を見つけます。その予定だけで結論を出さず、あなたへの質問から目的・判断・制約を整理し、検証できる再設計仮説を作ります。</p>
        <div className="home-actions">
          {calendar.connected ? <>
            <button type="button" onClick={() => void onCalendarStart()} className="primary-button" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" />過去4週間を取得中</> : <>業務傾向を見る<ArrowRight size={20} /></>}</button>
            <button type="button" onClick={() => void onProjects()} className="secondary-button" disabled={busy}>保存した仮説</button>
            <button type="button" onClick={() => void onDisconnect()} className="text-button" disabled={busy}>接続を解除</button>
          </> : <button type="button" onClick={onConnect} className="primary-button" disabled={calendar.loading || !calendar.configured}>{calendar.loading ? '接続状態を確認中' : 'Google Calendarを接続'}<ArrowRight size={20} /></button>}
          <button type="button" onClick={onDemoStart} className="secondary-button">ワークスペースの例を見る</button>
        </div>
        <p className="calendar-note">{calendar.connected ? `${calendar.email ?? 'Googleアカウント'}と接続済み` : calendar.configured ? '予定の読み取り権限だけを使用します。' : 'Google OAuthのローカル設定が必要です。'}</p>
        {error && <p className="calendar-error" role="alert">{error}</p>}
        <ul className="service-notes" aria-label="データの取り扱い">
          <li>Calendarは業務について質問を始める索引として使います</li>
          <li>選択した業務の観測情報と回答だけを分析のため外部AIサービスへ送信します</li>
          <li>Calendar全件や会話全文は保存せず、あなたが保存した仮説だけを残します</li>
        </ul>
      </div></section>
      <section className="hero-example" aria-label="FlowShiftで扱う業務モデルの例">
        <header className="example-header"><p>業務モデル / 過去4週間</p><h2>朝会</h2><strong>20回・合計5時間</strong></header>
        <div className="domain-model-preview">
          <p>目的：チームが変化を把握し、対応を判断できる状態にする</p>
          <ul>
            <li><span><strong>予定共有</strong><small>各メンバーの予定を揃える</small></span><b className="treatment-system">System化候補</b></li>
            <li><span><strong>変更確認</strong><small>前回からの差分を確認する</small></span><b className="treatment-system">System化候補</b></li>
            <li><span><strong>困りごとの相談</strong><small>支援の要否を人が判断する</small></span><b className="treatment-human">Human・維持</b></li>
            <li><span><strong>新人教育</strong><small>必要な回と対象を確認する</small></span><b className="treatment-unknown">? 未確認</b></li>
          </ul>
        </div>
        <p className="example-note">AIは裏側で整理します。画面で扱うのは、事実・仮定・未確認を分けた業務モデルです。</p>
      </section>
    </main>
  )
}

function DashboardScreen({ email, groups, projects, busy, error, savedNotice, onRefresh, onDiscover, onOpenProject, onDisconnect }: {
  email?: string
  groups: WorkGroup[]
  projects: ImprovementProject[]
  busy: boolean
  error: string
  savedNotice: string
  onRefresh: () => Promise<void>
  onDiscover: (group?: WorkGroup) => void
  onOpenProject: (project: ImprovementProject) => void
  onDisconnect: () => Promise<void>
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const summary = useMemo(() => summarizeWorkGroups(groups), [groups])
  const categories = useMemo(() => Object.entries(groups.reduce<Record<string, number>>((result, group) => {
    result[group.category] = (result[group.category] ?? 0) + group.totalMinutes
    return result
  }, {})).sort((a, b) => b[1] - a[1]), [groups])
  const maxCategoryMinutes = Math.max(1, ...categories.map(([, minutes]) => minutes))
  const categoryGroups = selectedCategory ? groups.filter((group) => group.category === selectedCategory).sort((a, b) => b.totalMinutes - a.totalMinutes) : []
  const activeProjects = projects.filter((project) => !['REJECTED', 'ADOPTED'].includes(project.status))

  return <main className="dashboard-main">
    <section className="workspace-overview">
      <header className="dashboard-heading"><div><p>{email ? `${email} で利用中` : '業務ポートフォリオ'}</p><h1>現在の業務構造</h1><span>過去4週間の観測事実と、検証中の再設計仮説を同じ場所で確認できます。</span></div>{email && <button type="button" className="secondary-button" disabled={busy} onClick={() => void onRefresh()}>{busy ? '更新中' : 'Calendarを更新'}</button>}</header>
      <section className="dashboard-summary" aria-label="過去4週間の集計">
        <div><span>Calendar上の業務</span><strong>{formatMinutes(summary.calendarMinutes)}</strong></div>
        <div><span>繰り返し業務</span><strong>{formatMinutes(summary.recurringMinutes)}</strong></div>
        <div><span>会議</span><strong>{formatMinutes(summary.meetingMinutes)}</strong></div>
        <div><span>改善検討中</span><strong>{activeProjects.length}件</strong></div>
      </section>
    </section>
    {savedNotice && <p className="workspace-notice" role="status"><Check size={18} />{savedNotice}</p>}
    {error && <p className="calendar-error" role="alert">{error}</p>}
    <div className="dashboard-grid">
      <section className="work-breakdown"><header><h2>業務時間の内訳</h2><p>棒を選ぶと、業務まで詳しく見られます。</p></header>
        {categories.length ? <div className="category-bars">{categories.map(([category, minutes]) => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory((current) => current === category ? null : category)}><span>{category}</span><i><b style={{ width: `${Math.max(6, Math.round(minutes / maxCategoryMinutes * 100))}%` }} /></i><strong>{formatMinutes(minutes)}</strong></button>)}</div> : <p>Calendar上の業務を取得すると内訳が表示されます。</p>}
        {selectedCategory && <div className="category-drilldown"><h3>{selectedCategory}</h3>{categoryGroups.map((group) => <button key={group.id} type="button" onClick={() => onDiscover(group)}><span><strong>{group.title}</strong><small>{group.occurrences}回 / 4週間</small></span><span>{formatMinutes(group.totalMinutes)}</span><ArrowRight size={18} /></button>)}</div>}
      </section>
      <section className="active-projects"><header><h2>改善中の業務</h2><p>未確認事項と、次に進める検証です。</p></header>
        {activeProjects.length ? <div>{activeProjects.map((project) => {
          const unknownCount = project.proposal.analysis.criticalUnknowns.length
          const next = project.contextDirty ? '追加した情報を仮説へ反映' : project.proposal.analysis.criticalUnknowns[0]?.question ?? project.validations[0]?.title
          return <button key={project.id} type="button" className="project-card" onClick={() => onOpenProject(project)}><header><strong>{project.taskName}</strong><span className={`project-status status-${project.status.toLowerCase()}`}>{project.contextDirty ? '更新待ち' : projectStatusLabels[project.status]}</span></header><p className="project-hypothesis">{project.proposal.redesign.headline}</p><dl><div><dt>過去4週間</dt><dd>{project.businessContext.observed.occurrences}回・{formatMinutes(project.businessContext.observed.totalMinutes)}</dd></div><div><dt>{project.contextDirty ? '反映待ち' : '未確認'}</dt><dd>{project.contextDirty ? '業務情報を更新済み' : `${unknownCount}件`}</dd></div></dl>{next && <small>次にやること：{next}</small>}<span className="project-continue">続ける<ArrowRight size={18} /></span></button>
        })}</div> : <div className="empty-dashboard-projects"><p>改善中の業務はまだありません。</p><span>業務を選び、再設計仮説を保存するとここから続けられます。</span></div>}
      </section>
    </div>
    <div className="dashboard-actions"><button type="button" className="primary-button" onClick={() => onDiscover()}><Plus size={20} />新しい業務を見直す</button>{email && <button type="button" className="text-button" onClick={() => void onDisconnect()}>Google Calendarの接続を解除</button>}</div>
  </main>
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
        <div className="filter-buttons">{([['all', 'すべて'], ['repeat', '繰り返し'], ['meeting', '会議']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      </div>
      <div className={`work-browser ${showMobileDetail ? 'show-detail' : ''}`}>
        <section className="work-list" aria-labelledby="work-list-heading">
          <h2 id="work-list-heading">業務</h2>
          <div className="work-table-head"><span>業務</span><span>回数</span><span>合計時間</span></div>
          {visibleGroups.map((group) => <button key={group.id} type="button" className={`work-group-row${group.id === selectedGroup.id ? ' is-selected' : ''}`} onClick={() => { onSelectGroup(group); setShowMobileDetail(true) }}><span><strong>{group.title}</strong><small>{group.category}・平均{formatMinutes(group.averageMinutes)}</small></span><span>{group.occurrences}回</span><span>{formatMinutes(group.totalMinutes)}</span></button>)}
          {!visibleGroups.length && <p className="empty-work-list">この条件に合う業務はありません。</p>}
        </section>
        <aside className="selection-pane" aria-labelledby="selected-work-heading">
          <button type="button" className="mobile-list-back" onClick={() => setShowMobileDetail(false)}><ArrowLeft size={18} />一覧へ戻る</button>
          <p className="eyebrow">観測できたこと</p><h2 id="selected-work-heading">{selectedGroup.title}</h2><p className="work-meta">{selectedGroup.category}・{formatPeriod(selectedGroup)}</p>
          <dl className="evidence-list"><div><dt>回数</dt><dd>{selectedGroup.occurrences}回</dd></div><div><dt>合計時間</dt><dd>{formatMinutes(selectedGroup.totalMinutes)}</dd></div><div><dt>1回あたり</dt><dd>平均{formatMinutes(selectedGroup.averageMinutes)}</dd></div><div><dt>登録</dt><dd>{selectedGroup.evidence.recurring ? '同一の定例予定' : '同じタイトルの予定'}</dd></div></dl>
          <div className="observation-note"><CircleHelp size={20} /><p>この情報だけでは、目的や必要性は分かりません。次に、あなたが知っている業務の背景を確認します。</p></div>
          <button type="button" className="primary-button full-width" onClick={() => void selectWork()} disabled={preparing}>{preparing ? <><LoaderCircle className="animate-spin" />質問を準備中</> : <>この業務について答える<ArrowRight size={20} /></>}</button>
        </aside>
      </div>
    </main>
  )
}

function InterviewScreen({ group, plan, answers, setAnswers, onComplete }: {
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
      <ToolTitle title={group.title} summary={plan.phase === 'CORE' ? `Core Interview ${Math.min(answeredInPlan + 1, plan.questions.length)} / ${plan.questions.length}` : `追加確認 ${Math.min(answeredInPlan + 1, plan.questions.length)} / ${plan.questions.length}`} />
      <div className="observation-strip"><span>Calendarで確認</span><strong>{group.occurrences}回</strong><strong>合計{formatMinutes(group.totalMinutes)}</strong><strong>平均{formatMinutes(group.averageMinutes)}</strong></div>
      {answers.length > 0 && <details className="previous-answers"><summary>回答済みの内容（{answers.length}件）</summary><ol>{answers.map((answer) => <li key={`${answer.questionId}-${answer.answer}`}><strong>{answer.question}</strong><p>{answer.answer}</p></li>)}</ol></details>}
      {status === 'loading' ? <div className="request-state" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>{plan.phase === 'CORE' ? '暫定業務モデルを整理しています' : '追加情報を反映しています'}</strong><p>選んだ回答の意味を変えずに、確認済み・一部確認・未確認へ分けます。</p></div></div>
        : status === 'error' ? <div className="request-error" role="alert"><strong>回答内容を整理できませんでした</strong><p>{errorMessage}</p><button type="button" className="primary-button" onClick={() => void retry()}>再試行</button></div>
          : question ? <form className="interview-form" onSubmit={(event) => void submitAnswer(event)}>
            <div className="question-block"><h2 id="question-heading">{question.prompt}</h2><p id="question-hint">{question.hint}</p></div>
            {(question.selection ?? 'SINGLE') === 'MULTIPLE' && <p className="multi-select-note">複数選択できます</p>}
            <fieldset className="answer-options" aria-labelledby="question-heading" aria-describedby="question-hint"><legend className="sr-only">回答候補</legend>{question.options.map((option) => { const selected = selectedOptionIds.includes(option.id) && !customMode; return <label key={option.id} className={selected ? 'is-selected' : ''}><input type={(question.selection ?? 'SINGLE') === 'MULTIPLE' ? 'checkbox' : 'radio'} name={question.id} checked={selected} onChange={() => toggleOption(option)} /><span>{option.label}</span>{selected && <Check size={18} aria-hidden="true" />}</label> })}</fieldset>
            <button type="button" className="text-button custom-answer-toggle" onClick={() => { setCustomMode(true); setSelectedOptionIds([]) }}>選択肢にない内容を入力</button>
            {customMode && <textarea className="answer-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} maxLength={2000} autoFocus placeholder="分かる範囲で入力してください" />}
            <button type="submit" className="primary-button full-width" disabled={customMode ? !draft.trim() : !selectedOptionIds.length}>{answeredInPlan + 1 === plan.questions.length ? '暫定モデルを確認' : '次へ'}<ArrowRight size={20} /></button>
          </form> : null}
    </main>
  )
}

function contextStateLabel(state: ContextState): string {
  return state === 'CONFIRMED' ? '✓ 確認済み' : state === 'PARTIAL' ? '△ 一部確認' : '? 未確認'
}

function ContextCompleteness({ task, onAdd }: { task: BusinessTask; onAdd?: (key: keyof BusinessTask['contextStatus']) => void }) {
  return <section className="context-completeness" aria-labelledby="context-heading"><h2 id="context-heading">業務理解</h2><dl>{(Object.entries(task.contextStatus) as [keyof BusinessTask['contextStatus'], ContextState][]).map(([key, state]) => <div key={key}><dt>{contextLabels[key]}</dt><dd className={`context-${state.toLowerCase()}`}>{contextStateLabel(state)}{state !== 'CONFIRMED' && onAdd && <button type="button" className="inline-add" onClick={() => onAdd(key)}>情報を追加</button>}</dd></div>)}</dl></section>
}

function deliveryLabels(task: BusinessTask) {
  return {
    sharing: task.deliveryModel.sharingMode === 'ASYNC_POSSIBLE' ? '非同期化できる' : task.deliveryModel.sharingMode === 'SYNC_REQUIRED' ? '同期共有が必要' : '未確認',
    synchronous: task.deliveryModel.synchronousRole === 'SEPARATE_REQUIRED' ? '別の相談時間が必要' : task.deliveryModel.synchronousRole === 'CURRENT_FORMAT_REQUIRED' ? '現在形式の中で必要' : task.deliveryModel.synchronousRole === 'NONE' ? '確認済みの同期役割なし' : '未確認',
    currentFormat: task.deliveryModel.currentFormat === 'REQUIRED' ? '必要' : task.deliveryModel.currentFormat === 'NOT_REQUIRED' ? '不要' : '必要か未確認',
  }
}

function SummaryItem({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><dt>{title}</dt><dd>{children}</dd></div>
}

const componentScopeLabels: Record<WorkComponent['scope'], string> = {
  ALL: '通常時', PARTIAL: '一部のみ', CONDITIONAL: '条件付き', UNKNOWN: '範囲未確認',
}

function WorkDecomposition({ task, design, onEdit }: { task: BusinessTask; design?: BusinessDesign; onEdit?: () => void }) {
  const components = useMemo(() => decomposeBusinessTask(task), [task])
  const [selectedId, setSelectedId] = useState(components[0]?.id ?? '')
  const selected = components.find((component) => component.id === selectedId) ?? components[0]
  const evidence = selected ? task.answerEvidence.filter((answer) => selected.sourceQuestionIds.includes(answer.questionId)) : []
  const treatment = selected && design ? proposedTreatment(selected, design) : []

  useEffect(() => {
    if (!components.some((component) => component.id === selectedId)) setSelectedId(components[0]?.id ?? '')
  }, [components, selectedId])

  return <section className="work-decomposition" aria-label={`${task.name}の業務分解`}>
    <header><div><h2>業務の分解</h2><p>文章ではなく、目的を支える機能として整理しています。要素を選ぶと根拠と仮説上の扱いを確認できます。</p></div>{onEdit && <button type="button" onClick={onEdit}>分け方を修正</button>}</header>
    <div className="decomposition-root"><strong>{task.name}</strong><span>{task.purpose}</span></div>
    {components.length ? <>
      <div className="decomposition-connector" aria-hidden="true" />
      <div className="decomposition-nodes">{components.map((component) => <button key={component.id} type="button" aria-pressed={selected?.id === component.id} className={`component-${component.kind.toLowerCase()}`} onClick={() => setSelectedId(component.id)}><span>{component.label}</span><strong>{component.items[0]}</strong><small>{contextStateLabel(component.state)}・{componentScopeLabels[component.scope]}</small></button>)}</div>
      {selected && <div className={`component-detail component-${selected.kind.toLowerCase()}`} aria-live="polite">
        <div><span>{selected.label}</span><h3>{selected.items[0]}</h3><p>{contextStateLabel(selected.state)}・{componentScopeLabels[selected.scope]}{selected.scopeDetail ? `（${selected.scopeDetail}）` : ''}</p></div>
        <section><h4>現在の構成</h4><ul>{selected.items.map((item) => <li key={item}>{item}</li>)}</ul></section>
        {design && <section><h4>仮説上の扱い</h4>{treatment.length ? <ul>{treatment.map((item) => <li key={item}>{item}</li>)}</ul> : <p>この機能の扱いは、まだ仮説内で明確になっていません。</p>}</section>}
        <section><h4>回答の根拠</h4>{evidence.length ? <ul>{evidence.map((answer) => <li key={answer.questionId}>{answer.answer}</li>)}</ul> : <p>直接対応する回答はなく、整理済みの業務モデルから表示しています。</p>}</section>
      </div>}
    </> : <div className="decomposition-empty"><p>現在の工程や役割を確認すると、ここに分解結果が表示されます。</p>{onEdit && <button type="button" onClick={onEdit}>工程を追加する</button>}</div>}
  </section>
}

function ReviewScreen({ task, setTask, followUpCount, onFollowUp, onAddContext, onAnalyze }: {
  task: BusinessTask
  setTask: (task: BusinessTask) => void
  followUpCount: number
  onFollowUp: () => void
  onAddContext: (key: keyof BusinessTask['contextStatus']) => void
  onAnalyze: (task: BusinessTask) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
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
  async function analyze() {
    setStatus('loading'); setErrorMessage('')
    try { await onAnalyze(task) } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '業務モデルを分析できませんでした。')
    }
  }
  function openEditing() {
    setEditing(true)
    window.setTimeout(() => document.querySelector('.advanced-edit-groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  return <main className="tool-main">
    <ToolTitle title="暫定業務モデル" summary="まず回答の要点だけを確認します。未確認事項が結論に影響する場合だけ、追加で質問します。" />
    <section className="observed-facts"><h2>Calendarで観測した事実</h2><div><span>{task.observed.occurrences}回 / 4週間</span><span>合計{formatMinutes(task.observed.totalMinutes)}</span><span>1回平均{formatMinutes(task.observed.averageMinutes)}</span></div></section>
    <WorkDecomposition task={task} onEdit={openEditing} />
    <div className="review-layout">
      <div>
        <dl className="model-summary">
          <SummaryItem title="業務の目的">{task.purpose}</SummaryItem>
          <SummaryItem title="人が判断すること">{task.decisionPoints.length ? <ul>{task.decisionPoints.map((item) => <li key={item}>{item}</li>)}</ul> : '未確認'}</SummaryItem>
           <SummaryItem title="確認できている役割">{task.businessRoleDetails.some((role) => role.present) ? <ul>{task.businessRoleDetails.filter((role) => role.present).map((role) => <li key={role.name}>{role.name}{role.scope !== 'ALL' && <small> — {role.scopeDetail ?? '条件付き'}</small>}</li>)}</ul> : '予定共有以外の役割は未確認'}</SummaryItem>
           <SummaryItem title="共有方法と同期の役割">{(() => { const labels = deliveryLabels(task); return <dl className="delivery-summary"><div><dt>予定共有</dt><dd>{labels.sharing}</dd></div><div><dt>相談・調整</dt><dd>{labels.synchronous}</dd></div><div><dt>現在の形式</dt><dd>{labels.currentFormat}</dd></div></dl> })()}<p>{task.outputRequirementReason}</p></SummaryItem>
          <SummaryItem title="まだ確認したいこと">{unknownLabels.length ? <ul>{unknownLabels.map((item) => <li key={item}>{item}</li>)}</ul> : '再設計判断に影響する未確認事項はありません'}</SummaryItem>
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
    <div className="bottom-action">{followUpCount > 0 ? <button type="button" className="primary-button" onClick={onFollowUp}>判断に必要な{followUpCount}件を追加確認<ArrowRight size={20} /></button> : <button type="button" className="primary-button" onClick={() => void analyze()} disabled={status === 'loading'}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />仮説を整理中</> : <>この内容で仮説を作る<ArrowRight size={20} /></>}</button>}</div>
  </main>
}

function EvidenceColumn({ title, items, tone, empty }: { title: string; items: string[]; tone: string; empty: string }) {
  return <section className={`evidence-column ${tone}`}><h3>{title}</h3>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}</section>
}

function workflowSteps(design: BusinessDesign): WorkflowStep[] {
  return design.redesign.workflow.map((step, index) => ({ id: `${index}-${step.label}`, ...step }))
}

function RedesignScreen({ design, connected, savedProject, onSave, onOpenSaved }: {
  design: BusinessDesign
  connected: boolean
  savedProject: ImprovementProject | null
  onSave: () => Promise<void>
  onOpenSaved: () => void
}) {
  const [showValidation, setShowValidation] = useState(false)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const validationRef = useRef<HTMLElement>(null)
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
    try { await action(); setStatus('idle') } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '処理を完了できませんでした。')
    }
  }

  function toggleValidation() {
    if (showValidation) { setShowValidation(false); return }
    setShowValidation(true)
    window.setTimeout(() => validationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  return <main className="tool-main">
    <ToolTitle title="再設計仮説" summary="答えではなく、前提を確認しながら人が育てる仮説です。" />
    <section className="result-overview">
      <div className={`judgement ${needsContext ? 'needs-context' : ''}`}><strong>{needsContext ? '判断保留' : '検証候補'}</strong><p>{design.analysis.conclusion}</p></div>
      <div className="result-headline"><h2>{design.redesign.headline}</h2><p>{design.redesign.hypothesis}</p></div>
      <div className="result-compare">
        <section><h3>現在</h3><strong>{metrics.routineHumanWorkBefore}</strong><p>{metrics.scheduledOutputBefore}</p><p>{metrics.detectionBefore}</p></section>
        <section><h3>仮説</h3><strong>{metrics.routineHumanWorkAfter}</strong><p>{metrics.scheduledOutputAfter}</p><p>{metrics.detectionAfter}</p></section>
      </div>
      <div className="result-conditions">
        <section><h3>成立条件</h3>{design.analysis.assumptions.length ? <ul>{design.analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>追加の仮定はありません。</p>}</section>
        <section><h3>未確認</h3>{design.analysis.unknowns.length ? <ul>{design.analysis.unknowns.map((item) => <li key={item}>{item}</li>)}</ul> : <p>重大な未確認事項はありません。</p>}</section>
      </div>
      <div className="result-actions"><button type="button" className="secondary-button" onClick={toggleValidation}>{showValidation ? '検証方法を閉じる' : 'この仮説を検証する'}<ArrowRight size={20} /></button>{!connected ? <span>保存するにはGoogle Calendarへ接続してください。</span> : savedProject ? <button type="button" className="primary-button" onClick={onOpenSaved}>保存した業務を開く<ArrowRight size={20} /></button> : <button type="button" className="primary-button" disabled={status === 'loading'} onClick={() => void run(onSave)}>{status === 'loading' ? <><LoaderCircle className="animate-spin" />保存中</> : '仮説を保存してワークスペースへ'}</button>}</div>
      {status === 'error' && <p className="calendar-error" role="alert">{errorMessage}</p>}
    </section>

    <WorkDecomposition task={design.businessTask} design={design} />

    <details className="report-section"><summary>現在と仮説の比較</summary><section className="comparison-section"><div className="comparison-table"><div className="comparison-head"><span></span><strong>現在</strong><strong>仮説</strong></div>{comparisons.map(([label, before, after]) => <div key={label}><span>{label}</span><p>{before}</p><p>{after}</p></div>)}</div><p className="comparison-assumption">前提：{design.redesign.impact.assumption}</p></section></details>
    <details className="report-section"><summary>工程と役割</summary><section className="workflow-section"><h2>現在の工程</h2>{design.businessTask.steps.length ? <ol className="plain-workflow">{design.businessTask.steps.map((step) => <li key={step}>{step}</li>)}</ol> : <p>現在の工程は未確認です。</p>}<h2>仮説上の工程</h2><WorkflowDiagram steps={workflowSteps(design)} ariaLabel="再設計仮説の工程" /></section><section className="role-section"><h2>担当する役割</h2><div className="role-grid"><div><h3>システム</h3><ul>{design.redesign.roles.system.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>AI</h3><ul>{design.redesign.roles.ai.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>人</h3><ul>{design.redesign.roles.human.map((item) => <li key={item}>{item}</li>)}</ul></div></div></section></details>
    <details className="report-section"><summary>根拠と不確実性</summary><div className="evidence-grid"><EvidenceColumn title="確認できていること" items={design.analysis.facts} tone="facts" empty="確認済み情報はありません" /><EvidenceColumn title="成立のための仮定" items={design.analysis.assumptions} tone="assumptions" empty="仮定はありません" /><EvidenceColumn title="まだ分からないこと" items={design.analysis.unknowns} tone="unknowns" empty="重大な未確認事項はありません" /></div></details>

    {showValidation && <section ref={validationRef} className="validation-section"><header><h2>検証方法</h2><p>{design.validationPlan.summary}</p></header>{design.validationPlan.items.map((item) => <article key={`${item.type}-${item.title}`}><span>{validationLabels[item.type]}</span><h3>{item.title}</h3><p>{item.description}</p><ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></article>)}</section>}
  </main>
}

function ProjectsScreen({ projects, onOpen }: { projects: ImprovementProject[]; onOpen: (project: ImprovementProject) => void }) {
  return <main className="tool-main"><ToolTitle title="保存した仮説" summary="確認・承認した業務モデルと検証計画だけを保存しています。" />{projects.length ? <div className="project-list">{projects.map((project) => <button key={project.id} type="button" onClick={() => onOpen(project)}><span><strong>{project.taskName}</strong><small>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(project.updatedAt))}</small></span><span className={`project-status status-${project.status.toLowerCase()}`}>{projectStatusLabels[project.status]}</span><ArrowRight size={20} /></button>)}</div> : <div className="empty-projects"><h2>保存した仮説はありません</h2><p>再設計案を正解としてではなく、検証する仮説として保存できます。</p></div>}</main>
}

function ProjectDetailScreen({ project, onAddContext, onUpdateHypothesis, onStatus }: {
  project: ImprovementProject
  onAddContext: (id: string, dimension: ContextDimension, question: string, detail: string) => Promise<void>
  onUpdateHypothesis: () => Promise<void>
  onStatus: (status: ProjectStatus) => Promise<void>
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const resolvedIds = new Set(project.businessContext.answerEvidence.filter((answer) => answer.questionId.startsWith('project-')).map((answer) => answer.questionId.slice('project-'.length)))
  const unknowns = project.proposal.analysis.criticalUnknowns.filter((unknown) => !resolvedIds.has(unknown.id))
  const roleDetails = project.businessContext.businessRoleDetails.filter((role) => role.present)

  async function run(action: () => Promise<void>) {
    setStatus('loading'); setErrorMessage('')
    try { await action(); setStatus('idle') } catch (error) {
      setStatus('error'); setErrorMessage(error instanceof Error ? error.message : '更新できませんでした。')
    }
  }

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
      <section className="project-hypothesis-panel"><h2>再設計仮説</h2><h3>{project.proposal.redesign.headline}</h3><p>{project.hypothesis}</p><small>AIの提案ではなく、確認と検証を続けるための仮説です。</small></section>
    </div>
    <section className="project-unknowns"><header><h2>未確認事項</h2><p>現実の業務で分かったことを追加します。保存後、仮説の更新は別操作で行います。</p></header>
      {unknowns.length ? unknowns.map((unknown) => <article key={unknown.id}><div><strong>{unknown.question}</strong><p>{unknown.reason}</p></div><form onSubmit={(event) => { event.preventDefault(); const detail = drafts[unknown.id]?.trim(); if (detail) void run(() => onAddContext(unknown.id, unknown.dimension, unknown.question, detail)) }}><input value={drafts[unknown.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [unknown.id]: event.target.value }))} placeholder="確認した具体的な内容" /><button type="submit" disabled={status === 'loading' || !drafts[unknown.id]?.trim()}>業務情報へ反映</button></form></article>) : <p className="all-resolved"><Check size={18} />表示中の未確認事項はすべて更新済みです。</p>}
    </section>
    <section className="project-validations"><header><h2>検証</h2><p>{project.proposal.validationPlan.summary}</p></header>{project.validations.map((item) => <article key={`${item.type}-${item.title}`}><span>{validationLabels[item.type]}</span><div><strong>{item.title}</strong><p>{item.description}</p><ul>{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></div></article>)}</section>
    <section className="project-history"><h2>履歴</h2>{project.history.length ? <ol>{[...project.history].reverse().map((item) => <li key={item.id}><time>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.createdAt))}</time><span>{item.summary}</span></li>)}</ol> : <p>履歴はまだありません。</p>}</section>
    <section className="project-decision"><h2>この仮説の判断</h2><div className="decision-buttons">{(['VALIDATING', 'ADOPTED', 'ON_HOLD', 'REJECTED'] as const).map((value) => <button key={value} type="button" disabled={status === 'loading' || project.status === value} onClick={() => void run(() => onStatus(value))}>{projectStatusLabels[value]}</button>)}</div></section>
  </main>
}

function questionForContext(key: keyof BusinessTask['contextStatus']): InterviewPlan {
  const dimensionByKey: Record<keyof BusinessTask['contextStatus'], ContextDimension> = {
    purpose: 'purpose', stakeholders: 'stakeholders', roles: 'roles', process: 'process', decisions: 'decision', exceptions: 'exceptions', constraints: 'constraints', dependencies: 'dependencies', risks: 'risks', output: 'outputNeed',
  }
  const dimension = dimensionByKey[key]
  const base = { id: `context-${key}`, dimension, phase: 'FOLLOW_UP' as const }
  const definitions: Record<keyof BusinessTask['contextStatus'], Omit<InterviewPlan['questions'][number], keyof typeof base>> = {
    purpose: {
      prompt: 'この業務によって、誰が何を把握・判断できる状態にしたいですか？', hint: '会議や成果物ではなく、達成したい状態を選びます。',
      options: [
        { id: 'purpose-team', label: 'チームが変化を把握し、対応を判断できる', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'purpose-lead', label: '責任者が状況を把握し、支援を判断できる', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'purpose-coordinate', label: '関係者が情報を揃え、調整を判断できる', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'purpose-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    stakeholders: {
      prompt: 'この業務に参加する人と、結果を使う人を選んでください。', hint: '具体的な対象を複数選べます。存在だけでは確認済みにしません。', selection: 'MULTIPLE',
      options: [
        { id: 'stakeholder-team', label: 'チームメンバー', meaning: { roles: [], stakeholders: ['チームメンバー'], contextState: 'CONFIRMED' } },
        { id: 'stakeholder-lead', label: 'チーム責任者', meaning: { roles: [], stakeholders: ['チーム責任者'], contextState: 'CONFIRMED' } },
        { id: 'stakeholder-department', label: '他部署', meaning: { roles: [], stakeholders: ['他部署'], contextState: 'CONFIRMED' } },
        { id: 'stakeholder-customer', label: '顧客', meaning: { roles: [], stakeholders: ['顧客'], contextState: 'CONFIRMED' } },
        { id: 'stakeholder-unknown', label: '具体的な対象はまだ分からない', exclusive: true, meaning: { roles: [], stakeholders: [], contextState: 'UNKNOWN' } },
      ],
    },
    roles: {
      prompt: '予定共有以外に、この業務が担っている役割を選んでください。', hint: '一部にだけ必要な役割は、その範囲も含めて保存します。', selection: 'MULTIPLE',
      options: [
        { id: 'role-consult', label: '困りごとの相談・担当調整', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'role-training', label: '新人教育（新人が参加する回のみ）', meaning: { roles: [{ name: '新人教育', present: true, scope: 'PARTIAL', scopeDetail: '新人が参加する回のみ' }], contextState: 'PARTIAL' } },
        { id: 'role-relationship', label: '関係づくり（一部の参加者のみ）', meaning: { roles: [{ name: '関係づくり', present: true, scope: 'PARTIAL', scopeDetail: '一部の参加者のみ' }], contextState: 'PARTIAL' } },
        { id: 'role-none', label: '予定共有以外の役割はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'role-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    process: {
      prompt: '普段、この業務で行っていることを選んでください。', hint: '現在の工程を複数選べます。', selection: 'MULTIPLE',
      options: [
        { id: 'process-share', label: '情報・予定の共有', meaning: { roles: [], processItems: ['情報・予定の共有'], contextState: 'CONFIRMED' } },
        { id: 'process-change', label: '変更点の確認', meaning: { roles: [], processItems: ['変更点の確認'], contextState: 'CONFIRMED' } },
        { id: 'process-consult', label: '困りごとの相談', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], processItems: ['困りごとの相談'], contextState: 'CONFIRMED' } },
        { id: 'process-adjust', label: '担当・時間の調整', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], processItems: ['担当・時間の調整'], contextState: 'CONFIRMED' } },
        { id: 'process-approve', label: '承認・決裁', meaning: { roles: [], processItems: ['承認・決裁'], contextState: 'CONFIRMED' } },
        { id: 'process-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], processItems: [], contextState: 'UNKNOWN' } },
      ],
    },
    decisions: {
      prompt: 'この業務で、人が最終的に判断していることは何ですか？', hint: '最も近いものを選ぶか、具体的な内容を入力します。',
      options: [
        { id: 'decision-priority', label: '対応の要否や優先順位', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'decision-assignment', label: '担当者や実施時間の調整', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'decision-approval', label: '承認・差し戻し', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'decision-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    exceptions: {
      prompt: '通常と違う対応が必要になるのは、どんな場合ですか？', hint: '仮説を安全に運用するための例外を確認します。',
      options: [
        { id: 'exception-urgent', label: '緊急・重大な変更があった場合', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'exception-missing', label: '情報の欠損や矛盾がある場合', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'exception-special', label: '特定の顧客・案件だけ別対応', meaning: { roles: [], contextState: 'PARTIAL' } },
        { id: 'exception-none', label: '確認できている例外はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'exception-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    constraints: {
      prompt: '形式を変えるときに守る必要がある条件はありますか？', hint: '制度・権限・セキュリティなどを確認します。',
      options: [
        { id: 'constraint-report', label: '定期報告・監査の義務がある', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'constraint-security', label: '共有範囲や機密情報に制限がある', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'constraint-system', label: '利用システム・権限に制限がある', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'constraint-none', label: '確認できている制約はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'constraint-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    dependencies: {
      prompt: 'この業務を変えると影響を受ける相手を選んでください。', hint: '影響先が具体的に分かるものを選びます。', selection: 'MULTIPLE',
      options: [
        { id: 'dependency-team', label: 'チーム内の別業務', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'dependency-department', label: '他部署', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'dependency-customer', label: '顧客・取引先', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'dependency-none', label: '確認できている影響先はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'dependency-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    risks: {
      prompt: 'この業務を変えるとき、最も避けたいことは何ですか？', hint: '検証時の停止条件に使います。',
      options: [
        { id: 'risk-miss', label: '重要な変更・異常の見逃し', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'risk-consult', label: '相談や支援の機会が減ること', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'risk-responsibility', label: '責任所在が曖昧になること', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'risk-unknown', label: 'まだ整理できていない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    output: {
      prompt: '現在の会議・成果物は、目的達成にどの程度必要ですか？', hint: '共有方法と、同期で話す役割を分けて選びます。',
      options: [
        { id: 'context-async', label: '非同期の共有だけで目的を達成できる', meaning: { outputNeed: 'ASYNC_OK', roles: [], contextState: 'CONFIRMED' } },
        { id: 'context-sync', label: '共有は非同期化できるが、相談時間は別途必要', meaning: { outputNeed: 'SYNC_DISCUSSION_STILL_REQUIRED', roles: [{ name: '同期での相談・調整', present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'context-current', label: '現在の形式そのものを残す必要がある', meaning: { outputNeed: 'CURRENT_FORMAT_REQUIRED', roles: [], contextState: 'CONFIRMED' } },
        { id: 'context-unknown', label: 'まだ確認できていない', exclusive: true, meaning: { outputNeed: 'UNKNOWN', roles: [], contextState: 'UNKNOWN' } },
      ],
    },
  }
  return { phase: 'FOLLOW_UP', questions: [{ ...base, ...definitions[key] }] }
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
  const [followUpPlan, setFollowUpPlan] = useState<InterviewPlan>({ phase: 'FOLLOW_UP', questions: [] })
  const [answers, setAnswers] = useState<InterviewAnswer[]>([])
  const [task, setTask] = useState<BusinessTask>(initialBusinessTask)
  const [design, setDesign] = useState<BusinessDesign>(demoDesign)
  const [projects, setProjects] = useState<ImprovementProject[]>([])
  const [savedProject, setSavedProject] = useState<ImprovementProject | null>(null)
  const [openedFromProjects, setOpenedFromProjects] = useState(false)
  const [workspaceNotice, setWorkspaceNotice] = useState('')
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.has('calendar')) window.history.replaceState({}, '', window.location.pathname)
    void refreshCalendarStatus(query.get('calendar') === 'error')
  }, [])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [screen])

  async function refreshCalendarStatus(callbackError = false) {
    setCalendar((current) => ({ ...current, loading: true }))
    if (callbackError) setCalendarError('Google Calendarとの接続を完了できませんでした。設定と権限を確認してください。')
    try {
      const next = await getGoogleCalendarStatus()
      setCalendar({ ...next, loading: false })
      if (next.connected) await loadWorkspace()
    } catch (error) {
      setCalendar((current) => ({ ...current, loading: false }))
      setCalendarError(error instanceof Error ? error.message : '接続状態を確認できませんでした。')
    }
  }

  async function loadWorkspace() {
    setCalendarBusy(true); setCalendarError('')
    try {
      const [calendarResult, savedProjects] = await Promise.all([getGoogleCalendarEvents(), getImprovementProjects()])
      const nextGroups = groupCalendarEvents(calendarResult.events)
      setGroups(nextGroups)
      if (nextGroups.length) setSelectedGroup(nextGroups.find(isDiscoveryCandidate) ?? nextGroups[0])
      setProjects(savedProjects)
      setSource('google')
      setScreen('dashboard')
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : 'ワークスペースを読み込めませんでした。')
    } finally { setCalendarBusy(false) }
  }

  function clearCurrentFlow() {
    setPlan(demoInterviewPlan); setFollowUpPlan({ phase: 'FOLLOW_UP', questions: [] }); setAnswers([])
    setTask(initialBusinessTask); setDesign(demoDesign); setSavedProject(null); setOpenedFromProjects(false); setCalendarError('')
  }

  function beginDiscovery(group?: WorkGroup) {
    if (calendar.connected && !group && !groups.length) {
      setCalendarError('過去28日間に、時間のある予定が見つかりませんでした。')
      return
    }
    clearCurrentFlow()
    if (group) setSelectedGroup(group)
    else if (groups.length) setSelectedGroup(groups.find(isDiscoveryCandidate) ?? groups[0])
    setSource(calendar.connected ? 'google' : 'demo')
    setScreen('discovery')
  }

  function restartWithConfirmation() {
    setShowRestartConfirm(true)
  }

  function startDemo() {
    clearCurrentFlow(); setGroups(demoWorkGroups); setSelectedGroup(demoWorkGroups[0]); setProjects([demoProject]); setSource('demo'); setWorkspaceNotice('デモ用の業務と仮説を表示しています。'); setScreen('dashboard')
  }

  async function startFromCalendar() {
    setCalendarBusy(true); setCalendarError('')
    try {
      const result = await getGoogleCalendarEvents()
      const nextGroups = groupCalendarEvents(result.events)
      if (!nextGroups.length) throw new Error('過去28日間に、時間のある予定が見つかりませんでした。')
      const first = nextGroups.find(isDiscoveryCandidate) ?? nextGroups[0]
      setGroups(nextGroups); setSelectedGroup(first); setSource('google'); clearCurrentFlow(); setSource('google'); setScreen('discovery')
    } catch (error) {
      if ((error as { code?: string }).code === 'authentication_required' || (error as { code?: string }).code === 'google_not_connected') await refreshCalendarStatus()
      setCalendarError(error instanceof Error ? error.message : '予定を取得できませんでした。')
    } finally { setCalendarBusy(false) }
  }

  async function startInterview() {
    const nextPlan = source === 'demo' ? demoInterviewPlan : await generateInterviewPlan(selectedGroup)
    setPlan(nextPlan); setFollowUpPlan({ phase: 'FOLLOW_UP', questions: [] }); setAnswers([]); setScreen('interview')
  }

  async function completeInterview(nextAnswers: InterviewAnswer[]) {
    const nextTask = source === 'demo' ? createDeterministicTask(observationFromDemoGroup(selectedGroup), nextAnswers) : await extractBusinessTask(nextAnswers, selectedGroup)
    setTask(nextTask)
    if (plan.phase === 'CORE') {
      const nextFollowUp = source === 'demo' ? createDemoFollowUpPlan(nextTask) : await generateFollowUpPlan(nextTask)
      setFollowUpPlan(nextFollowUp)
    } else {
      const answeredIds = new Set(nextAnswers.map((answer) => answer.questionId))
      setFollowUpPlan((current) => ({ phase: 'FOLLOW_UP', questions: current.questions.filter((question) => !answeredIds.has(question.id)) }))
    }
    setScreen('review')
  }

  function startFollowUp(nextPlan = followUpPlan) {
    const questionIds = new Set(nextPlan.questions.map((question) => question.id))
    setAnswers((current) => current.filter((answer) => !questionIds.has(answer.questionId)))
    setPlan(nextPlan); setScreen('interview')
  }

  function addContext(key: keyof BusinessTask['contextStatus']) {
    const matching = followUpPlan.questions.filter((question) => question.dimension === ({ decisions: 'decision', output: 'outputNeed' } as Record<string, string>)[key] || question.dimension === key)
    startFollowUp(matching.length ? { phase: 'FOLLOW_UP', questions: matching } : questionForContext(key))
  }

  async function completeReview(approvedTask: BusinessTask) {
    const nextDesign = source === 'demo' ? createDemoDesign(approvedTask) : await generateBusinessDesign(approvedTask)
    setDesign(nextDesign); setSavedProject(null); setOpenedFromProjects(false); setScreen('redesign')
  }

  async function showProjects() {
    setCalendarBusy(true); setCalendarError('')
    try { setProjects(await getImprovementProjects()); setScreen('projects') } catch (error) { setCalendarError(error instanceof Error ? error.message : '保存した仮説を取得できませんでした。') } finally { setCalendarBusy(false) }
  }

  async function saveProject() {
    const project = await createImprovementProject(design)
    setSavedProject(project); setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)])
    setWorkspaceNotice(`${project.taskName}を、検証する仮説として保存しました。`)
    setScreen('dashboard')
  }

  async function updateProjectStatus(status: ProjectStatus) {
    if (!savedProject) return
    const project = source === 'demo' ? {
      ...savedProject,
      status,
      updatedAt: new Date().toISOString(),
      history: [...savedProject.history, { id: crypto.randomUUID(), type: 'STATUS_UPDATED' as const, summary: `状態を「${projectStatusLabels[status]}」へ変更`, createdAt: new Date().toISOString() }],
    } : await updateImprovementProjectStatus(savedProject.id, status)
    setSavedProject(project); setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  async function addProjectContext(id: string, dimension: ContextDimension, question: string, detail: string) {
    if (!savedProject) return
    const questionId = `project-${id}`
    const baseTask = savedProject.businessContext
    const answer: InterviewAnswer = { questionId, dimension, question, answer: detail.trim(), source: 'FREE_TEXT' }
    const nextAnswers = [...baseTask.answerEvidence.filter((item) => item.questionId !== questionId), answer]
    const nextTask = source === 'demo' ? createDeterministicTask(baseTask.observed, nextAnswers) : await extractBusinessTaskFromObservation(nextAnswers, baseTask.observed)
    const summary = `「${question}」について情報を追加`
    const project = source === 'demo' ? {
      ...savedProject,
      taskName: nextTask.name,
      businessContext: nextTask,
      contextDirty: true,
      updatedAt: new Date().toISOString(),
      history: [...savedProject.history, { id: crypto.randomUUID(), type: 'CONTEXT_UPDATED' as const, summary, createdAt: new Date().toISOString() }],
    } : await updateImprovementProjectContext(savedProject.id, nextTask, summary)
    setAnswers(nextAnswers); setTask(nextTask); setSavedProject(project)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  async function refreshProjectHypothesis() {
    if (!savedProject) return
    const nextDesign = source === 'demo' ? createDemoDesign(savedProject.businessContext) : await generateBusinessDesign(savedProject.businessContext)
    const project = source === 'demo' ? {
      ...savedProject,
      businessContext: nextDesign.businessTask,
      proposal: nextDesign,
      hypothesis: nextDesign.redesign.hypothesis,
      validations: nextDesign.validationPlan.items,
      contextDirty: false,
      updatedAt: new Date().toISOString(),
      history: [...savedProject.history, { id: crypto.randomUUID(), type: 'HYPOTHESIS_UPDATED' as const, summary: '追加した業務情報を反映して仮説を更新', createdAt: new Date().toISOString() }],
    } : await updateImprovementProject(savedProject.id, nextDesign, '追加した業務情報を反映して仮説を更新')
    setTask(project.businessContext); setDesign(project.proposal); setSavedProject(project)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  function openProject(project: ImprovementProject) {
    setSource(project.id === demoProject.id ? 'demo' : 'google'); setAnswers(project.businessContext.answerEvidence); setTask(project.businessContext); setDesign(project.proposal); setSavedProject(project); setOpenedFromProjects(true); setScreen('project')
  }

  async function disconnect() {
    setCalendarBusy(true); setCalendarError('')
    try { await disconnectGoogleCalendar(); setCalendar({ configured: calendar.configured, connected: false, loading: false }); clearCurrentFlow(); setGroups(demoWorkGroups); setScreen('home') } catch (error) { setCalendarError(error instanceof Error ? error.message : '接続を解除できませんでした。') } finally { setCalendarBusy(false) }
  }

  function workspaceScreen(): Screen {
    return calendar.connected || source === 'demo' && projects.some((project) => project.id === demoProject.id) ? 'dashboard' : 'home'
  }

  function goBack() {
    if (screen === 'discovery' || screen === 'projects' || screen === 'project') setScreen(workspaceScreen())
    else if (screen === 'interview') setScreen(plan.phase === 'CORE' ? 'discovery' : 'review')
    else if (screen === 'review') setScreen('discovery')
    else if (screen === 'redesign') setScreen(openedFromProjects ? 'project' : 'review')
    else setScreen(workspaceScreen())
  }

  return <div className="app-shell">
    <AppHeader screen={screen} onBack={goBack} onHome={() => setScreen(workspaceScreen())} onRestart={restartWithConfirmation} />
    {screen === 'home' && <HomeScreen calendar={calendar} busy={calendarBusy} error={calendarError} onConnect={() => { window.location.href = '/api/google/connect' }} onCalendarStart={startFromCalendar} onDisconnect={disconnect} onDemoStart={startDemo} onProjects={showProjects} />}
    {screen === 'dashboard' && <DashboardScreen email={calendar.email} groups={groups} projects={projects} busy={calendarBusy} error={calendarError} savedNotice={workspaceNotice} onRefresh={loadWorkspace} onDiscover={beginDiscovery} onOpenProject={openProject} onDisconnect={disconnect} />}
    {screen === 'discovery' && <DiscoveryScreen groups={groups} selectedGroup={selectedGroup} onSelectGroup={setSelectedGroup} onSelect={startInterview} />}
    {screen === 'interview' && <InterviewScreen group={selectedGroup} plan={plan} answers={answers} setAnswers={setAnswers} onComplete={completeInterview} />}
    {screen === 'review' && <ReviewScreen task={task} setTask={setTask} followUpCount={followUpPlan.questions.length} onFollowUp={() => startFollowUp()} onAddContext={addContext} onAnalyze={completeReview} />}
    {screen === 'redesign' && <RedesignScreen design={design} connected={calendar.connected} savedProject={savedProject} onSave={saveProject} onOpenSaved={() => savedProject && openProject(savedProject)} />}
    {screen === 'projects' && <ProjectsScreen projects={projects} onOpen={openProject} />}
    {screen === 'project' && savedProject && <ProjectDetailScreen project={savedProject} onAddContext={addProjectContext} onUpdateHypothesis={refreshProjectHypothesis} onStatus={updateProjectStatus} />}
    {showRestartConfirm && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-heading"><h2 id="restart-heading">最初からやり直しますか？</h2><p>入力中の回答は保存されません。保存済みの業務と仮説は残ります。</p><div><button type="button" className="secondary-button" onClick={() => setShowRestartConfirm(false)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { setShowRestartConfirm(false); beginDiscovery() }}>やり直す</button></div></section></div>}
  </div>
}
