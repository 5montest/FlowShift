import assert from 'node:assert/strict'
import { groupCalendarEvents, isLikelyPersonal, rankDiscoveryCandidates, summarizeWorkGroups } from '../shared/work-group.ts'

const events = [
  { id: '1', title: '朝会', start: '2026-07-13T00:00:00.000Z', end: '2026-07-13T00:15:00.000Z', durationMinutes: 15, recurringEventId: 'daily', allDay: false },
  { id: '2', title: '朝会', start: '2026-07-14T00:00:00.000Z', end: '2026-07-14T00:15:00.000Z', durationMinutes: 15, recurringEventId: 'daily', allDay: false },
  { id: '3', title: ' 売上　レポート ', start: '2026-07-15T00:00:00.000Z', end: '2026-07-15T00:45:00.000Z', durationMinutes: 45, allDay: false },
  { id: '4', title: '売上 レポート', start: '2026-07-22T00:00:00.000Z', end: '2026-07-22T00:45:00.000Z', durationMinutes: 45, allDay: false },
]

const groups = groupCalendarEvents(events)
assert.equal(groups.length, 2)
assert.equal(groups[0].title, ' 売上　レポート ')
assert.equal(groups[0].occurrences, 2)
assert.equal(groups[0].totalMinutes, 90)
assert.equal(groups[1].recurringEventId, 'daily')
assert.deepEqual(summarizeWorkGroups(groups), {
  calendarMinutes: 120,
  recurringMinutes: 30,
  meetingMinutes: 30,
  candidateCount: 2,
})

// 声かけ候補の選定：業務でない予定と単発は選ばない
const rankGroups = [
  { id: 'recurring:lunch', title: '昼休憩', occurrences: 9, totalMinutes: 540, averageMinutes: 60, firstOccurredAt: '2026-07-13T03:00:00.000Z', lastOccurredAt: '2026-08-07T03:00:00.000Z', recurringEventId: 'lunch', recurring: true, category: 'その他' },
  { id: 'title:集中開発', title: '集中開発・コーディング', occurrences: 1, totalMinutes: 165, averageMinutes: 165, firstOccurredAt: '2026-08-01T01:00:00.000Z', lastOccurredAt: '2026-08-01T01:00:00.000Z', recurring: false, category: 'その他' },
  { id: 'recurring:report', title: '売上レポート作成', occurrences: 4, totalMinutes: 180, averageMinutes: 45, firstOccurredAt: '2026-07-13T01:00:00.000Z', lastOccurredAt: '2026-08-03T01:00:00.000Z', recurringEventId: 'report', recurring: true, category: '資料作成' },
  { id: 'title:資料レビュー', title: '資料レビュー', occurrences: 2, totalMinutes: 150, averageMinutes: 75, firstOccurredAt: '2026-07-20T01:00:00.000Z', lastOccurredAt: '2026-07-27T01:00:00.000Z', recurring: false, category: '資料作成' },
]
assert.equal(isLikelyPersonal('昼休憩'), true)
assert.equal(isLikelyPersonal('売上レポート作成'), false)
const ranked = rankDiscoveryCandidates(rankGroups)
assert.ok(!ranked.some((group) => group.title === '昼休憩'), 'personal events must not be suggested')
assert.ok(!ranked.some((group) => group.title === '集中開発・コーディング'), 'one-off events must not be suggested')
assert.equal(ranked[0]?.title, '売上レポート作成')
assert.ok(ranked.some((group) => group.title === '資料レビュー'), '2+ occurrences with 2h+ total qualifies')
assert.ok(!rankDiscoveryCandidates(rankGroups, ['売上レポート作成']).some((group) => group.title === '売上レポート作成'), 'excluded titles must not be suggested')

console.log('WorkGroup checks passed')
