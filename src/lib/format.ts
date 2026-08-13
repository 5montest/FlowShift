import type { WorkGroup } from '../types'

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}時間${remainder}分` : `${hours}時間`
}

export function formatPeriod(group: WorkGroup): string {
  const format = (value: string) => new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(value))
  return `${format(group.firstOccurredAt)}〜${format(group.lastOccurredAt)}`
}
