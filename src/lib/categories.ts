import { workCategorySchema, type WorkCategory } from '../../shared/work-group'

// AIが割り当てた業務分類のキャッシュ（正規化タイトル→分類）。ブラウザ内にのみ保存。
// 同じタイトルを再送信しない・リロードしても分類が揺れないための仕組み。
const STORAGE_KEY = 'flowshift.work-categories.v1'
const MAX_ENTRIES = 500

export function readCategoryCache(): Record<string, WorkCategory> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, WorkCategory> = {}
    for (const [title, category] of Object.entries(parsed as Record<string, unknown>)) {
      if (workCategorySchema.safeParse(category).success) result[title] = category as WorkCategory
    }
    return result
  } catch {
    return {}
  }
}

export function mergeCategoryCache(added: Record<string, WorkCategory>): Record<string, WorkCategory> {
  const merged = { ...readCategoryCache(), ...added }
  // 上限を超えたら古いキーから捨てる（挿入順）
  const entries = Object.entries(merged)
  const trimmed = entries.length > MAX_ENTRIES ? Object.fromEntries(entries.slice(entries.length - MAX_ENTRIES)) : merged
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // 容量超過等。キャッシュされないだけで動作は続く。
  }
  return trimmed
}
