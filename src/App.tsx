import { useEffect, useRef, useState } from 'react'
import { fallbackCorePlan } from '../shared/context-questions'
import { createDeterministicTask } from '../shared/interview'
import { projectContext, projectName } from '../shared/project-schema'
import { groupCalendarEvents, rankDiscoveryCandidates, toObservation } from '../shared/work-group'
import {
  ApiError,
  createImprovementProject,
  deleteImprovementProject,
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
import { clearAllDrafts, deleteDraft, listDrafts, loadDraft, saveDraft } from './lib/drafts'
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
  SessionDraft,
  WorkGroup,
} from './types'

type CalendarState = CalendarStatus & { loading: boolean }
type CalendarRange = { timeMin: string; timeMax: string } | null

// 発見→理解→仮説の1セッション分の作業状態。ばらばらのuseStateではなく
// 1オブジェクトで持ち、開始・破棄を原子的に行う。
type SessionFlow = {
  group: WorkGroup | null
  plan: InterviewPlan | null
  planSource: 'ai' | 'generic' | null
  answers: InterviewAnswer[]
  task: BusinessTask | null
  refinedTask: BusinessTask | null
  pendingQuestions: InterviewQuestion[]
  askedQuestions: InterviewQuestion[]
  refining: boolean
  design: BusinessDesign | null
  designError: string
}

const emptyFlow: SessionFlow = {
  group: null, plan: null, planSource: null, answers: [], task: null, refinedTask: null,
  pendingQuestions: [], askedQuestions: [], refining: false, design: null, designError: '',
}

function mergeQuestions(current: InterviewQuestion[], added: InterviewQuestion[]): InterviewQuestion[] {
  const known = new Set(current.map((question) => question.id))
  return [...current, ...added.filter((question) => !known.has(question.id))]
}

