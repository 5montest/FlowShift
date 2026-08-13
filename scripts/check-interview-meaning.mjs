import assert from 'node:assert/strict'
import { businessTaskDraftSchemaFor, businessTaskSchema } from '../shared/design-schema.ts'
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
  contextStatus: { purpose: 'CONFIRMED', stakeholders: 'UNKNOWN', roles: 'UNKNOWN', process: 'UNKNOWN', decision: 'UNKNOWN', exceptions: 'UNKNOWN', constraints: 'UNKNOWN', dependencies: 'UNKNOWN', risks: 'UNKNOWN', outputNeed: 'UNKNOWN' },
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

// 失敗コスト（誤りの影響）はrisks回答のmeaningから決定論で設定される。未回答はUNKNOWN
assert.equal(task.failureCost, 'UNKNOWN')
const highRiskAnswer = {
  questionId: 'context-risks', dimension: 'risks', question: 'この業務を変えるとき、最も避けたいことは何ですか？',
  answer: '重要な変更・異常の見逃し', source: 'OPTION', optionId: 'risk-miss',
  meaning: { roles: [], contextState: 'CONFIRMED', failureCost: 'HIGH' },
}
assert.equal(finalizeBusinessTask(observation, [consultationAnswer, highRiskAnswer], contradictoryDraft).failureCost, 'HIGH')
const lowRiskAnswer = { ...highRiskAnswer, optionId: 'risk-none', answer: '変えても大きな影響はない', meaning: { roles: [], contextState: 'CONFIRMED', failureCost: 'LOW' } }
assert.equal(finalizeBusinessTask(observation, [consultationAnswer, lowRiskAnswer], contradictoryDraft).failureCost, 'LOW')
assert.equal(finalizeBusinessTask(observation, [highRiskAnswer, lowRiskAnswer], contradictoryDraft).failureCost, 'LOW', 'latest answer wins')

// 目的文のスタイルガード：ユーザーの語彙に含まれる成果物名は許可し、含まれなければ拒否する。
// 保存データ検証（businessTaskSchema）には語のガードを掛けない（読み込みで落とさない）。
const mailPurposeDraft = { ...contradictoryDraft, purpose: '顧客からの問い合わせメールに漏れなく答え、対応状況を把握する' }
assert.ok(businessTaskDraftSchemaFor('問い合わせメール対応\n毎日メールを確認して返信する').safeParse(mailPurposeDraft).success, 'topic words from user vocabulary must be allowed in purpose')
assert.ok(!businessTaskDraftSchemaFor('朝会\n予定を共有する').safeParse(mailPurposeDraft).success, 'artifact words outside user vocabulary must be rejected')
assert.ok(businessTaskDraftSchemaFor('朝会').safeParse(contradictoryDraft).success)
assert.ok(businessTaskSchema.safeParse({ ...task, purpose: '問い合わせメールに答えて顧客の状況を把握する' }).success, 'stored tasks must never be dropped for purpose wording')

console.log('Interview meaning fidelity checks passed')
