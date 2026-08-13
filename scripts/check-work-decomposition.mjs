import assert from 'node:assert/strict'
import { decomposeBusinessTask, proposedTreatment } from '../shared/work-decomposition.ts'
import { demoProject } from '../shared/demo-fixtures.ts'

const components = decomposeBusinessTask(demoProject.businessContext)
const byKind = new Map(components.map((component) => [component.kind, component]))

assert.deepEqual(components.map((component) => component.kind), ['SHARE', 'OBSERVE', 'CONSULT', 'DECIDE', 'EDUCATE'])
assert.equal(byKind.get('EDUCATE')?.scope, 'PARTIAL')
assert.equal(byKind.get('EDUCATE')?.scopeDetail, '新人が参加する回のみ')
assert.ok(byKind.get('CONSULT')?.sourceQuestionIds.includes('follow-process'))
assert.ok(proposedTreatment(byKind.get('SHARE'), demoProject.proposal).length > 0)

console.log('work decomposition check passed')
