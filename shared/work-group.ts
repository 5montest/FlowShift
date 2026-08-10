import type { CalendarEvent } from './calendar-schema'

export type WorkCategory = '会議' | '資料作成' | 'データ処理' | '顧客対応' | 'その他'

export type WorkGroup = {
  id: string
  title: string
  occurrences: number
  totalMinutes: number
  averageMinutes: number
  firstOccurredAt: string
  lastOccurredAt: string
  recurringEventId?: string
  category: WorkCategory
  evidence: {
    recurring: boolean
    occurrenceCount: number
    totalMinutes: number
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
      category: categorizeWork(ordered[0].title),
      evidence: {
        recurring: Boolean(recurringEventId),
        occurrenceCount: ordered.length,
        totalMinutes,
      },
    }
  }).sort((left, right) => right.totalMinutes - left.totalMinutes || right.occurrences - left.occurrences || left.title.localeCompare(right.title, 'ja'))
}

export function isDiscoveryCandidate(group: WorkGroup): boolean {
  return group.occurrences >= 2 || group.totalMinutes >= 60 || ['資料作成', 'データ処理'].includes(group.category)
}

export function summarizeWorkGroups(groups: WorkGroup[]): DiscoverySummary {
  return {
    calendarMinutes: groups.reduce((total, group) => total + group.totalMinutes, 0),
    recurringMinutes: groups.filter((group) => group.evidence.recurring).reduce((total, group) => total + group.totalMinutes, 0),
    meetingMinutes: groups.filter((group) => group.category === '会議').reduce((total, group) => total + group.totalMinutes, 0),
    candidateCount: groups.filter(isDiscoveryCandidate).length,
  }
}
