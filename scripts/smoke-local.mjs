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

// プロフィール：ローカルはセッション無しでGETがnull、PUTはOrigin検査で拒否される
const profileResponse = await fetch(`${baseUrl}/api/profile`)
assert.equal(profileResponse.status, 200)
const putProfileResponse = await fetch(`${baseUrl}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobType: '営業' }) })
assert.equal(putProfileResponse.status, 403, 'Profile update must reject a missing Origin header')

if (process.argv.includes('--skip-ai')) {
  console.log('Local HTTP, Calendar auth boundary, and origin checks passed')
  process.exit(0)
}

const classifyResponse = await fetch(`${baseUrl}/api/classify-work`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ titles: ['昼休憩', '売上レポート作成', 'API連携モジュール実装'] }),
})
const classifyResult = await classifyResponse.json()
assert.equal(classifyResponse.status, 200, `Work classification failed: ${JSON.stringify(classifyResult)}`)
assert.ok(Array.isArray(classifyResult.categories) && classifyResult.categories.length >= 1)
const validCategories = new Set(['会議', '資料作成', 'データ処理', '顧客対応', '開発・制作', '休憩・私用', 'その他'])
for (const item of classifyResult.categories) {
  assert.ok(validCategories.has(item.category), `unexpected category: ${item.category}`)
}

const optionsResponse = await fetch(`${baseUrl}/api/interview-options`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ observation }),
})
const optionsResult = await optionsResponse.json()
assert.equal(optionsResponse.status, 200, `Interview plan generation failed: ${JSON.stringify(optionsResult)}`)
assert.equal(optionsResult.options?.phase, 'CORE')
assert.equal(optionsResult.options?.questions?.length, 3)
for (const required of ['purpose', 'decision', 'outputNeed']) {
  assert.ok(optionsResult.options.questions.some((question) => question.dimension === required), `${required} question is required`)
}

const purposeQuestion = optionsResult.options.questions.find((question) => question.dimension === 'purpose')
const decisionQuestion = optionsResult.options.questions.find((question) => question.dimension === 'decision')
const outputQuestion = optionsResult.options.questions.find((question) => question.dimension === 'outputNeed')
const consultationOption = outputQuestion.options.find((option) => option.meaning.outputNeed === 'SYNC_DISCUSSION_STILL_REQUIRED')
assert.ok(consultationOption, 'A synchronous consultation option is required')
assert.ok(consultationOption.meaning.roles.some((role) => role.present), 'The consultation role must be machine-readable')

function selectedAnswer(question, option) {
  return {
    questionId: question.id,
    dimension: question.dimension,
    question: question.prompt,
    answer: option.label,
    source: 'OPTION',
    optionId: option.id,
    meaning: option.meaning,
  }
}

const answers = [
  selectedAnswer(purposeQuestion, purposeQuestion.options[0]),
  selectedAnswer(decisionQuestion, decisionQuestion.options[0]),
  selectedAnswer(outputQuestion, consultationOption),
]

const response = await fetch(`${baseUrl}/api/business-task`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    observation,
    answers,
  }),
})

const result = await response.json()
assert.equal(response.status, 200, `BusinessTask generation failed: ${JSON.stringify(result)}`)
assert.deepEqual(result.businessTask?.observed, observation)
assert.equal(result.businessTask?.contextStatus?.constraints, 'UNKNOWN')
assert.equal(result.businessTask?.contextStatus?.dependencies, 'UNKNOWN')
assert.equal(result.businessTask?.contextStatus?.risks, 'UNKNOWN')
assert.equal(result.businessTask?.outputRequirement, 'UNKNOWN')
assert.equal(result.businessTask?.deliveryModel?.sharingMode, 'ASYNC_POSSIBLE')
assert.equal(result.businessTask?.deliveryModel?.synchronousRole, 'SEPARATE_REQUIRED')
assert.equal(result.businessTask?.deliveryModel?.currentFormat, 'UNKNOWN')
assert.ok(result.businessTask?.businessRoles?.includes(consultationOption.meaning.roles.find((role) => role.present).name))
assert.equal(result.businessTask?.answerEvidence?.[2]?.answer, consultationOption.label)
assert.ok(!/(レポート|報告書|資料|メール|Excel|PowerPoint)/i.test(result.businessTask.purpose))

const followUpResponse = await fetch(`${baseUrl}/api/follow-up-questions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ businessTask: result.businessTask }),
})
const followUpResult = await followUpResponse.json()
assert.equal(followUpResponse.status, 200, `Follow-up generation failed: ${JSON.stringify(followUpResult)}`)
assert.equal(followUpResult.plan?.phase, 'FOLLOW_UP')
assert.ok(followUpResult.plan.questions.length <= 4)

const designResponse = await fetch(`${baseUrl}/api/design`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ businessTask: result.businessTask }),
})
const designResult = await designResponse.json()
assert.equal(designResponse.status, 200, `Business redesign generation failed: ${JSON.stringify(designResult)}`)
assert.equal(designResult.design?.analysis?.readiness, 'NEEDS_CONTEXT')
// 判断保留でも具体案は描く（KEEPへ逃げない）。ELIMINATEだけはsuperRefineが禁じている
assert.ok(['AUTOMATE', 'ON_DEMAND', 'KEEP'].includes(designResult.design?.redesign?.strategy), `unexpected strategy: ${designResult.design?.redesign?.strategy}`)
const confirmedRoleName = consultationOption.meaning.roles.find((role) => role.present).name
const roleRegex = new RegExp(confirmedRoleName)
assert.ok(
  roleRegex.test(designResult.design?.redesign?.hypothesis ?? '') || roleRegex.test(designResult.design?.redesign?.roleNote ?? ''),
  'confirmed role must be stated in hypothesis or roleNote',
)
assert.ok(!designResult.design?.analysis?.unknowns?.some((item) => item.includes('相談')))
assert.equal(typeof designResult.design?.redesign?.hypothesis, 'string')
assert.ok(designResult.design?.analysis?.unknowns?.length > 0)
assert.ok(designResult.design?.validationPlan?.items?.length > 0)

console.log('Local interview, context model, conditional hypothesis, and validation smoke tests passed.')
