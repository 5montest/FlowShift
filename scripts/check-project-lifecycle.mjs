import assert from 'node:assert/strict'
import { improvementProjectSchema, updateProjectContextRequestSchema } from '../shared/project-schema.ts'
import { createDemoDesign, initialBusinessTask } from '../shared/demo-fixtures.ts'

const proposal = createDemoDesign(initialBusinessTask)
const createdAt = '2026-08-11T00:00:00.000Z'

const legacyProject = improvementProjectSchema.parse({
  id: 'fd0f3bf7-4f44-438f-9761-60408390dd0a',
  taskName: '朝会',
  businessContext: initialBusinessTask,
  proposal,
  hypothesis: proposal.redesign.hypothesis,
  validations: proposal.validationPlan.items,
  status: 'DRAFT',
  createdAt,
  updatedAt: createdAt,
})

assert.equal(legacyProject.contextDirty, false)
assert.deepEqual(legacyProject.history, [])

const contextUpdate = updateProjectContextRequestSchema.parse({
  businessContext: initialBusinessTask,
  revisionSummary: '相談機能は別途必要と確認',
})
assert.equal(contextUpdate.revisionSummary, '相談機能は別途必要と確認')
assert.equal(contextUpdate.businessContext.deliveryModel.synchronousRole, 'UNKNOWN')

console.log('ImprovementProject lifecycle schema checks passed')
