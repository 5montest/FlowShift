import { z } from 'zod'
import { businessDesignSchema, businessTaskSchema, interviewAnswerSchema, interviewPlanSchema, interviewQuestionSchema } from './design-schema.ts'
import { workGroupSchema } from './work-group.ts'

export const SESSION_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000

// 回答途中のセッションをブラウザ内に残す下書き。サーバーには送らない
// （データ方針：サーバーに残すのはユーザーが保存した仮説だけ）。
export const sessionDraftSchema = z.object({
  version: z.literal(1),
  // 4週間窓から業務が消えても再開できるよう、WorkGroupの全量スナップショットを持つ
  group: workGroupSchema,
  // 回答が存在する時点でplanは必ず読込済み（handleAnswerの前提）なので必須
  plan: interviewPlanSchema,
  answers: z.array(interviewAnswerSchema).max(20),
  // つなぎ質問（最大3）とLLM追加質問（最大4）が同時に並ぶことがある
  pendingQuestions: z.array(interviewQuestionSchema).max(9),
  // 連続インタビューの進行状態。旧下書きには無いためdefaultで補う
  interviewComplete: z.boolean().default(false),
  followUpRounds: z.number().int().min(0).max(10).default(0),
  // 回答済みの質問も「修正」で再表示できるよう、出題した質問を保持する。
  // 旧下書きには無いためdefaultで補う。
  askedQuestions: z.array(interviewQuestionSchema).max(40).default([]),
  task: businessTaskSchema.nullable(),
  // LLM整理済みタスク。mergeRefinedの土台になるため別に保持する
  refinedTask: businessTaskSchema.nullable(),
  // 生成済み仮説のキャッシュ。再開時にLLMを呼び直さない
  design: businessDesignSchema.nullable(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict()

export type SessionDraft = z.infer<typeof sessionDraftSchema>

export function parseDraft(value: unknown, now = Date.now()): SessionDraft | null {
  const parsed = sessionDraftSchema.safeParse(value)
  if (!parsed.success) return null
  const age = now - Date.parse(parsed.data.updatedAt)
  if (!Number.isFinite(age) || age > SESSION_DRAFT_TTL_MS || age < -SESSION_DRAFT_TTL_MS) return null
  return parsed.data
}
