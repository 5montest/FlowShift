import { useEffect, useRef, useState } from 'react'
import { bridgeQuestionsFor, fallbackCorePlan, QUESTION_BUDGET } from '../shared/context-questions'
import { createDeterministicTask } from '../shared/interview'
import { projectContext, projectName } from '../shared/project-schema'
import { applyCategories, calendarKeyOfGroupId, groupCalendarEvents, mergeWorkGroups, normalizeWorkTitle, rankDiscoveryCandidates, toObservation, type WorkCategory } from '../shared/work-group'
import type { CalendarEntry } from '../shared/calendar-schema'
import type { UserProfile } from '../shared/profile-schema'
import {
  ApiError,
  classifyWork,
  createImprovementProject,
  deleteImprovementProject,
  disconnectGoogleCalendar,
  extractBusinessTask,
  extractBusinessTaskFromObservation,
  generateBusinessDesign,
  generateFollowUpPlan,
  generateInterviewPlan,
  getCalendarList,
  getGoogleCalendarEvents,
  getGoogleCalendarStatus,
  getImprovementProjects,
  getProfile,
  saveProfile,
  updateImprovementProject,
  updateImprovementProjectContext,
  updateImprovementProjectStatus,
} from './api'
import AppHeader from './components/AppHeader'
import { mergeCategoryCache, readCategoryCache } from './lib/categories'
import { clearAllDrafts, deleteDraft, listDrafts, loadDraft, saveDraft } from './lib/drafts'
import { listMutedWork, markProfilePrompted, muteWork, profilePrompted, unmuteWork } from './lib/preferences'
import { addManualWork, listManualWork, removeManualWork } from './lib/manual-work'
import AddWorkDialog from './components/AddWorkDialog'
import ProfileDialog from './components/ProfileDialog'
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
  // 連続インタビューの進行状態：完了で確認画面へ。roundsは追加質問生成の実行回数
  interviewComplete: boolean
  followUpRounds: number
  design: BusinessDesign | null
  designError: string
}

const emptyFlow: SessionFlow = {
  group: null, plan: null, planSource: null, answers: [], task: null, refinedTask: null,
  pendingQuestions: [], askedQuestions: [], refining: false, interviewComplete: false, followUpRounds: 0, design: null, designError: '',
}

// 追加質問の生成ラウンド上限。QUESTION_BUDGET（合計9問）はshared/context-questions.tsに定義
const MAX_FOLLOWUP_ROUNDS = 2

