import type { BusinessDesign, BusinessTask, ContextState, RoleScope } from './design-schema.ts'

export type WorkComponentKind = 'SHARE' | 'OBSERVE' | 'CONSULT' | 'DECIDE' | 'EDUCATE' | 'PRODUCE' | 'EXECUTE'

export type WorkComponent = {
  id: string
  kind: WorkComponentKind
  label: string
  items: string[]
  state: ContextState
  scope: RoleScope
  scopeDetail?: string
  sourceQuestionIds: string[]
}

export const workComponentLabels: Record<WorkComponentKind, string> = {
  SHARE: '共有・連携',
  OBSERVE: '観測・確認',
  CONSULT: '相談・支援',
  DECIDE: '判断・調整',
  EDUCATE: '教育・関係づくり',
  PRODUCE: '成果物',
  EXECUTE: '実行作業',
}

const kindOrder: WorkComponentKind[] = ['SHARE', 'OBSERVE', 'CONSULT', 'DECIDE', 'EDUCATE', 'PRODUCE', 'EXECUTE']

function classify(label: string): WorkComponentKind {
  if (/新人|教育|関係づくり/.test(label)) return 'EDUCATE'
  if (/相談|困りごと|支援/.test(label)) return 'CONSULT'
  if (/判断|承認|決裁|調整|担当/.test(label)) return 'DECIDE'
  if (/変更|変化|差分|確認|監視|把握|検知/.test(label)) return 'OBSERVE'
  if (/共有|通知|連絡|報告/.test(label)) return 'SHARE'
  if (/作成|生成|成果物|資料|レポート|出力/.test(label)) return 'PRODUCE'
  return 'EXECUTE'
}

function questionIds(task: BusinessTask, dimensions: string[]): string[] {
  return task.answerEvidence.filter((answer) => dimensions.includes(answer.dimension)).map((answer) => answer.questionId)
}

export function decomposeBusinessTask(task: BusinessTask): WorkComponent[] {
  const components = new Map<WorkComponentKind, WorkComponent>()

  function add(label: string, state: ContextState, scope: RoleScope, sourceQuestionIds: string[], scopeDetail?: string) {
    if (!label || label === '未確認') return
    const kind = classify(label)
    const current = components.get(kind)
    if (current) {
      if (!current.items.includes(label)) current.items.push(label)
      current.sourceQuestionIds = [...new Set([...current.sourceQuestionIds, ...sourceQuestionIds])]
      if (current.state !== state) current.state = 'PARTIAL'
      if (scope === 'PARTIAL' || scope === 'CONDITIONAL') {
        current.scope = scope
        current.scopeDetail = scopeDetail
      }
      return
    }
    components.set(kind, {
      id: kind.toLowerCase(),
      kind,
      label: workComponentLabels[kind],
      items: [label],
      state,
      scope,
      scopeDetail,
      sourceQuestionIds,
    })
  }

  if (task.deliveryModel.sharingMode !== 'UNKNOWN') {
    add('予定・情報の共有', task.contextStatus.outputNeed, 'ALL', task.deliveryModel.sourceQuestionId ? [task.deliveryModel.sourceQuestionId] : [])
  }
  for (const step of task.steps) add(step, task.contextStatus.process, 'ALL', questionIds(task, ['process']))
  for (const role of task.businessRoleDetails.filter((item) => item.present)) {
    const roleState = role.scope === 'ALL' ? 'CONFIRMED' : role.scope === 'UNKNOWN' ? 'UNKNOWN' : 'PARTIAL'
    add(role.name, roleState, role.scope, [role.sourceQuestionId], role.scopeDetail)
  }
  for (const decision of task.decisionPoints) add(decision, task.contextStatus.decision, 'ALL', questionIds(task, ['decision']))
  if (task.contextStatus.outputNeed !== 'UNKNOWN') add(task.output, task.contextStatus.outputNeed, 'ALL', questionIds(task, ['outputNeed']))

  return kindOrder.flatMap((kind) => components.get(kind) ?? [])
}

export function proposedTreatment(component: WorkComponent, design: BusinessDesign): string[] {
  const patterns: Record<WorkComponentKind, RegExp> = {
    SHARE: /共有|通知|配信|知らせ/,
    OBSERVE: /確認|検知|監視|差分|把握/,
    CONSULT: /相談|困りごと|支援/,
    DECIDE: /判断|調整|承認|担当/,
    EDUCATE: /新人|教育|関係づくり/,
    PRODUCE: /作成|生成|成果物|資料|レポート|出力/,
    EXECUTE: new RegExp(component.items.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^'),
  }
  const pattern = patterns[component.kind]
  return [...new Set([
    ...design.redesign.workflow.filter((step) => pattern.test(`${step.label}${step.detail}`)).map((step) => `${step.label}：${step.detail}`),
    ...design.redesign.roles.human.filter((item) => pattern.test(item)).map((item) => `人が担当：${item}`),
    ...design.redesign.roles.system.filter((item) => pattern.test(item)).map((item) => `システムが担当：${item}`),
    ...design.redesign.roles.ai.filter((item) => pattern.test(item)).map((item) => `AIが支援：${item}`),
  ])].slice(0, 3)
}
