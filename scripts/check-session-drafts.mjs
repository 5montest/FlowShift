import assert from 'node:assert/strict'
import { fallbackCorePlan } from '../shared/context-questions.ts'
import { createDemoDesign, demoInterviewPlan, demoWorkGroups, initialBusinessTask } from '../shared/demo-fixtures.ts'
import { parseDraft, SESSION_DRAFT_TTL_MS } from '../shared/session-draft.ts'
import { workGroupSchema } from '../shared/work-group.ts'

for (const group of demoWorkGroups) {
  assert.ok(workGroupSchema.safeParse(group).success, `workGroupSchema must accept fixture group ${group.id}`)
}

const now = Date.now()
const fullDraft = {
  version: 1,
  group: demoWorkGroups[0],
  plan: demoInterviewPlan,
  answers: initialBusinessTask.answerEvidence,
  pendingQuestions: fallbackCorePlan().questions.slice(0, 2),
  askedQuestions: demoInterviewPlan.questions,
  task: initialBusinessTask,
  refinedTask: initialBusinessTask,
  design: createDemoDesign(initialBusinessTask),
  updatedAt: new Date(now).toISOString(),
}

// localStorage経由と同じJSONラウンドトリップで復元できること
const roundTripped = parseDraft(JSON.parse(JSON.stringify(fullDraft)), now)
assert.ok(roundTripped, 'full draft must round-trip through JSON')
assert.equal(roundTripped.group.id, demoWorkGroups[0].id)
assert.equal(roundTripped.answers.length, initialBusinessTask.answerEvidence.length)
assert.ok(roundTripped.design)

// 最小の下書き（回答1件・仮説なし）も通ること
const minimalDraft = { ...fullDraft, answers: fullDraft.answers.slice(0, 1), pendingQuestions: [], task: null, refinedTask: null, design: null }
assert.ok(parseDraft(JSON.parse(JSON.stringify(minimalDraft)), now), 'minimal draft must parse')

// askedQuestions・interviewComplete・followUpRoundsを持たない旧下書きはdefaultで補われる（後方互換）
const { askedQuestions: _asked, ...legacyDraft } = fullDraft
const upgradedDraft = parseDraft(JSON.parse(JSON.stringify(legacyDraft)), now)
assert.ok(upgradedDraft, 'draft without askedQuestions must still parse')
assert.deepEqual(upgradedDraft.askedQuestions, [])
assert.equal(upgradedDraft.interviewComplete, false)
assert.equal(upgradedDraft.followUpRounds, 0)

// 連続インタビューの進行状態がラウンドトリップで保持されること
const continuedDraft = parseDraft(JSON.parse(JSON.stringify({ ...fullDraft, interviewComplete: true, followUpRounds: 2 })), now)
assert.ok(continuedDraft)
assert.equal(continuedDraft.interviewComplete, true)
assert.equal(continuedDraft.followUpRounds, 2)

// 期限切れ・バージョン違い・未知キー・plan欠落は静かにnull
const expired = { ...fullDraft, updatedAt: new Date(now - SESSION_DRAFT_TTL_MS - 24 * 60 * 60 * 1000).toISOString() }
assert.equal(parseDraft(JSON.parse(JSON.stringify(expired)), now), null, 'expired draft must be dropped')
assert.equal(parseDraft({ ...fullDraft, version: 2 }, now), null, 'unknown version must be dropped')
assert.equal(parseDraft({ ...fullDraft, extra: true }, now), null, 'unknown keys must be dropped (strict)')
const { plan: _plan, ...withoutPlan } = fullDraft
assert.equal(parseDraft(withoutPlan, now), null, 'draft without plan must be dropped')
assert.equal(parseDraft('garbage', now), null)
assert.equal(parseDraft(null, now), null)

console.log('Session draft round-trip and pruning checks passed')
