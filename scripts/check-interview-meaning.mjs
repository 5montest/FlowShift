import assert from 'node:assert/strict'
import { finalizeBusinessTask } from '../shared/interview.ts'

const observation = {
  title: '朝会', occurrences: 20, totalMinutes: 300, averageMinutes: 15,
  firstOccurredAt: '2026-07-13T00:00:00.000Z', lastOccurredAt: '2026-08-07T00:00:00.000Z', recurring: true,
}

const consultationAnswer = {
  questionId: 'core-output', dimension: 'outputNeed', question: '現在の会議形式は必要ですか？',
  answer: '予定は非同期共有できるが、相談時間は別途必要', source: 'OPTION', optionId: 'output-consultation',
  meaning: {
    outputNeed: 'SYNC_DISCUSSION_STILL_REQUIRED',
    roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }],
    contextState: 'CONFIRMED',
  },
}

const contradictoryDraft = {
  name: '朝会', purpose: 'チームが重要な変更を把握して調整を判断する', frequency: '過去4週間で20回', duration: '1回15分', trigger: '毎朝',
  stakeholders: [], consumer: '未確認', businessRoles: ['通知確認'], tools: [], inputs: [], output: '予定共有', steps: [], decisionPoints: [], exceptions: [], constraints: [], dependencies: [], risks: [],
  outputRequirement: 'NOT_REQUIRED', outputRequirementReason: '通知だけでよい',
  contextStatus: { purpose: 'CONFIRMED', stakeholders: 'UNKNOWN', roles: 'UNKNOWN', process: 'UNKNOWN', decisions: 'UNKNOWN', exceptions: 'UNKNOWN', constraints: 'UNKNOWN', dependencies: 'UNKNOWN', risks: 'UNKNOWN', output: 'UNKNOWN' },
}

const task = finalizeBusinessTask(observation, [consultationAnswer], contradictoryDraft)
assert.equal(task.outputRequirement, 'UNKNOWN')
assert.equal(task.deliveryModel.sharingMode, 'ASYNC_POSSIBLE')
assert.equal(task.deliveryModel.synchronousRole, 'SEPARATE_REQUIRED')
assert.equal(task.deliveryModel.currentFormat, 'UNKNOWN')
assert.deepEqual(task.businessRoles, ['困りごとの相談と担当調整'])
assert.equal(task.contextStatus.roles, 'CONFIRMED')
assert.equal(task.answerEvidence[0].answer, '予定は非同期共有できるが、相談時間は別途必要')
assert.match(task.outputRequirementReason, /予定は非同期共有できるが、相談時間は別途必要/)

const correctedAnswer = {
  ...consultationAnswer,
  questionId: 'follow-consultation',
  answer: '困りごとの相談と担当調整の役割はない',
  optionId: 'follow-consultation-no',
  meaning: { roles: [{ name: '困りごとの相談と担当調整', present: false, scope: 'ALL' }], contextState: 'CONFIRMED' },
}
const corrected = finalizeBusinessTask(observation, [consultationAnswer, correctedAnswer], contradictoryDraft)
assert.deepEqual(corrected.businessRoles, [])

const partialRoleAnswer = {
  questionId: 'follow-training', dimension: 'roles', question: '新人教育の役割はありますか？',
  answer: '一部の回や参加者にだけ当てはまる', source: 'OPTION', optionId: 'follow-training-partial',
  meaning: {
    roles: [{ name: '新人教育・関係づくり', present: true, scope: 'PARTIAL', scopeDetail: '一部の回または参加者のみ' }],
    contextState: 'PARTIAL',
  },
}
const partial = finalizeBusinessTask(observation, [partialRoleAnswer], contradictoryDraft)
assert.equal(partial.contextStatus.roles, 'PARTIAL')
assert.equal(partial.businessRoleDetails[0].scope, 'PARTIAL')
assert.equal(partial.businessRoleDetails[0].scopeDetail, '一部の回または参加者のみ')

const processWithPartialRole = {
  questionId: 'follow-process', dimension: 'process', question: '普段行うことを選んでください',
  answer: '予定共有、新人への説明', source: 'OPTION', optionIds: ['process-share', 'process-training'],
  meaning: {
    roles: [{ name: '新人教育・関係づくり', present: true, scope: 'PARTIAL', scopeDetail: '新人が参加する回のみ' }],
    processItems: ['予定共有', '新人への説明'],
    contextState: 'PARTIAL',
  },
}
const processTask = finalizeBusinessTask(observation, [processWithPartialRole], contradictoryDraft)
assert.equal(processTask.contextStatus.process, 'CONFIRMED')
assert.equal(processTask.contextStatus.roles, 'PARTIAL')
assert.deepEqual(processTask.steps, ['予定共有', '新人への説明'])

const vagueStakeholderAnswer = {
  questionId: 'follow-stakeholders', dimension: 'stakeholders', question: '関係者を教えてください',
  answer: '関係者・利用者がある', source: 'OPTION', optionId: 'stakeholder-exists',
  meaning: { roles: [], stakeholders: [], contextState: 'CONFIRMED' },
}
const vagueStakeholders = finalizeBusinessTask(observation, [vagueStakeholderAnswer], contradictoryDraft)
assert.equal(vagueStakeholders.contextStatus.stakeholders, 'UNKNOWN')
assert.deepEqual(vagueStakeholders.stakeholders, [])

const concreteStakeholderAnswer = {
  ...vagueStakeholderAnswer,
  answer: 'チームメンバー、チーム責任者',
  optionId: undefined,
  optionIds: ['stakeholder-team', 'stakeholder-lead'],
  meaning: { roles: [], stakeholders: ['チームメンバー', 'チーム責任者'], contextState: 'CONFIRMED' },
}
const concreteStakeholders = finalizeBusinessTask(observation, [concreteStakeholderAnswer], contradictoryDraft)
assert.equal(concreteStakeholders.contextStatus.stakeholders, 'CONFIRMED')
assert.deepEqual(concreteStakeholders.stakeholders, ['チームメンバー', 'チーム責任者'])

console.log('Interview meaning fidelity checks passed')
