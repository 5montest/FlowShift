import assert from 'node:assert/strict'
import { improvementProjectSchema, parseStoredProject, projectContext, projectName, updateProjectRequestSchema } from '../shared/project-schema.ts'
import { createDemoDesign, initialBusinessTask } from '../shared/demo-fixtures.ts'

const proposal = createDemoDesign(initialBusinessTask)
const createdAt = '2026-08-11T00:00:00.000Z'

const project = improvementProjectSchema.parse({
  id: 'fd0f3bf7-4f44-438f-9761-60408390dd0a',
  proposal,
  status: 'DRAFT',
  createdAt,
  updatedAt: createdAt,
})

assert.deepEqual(project.history, [])
assert.equal(project.pendingContext, undefined)
assert.equal(projectName(project), '朝会')
assert.equal(projectContext(project), project.proposal.businessTask)

const contextUpdate = updateProjectRequestSchema.parse({
  action: 'context',
  pendingContext: initialBusinessTask,
  revisionSummary: '相談機能は別途必要と確認',
})
assert.equal(contextUpdate.action, 'context')
assert.equal(contextUpdate.revisionSummary, '相談機能は別途必要と確認')
assert.equal(contextUpdate.pendingContext.deliveryModel.synchronousRole, 'UNKNOWN')
const statusUpdate = updateProjectRequestSchema.parse({ action: 'status', status: 'ADOPTED' })
assert.equal(statusUpdate.status, 'ADOPTED')

const withPending = improvementProjectSchema.parse({ ...project, pendingContext: initialBusinessTask })
assert.equal(projectContext(withPending), withPending.pendingContext)

// v1形式（businessContext / hypothesis / validations / taskName / contextDirty / reviewAt、
// contextStatusの旧キー、UI非表示のため削除した設計フィールド）の保存行が
// parseStoredProjectで読み込めることを固定する。
const v1Row = JSON.parse(JSON.stringify({
  id: project.id,
  taskName: '朝会',
  businessContext: initialBusinessTask,
  proposal,
  hypothesis: proposal.redesign.hypothesis,
  validations: proposal.validationPlan.items,
  status: 'VALIDATING',
  contextDirty: true,
  history: [],
  createdAt,
  updatedAt: createdAt,
  reviewAt: createdAt,
}))
const downgradeContextStatus = (task) => {
  task.contextStatus.decisions = task.contextStatus.decision
  delete task.contextStatus.decision
  task.contextStatus.output = task.contextStatus.outputNeed
  delete task.contextStatus.outputNeed
  delete task.observed.sourceGroupId
}
downgradeContextStatus(v1Row.businessContext)
downgradeContextStatus(v1Row.proposal.businessTask)
v1Row.proposal.analysis.purposeCheck = { outcome: 'x', currentMeans: 'y', outputDecision: 'z' }
v1Row.proposal.analysis.ratings = { opportunity: 'MEDIUM', implementation: 'MEDIUM', aiFit: 'MEDIUM' }
v1Row.proposal.redesign.insight = '古いフィールド'
v1Row.proposal.redesign.hypothesis = 'あ'.repeat(500)
v1Row.proposal.redesign.impact = { routineMinutesPerCycle: 0, exceptionMinutesMin: 5, exceptionMinutesMax: 10, confidence: 'LOW', assumption: '前提' }

const upgraded = parseStoredProject(v1Row)
assert.ok(upgraded, 'v1 row must upgrade to v2')
assert.equal(upgraded.status, 'VALIDATING')
assert.ok(upgraded.pendingContext, 'contextDirty:true must become pendingContext')
assert.equal(upgraded.pendingContext.contextStatus.decision, initialBusinessTask.contextStatus.decision)
assert.equal(upgraded.proposal.businessTask.contextStatus.outputNeed, initialBusinessTask.contextStatus.outputNeed)
assert.ok(upgraded.proposal.redesign.hypothesis.length <= 200)
assert.deepEqual(Object.keys(upgraded.proposal.redesign.impact), ['assumption'])
assert.equal('reviewAt' in upgraded, false)

// contextDirty:false のv1行はpendingContext無しに畳まれる
const cleanV1 = JSON.parse(JSON.stringify(v1Row))
cleanV1.contextDirty = false
const upgradedClean = parseStoredProject(cleanV1)
assert.ok(upgradedClean)
assert.equal(upgradedClean.pendingContext, undefined)

console.log('ImprovementProject lifecycle and v1->v2 upgrade checks passed')