function isReconnectError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'authentication_required' || error.code === 'google_not_connected')
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('connect')
  const [calendar, setCalendar] = useState<CalendarState>({ configured: false, connected: false, loading: true })
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const [groups, setGroups] = useState<WorkGroup[]>([])
  const [calendarRange, setCalendarRange] = useState<CalendarRange>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [projects, setProjects] = useState<ImprovementProject[]>([])
  const [workspaceNotice, setWorkspaceNotice] = useState('')
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [flow, setFlow] = useState<SessionFlow>(emptyFlow)
  const [savedProject, setSavedProject] = useState<ImprovementProject | null>(null)
  const [drafts, setDrafts] = useState<SessionDraft[]>(() => listDrafts())

  // 声かけ表示中に焦点業務の質問を先読みしておくキャッシュ（グループid→Promise）
  const planCache = useRef(new Map<string, Promise<InterviewPlan>>())
  // 画面遷移や仮説生成をまたいだ古い非同期結果を無視するためのトークン
  const sessionToken = useRef(0)
  const noticeTimer = useRef<number | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.has('calendar')) window.history.replaceState({}, '', window.location.pathname)
    void refreshCalendarStatus(query.get('calendar') === 'error')
  }, [])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [screen])

  function refreshDrafts() {
    setDrafts(listDrafts())
  }

  // 回答途中のセッションを自動で下書き保存する（明示的な保存操作は不要）。
  // refining / designError / planSource は一時状態なので保存しない。
  useEffect(() => {
    if (!flow.group || !flow.plan) return
    if (flow.answers.length === 0 && !flow.design) return
    saveDraft({
      version: 1,
      group: flow.group,
      plan: flow.plan,
      answers: flow.answers,
      pendingQuestions: flow.pendingQuestions,
      askedQuestions: flow.askedQuestions,
      task: flow.task,
      refinedTask: flow.refinedTask,
      design: flow.design,
      updatedAt: new Date().toISOString(),
    })
  }, [flow])

  // ワークスペースへ戻るたびに下書き一覧を読み直す（別タブの更新も拾う）
  useEffect(() => {
    if (screen === 'workspace') refreshDrafts()
  }, [screen])

  useEffect(() => {
    const onStorage = () => refreshDrafts()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

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
      if (next.connected) {
        // 接続済みならワークスペースへ入ってから読み込む（読み込み失敗で接続画面へ
        // 誤って戻さない。ConnectScreenの接続ボタン再押下も防ぐ）
        setScreen('workspace')
        await loadWorkspace()
      }
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
      planCache.current.clear()
      setGroups(nextGroups)
      setCalendarRange(calendarResult.range ?? null)
      setFetchedAt(new Date())
      setProjects(savedProjects)
      setNeedsReconnect(false)
      setScreen('workspace')
      const activeTitles = savedProjects.filter((project) => project.status !== 'REJECTED').map((project) => projectContext(project).observed.title)
      const focus = rankDiscoveryCandidates(nextGroups, activeTitles)[0]
      // 下書きがあるなら質問はその中にあるので先読みしない
      if (focus && !loadDraft(focus.id)) prefetchPlan(focus).catch(() => {})
    } catch (error) {
      if (isReconnectError(error)) setNeedsReconnect(true)
      setCalendarError(error instanceof Error ? error.message : 'ワークスペースを読み込めませんでした。')
    } finally { setCalendarBusy(false) }
  }

  function clearSession() {
    sessionToken.current += 1
    setFlow(emptyFlow)
    setSavedProject(null)
    setCalendarError('')
  }

  // 暫定の構造化は決定論で即時に行う。スキーマ検査（語彙・字数）に落ちる自由入力は
  // マスクして再試行し、それでも組めなければnull（裏のLLM整理を待つ）。
  function buildProvisionalTask(group: WorkGroup, nextAnswers: InterviewAnswer[]): BusinessTask | null {
    const observed = toObservation(group)
    try {
      return createDeterministicTask(observed, nextAnswers)
    } catch {
      try {
        const masked = nextAnswers.map((answer) => answer.source === 'FREE_TEXT' ? { ...answer, answer: '未確認' } : answer)
        return createDeterministicTask(observed, masked)
      } catch {
        return null
      }
    }
  }

  function startSession(group: WorkGroup) {
    const draft = loadDraft(group.id)
    clearSession()
    if (draft) {
      // 中断していた続きから再開する。観測値はカレンダーの最新があればそちらを使う
      const freshGroup = groups.find((item) => item.id === draft.group.id) ?? draft.group
      const provisional = draft.answers.length ? buildProvisionalTask(freshGroup, draft.answers) : null
      const task = provisional ? (draft.refinedTask ? mergeRefined(draft.refinedTask, provisional) : provisional) : draft.task
      setFlow({
        ...emptyFlow,
        group: freshGroup,
        plan: draft.plan,
        planSource: 'ai',
        answers: draft.answers,
        task,
        refinedTask: draft.refinedTask,
        pendingQuestions: draft.pendingQuestions,
        askedQuestions: mergeQuestions(draft.askedQuestions, draft.plan.questions),
        design: draft.design,
      })
      setScreen('session')
      const coreDone = draft.plan.questions.every((question) => draft.answers.some((answer) => answer.questionId === question.id))
      if (coreDone && !draft.design && draft.pendingQuestions.length === 0) void refineInBackground(freshGroup, draft.answers)
      return
    }
    setFlow({ ...emptyFlow, group })
    setScreen('session')
    const token = sessionToken.current
    void (async () => {
      let nextPlan: InterviewPlan
      let source: 'ai' | 'generic' = 'ai'
      try {
        nextPlan = await prefetchPlan(group)
      } catch {
        nextPlan = fallbackCorePlan()
        source = 'generic'
      }
      if (sessionToken.current === token) {
        setFlow((current) => ({ ...current, plan: nextPlan, planSource: source, askedQuestions: mergeQuestions(current.askedQuestions, nextPlan.questions) }))
      }
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
        // 回答が増えたら生成済み仮説は古くなるので破棄（次に進むとき再生成）
        design: null,
        designError: '',
      }
    })
  }

  // コア回答後、確認モードを読んでいる裏でLLMに整理と追加質問を任せる。
  // 失敗してもフローは止めない（taskがnullのままの場合だけSessionScreenが再試行を出す）。
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
      const fresh = followUp.questions.filter((question) => !answeredIds.has(question.id))
      setFlow((current) => ({ ...current, pendingQuestions: fresh, askedQuestions: mergeQuestions(current.askedQuestions, fresh) }))
    } catch {
      // 追加質問なしで進められる。未確認の項目は仮説側がunknownsとして明示する。
    } finally {
      if (sessionToken.current === token) setFlow((current) => ({ ...current, refining: false }))
    }
  }

  function retryRefine() {
    if (flow.group) void refineInBackground(flow.group, flow.answers)
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
    const { group, task, answers, design } = flow
    if (!group) return
    const finalTask = task ?? await extractBusinessTask(answers, group)
    setFlow((current) => ({ ...current, task: finalTask }))
    setScreen('hypothesis')
    // 下書きから復元した仮説があればLLMを呼び直さない（回答が増えるとhandleAnswerがdesignを破棄する）
    if (!design) void generateDesign(finalTask)
  }

  async function generateDesign(forTask: BusinessTask) {
    // 進行中の古い整理・古い仮説生成をここで無効化する。
    // 保存される仮説が「最後の回答を反映したタスク」から作られることを保証する。
    sessionToken.current += 1
    const token = sessionToken.current
    setFlow((current) => ({ ...current, design: null, designError: '', refining: false }))
    try {
      const nextDesign = await generateBusinessDesign(forTask)
      if (sessionToken.current === token) setFlow((current) => ({ ...current, design: nextDesign }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '仮説を作成できませんでした。'
      if (sessionToken.current === token) setFlow((current) => ({ ...current, designError: message }))
    }
  }

  function showNotice(message: string) {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    setWorkspaceNotice(message)
    noticeTimer.current = window.setTimeout(() => setWorkspaceNotice(''), 8000)
  }

  async function saveProject() {
    if (!flow.design) return
    const project = await createImprovementProject(flow.design)
    // 保存できたら下書きは役目を終える。遅延中のバックグラウンド整理がsetFlowで
    // 下書きを復活させないよう、セッションも原子的に終了する。
    if (flow.group) deleteDraft(flow.group.id)
    sessionToken.current += 1
    setFlow(emptyFlow)
    refreshDrafts()
    setSavedProject(project); setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)])
    showNotice(`${projectName(project)}を、検証する仮説として保存しました。`)
    setScreen('workspace')
  }

  async function updateProjectStatus(status: ProjectStatus) {
    if (!savedProject) return
    const token = sessionToken.current
    try {
      const project = await updateImprovementProjectStatus(savedProject.id, status)
      if (sessionToken.current !== token) return
      setSavedProject(project); setProjects((current) => current.map((item) => item.id === project.id ? project : item))
    } catch (error) {
      if (isReconnectError(error)) setNeedsReconnect(true)
      throw error
    }
  }

  async function addProjectContext(id: string, answer: InterviewAnswer) {
    if (!savedProject) return
    const token = sessionToken.current
    const questionId = `project-${id}`
    const baseTask = projectContext(savedProject)
    const finalAnswer: InterviewAnswer = { ...answer, questionId }
    const nextAnswers = [...baseTask.answerEvidence.filter((item) => item.questionId !== questionId), finalAnswer]
    try {
      const nextTask = await extractBusinessTaskFromObservation(nextAnswers, baseTask.observed)
      const project = await updateImprovementProjectContext(savedProject.id, nextTask, `「${answer.question}」について情報を追加`)
      if (sessionToken.current !== token) return
      setSavedProject(project)
      setProjects((current) => current.map((item) => item.id === project.id ? project : item))
    } catch (error) {
      if (isReconnectError(error)) setNeedsReconnect(true)
      throw error
    }
  }

  async function refreshProjectHypothesis() {
    if (!savedProject) return
    const token = sessionToken.current
    try {
      const nextDesign = await generateBusinessDesign(projectContext(savedProject))
      const project = await updateImprovementProject(savedProject.id, nextDesign, '追加した業務情報を反映して仮説を更新')
      if (sessionToken.current !== token) return
      setSavedProject(project)
      setProjects((current) => current.map((item) => item.id === project.id ? project : item))
    } catch (error) {
      if (isReconnectError(error)) setNeedsReconnect(true)
      throw error
    }
  }

  async function deleteProject() {
    if (!savedProject) return
    const name = projectName(savedProject)
    await deleteImprovementProject(savedProject.id)
    setProjects((current) => current.filter((item) => item.id !== savedProject.id))
    setSavedProject(null)
    showNotice(`${name}を削除しました。`)
    setScreen('workspace')
  }

  function openProject(project: ImprovementProject) {
    clearSession()
    setSavedProject(project)
    setScreen('note')
  }

  function discardDraft(groupId: string) {
    deleteDraft(groupId)
    // 同じ業務のセッションがメモリに残っていると、遅延したsetFlow→自動保存で
    // 削除済み下書きが復活するため、セッションごと破棄する
    if (flow.group?.id === groupId) clearSession()
    refreshDrafts()
  }

  async function disconnect() {
    setCalendarBusy(true); setCalendarError('')
    try {
      await disconnectGoogleCalendar()
      setCalendar({ configured: calendar.configured, connected: false, loading: false })
      clearSession(); setGroups([]); setProjects([]); planCache.current.clear()
      clearAllDrafts(); refreshDrafts()
      setNeedsReconnect(false)
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

  function restartSession() {
    const group = flow.group
    if (group) deleteDraft(group.id)
    clearSession()
    refreshDrafts()
    if (group) startSession(group)
    else goHome()
  }

  return <div className="app-shell">
    <AppHeader screen={screen} canRestart={screen === 'session' || screen === 'hypothesis'} onBack={goBack} onHome={goHome} onRestart={() => setShowRestartConfirm(true)} />
    {screen === 'connect' && <ConnectScreen calendar={calendar} error={calendarError} onConnect={() => { window.location.href = '/api/google/connect' }} />}
    {screen === 'workspace' && <WorkspaceScreen email={calendar.email} groups={groups} projects={projects} drafts={drafts} busy={calendarBusy} error={calendarError} needsReconnect={needsReconnect} savedNotice={workspaceNotice} calendarRange={calendarRange} fetchedAt={fetchedAt} onRefresh={loadWorkspace} onReconnect={() => { window.location.href = '/api/google/connect' }} onStartSession={startSession} onOpenProject={openProject} onDiscardDraft={discardDraft} onDisconnect={disconnect} />}
    {screen === 'session' && flow.group && <SessionScreen group={flow.group} plan={flow.plan} planSource={flow.planSource} answers={flow.answers} task={flow.task} pendingQuestions={flow.pendingQuestions} askedQuestions={flow.askedQuestions} refining={flow.refining} onAnswer={handleAnswer} onRetryRefine={retryRefine} onProceed={proceedToHypothesis} />}
    {screen === 'hypothesis' && flow.task && <HypothesisScreen task={flow.task} design={flow.design} designError={flow.designError} savedProject={savedProject} onBackToSession={() => setScreen('session')} onRetry={() => flow.task && void generateDesign(flow.task)} onSave={saveProject} onOpenSaved={() => savedProject && openProject(savedProject)} />}
    {screen === 'note' && savedProject && <NoteScreen project={savedProject} currentGroups={groups} onAddContext={addProjectContext} onUpdateHypothesis={refreshProjectHypothesis} onStatus={updateProjectStatus} onDelete={deleteProject} />}
    {showRestartConfirm && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-heading"><h2 id="restart-heading">最初からやり直しますか？</h2><p>この業務の下書きを削除して、最初の質問からやり直します。保存済みの仮説は残ります。</p><div><button type="button" className="secondary-button" onClick={() => setShowRestartConfirm(false)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { setShowRestartConfirm(false); restartSession() }}>やり直す</button></div></section></div>}
  </div>
}
