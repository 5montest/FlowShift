import { parseDraft, type SessionDraft } from '../../shared/session-draft'

// 回答途中のセッションはブラウザ内にだけ残す（サーバーに残すのは保存済み仮説だけ、という
// データ方針を守る）。壊れた・古い・形式の違うエントリは読み飛ばし、次の保存で掃除される。
const STORAGE_KEY = 'flowshift.drafts.v1'

function readMap(): Record<string, SessionDraft> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, SessionDraft> = {}
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      const draft = parseDraft(value)
      if (draft) result[draft.group.id] = draft
    }
    return result
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, SessionDraft>) {
  try {
    if (Object.keys(map).length === 0) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // 容量超過・プライベートモード等。下書きが残らないだけでフローは続行できる。
  }
}

export function listDrafts(): SessionDraft[] {
  return Object.values(readMap()).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function loadDraft(groupId: string): SessionDraft | null {
  return readMap()[groupId] ?? null
}

// 別タブが別業務を保存していても消さないよう、毎回読み直してからマージする
export function saveDraft(draft: SessionDraft) {
  const map = readMap()
  map[draft.group.id] = draft
  writeMap(map)
}

export function deleteDraft(groupId: string) {
  const map = readMap()
  if (!(groupId in map)) return
  delete map[groupId]
  writeMap(map)
}

export function clearAllDrafts() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // noop
  }
}

export function draftProgressLabel(draft: SessionDraft): string {
  if (draft.design) return '仮説作成済み'
  const answeredIds = new Set(draft.answers.map((answer) => answer.questionId))
  const answeredInPlan = draft.plan.questions.filter((question) => answeredIds.has(question.id)).length
  if (answeredInPlan < draft.plan.questions.length) return `質問 ${answeredInPlan}/${draft.plan.questions.length} に回答`
  if (draft.pendingQuestions.length) return `追加の質問 残り${draft.pendingQuestions.length}問`
  return '内容の確認まで完了'
}
