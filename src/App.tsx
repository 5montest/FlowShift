import { useEffect, useRef, useState } from 'react'
import { fallbackCorePlan } from '../shared/context-questions'
import { createDeterministicTask } from '../shared/interview'
import { projectContext, projectName } from '../shared/project-schema'
import { groupCalendarEvents, rankDiscoveryCandidates, toObservation } from '../shared/work-group'
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

// 発見→理解→仮説の1セッション分の作業状態。ばらばらのuseStateではなく
// 1オブジェクトで持ち、開始・破棄を原子的に行う。
type SessionFlow = {
  group: WorkGroup | null
  plan: InterviewPlan | null
  answers: InterviewAnswer[]
  task: BusinessTask | null
  refinedTask: BusinessTask | null
  pendingQuestions: InterviewQuestion[]
  refining: boolean
  design: BusinessDesign | null
  designError: string
}

const emptyFlow: SessionFlow = {
  group: null, plan: null, answers: [], task: null, refinedTask: null,
  pendingQuestions: [], refining: false, design: null, designError: '',
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('connect')
  const [calendar, setCalendar] = useState<CalendarState>({ configured: false, connected: false, loading: true })
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [groups, setGroups] = useState<WorkGroup[]>([])
  const [projects, setProjects] = useState<ImprovementProject[]>([])
  const [workspaceNotice, setWorkspaceNotice] = useState('')
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [flow, setFlow] = useState<SessionFlow>(emptyFlow)
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
      const focus = rankDiscoveryCandidates(nextGroups, savedProjects.map((project) => projectContext(project).observed.title))[0]
      if (focus) prefetchPlan(focus).catch(() => {})
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : 'ワークスペースを読み込めませんでした。')
      setScreen(calendar.connected ? 'workspace' : 'connect')
    } finally { setCalendarBusy(false) }
  }

  function clearSession() {
    sessionToken.current += 1
    setFlow(emptyFlow)
    setSavedProject(null)
    setCalendarError('')
  }

  // 暫定の構造化は決定論で即時に行う。purposeの語彙検査に落ちる自由入力などは
  // マスクして再試行し、それでも組めなければnull（裏のLLM整理を待つ）。
  function buildProvisionalTask(group: WorkGroup, nextAnswers: InterviewAnswer[]): BusinessTask | null {
    const observed = toObservation(group)
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
    setFlow({ ...emptyFlow, group })
    setScreen('session')
    const token = sessionToken.current
    void (async () => {
      let nextPlan: InterviewPlan
      try {
        nextPlan = await prefetchPlan(group)
      } catch {
        nextPlan = fallbackCorePlan()
      }
      if (sessionToken.current === token) setFlow((current) => ({ ...current, plan: nextPlan }))
    })()
  }

  function handleAnswer(answer: InterviewAnswer) {
    setFlow((current) => {
      if (!current.group || !current.plan) return current
      const nextAnswers = [...current.answers.filter((item) => item.questionId !== answer.questionId), answer]
      const provisional = buildProvisionalTask(current.group, nextAnswers)
      const nextTask = provisional ? (current.refinedTask ? mergeRefined(current.refinedTask, provisional) : provisional) : current.task
      const coreDone = current.plan.questions.every((question) => nextAnswers.some((item) => item.questionId === question.id))
      if (coreDone && current.plan.questions.some((question) => question.id === answer.questionId)) {
        void refineInBackground(current.group, nextAnswers)
      }
      return {
        ...current,
        answers: nextAnswers,
        task: nextTask,
        pendingQuestions: current.pendingQuestions.filter((question) => question.id !== answer.questionId),
      }
    })
  }

  // コア回答後、確認モードを読んでいる裏でLLMに整理と追加質問を任せる。
  // 失敗してもフローは止めない（未確認のまま仮説に進める）。
  async function refineInBackground(group: WorkGroup, nextAnswers: InterviewAnswer[]) {
    const token = sessionToken.current
    setFlow((current) => ({ ...current, refining: true }))
    try {
      const hasFreeText = nextAnswers.some((answer) => answer.source === 'FREE_TEXT')
      let baseTask = buildProvisionalTask(group, nextAnswers)
      if (hasFreeText || !baseTask) {
        baseTask = await extractBusinessTask(nextAnswers, group)
        if (sessionToken.current !== token) return
        const refined = baseTask
        setFlow((current) => ({ ...current, refinedTask: refined, task: refined }))
      }
      const followUp = await generateFollowUpPlan(baseTask)
      if (sessionToken.current !== token) return
      const answeredIds = new Set(nextAnswers.map((answer) => answer.questionId))
      setFlow((current) => ({ ...current, pendingQuestions: followUp.questions.filter((question) => !answeredIds.has(question.id)) }))
    } catch {
      // 追加質問なしで進められる。未確認の項目は仮説側がunknownsとして明示する。
    } finally {
      if (sessionToken.current === token) setFlow((current) => ({ ...current, refining: false }))
    }
  }

  // LLMが整理したタスクを土台に、その後の回答の決定論的な意味を上書きで反映する
  function mergeRefined(refined: BusinessTask, provisional: BusinessTask): BusinessTask {
    return {
      ...refined,
      ...provisional,
      purpose: provisional.purpose === '未確認' ? refined.purpose : provisional.purpose,
      tools: provisional.tools.length ? provisional.tools : refined.tools,
      inputs: provisional.inputs.length ? provisional.inputs : refined.inputs,
      output: provisional.output === '未確認' ? refined.output : provisional.output,
    }
  }

  async function proceedToHypothesis() {
    const { group, task, answers } = flow
    if (!group) return
    const finalTask = task ?? await extractBusinessTask(answers, group)
    setFlow((current) => ({ ...current, task: finalTask }))
    setScreen('hypothesis')
    void generateDesign(finalTask)
  }

  async function generateDesign(forTask: BusinessTask) {
    const token = sessionToken.current
    setFlow((current) => ({ ...current, design: null, designError: '' }))
    try {
      const nextDesign = await generateBusinessDesign(forTask)
      if (sessionToken.current === token) setFlow((current) => ({ ...current, design: nextDesign }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '仮説を作成できませんでした。'
      if (sessionToken.current === token) setFlow((current) => ({ ...current, designError: message }))
    }
  }

  async function saveProject() {
    if (!flow.design) return
    const project = await createImprovementProject(flow.design)
    setSavedProject(project); setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)])
    setWorkspaceNotice(`${projectName(project)}を、検証する仮説として保存しました。`)
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
    const baseTask = projectContext(savedProject)
    const finalAnswer: InterviewAnswer = { ...answer, questionId }
    const nextAnswers = [...baseTask.answerEvidence.filter((item) => item.questionId !== questionId), finalAnswer]
    const nextTask = await extractBusinessTaskFromObservation(nextAnswers, baseTask.observed)
    const project = await updateImprovementProjectContext(savedProject.id, nextTask, `「${answer.question}」について情報を追加`)
    setSavedProject(project)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  async function refreshProjectHypothesis() {
    if (!savedProject) return
    const nextDesign = await generateBusinessDesign(projectContext(savedProject))
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
    {screen === 'session' && flow.group && <SessionScreen group={flow.group} plan={flow.plan} answers={flow.answers} task={flow.task} pendingQuestions={flow.pendingQuestions} refining={flow.refining} onAnswer={handleAnswer} onProceed={proceedToHypothesis} />}
    {screen === 'hypothesis' && flow.task && <HypothesisScreen task={flow.task} design={flow.design} designError={flow.designError} connected={calendar.connected} savedProject={savedProject} onRetry={() => flow.task && void generateDesign(flow.task)} onSave={saveProject} onOpenSaved={() => savedProject && openProject(savedProject)} />}
    {screen === 'note' && savedProject && <NoteScreen project={savedProject} currentGroups={groups} onAddContext={addProjectContext} onUpdateHypothesis={refreshProjectHypothesis} onStatus={updateProjectStatus} />}
    {showRestartConfirm && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-heading"><h2 id="restart-heading">最初からやり直しますか？</h2><p>入力中の回答は保存されません。保存済みの業務と仮説は残ります。</p><div><button type="button" className="secondary-button" onClick={() => setShowRestartConfirm(false)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { setShowRestartConfirm(false); clearSession(); goHome() }}>やり直す</button></div></section></div>}
  </div>
}
