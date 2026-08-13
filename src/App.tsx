import { useEffect, useState } from 'react'
import { isDiscoveryCandidate, groupCalendarEvents } from '../shared/work-group'
import { questionForContext } from '../shared/context-questions'
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
import HomeScreen from './screens/HomeScreen'
import DashboardScreen from './screens/DashboardScreen'
import DiscoveryScreen from './screens/DiscoveryScreen'
import InterviewScreen from './screens/InterviewScreen'
import ReviewScreen from './screens/ReviewScreen'
import RedesignScreen from './screens/RedesignScreen'
import ProjectsScreen from './screens/ProjectsScreen'
import ProjectDetailScreen from './screens/ProjectDetailScreen'
import type {
  BusinessDesign,
  BusinessTask,
  CalendarStatus,
  ContextDimension,
  ImprovementProject,
  InterviewAnswer,
  InterviewPlan,
  ProjectStatus,
  Screen,
  WorkGroup,
} from './types'

type CalendarState = CalendarStatus & { loading: boolean }

const emptyFollowUpPlan: InterviewPlan = { phase: 'FOLLOW_UP', questions: [] }

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [calendar, setCalendar] = useState<CalendarState>({ configured: false, connected: false, loading: true })
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [groups, setGroups] = useState<WorkGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<WorkGroup | null>(null)
  const [plan, setPlan] = useState<InterviewPlan | null>(null)
  const [followUpPlan, setFollowUpPlan] = useState<InterviewPlan>(emptyFollowUpPlan)
  const [answers, setAnswers] = useState<InterviewAnswer[]>([])
  const [task, setTask] = useState<BusinessTask | null>(null)
  const [design, setDesign] = useState<BusinessDesign | null>(null)
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
      setScreen('dashboard')
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : 'ワークスペースを読み込めませんでした。')
    } finally { setCalendarBusy(false) }
  }

  function clearCurrentFlow() {
    setPlan(null); setFollowUpPlan(emptyFollowUpPlan); setAnswers([])
    setTask(null); setDesign(null); setSavedProject(null); setOpenedFromProjects(false); setCalendarError('')
  }

  function beginDiscovery(group?: WorkGroup) {
    if (!group && !groups.length) {
      setCalendarError('過去28日間に、時間のある予定が見つかりませんでした。')
      return
    }
    clearCurrentFlow()
    setSelectedGroup(group ?? groups.find(isDiscoveryCandidate) ?? groups[0])
    setScreen('discovery')
  }

  function restartWithConfirmation() {
    setShowRestartConfirm(true)
  }

  async function startFromCalendar() {
    setCalendarBusy(true); setCalendarError('')
    try {
      const result = await getGoogleCalendarEvents()
      const nextGroups = groupCalendarEvents(result.events)
      if (!nextGroups.length) throw new Error('過去28日間に、時間のある予定が見つかりませんでした。')
      setGroups(nextGroups); clearCurrentFlow()
      setSelectedGroup(nextGroups.find(isDiscoveryCandidate) ?? nextGroups[0])
      setScreen('discovery')
    } catch (error) {
      if ((error as { code?: string }).code === 'authentication_required' || (error as { code?: string }).code === 'google_not_connected') await refreshCalendarStatus()
      setCalendarError(error instanceof Error ? error.message : '予定を取得できませんでした。')
    } finally { setCalendarBusy(false) }
  }

  async function startInterview() {
    if (!selectedGroup) return
    const nextPlan = await generateInterviewPlan(selectedGroup)
    setPlan(nextPlan); setFollowUpPlan(emptyFollowUpPlan); setAnswers([]); setScreen('interview')
  }

  async function completeInterview(nextAnswers: InterviewAnswer[]) {
    if (!selectedGroup || !plan) return
    const nextTask = await extractBusinessTask(nextAnswers, selectedGroup)
    setTask(nextTask)
    if (plan.phase === 'CORE') {
      setFollowUpPlan(await generateFollowUpPlan(nextTask))
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
    const nextDesign = await generateBusinessDesign(approvedTask)
    setDesign(nextDesign); setSavedProject(null); setOpenedFromProjects(false); setScreen('redesign')
  }

  async function showProjects() {
    setCalendarBusy(true); setCalendarError('')
    try { setProjects(await getImprovementProjects()); setScreen('projects') } catch (error) { setCalendarError(error instanceof Error ? error.message : '保存した仮説を取得できませんでした。') } finally { setCalendarBusy(false) }
  }

  async function saveProject() {
    if (!design) return
    const project = await createImprovementProject(design)
    setSavedProject(project); setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)])
    setWorkspaceNotice(`${project.taskName}を、検証する仮説として保存しました。`)
    setScreen('dashboard')
  }

  async function updateProjectStatus(status: ProjectStatus) {
    if (!savedProject) return
    const project = await updateImprovementProjectStatus(savedProject.id, status)
    setSavedProject(project); setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  async function addProjectContext(id: string, dimension: ContextDimension, question: string, detail: string) {
    if (!savedProject) return
    const questionId = `project-${id}`
    const baseTask = savedProject.businessContext
    const answer: InterviewAnswer = { questionId, dimension, question, answer: detail.trim(), source: 'FREE_TEXT' }
    const nextAnswers = [...baseTask.answerEvidence.filter((item) => item.questionId !== questionId), answer]
    const nextTask = await extractBusinessTaskFromObservation(nextAnswers, baseTask.observed)
    const project = await updateImprovementProjectContext(savedProject.id, nextTask, `「${question}」について情報を追加`)
    setAnswers(nextAnswers); setTask(nextTask); setSavedProject(project)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  async function refreshProjectHypothesis() {
    if (!savedProject) return
    const nextDesign = await generateBusinessDesign(savedProject.businessContext)
    const project = await updateImprovementProject(savedProject.id, nextDesign, '追加した業務情報を反映して仮説を更新')
    setTask(project.businessContext); setDesign(project.proposal); setSavedProject(project)
    setProjects((current) => current.map((item) => item.id === project.id ? project : item))
  }

  function openProject(project: ImprovementProject) {
    setAnswers(project.businessContext.answerEvidence); setTask(project.businessContext); setDesign(project.proposal); setSavedProject(project); setOpenedFromProjects(true); setScreen('project')
  }

  async function disconnect() {
    setCalendarBusy(true); setCalendarError('')
    try { await disconnectGoogleCalendar(); setCalendar({ configured: calendar.configured, connected: false, loading: false }); clearCurrentFlow(); setGroups([]); setProjects([]); setScreen('home') } catch (error) { setCalendarError(error instanceof Error ? error.message : '接続を解除できませんでした。') } finally { setCalendarBusy(false) }
  }

  function workspaceScreen(): Screen {
    return calendar.connected ? 'dashboard' : 'home'
  }

  function goBack() {
    if (screen === 'discovery' || screen === 'projects' || screen === 'project') setScreen(workspaceScreen())
    else if (screen === 'interview') setScreen(plan?.phase === 'CORE' ? 'discovery' : 'review')
    else if (screen === 'review') setScreen('discovery')
    else if (screen === 'redesign') setScreen(openedFromProjects ? 'project' : 'review')
    else setScreen(workspaceScreen())
  }

  return <div className="app-shell">
    <AppHeader screen={screen} onBack={goBack} onHome={() => setScreen(workspaceScreen())} onRestart={restartWithConfirmation} />
    {screen === 'home' && <HomeScreen calendar={calendar} busy={calendarBusy} error={calendarError} onConnect={() => { window.location.href = '/api/google/connect' }} onCalendarStart={startFromCalendar} onDisconnect={disconnect} onProjects={showProjects} />}
    {screen === 'dashboard' && <DashboardScreen email={calendar.email} groups={groups} projects={projects} busy={calendarBusy} error={calendarError} savedNotice={workspaceNotice} onRefresh={loadWorkspace} onDiscover={beginDiscovery} onOpenProject={openProject} onDisconnect={disconnect} />}
    {screen === 'discovery' && selectedGroup && <DiscoveryScreen groups={groups} selectedGroup={selectedGroup} onSelectGroup={setSelectedGroup} onSelect={startInterview} />}
    {screen === 'interview' && selectedGroup && plan && <InterviewScreen group={selectedGroup} plan={plan} answers={answers} setAnswers={setAnswers} onComplete={completeInterview} />}
    {screen === 'review' && task && <ReviewScreen task={task} setTask={setTask} followUpCount={followUpPlan.questions.length} onFollowUp={() => startFollowUp()} onAddContext={addContext} onAnalyze={completeReview} />}
    {screen === 'redesign' && design && <RedesignScreen design={design} connected={calendar.connected} savedProject={savedProject} onSave={saveProject} onOpenSaved={() => savedProject && openProject(savedProject)} />}
    {screen === 'projects' && <ProjectsScreen projects={projects} onOpen={openProject} />}
    {screen === 'project' && savedProject && <ProjectDetailScreen project={savedProject} onAddContext={addProjectContext} onUpdateHypothesis={refreshProjectHypothesis} onStatus={updateProjectStatus} />}
    {showRestartConfirm && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-heading"><h2 id="restart-heading">最初からやり直しますか？</h2><p>入力中の回答は保存されません。保存済みの業務と仮説は残ります。</p><div><button type="button" className="secondary-button" onClick={() => setShowRestartConfirm(false)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { setShowRestartConfirm(false); beginDiscovery() }}>やり直す</button></div></section></div>}
  </div>
}
