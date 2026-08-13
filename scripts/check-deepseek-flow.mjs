import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createBusinessDesign, createFollowUpQuestions, createInterviewOptions, extractBusinessTask } from '../worker/deepseek.ts'

const apiKey = (await readFile(new URL('../apikey.txt', import.meta.url), 'utf8')).trim()
assert.ok(apiKey, 'apikey.txt is empty')

const observation = {
  title: '朝会', occurrences: 20, totalMinutes: 300, averageMinutes: 15,
  firstOccurredAt: '2026-07-13T00:00:00.000Z', lastOccurredAt: '2026-08-07T00:00:00.000Z', recurring: true,
}

const plan = (await createInterviewOptions(apiKey, { observation })).value
assert.equal(plan.phase, 'CORE')
assert.equal(plan.questions.length, 3)
const purpose = plan.questions.find((question) => question.dimension === 'purpose')
const decision = plan.questions.find((question) => question.dimension === 'decision')
const output = plan.questions.find((question) => question.dimension === 'outputNeed')
assert.ok(purpose && decision && output)
const consultation = output.options.find((option) => option.meaning.outputNeed === 'SYNC_DISCUSSION_STILL_REQUIRED')
assert.ok(consultation)
const requiredRole = consultation.meaning.roles.find((role) => role.present)?.name
assert.ok(requiredRole)

function select(question, option) {
  return { questionId: question.id, dimension: question.dimension, question: question.prompt, answer: option.label, source: 'OPTION', optionId: option.id, meaning: option.meaning }
}

const answers = [select(purpose, purpose.options[0]), select(decision, decision.options[0]), select(output, consultation)]
const task = (await extractBusinessTask(apiKey, { observation, answers })).value
assert.equal(task.outputRequirement, 'UNKNOWN')
assert.equal(task.deliveryModel.sharingMode, 'ASYNC_POSSIBLE')
assert.equal(task.deliveryModel.synchronousRole, 'SEPARATE_REQUIRED')
assert.equal(task.deliveryModel.currentFormat, 'UNKNOWN')
assert.ok(task.businessRoles.includes(requiredRole))
assert.equal(task.answerEvidence[2].answer, consultation.label)

const followUp = (await createFollowUpQuestions(apiKey, task)).value
assert.equal(followUp.phase, 'FOLLOW_UP')
assert.ok(followUp.questions.length <= 4)

const design = (await createBusinessDesign(apiKey, task)).value
assert.equal(design.analysis.readiness, 'NEEDS_CONTEXT')
assert.equal(design.redesign.strategy, 'KEEP')
assert.match(design.redesign.hypothesis, /相談|調整/)
assert.doesNotMatch(design.redesign.hypothesis, /通知だけでよい/)
assert.ok(!design.analysis.unknowns.some((item) => item.includes('相談')))

console.log('DeepSeek Core Interview, fidelity, adaptive follow-up, and hypothesis checks passed')
