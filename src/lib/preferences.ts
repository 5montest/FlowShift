import { normalizeWorkTitle } from '../../shared/work-group'

// ユーザーが「声かけの対象外」にした業務（正規化タイトル）。ブラウザ内にのみ保存。
// 一覧・内訳には表示されたままで、アプリから話しかける候補にしないだけ。
const STORAGE_KEY = 'flowshift.muted-work.v1'

function readSet(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    return new Set()
  }
}

function writeSet(titles: Set<string>) {
  try {
    if (titles.size === 0) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...titles]))
  } catch {
    // noop
  }
}

export function listMutedWork(): Set<string> {
  return readSet()
}

export function isMutedWork(title: string, muted: Set<string>): boolean {
  return muted.has(normalizeWorkTitle(title))
}

export function muteWork(title: string): Set<string> {
  const titles = readSet()
  titles.add(normalizeWorkTitle(title))
  writeSet(titles)
  return titles
}

export function unmuteWork(title: string): Set<string> {
  const titles = readSet()
  titles.delete(normalizeWorkTitle(title))
  writeSet(titles)
  return titles
}