// handleAnswerは同じquestionIdを上書きするためanswersはquestionIdユニーク
function criticalUnknownRemains(task: BusinessTask | null): boolean {
  return !task || (['constraints', 'dependencies', 'risks'] as const).some((key) => task.contextStatus[key] === 'UNKNOWN')
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
  const [mutedWork, setMutedWork] = useState<Set<string>>(() => listMutedWork())
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [showProfileDialog, setShowProfileDialog] = useState(false)
  const [showAddWork, setShowAddWork] = useState(false)
  // アクセス可能なカレンダーの一覧と表示中カレンダー。null=自分（primary）。
  // リロードで自分に戻る（安全側の既定。永続化しない）
  const [calendars, setCalendars] = useState<CalendarEntry[]>([])
  const [viewingCalendar, setViewingCalendar] = useState<CalendarEntry | null>(null)
  const [calendarListHint, setCalendarListHint] = useState('')

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
      interviewComplete: flow.interviewComplete,
      followUpRounds: flow.followUpRounds,
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

  function prefetchPlan(group: WorkGroup, userProfile: UserProfile | null): Promise<InterviewPlan> {
    const cached = planCache.current.get(group.id)
    if (cached) return cached
    const promise = generateInterviewPlan(group, userProfile)
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
        void loadCalendarList()
        await loadWorkspace()
      }
    } catch (error) {
      setCalendar((current) => ({ ...current, loading: false }))
      setCalendarError(error instanceof Error ? error.message : '接続状態を確認できませんでした。')
    }
  }

  // regex分類のままのタイトルをAIに分類させ、返ってきたら差し替える。
  // タイトルキーの上書きなので、途中で再読込されても安全（冪等）。
  function refineCategoriesInBackground(groups: WorkGroup[], cached: Record<string, WorkCategory>, userProfile: UserProfile | null) {
    const unclassified = [...new Set(groups.filter((group) => !(normalizeWorkTitle(group.title) in cached)).map((group) => group.title))].slice(0, 100)
    if (!unclassified.length) return
    void classifyWork(unclassified, userProfile)
      .then((map) => {
        mergeCategoryCache(map)
        setGroups((current) => applyCategories(current, map))
      })
      .catch(() => {
        // 分類できなくてもregexフォールバックのまま表示できる
      })
  }

  // アクセス可能なカレンダーの一覧（自分＋共有）。旧接続は一覧スコープが無く403になるため
  // ヒントだけ出して自分のカレンダーで動き続ける
  async function loadCalendarList() {
    try {
      const result = await getCalendarList()
      setCalendars(result.calendars)
      setCalendarListHint('')
    } catch (error) {
      setCalendars([])
      setCalendarListHint(error instanceof ApiError && error.code === 'google_scope_denied'
        ? '他のカレンダーを表示するには、接続を解除して再接続してください。'
        : '')
    }
  }

  async function loadWorkspace(view: CalendarEntry | null = viewingCalendar) {
    setCalendarBusy(true); setCalendarError('')
    // 自分のカレンダー（primary）は接頭辞なしの現行ID体系のまま扱う
    const other = view && !view.primary ? { id: view.id, name: view.summary } : undefined
    try {
      const [calendarResult, savedProjects, userProfile] = await Promise.all([
        getGoogleCalendarEvents(other?.id),
        getImprovementProjects(),
        getProfile().catch(() => null),
      ])
      const cachedCategories = readCategoryCache()
      // 手動登録の業務は自分のカレンダー表示にだけ合流させる
      const calendarGroups = groupCalendarEvents(calendarResult.events, other)
      const nextGroups = applyCategories(other ? calendarGroups : mergeWorkGroups(calendarGroups, listManualWork()), cachedCategories)
      planCache.current.clear()
      setGroups(nextGroups)
      setProfile(userProfile)
      if (!userProfile && !profilePrompted()) setShowProfileDialog(true)
      // 他人の業務は閲覧者のプロフィール（職種等）で解釈させない
      refineCategoriesInBackground(nextGroups, cachedCategories, other ? null : userProfile)
      setCalendarRange(calendarResult.range ?? null)
      setFetchedAt(new Date())
      setProjects(savedProjects)
      setNeedsReconnect(false)
      setScreen('workspace')
      const currentKey = other?.id ?? null
      const visibleProjects = savedProjects.filter((project) => calendarKeyOfGroupId(projectContext(project).observed.sourceGroupId) === currentKey)
      const activeTitles = visibleProjects.filter((project) => project.status !== 'REJECTED').map((project) => projectContext(project).observed.title)
      const focus = rankDiscoveryCandidates(nextGroups, [...activeTitles, ...mutedWork])[0]
      // 下書きがあるなら質問はその中にあるので先読みしない
      if (focus && !loadDraft(focus.id)) prefetchPlan(focus, other ? null : userProfile).catch(() => {})
    } catch (error) {
      if (isReconnectError(error)) setNeedsReconnect(true)
      setCalendarError(error instanceof Error ? error.message : 'ワークスペースを読み込めませんでした。')
    } finally { setCalendarBusy(false) }
  }

  function handleSelectCalendar(entry: CalendarEntry | null) {
    // primary選択はnull（自分）と同義に正規化する（既存ID体系の維持）
    const next = entry && !entry.primary ? entry : null
    setViewingCalendar(next)
    void loadWorkspace(next)
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
        // 仮説まで作っていた下書きはインタビュー完了として扱う（旧下書きの自然な移行）
        interviewComplete: draft.interviewComplete || Boolean(draft.design),
        followUpRounds: draft.followUpRounds,
        design: draft.design,
      })
      setScreen('session')
      const coreDone = draft.plan.questions.every((question) => draft.answers.some((answer) => answer.questionId === question.id))
      if (coreDone && !draft.design && !draft.interviewComplete && draft.pendingQuestions.length === 0
        && draft.followUpRounds < MAX_FOLLOWUP_ROUNDS && draft.answers.length < QUESTION_BUDGET) {
        void refineInBackground(freshGroup, draft.answers)
      }
      return
    }
    setFlow({ ...emptyFlow, group })
    setScreen('session')
    const token = sessionToken.current
    void (async () => {
      let nextPlan: InterviewPlan
      let source: 'ai' | 'generic' = 'ai'
      try {
        nextPlan = await prefetchPlan(group, profile)
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
      const nextPending = current.pendingQuestions.filter((question) => question.id !== answer.questionId)
      const coreJustDone = current.plan.questions.every((question) => nextAnswers.some((item) => item.questionId === question.id))
        && current.plan.questions.some((question) => question.id === answer.questionId)

      let pendingQuestions = nextPending
      let askedQuestions = current.askedQuestions
      let interviewComplete = current.interviewComplete
      if (coreJustDone) {
        // 裏で整理＋追加質問生成（ラウンド1）を開始しつつ、生成待ちの間は
        // 決定論カタログのつなぎ質問（制約・依存・リスク）を即時に出す
        const bridges = nextTask
          ? bridgeQuestionsFor(nextTask.contextStatus).filter((question) => !nextAnswers.some((item) => item.questionId === question.id))
          : []
        pendingQuestions = mergeQuestions(nextPending, bridges)
        askedQuestions = mergeQuestions(current.askedQuestions, bridges)
        void refineInBackground(current.group, nextAnswers)
      } else if (!interviewComplete && nextPending.length === 0 && !current.refining) {
        // キューが空になった：残ラウンド・残予算・重要次元のUNKNOWNが揃えば次ラウンド、でなければ完了
        if (current.followUpRounds < MAX_FOLLOWUP_ROUNDS && nextAnswers.length < QUESTION_BUDGET && criticalUnknownRemains(nextTask)) {
          void refineInBackground(current.group, nextAnswers)
        } else {
          interviewComplete = true
        }
      }
      return {
        ...current,
        answers: nextAnswers,
        task: nextTask,
        pendingQuestions,
        askedQuestions,
        interviewComplete,
        // 回答が増えたら生成済み仮説は古くなるので破棄（次に進むとき再生成）
        design: null,
        designError: '',
      }
    })
  }

  // 回答を裏でLLMに整理させ、次ラウンドの追加質問を生成する（ユーザーはつなぎ質問に回答中）。
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
        setFlow((current) => {
          // 整理中につなぎ質問へ回答が進んでいることがあるため、最新の回答の決定論を上に重ねる
          const provisionalNow = current.group ? buildProvisionalTask(current.group, current.answers) : null
          return { ...current, refinedTask: refined, task: provisionalNow ? mergeRefined(refined, provisionalNow) : refined }
        })
      }
      const followUp = await generateFollowUpPlan(baseTask)
      if (sessionToken.current !== token) return
      setFlow((current) => {
        // 到着時点の最新状態で重複を排除する：回答済みid・CORE以外で回答済みの次元（つなぎ質問と
        // 同じ次元の生成質問を落とす）・保留中の次元。予算の残りに収まる分だけ採用する
        const answeredIds = new Set(current.answers.map((item) => item.questionId))
        const coreIds = new Set(current.plan?.questions.map((question) => question.id) ?? [])
        const postCoreDimensions = new Set(current.answers.filter((item) => !coreIds.has(item.questionId)).map((item) => item.dimension))
        const pendingDimensions = new Set(current.pendingQuestions.map((question) => question.dimension))
        const budgetLeft = Math.max(0, QUESTION_BUDGET - current.answers.length - current.pendingQuestions.length)
        const fresh = followUp.questions
          .filter((question) => !answeredIds.has(question.id) && !postCoreDimensions.has(question.dimension) && !pendingDimensions.has(question.dimension))
          .slice(0, budgetLeft)
        return {
          ...current,
          pendingQuestions: mergeQuestions(current.pendingQuestions, fresh),
          askedQuestions: mergeQuestions(current.askedQuestions, fresh),
          followUpRounds: current.followUpRounds + 1,
          // 新しい質問が無くキューも空なら、このラウンドでインタビューを終える
          interviewComplete: current.interviewComplete || (fresh.length === 0 && current.pendingQuestions.length === 0),
        }
      })
    } catch {
      // 追加質問なしで進められる。キューが空なら完了扱いにして確認画面へ進める
      // （未確認の項目は仮説側がunknownsとして明示する）
      if (sessionToken.current === token) {
        setFlow((current) => ({ ...current, interviewComplete: current.interviewComplete || current.pendingQuestions.length === 0 }))
      }
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
    // 仮説へ進む＝インタビュー終了（早期離脱を含む）。残りの未確認は検証条件になる
    setFlow((current) => ({ ...current, interviewComplete: true }))
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
      const nextDesign = await generateBusinessDesign(forTask, profile)
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
      const nextDesign = await generateBusinessDesign(projectContext(savedProject), profile)
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

  async function handleSaveProfile(next: UserProfile) {
    const saved = await saveProfile(next)
    setProfile(saved)
    markProfilePrompted()
    setShowProfileDialog(false)
  }

  function handleSkipProfile() {
    markProfilePrompted()
    setShowProfileDialog(false)
  }

  function handleAddWork(group: WorkGroup) {
    // 同じ名前の業務がすでにあるなら二重計上させない（カレンダー実測優先）
    if (groups.some((item) => normalizeWorkTitle(item.title) === normalizeWorkTitle(group.title))) {
      setCalendarError(`「${group.title}」は同じ名前の業務がすでに一覧にあります。`)
      return
    }
    addManualWork(group)
    setCalendarError('')
    setGroups((current) => mergeWorkGroups(current, [group]))
    refineCategoriesInBackground([group], readCategoryCache(), profile)
    showNotice(`「${group.title}」を追加しました。内訳と業務の一覧から確認できます。`)
  }

  function handleRemoveManualWork(id: string) {
    removeManualWork(id)
    planCache.current.delete(id)
    setGroups((current) => current.filter((group) => group.id !== id))
  }

  function handleMuteWork(title: string) {
    setMutedWork(muteWork(title))
  }

  function handleUnmuteWork(title: string) {
    setMutedWork(unmuteWork(title))
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
      setCalendars([]); setViewingCalendar(null); setCalendarListHint('')
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

  // 表示中カレンダー由来の仮説だけをワークスペースに出す（別カレンダーの実測との嘘の削減マッチを防ぐ）
  const currentCalendarKey = viewingCalendar && !viewingCalendar.primary ? viewingCalendar.id : null
  const visibleProjects = projects.filter((project) => calendarKeyOfGroupId(projectContext(project).observed.sourceGroupId) === currentCalendarKey)

  return <div className="app-shell">
    <AppHeader screen={screen} canRestart={screen === 'session' || screen === 'hypothesis'} email={calendar.connected ? calendar.email : undefined} picture={calendar.connected ? calendar.picture : undefined} onBack={goBack} onHome={goHome} onRestart={() => setShowRestartConfirm(true)} onOpenProfile={() => setShowProfileDialog(true)} onDisconnect={() => void disconnect()} />
    {screen === 'connect' && <ConnectScreen calendar={calendar} error={calendarError} onConnect={() => { window.location.href = '/api/google/connect' }} />}
    {screen === 'workspace' && <WorkspaceScreen groups={groups} projects={visibleProjects} drafts={drafts} calendars={calendars} viewingCalendar={viewingCalendar} calendarListHint={calendarListHint} onSelectCalendar={handleSelectCalendar} mutedWork={mutedWork} busy={calendarBusy} error={calendarError} needsReconnect={needsReconnect} savedNotice={workspaceNotice} calendarRange={calendarRange} fetchedAt={fetchedAt} onRefresh={loadWorkspace} onReconnect={() => { window.location.href = '/api/google/connect' }} onStartSession={startSession} onOpenProject={openProject} onDiscardDraft={discardDraft} onMuteWork={handleMuteWork} onUnmuteWork={handleUnmuteWork} onAddWork={() => setShowAddWork(true)} onRemoveManualWork={handleRemoveManualWork} />}
    {screen === 'session' && flow.group && <SessionScreen group={flow.group} plan={flow.plan} planSource={flow.planSource} answers={flow.answers} task={flow.task} pendingQuestions={flow.pendingQuestions} askedQuestions={flow.askedQuestions} refining={flow.refining} interviewComplete={flow.interviewComplete} onAnswer={handleAnswer} onRetryRefine={retryRefine} onProceed={proceedToHypothesis} />}
    {screen === 'hypothesis' && flow.task && <HypothesisScreen task={flow.task} design={flow.design} designError={flow.designError} savedProject={savedProject} onBackToSession={() => setScreen('session')} onRetry={() => flow.task && void generateDesign(flow.task)} onSave={saveProject} onOpenSaved={() => savedProject && openProject(savedProject)} />}
    {screen === 'note' && savedProject && <NoteScreen project={savedProject} currentGroups={groups} onAddContext={addProjectContext} onUpdateHypothesis={refreshProjectHypothesis} onStatus={updateProjectStatus} onDelete={deleteProject} />}
    {showProfileDialog && calendar.connected && <ProfileDialog profile={profile} onSave={handleSaveProfile} onSkip={handleSkipProfile} />}
    {showAddWork && <AddWorkDialog onAdd={handleAddWork} onClose={() => setShowAddWork(false)} />}
    {showRestartConfirm && <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-heading"><h2 id="restart-heading">最初からやり直しますか？</h2><p>この業務の下書きを削除して、最初の質問からやり直します。保存済みの仮説は残ります。</p><div><button type="button" className="secondary-button" onClick={() => setShowRestartConfirm(false)}>キャンセル</button><button type="button" className="primary-button" onClick={() => { setShowRestartConfirm(false); restartSession() }}>やり直す</button></div></section></div>}
  </div>
}
