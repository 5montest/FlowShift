import { useEffect, useRef, useState } from 'react'
import { fallbackCorePlan } from '../shared/context-questions'
import { createDeterministicTask } from '../shared/interview'
import { groupCalendarEvents, rankDiscoveryCandidates } from '../shared/work-group'
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
  observationFrom,
  updateImprovementProject,
  updateImprovementProjectContext,
  updateImprovementProjectStatus,
} from './api'
import AppHeader from './components/AppHeader'
import ConnectScreen from './screens/ConnectScreen'
import WorkspaceScreen from './screens/WorkspaceScreen'
import SessionScreen from './screens/SessionScreen'
import HypothesisScreen from './screens/HypothesisScreen'
import NoteScreen from './screens/NoteScreen'
import type {
  BusinessDesign,
  BusinessTask,
  CalendarStatus,
  ImprovementProject,
  InterviewAnswer,
  InterviewPlan,
  InterviewQuestion,
  ProjectStatus,
  Screen,
  WorkGroup,
} from './types'

type CalendarState = CalendarStatus & { loading: boolean }

export default function App() {
  const [screen, setScreen] = useState<Screen>('connect')
  const [calendar, setCalendar] = useState<CalendarState>({ configured: false, connected: false, loading: true })
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [groups, setGroups] = useState<WorkGroup[]>([])
  const [projects, setProjects] = useState<ImprovementProject[]>([])
  const [workspaceNotice, setWorkspaceNotice] = useState('')
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)

  // 進行中セッション（発見→理解→仮説）の作業状態
  const [selectedGroup, setSelectedGroup] = useState<WorkGroup | null>(null)
  const [plan, setPlan] = useState<InterviewPlan | null>(null)
  const [answers, setAnswers] = useState<InterviewAnswer[]>([])
  const [task, setTask] = useState<BusinessTask | null>(null)
  const [refinedTask, setRefinedTask] = useState<BusinessTask | null>(null)
  const [pendingQuestions, setPendingQuestions] = useState<InterviewQuestion[]>([])
  const [refining, setRefining] = useState(false)
  const [design, setDesign] = useState<BusinessDesign | null>(null)
  const [designError, setDesignError] = useState('')
  const [savedProject, setSavedProject] = useState<ImprovementProject | null>(null)

  // 声かけ表示中に焦点業務の質問を先読みしておくキャッシュ（グループid→Promise）
  const planCache = useRef(new Map<string, Promise<InterviewPlan>>())
  // 画面遷移をまたいだ古い非同期結果を無視するためのトークン
  const sessionToken = useRef(0)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.has('calendar')) window.history.replaceState({}, '', window.location.pathname)
    void refreshCalendarStatus(query.get('calendar') === 'error')
  }, [])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [screen])

  function prefetchPlan(group: WorkGroup): Promise<InterviewPlan> {
    const cached = planCache.current.get(group.id)
    if (cached) return cached
    const promise = generateInterviewPlan(group)
    promise.catch(() => planCache.current.delete(group.id))
    planCache.current.set(group.id, promise)
    return promise
  }

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
      setProjects(savedProjects)
      setScreen('workspace')
      const focus = rankDiscoveryCandidates(nextGroups, savedProjects.map((project) => project.businessContext.observed.title))[0]
      if (focus) prefetchPlan(focus).catch(() => {})
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : 'ワークスペースを読み込めませんでした。')
      setScreen(calendar.connected ? 'workspace' : 'connect')
    } finally { setCalendarBusy(false) }
  }

  function clearSession() {
    sessionToken.current += 1
    setSelectedGroup(null); setPlan(null); setAnswers([]); setTask(null); setRefinedTask(null)
    setPendingQuestions([]); setRefining(false); setDesign(null); setDesignError(''); setSavedProject(null); setCalendarError('')
  }

  // 提案的な構造化は決定論で即時に行う。purposeの語彙検査に落ちる自由入力などは
  // マスクして再試行し、それでも組めなければnull（裏のLLM整理を待つ）。
  function buildProvisionalTask(group: WorkGroup, nextAnswers: InterviewAnswer[]): BusinessTask | null {
    const observed = observationFrom(group)
    try {
      return createDeterministicTask(observed, nextAnswers)
    } catch {
      try {
        const masked = nextAnswers.map((answer) => answer.dimension === 'purpose' && answer.source === 'FREE_TEXT' ? { ...answer, answer: '未確認' } : answer)
        return createDeterministicTask(observed, masked)
      } catch {
        return null
      }
    }
  }

  function startSession(group: WorkGroup) {
    clearSession()
    setSelectedGroup(group)
    setScreen('session')
    const token = sessionToken.current
    void (async () => {
      let nextPlan: InterviewPlan
      try {
        nextPlan = await prefetchPlan(group)
      } catch {
        nextPlan = fallbackCorePlan()
      }
      if (sessionToken.current === token) setPlan(nextPlan)
    })()
  }

  function handleAnswer(answer: InterviewAnswer) {
    if (!selectedGroup || !plan) return
    const nextAnswers = [...answers.filter((item) => item.questionId !== answer.questionId), answer]
    setAnswers(nextAnswers)
    setPendingQuestions((current) => current.filter((question) => question.id !== answer.questionId))
    const provisional = buildProvisionalTask(selectedGroup, nextAnswers)
    if (provisional) setTask(refinedTask ? mergeRefined(refinedTask, provisional) : provisional)
    const coreDone = plan.questions.every((question) => nextAnswers.some((item) => item.questionId === question.id))
    if (coreDone && plan.questions.some((question) => question.id === answer.questionId)) {
      void refineInBackground(selectedGroup, nextAnswers)
    }
  }

  // コア回答後、確認モードを読んでいる裏でLLMに整理と追加質問を任せる。
  // 失敗してもフローは止めない（未確認のまま仮説に進める）。
  async function refineInBackground(group: WorkGroup, nextAnswers: InterviewAnswer[]) {
    const token = sessionToken.current
    setRefining(true)
    try {
      const hasFreeText = nextAnswers.some((answer) => answer.source === 'FREE_TEXT')
      let baseTask = buildProvisionalTask(group, nextAnswers)
      if (hasFreeText || !baseTask) {
        baseTask = await extractBusinessTask(nextAnswers, group)
        if (sessionToken.current !== token) return
        setRefinedTask(baseTask)
        setTask(baseTask)
      }
      const followUp = await generateFollowUpPlan(baseTask)
      if (sessionToken.current !== token) return
      const answeredIds = new Set(nextAnswers.map((answer) => answer.questionId))
      setPendingQuestions(followUp.questions.filter((question) => !answeredIds.has(question.id)))
    } catch {
      // 追加質問なしで進められる。未確認の項目は仮説側がunknownsとして明示する。
    } finally {
      if (sessionToken.current === token) setRefining(false)
    }
  }

  // LLMが整理したタスクを土台に、その後の回答の決定論的な意味を上書きで反映する
  function mergeRefined(refined: BusinessTask, provisional: BusinessTask): BusinessTask {
    return {
      ...refined,
      ...provisional,
      // 決定論ビルドで「未確認」になっただけのテキスト項目はLLM整理を優先する
      purpose: provisional.purpose === '未確認' ? refined.purpose : provisional.purpose,
      tools: provisional.tools.length ? provisional.tools : refined.tools,
      inputs: provisional.inputs.length ? provisional.inputs : refined.inputs,
      output: provisional.output === '未確認' ? refined.output : provisional.output,
    }
  }

  async function proceedToHypothesis() {
    if (!selectedGroup) return
    let finalTask = task
    if (!finalTask) finalTask = await extractBusinessTask(answers, selectedGroup)
    setTask(finalTask)
    setScreen('hypothesis')
    void generateDesign(finalTask)
  }

  async function generateDesign(forTask: BusinessTask) {
    const token = sessionToken.current
    setDesign(null); setDesignError('')
    try {
      const nextDesign = await generateBusinessDesign(forTask)
      if (sessionToken.current === token) setDesign(nextDesign)
    } catch (error) {
      if (sessionToken.current === token) setDesignError(error instanceof Error ? error.message : '仮説を作成できませんでした。')
    }
  }

  async function saveProject() {
    if (!design) return
    const project = await createImprovementProject(design)
    setSavedProject(project); setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)])
    setWorkspaceNotice(`${project.taskName}を、検証する仮説として保存しました。`)
    setScreen('workspace')
    window.setTimeout(() => setWorkspaceNotice(''), 8000)
  }

  async function updateProjectStatus(status: ProjectStatus) {
    if (!savedProject) return
    const project = await updateImprovementProjectStatus(savedProject.id, status)
    setSavedProject(project); setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  async function addProjectContext(id: string, answer: InterviewAnswer) {
    if (!savedProject) return
    const questionId = `project-${id}`
    const baseTask = savedProject.businessContext
    const finalAnswer: InterviewAnswer = { ...answer, questionId }
    const nextAnswers = [...baseTask.answerEvidence.filter((item) => item.questionId !== questionId), finalAnswer]
    const nextTask = await extractBusinessTaskFromObservation(nextAnswers, baseTask.observed)
    const project = await updateImprovementProjectContext(savedProject.id, nextTask, `「${answer.question}」について情報を追加`)
    setSavedProject(project)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  async function refreshProjectHypothesis() {
    if (!savedProject) return
    const nextDesign = await generateBusinessDesign(savedProject.businessContext)
    const project = await updateImprovementProject(savedProject.id, nextDesign, '追加した業務情報を反映して仮説を更新')
    setSavedProject(project)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  function openProject(project: ImprovementProject) {
    clearSession()
    setSavedProject(project)
    setScreen('note')
  }

  async function disconnect() {
    setCalendarBusy(true); setCalendarError('')
    try {
      await disconnectGoogleCalendar()
      setCalendar({ configured: calendar.configured, connected: false, loading: false })
      clearSession(); setGroups([]); setProjects([]); planCache.current.clear()
      setScreen('connect')
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : '接続を解除できませんでした。')
    } finally { setCalendarBusy(false) }
  }

  function goBack() {
    if (screen === 'hypothesis') setScreen('session')
    else setScreen(calendar.connected ? 'workspace' : 'connect')
  }

  function goHome() {
    setScreen(calendar.connected ? 'workspace' : 'connect')
  }

  return <div className="app-shell">
    <AppHeader screen={screen} onBack={goBack} onHome={goHome} onRestart={() => setShowRestartConfirm(true)} />
    {screen === 'connect' && <ConnectScreen calendar={calendar} error={calendarError} onConnect={() => { window.location.href = '/api/google/connect' }} />}
    {screen === 'workspace' && <WorkspaceScreen email={calendar.email} groups={groups} projects={projects} busy={calendarBusy} error={calendarError} savedNotice={workspaceNotice} onRefresh={loadWorkspace} onStartSession={startSession} onOpenProject={openProject} onDisconnect={disconnect} />}
    {screen === 'session' && selectedGroup && <SessionScreen group={selectedGroup} plan={plan} answers={answers} task={task} pendingQuestions={pendingQuestions} refining={refining} onAnswer={handleAnswer} onProceed={proceedToHypothesis} />}
    {screen === 'hypothesis' && task && <HypothesisScreen task={task} design={design} designError={designError} connected={calendar.connected} savedProject={savedProject} onRetry={() => task && void generateDesign(task)} onSave={saveProject} onOpenSaved={() => savedProject && openProject(savedProject)} />}
    {screen === 'note' && savedProject && <NoteScreen project={savedProject} currentGroups={groups} onAddContext={addProjectContext} onUpdateHypothesis={refreshProjectHypothesis} onStatus={updateProjectStatus} />}
    {showRestartConfirm && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-heading"><h2 id="restart-heading">最初からやり直しますか？</h2><p>入力中の回答は保存されません。保存済みの業務と仮説は残ります。</p><div><button type="button" className="secondary-button" onClick={() => setShowRestartConfirm(false)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { setShowRestartConfirm(false); clearSession(); goHome() }}>やり直す</button></div></section></div>}
  </div>
}
