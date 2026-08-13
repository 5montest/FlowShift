import { categorizeWork, workGroupSchema, type WorkGroup } from '../../shared/work-group'

// カレンダーに載らない業務の手動登録。自己申告データなのでブラウザ内にだけ残す
// （サーバーに残すのは保存済み仮説だけ、というデータ方針を守る）。TTLなし・上限200件。
const STORAGE_KEY = 'flowshift.manual-work.v1'
const MAX_ENTRIES = 200
const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000

function readMap(): Record<string, WorkGroup> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, WorkGroup> = {}
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      const group = workGroupSchema.safeParse(value)
      if (group.success) result[group.data.id] = group.data
    }
    return result
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, WorkGroup>) {
  try {
    if (Object.keys(map).length === 0) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // 容量超過・プライベートモード等。登録が残らないだけでフローは続行できる。
  }
}

export function isManualWork(group: Pick<WorkGroup, 'id'>): boolean {
  return group.id.startsWith('manual:')
}

export function listManualWork(): WorkGroup[] {
  return Object.values(readMap()).sort((left, right) => right.totalMinutes - left.totalMinutes)
}

export function createManualWork(input: { title: string; occurrences: number; averageMinutes: number; recurring: boolean }): WorkGroup {
  const now = new Date()
  return {
    id: `manual:${crypto.randomUUID()}`,
    title: input.title.trim(),
    occurrences: input.occurrences,
    averageMinutes: input.averageMinutes,
    totalMinutes: input.occurrences * input.averageMinutes,
    firstOccurredAt: new Date(now.getTime() - FOUR_WEEKS_MS).toISOString(),
    lastOccurredAt: now.toISOString(),
    recurring: input.recurring,
    category: categorizeWork(input.title),
  }
}

// 別タブの登録を消さないよう、毎回読み直してからマージする
export function addManualWork(group: WorkGroup): WorkGroup[] {
  const map = readMap()
  map[group.id] = group
  const keys = Object.keys(map)
  if (keys.length > MAX_ENTRIES) for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[key]
  writeMap(map)
  return Object.values(map).sort((left, right) => right.totalMinutes - left.totalMinutes)
}

export function removeManualWork(id: string): WorkGroup[] {
  const map = readMap()
  delete map[id]
  writeMap(map)
  return Object.values(map).sort((left, right) => right.totalMinutes - left.totalMinutes)
}
