import type { BusinessTask, ContextState, ProjectStatus } from '../types'

export const contextLabels: Record<keyof BusinessTask['contextStatus'], string> = {
  purpose: '目的', stakeholders: '関係者・利用者', roles: '確認できている役割', process: '現在の工程', decision: '人の判断', exceptions: '例外',
  constraints: '制約', dependencies: '他業務への影響', risks: '変更時のリスク', outputNeed: '成果物・会議形式の必要性',
}

export const validationLabels = {
  PILOT: '試行', TECHNICAL_FEASIBILITY: '技術検証', OFFLINE_EVALUATION: '過去データ評価',
  REQUIREMENT_VALIDATION: '要件確認', STAKEHOLDER_REVIEW: '関係者確認',
} as const

export const projectStatusLabels: Record<ProjectStatus, string> = {
  DRAFT: '下書き', VALIDATING: '検証中', ADOPTED: '採用', REJECTED: '却下', ON_HOLD: '保留',
}

export function contextStateLabel(state: ContextState): string {
  return state === 'CONFIRMED' ? '✓ 確認済み' : state === 'PARTIAL' ? '△ 一部確認' : '? 未確認'
}

export function deliveryLabels(task: BusinessTask) {
  return {
    sharing: task.deliveryModel.sharingMode === 'ASYNC_POSSIBLE' ? '非同期化できる' : task.deliveryModel.sharingMode === 'SYNC_REQUIRED' ? '同期共有が必要' : '未確認',
    synchronous: task.deliveryModel.synchronousRole === 'SEPARATE_REQUIRED' ? '別の相談時間が必要' : task.deliveryModel.synchronousRole === 'CURRENT_FORMAT_REQUIRED' ? '現在形式の中で必要' : task.deliveryModel.synchronousRole === 'NONE' ? '確認済みの同期役割なし' : '未確認',
    currentFormat: task.deliveryModel.currentFormat === 'REQUIRED' ? '必要' : task.deliveryModel.currentFormat === 'NOT_REQUIRED' ? '不要' : '必要か未確認',
  }
}
