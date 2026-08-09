import assert from 'node:assert/strict'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:5173'
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
  body: JSON.stringify({ eventTitle: '売上レポート作成', eventDurationMinutes: 45 }),
})
const optionsResult = await optionsResponse.json()
assert.equal(optionsResponse.status, 200, `Interview options generation failed: ${JSON.stringify(optionsResult)}`)
assert.equal(optionsResult.options?.purpose?.length, 3)
assert.equal(optionsResult.options?.process?.length, 3)
assert.equal(optionsResult.options?.exceptions?.length, 3)
assert.equal(optionsResult.options?.outputNeed?.length, 4)
assert.ok(optionsResult.options.purpose.every((item) => !/(レポート|報告書|資料|メール|Excel|PowerPoint)/i.test(item)))

const response = await fetch(`${baseUrl}/api/business-task`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventTitle: '売上レポート作成',
    eventDurationMinutes: 45,
    answers: [
      { question: 'この業務は、誰が何を判断するために行っていますか？', answer: '上司が週ごとの売上変化を確認し、問題があれば営業施策を判断するためです。' },
      { question: '実際には、どのツールを使って何をしていますか？', answer: 'SalesforceからCSVを取得し、Excelで集計してPowerPointへ貼り、Teamsで共有します。' },
      { question: 'いつ人の判断が必要になりますか？', answer: '前週比が大きく変わったときだけ、原因を確認してコメントします。' },
      { question: '現在の成果物は本当に必要ですか？', answer: '重要な変化があるときだけ通知されればよいです。' },
    ],
  }),
})

const result = await response.json()
assert.equal(response.status, 200, `BusinessTask generation failed: ${JSON.stringify(result)}`)
assert.equal(typeof result.businessTask?.duration, 'string')
assert.ok(Array.isArray(result.businessTask?.decisionPoints))
assert.ok(result.businessTask.decisionPoints.every((item) => typeof item === 'string'))
assert.equal(result.businessTask.outputRequirement, 'NOT_REQUIRED')
assert.ok(!/(レポート|報告書|資料|メール|Excel|PowerPoint)/i.test(result.businessTask.purpose))

const designResponse = await fetch(`${baseUrl}/api/design`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ businessTask: result.businessTask }),
})
const designResult = await designResponse.json()
assert.equal(designResponse.status, 200, `Business redesign generation failed: ${JSON.stringify(designResult)}`)
assert.equal(designResult.design?.redesign?.strategy, 'ELIMINATE')
assert.equal(designResult.design?.redesign?.impact?.routineMinutesPerCycle, 0)
assert.match(designResult.design?.redesign?.metrics?.scheduledOutputAfter ?? '', /(0|なし|廃止|不要|作らない)/)
const redesignedWorkflow = designResult.design.redesign.workflow.map((step) => `${step.label} ${step.detail}`).join('\n')
assert.ok(!/(?:定期|毎回|毎週|毎月).{0,16}(?:レポート|報告書|資料|メール|レビュー|承認)|(?:レポート|報告書|資料).{0,16}(?:作成|生成|配信|送信|共有|レビュー|承認)|(?:定期メール|メール配信|毎回レビュー|毎回承認)/.test(redesignedWorkflow))
console.log('Local DeepSeek interview, BusinessTask, and redesign smoke tests passed.')
