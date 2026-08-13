import { z } from 'zod'

// 初回連携時にヒアリングするユーザープロフィール。全項目任意。
// D1（users.profile_json）に保存し、分類・質問生成・仮説生成のプロンプト文脈に使う。
export const userProfileSchema = z.object({
  jobType: z.enum(['開発・エンジニア', '営業', '企画・マーケティング', '管理部門', 'カスタマーサポート', 'その他']).optional(),
  roleLevel: z.enum(['メンバー', 'リーダー・主任', '管理職', '経営・役員']).optional(),
  workStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  holidayPattern: z.enum(['土日祝で固定', 'シフト制・不定期']).optional(),
}).strict()

export type UserProfile = z.infer<typeof userProfileSchema>

// プロンプトに補間する1行。未設定の項目は省略し、全部未設定なら空文字。
export function profileSummaryLine(profile: UserProfile | undefined): string {
  if (!profile) return ''
  const parts = [
    profile.jobType ? `職種=${profile.jobType}` : null,
    profile.roleLevel ? `役職=${profile.roleLevel}` : null,
    profile.workStart && profile.workEnd ? `所定労働=${profile.workStart}〜${profile.workEnd}` : null,
    profile.holidayPattern ? `休み=${profile.holidayPattern}` : null,
  ].filter(Boolean)
  return parts.length ? `ユーザー情報：${parts.join('、')}` : ''
}
