import assert from 'node:assert/strict'
import { applyCategories, calendarKeyOfGroupId, categorizeWork, groupCalendarEvents, isLikelyPersonal, mergeWorkGroups, rankDiscoveryCandidates, summarizeWorkGroups, workClassificationRequestSchema, workClassificationResponseSchema, workGroupSchema } from '../shared/work-group.ts'

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

// 分類：regexフォールバックとAI割り当ての適用
assert.equal(categorizeWork('集中開発・コーディング（API連携モジュール実装）'), '開発・制作')
assert.equal(categorizeWork('昼休憩'), '休憩・私用')
assert.equal(categorizeWork('週次MTG'), '会議')
assert.equal(categorizeWork('謎の予定'), 'その他')
const applied = applyCategories(rankGroups, { '集中開発・コーディング': '開発・制作' })
assert.equal(applied.find((group) => group.title === '集中開発・コーディング')?.category, '開発・制作')
assert.equal(applied.find((group) => group.title === '売上レポート作成')?.category, '資料作成', 'unmapped titles keep their category')
// 休憩・私用categoryは声かけから除外される（タイトル判定を通り抜けても）
const sneakyBreak = { ...rankGroups[2], id: 'recurring:tea', title: 'ティータイム', category: '休憩・私用' }
assert.ok(!rankDiscoveryCandidates([sneakyBreak]).length, 'personal category must be excluded from suggestions')
assert.ok(workClassificationRequestSchema.safeParse({ titles: ['朝会'] }).success)
assert.ok(!workClassificationRequestSchema.safeParse({ titles: [] }).success)
assert.ok(workClassificationResponseSchema.safeParse({ categories: [{ title: '朝会', category: '会議' }] }).success)
assert.ok(!workClassificationResponseSchema.safeParse({ categories: [{ title: '朝会', category: '謎分類' }] }).success)

// 他カレンダーのグループIDは名前空間分離され、同じ定例予定IDでも自分のIDと衝突しない
const otherCalendar = { id: 'buka@example.com', name: '部下 太郎' }
const otherGroups = groupCalendarEvents(events, otherCalendar)
const ownGroups = groupCalendarEvents(events)
assert.ok(otherGroups.every((group) => group.id.startsWith('cal:buka%40example.com|')), 'other-calendar ids must be namespaced')
assert.ok(otherGroups.every((group) => group.sourceCalendarName === '部下 太郎'), 'other-calendar groups carry the calendar name')
assert.ok(ownGroups.every((group) => !group.id.startsWith('cal:')), 'own calendar ids must stay unprefixed')
assert.equal(new Set([...otherGroups, ...ownGroups].map((group) => group.id)).size, otherGroups.length + ownGroups.length, 'ids must not collide across calendars')
assert.equal(calendarKeyOfGroupId(otherGroups[0].id), 'buka@example.com')
assert.equal(calendarKeyOfGroupId(ownGroups[0].id), null)
assert.equal(calendarKeyOfGroupId(undefined), null)
assert.equal(calendarKeyOfGroupId('manual:abc'), null)

// 非公開予定（タイトル無し→「予定」）は巨大グループ化しても声かけしない
const privateBlock = { id: 'recurring:private', title: '予定', occurrences: 12, totalMinutes: 720, averageMinutes: 60, firstOccurredAt: '2026-07-13T00:00:00.000Z', lastOccurredAt: '2026-08-07T00:00:00.000Z', recurringEventId: 'private', recurring: true, category: 'その他' }
assert.ok(!rankDiscoveryCandidates([privateBlock]).length, 'untitled private events must not be suggested')

// 手動登録業務のマージ：タイトル衝突はカレンダー実測が勝ち、非衝突は合計時間順に並ぶ
const manualWork = {
  id: 'manual:00000000-0000-4000-8000-000000000001',
  title: '問い合わせメール対応',
  occurrences: 10,
  totalMinutes: 300,
  averageMinutes: 30,
  firstOccurredAt: '2026-07-16T00:00:00.000Z',
  lastOccurredAt: '2026-08-13T00:00:00.000Z',
  recurring: true,
  category: '顧客対応',
}
const manualDuplicate = { ...manualWork, id: 'manual:00000000-0000-4000-8000-000000000002', title: ' 売上レポート作成 ', totalMinutes: 999 }
assert.ok(workGroupSchema.safeParse(manualWork).success, 'manual work must satisfy workGroupSchema')
const mergedGroups = mergeWorkGroups(rankGroups, [manualWork, manualDuplicate])
assert.equal(mergedGroups.length, rankGroups.length + 1, 'duplicate titles must not be double counted')
assert.ok(!mergedGroups.some((group) => group.totalMinutes === 999), 'calendar observation must win over manual input')
assert.ok(mergedGroups.some((group) => group.id === manualWork.id))
assert.deepEqual(mergedGroups.map((group) => group.totalMinutes), [...mergedGroups.map((group) => group.totalMinutes)].sort((a, b) => b - a), 'merged list keeps totalMinutes order')
assert.equal(rankDiscoveryCandidates(mergeWorkGroups([], [manualWork]))[0]?.id, manualWork.id, 'recurring manual work qualifies for discovery')

// プロフィールのプロンプト補間行
const { profileSummaryLine } = await import('../shared/profile-schema.ts')
assert.equal(profileSummaryLine(undefined), '')
assert.equal(profileSummaryLine({}), '')
assert.equal(
  profileSummaryLine({ jobType: '開発・エンジニア', roleLevel: 'メンバー', workStart: '09:00', workEnd: '18:00', holidayPattern: '土日祝で固定' }),
  'ユーザー情報：職種=開発・エンジニア、役職=メンバー、所定労働=09:00〜18:00、休み=土日祝で固定',
)
assert.equal(profileSummaryLine({ jobType: '営業' }), 'ユーザー情報：職種=営業')

console.log('WorkGroup checks passed')
