import assert from 'node:assert/strict'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:5173'
const observation = {
  title: '朝会',
  occurrences: 20,
  totalMinutes: 300,
  averageMinutes: 15,
  firstOccurredAt: '2026-07-13T00:00:00.000Z',
  lastOccurredAt: '2026-08-07T00:00:00.000Z',
  recurring: true,
}

const healthResponse = await fetch(`${baseUrl}/api/health`)
assert.equal(healthResponse.status, 200, 'Local Worker health check failed')
const health = await healthResponse.json()
assert.equal(typeof health.googleCalendarConfigured, 'boolean')

const calendarStatusResponse = await fetch(`${baseUrl}/api/google/status`)
const calendarStatus = await calendarStatusResponse.json()
assert.equal(calendarStatusResponse.status, 200, `Calendar status failed: ${JSON.stringify(calendarStatus)}`)
assert.equal(typeof calendarStatus.configured, 'boolean')
assert.equal(calendarStatus.connected, false)

const calendarEventsResponse = await fetch(`${baseUrl}/api/calendar/events`)
assert.ok([401, 503].includes(calendarEventsResponse.status), `Unauthenticated calendar request returned ${calendarEventsResponse.status}`)

const disconnectResponse = await fetch(`${baseUrl}/api/google/disconnect`, { method: 'POST' })
assert.equal(disconnectResponse.status, 403, 'Calendar disconnect must reject a missing Origin header')

const optionsResponse = await fetch(`${baseUrl}/api/interview-options`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ observation }),
})
const optionsResult = await optionsResponse.json()
assert.equal(optionsResponse.status, 200, `Interview plan generation failed: ${JSON.stringify(optionsResult)}`)
assert.ok(optionsResult.options?.questions?.length >= 4)
for (const required of ['purpose', 'process', 'decision', 'outputNeed']) {
  assert.ok(optionsResult.options.questions.some((question) => question.id === required), `${required} question is required`)
}

const response = await fetch(`${baseUrl}/api/business-task`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    observation,
    answers: [
      { dimension: 'purpose', question: '何を判断するためですか？', answer: 'チーム全員が重要な予定変更を把握し、調整の要否を判断するためです。' },
      { dimension: 'process', question: '現在何をしていますか？', answer: '各自が今日の予定と変更点を順番に口頭共有します。' },
      { dimension: 'decision', question: 'どこで人が判断しますか？', answer: '予定が衝突した場合に担当や時間を調整します。' },
      { dimension: 'outputNeed', question: '毎朝集まることは必須ですか？', answer: '重要な変化があるときだけ通知されればよいですが、他の役割はまだ確認できていません。' },
    ],
  }),
})

const result = await response.json()
assert.equal(response.status, 200, `BusinessTask generation failed: ${JSON.stringify(result)}`)
assert.deepEqual(result.businessTask?.observed, observation)
assert.equal(result.businessTask?.contextStatus?.constraints, 'UNKNOWN')
assert.equal(result.businessTask?.contextStatus?.dependencies, 'UNKNOWN')
assert.equal(result.businessTask?.contextStatus?.risks, 'UNKNOWN')
assert.ok(!/(レポート|報告書|資料|メール|Excel|PowerPoint)/i.test(result.businessTask.purpose))

const designResponse = await fetch(`${baseUrl}/api/design`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ businessTask: result.businessTask }),
})
const designResult = await designResponse.json()
assert.equal(designResponse.status, 200, `Business redesign generation failed: ${JSON.stringify(designResult)}`)
assert.equal(designResult.design?.analysis?.readiness, 'NEEDS_CONTEXT')
assert.equal(designResult.design?.redesign?.strategy, 'KEEP')
assert.equal(typeof designResult.design?.redesign?.hypothesis, 'string')
assert.ok(designResult.design?.analysis?.unknowns?.length > 0)
assert.ok(designResult.design?.validationPlan?.items?.length > 0)

console.log('Local interview, context model, conditional hypothesis, and validation smoke tests passed.')
