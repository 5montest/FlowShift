import { z } from 'zod'
import type { CalendarEvent } from './calendar-schema'
import { workObservationSchema, type WorkObservation } from './design-schema.ts'

export const workCategorySchema = z.enum(['会議', '資料作成', 'データ処理', '顧客対応', 'その他'])
export type WorkCategory = z.infer<typeof workCategorySchema>

// WorkGroupは観測（WorkObservation）そのもの＋グルーピング情報。
// 同じ6フィールドを二重定義しない。下書き（session draft）の検証にも使うためschema化している。
export const workGroupSchema = workObservationSchema.omit({ sourceGroupId: true }).extend({
  id: z.string().min(1).max(1100),
  category: workCategorySchema,
  recurringEventId: z.string().min(1).max(1024).optional(),
}).strict()
export type WorkGroup = z.infer<typeof workGroupSchema>

export function toObservation(group: WorkGroup): WorkObservation {
  return {
    title: group.title,
    occurrences: group.occurrences,
    totalMinutes: group.totalMinutes,
    averageMinutes: group.averageMinutes,
    firstOccurredAt: group.firstOccurredAt,
    lastOccurredAt: group.lastOccurredAt,
    recurring: group.recurring,
    sourceGroupId: group.id,
  }
}

export type DiscoverySummary = {
  calendarMinutes: number
  recurringMinutes: number
  meetingMinutes: number
  candidateCount: number
}

export function normalizeWorkTitle(title: string): string {
  return title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ja-JP')
}

export function categorizeWork(title: string): WorkCategory {
  if (/(会議|定例|ミーティング|朝会|夕会|1on1|面談|打ち合わせ)/i.test(title)) return '会議'
  if (/(レポート|報告|資料|提案書)/i.test(title)) return '資料作成'
  if (/(入力|登録|更新|転記|集計)/i.test(title)) return 'データ処理'
  if (/(顧客|問い合わせ|フォロー|商談)/i.test(title)) return '顧客対応'
  return 'その他'
}

export function groupCalendarEvents(events: CalendarEvent[]): WorkGroup[] {
  const grouped = new Map<string, CalendarEvent[]>()

  for (const event of events) {
    if (event.allDay || event.durationMinutes <= 0) continue
    const key = event.recurringEventId
      ? `recurring:${event.recurringEventId}`
      : `title:${normalizeWorkTitle(event.title)}`
    const current = grouped.get(key) ?? []
    current.push(event)
    grouped.set(key, current)
  }

  return [...grouped.entries()].map(([id, occurrences]) => {
    const ordered = [...occurrences].sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
    const totalMinutes = ordered.reduce((total, event) => total + event.durationMinutes, 0)
    const recurringEventId = ordered.find((event) => event.recurringEventId)?.recurringEventId
    return {
      id,
      title: ordered[0].title,
      occurrences: ordered.length,
      totalMinutes,
      averageMinutes: Math.round(totalMinutes / ordered.length),
      firstOccurredAt: ordered[0].start,
      lastOccurredAt: ordered.at(-1)?.start ?? ordered[0].start,
      ...(recurringEventId ? { recurringEventId } : {}),
      recurring: Boolean(recurringEventId),
      category: categorizeWork(ordered[0].title),
    }
  }).sort((left, right) => right.totalMinutes - left.totalMinutes || right.occurrences - left.occurrences || left.title.localeCompare(right.title, 'ja'))
}

export function isDiscoveryCandidate(group: WorkGroup): boolean {
  return group.occurrences >= 2 || group.totalMinutes >= 60 || ['資料作成', 'データ処理'].includes(group.category)
}

// タイトルから明らかに業務でない予定（休憩・食事・休暇・私用・移動など）を見分ける。
// 声かけの対象から外すためだけに使い、一覧や内訳からは消さない。
export function isLikelyPersonal(title: string): boolean {
  return /(休憩|昼休|ランチ|lunch|朝食|昼食|夕食|食事|休暇|有休|有給|私用|通院|健診|検診|病院|歯医者|美容院|ジム|移動|送迎|不在|外出|ブロック)/i.test(title)
}

// 声かけ（アプリから先に話しかける）対象の選定。
// isDiscoveryCandidateはほぼ全件を通すため、ここではより強い条件で絞り込む：
// ①除外タイトル（保存済みプロジェクト・ユーザーが対象外にしたもの等）と業務でない予定を外す
// ②繰り返しが対象（定例3回以上、または2回以上かつ合計2時間以上。単発は選ばない）
// ③1人で完結しやすい資料作成・データ処理を優先し、同点は合計時間の多い順。
export function rankDiscoveryCandidates(groups: WorkGroup[], excludeTitles: Iterable<string> = []): WorkGroup[] {
  const excluded = new Set([...excludeTitles].map(normalizeWorkTitle))
  const eligible = groups.filter((group) => !excluded.has(normalizeWorkTitle(group.title))
    && !isLikelyPersonal(group.title)
    && ((group.occurrences >= 3 && group.recurring) || (group.occurrences >= 2 && group.totalMinutes >= 120)))
  const soloFriendly = (group: WorkGroup) => (['資料作成', 'データ処理'].includes(group.category) ? 1 : 0)
  return [...eligible].sort((left, right) => soloFriendly(right) - soloFriendly(left)
    || right.totalMinutes - left.totalMinutes
    || right.occurrences - left.occurrences)
}

export type WorkReduction = {
  // 直近4週間のカレンダーに同じ業務が見つかったか。見つからない場合、
  // 「全削減」と「タイトル変更・休暇などで照合できない」を区別できないため、
  // 削減量として断定しない（UI側は「見当たりません」と表示する）。
  matched: boolean
  baselineOccurrences: number
  baselineMinutes: number
  currentOccurrences: number
  currentMinutes: number
  deltaMinutes: number
}

// 採用した仮説の「どのくらい減ったか」。保存時点の観測値と、直近4週間の同じ業務
// （出所グループid、無ければ正規化タイトル）を突き合わせる。
export function computeReduction(baseline: { title: string; occurrences: number; totalMinutes: number; sourceGroupId?: string }, currentGroups: WorkGroup[]): WorkReduction {
  const key = normalizeWorkTitle(baseline.title)
  const current = (baseline.sourceGroupId ? currentGroups.find((group) => group.id === baseline.sourceGroupId) : undefined)
    ?? currentGroups.find((group) => normalizeWorkTitle(group.title) === key)
  return {
    matched: Boolean(current),
    baselineOccurrences: baseline.occurrences,
    baselineMinutes: baseline.totalMinutes,
    currentOccurrences: current?.occurrences ?? 0,
    currentMinutes: current?.totalMinutes ?? 0,
    deltaMinutes: baseline.totalMinutes - (current?.totalMinutes ?? 0),
  }
}

export function summarizeWorkGroups(groups: WorkGroup[]): DiscoverySummary {
  return {
    calendarMinutes: groups.reduce((total, group) => total + group.totalMinutes, 0),
    recurringMinutes: groups.filter((group) => group.recurring).reduce((total, group) => total + group.totalMinutes, 0),
    meetingMinutes: groups.filter((group) => group.category === '会議').reduce((total, group) => total + group.totalMinutes, 0),
    candidateCount: groups.filter(isDiscoveryCandidate).length,
  }
}
