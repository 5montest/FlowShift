import assert from 'node:assert/strict'
import { groupCalendarEvents, summarizeWorkGroups } from '../shared/work-group.ts'

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

console.log('WorkGroup checks passed')
