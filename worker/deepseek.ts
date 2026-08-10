import { z } from 'zod'
import {
  businessTaskSchema,
  designOutputSchemaFor,
  interviewPlanSchema,
  type BusinessTask,
  type DesignOutput,
  type InterviewPlan,
} from '../shared/design-schema'

const MODEL = 'deepseek-v4-flash'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'

const completionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable() }).passthrough(),
    finish_reason: z.string().nullable().optional(),
  }).passthrough()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough()

export class DeepSeekError extends Error {
  constructor(public readonly code: 'provider' | 'empty' | 'invalid_json' | 'invalid_output', message: string, public readonly details?: string[]) {
    super(message)
  }
}

type DeepSeekResult<T> = {
  value: T
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

async function generateJson<T>(apiKey: string, systemPrompt: string, userInput: unknown, schema: z.ZodType<T>, maxTokens = 5000): Promise<DeepSeekResult<T>> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `次の入力を分析し、指定形式のjsonだけを返してください。\n${JSON.stringify(userInput)}` },
  ]

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(45_000),
    })

    if (!response.ok) {
      throw new DeepSeekError('provider', `DeepSeek returned HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > 1_000_000) {
      throw new DeepSeekError('provider', 'DeepSeek response was too large')
    }

    const completion = completionSchema.safeParse(await response.json())
    if (!completion.success) {
      throw new DeepSeekError('provider', 'DeepSeek response envelope was invalid')
    }

    const content = completion.data.choices[0]?.message.content?.trim()
    if (!content) {
      throw new DeepSeekError('empty', 'DeepSeek returned empty content')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      if (attempt === 0) {
        messages.push({ role: 'assistant', content })
        messages.push({ role: 'user', content: '前の応答は有効なjsonではありません。指定されたキーだけを使った有効なjsonに修正してください。' })
        continue
      }
      throw new DeepSeekError('invalid_json', 'DeepSeek returned invalid JSON')
    }

    const validated = schema.safeParse(parsed)
    if (validated.success) {
      return {
        value: validated.data,
        usage: completion.data.usage ? {
          promptTokens: completion.data.usage.prompt_tokens,
          completionTokens: completion.data.usage.completion_tokens,
          totalTokens: completion.data.usage.total_tokens,
        } : undefined,
      }
    }

    const validationIssues = validated.error.issues.slice(0, 12)
    const issues = validationIssues.map((issue) => `${issue.path.join('.') || '(root)'}:${issue.code}`)
    if (attempt === 0) {
      const repairInstructions = validationIssues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join(', ')
      messages.push({ role: 'assistant', content })
      messages.push({ role: 'user', content: `前のjsonはスキーマ検証に失敗しました（${repairInstructions}）。値を捏造せず、必須キー・型・配列件数を指定形式へ修正したjsonだけを返してください。` })
      continue
    }

    throw new DeepSeekError('invalid_output', 'DeepSeek output did not match the required schema', issues)
  }

  throw new DeepSeekError('invalid_output', 'DeepSeek output could not be repaired')
}

const businessTaskPrompt = `あなたはFlowShiftの業務コンテクスト整理役です。Calendarの観測事実と、ユーザー本人への質問・回答だけからBusinessTaskを構造化します。
AIが業務を知っているふりをしてはいけません。回答にない内容は推測せず、配列は空、文字列は「未確認」、contextStatusはUNKNOWNにしてください。一部だけ分かる場合はPARTIALです。
purposeは「誰が、何を把握・判断・達成するか」という目的だけにし、成果物名やツール名を含めません。outputは現在の手段・成果物です。
observedは入力されたobservationを一字一句変えずに複製してください。frequencyとdurationは観測事実を自然な日本語にします。
outputRequirementは回答から明示的に判断できる場合だけNOT_REQUIRED、ON_DEMAND、REQUIREDとし、それ以外はUNKNOWNです。
contextStatusは、各情報が回答で確認できたかを項目ごとに示します。質問されていない項目は必ずUNKNOWNです。
必ず次のキーだけを持つ日本語のjsonを返してください。
{
  "name":"string","observed":{"title":"string","occurrences":1,"totalMinutes":1,"averageMinutes":1,"firstOccurredAt":"RFC3339","lastOccurredAt":"RFC3339","recurring":true},
  "purpose":"string","frequency":"string","duration":"string","trigger":"string",
  "stakeholders":["string"],"consumer":"string","tools":["string"],"inputs":["string"],"output":"string",
  "steps":["string"],"decisionPoints":["string"],"exceptions":["string"],"constraints":["string"],"dependencies":["string"],"risks":["string"],
  "outputRequirement":"NOT_REQUIRED | ON_DEMAND | REQUIRED | UNKNOWN","outputRequirementReason":"string",
  "contextStatus":{"purpose":"CONFIRMED | PARTIAL | UNKNOWN","stakeholders":"CONFIRMED | PARTIAL | UNKNOWN","process":"CONFIRMED | PARTIAL | UNKNOWN","decisions":"CONFIRMED | PARTIAL | UNKNOWN","exceptions":"CONFIRMED | PARTIAL | UNKNOWN","constraints":"CONFIRMED | PARTIAL | UNKNOWN","dependencies":"CONFIRMED | PARTIAL | UNKNOWN","risks":"CONFIRMED | PARTIAL | UNKNOWN","output":"CONFIRMED | PARTIAL | UNKNOWN"}
}`

const interviewOptionsPrompt = `あなたはFlowShiftの業務ヒアリング設計役です。Calendarの観測事実は、質問を始める索引にすぎません。予定名から業務内容や廃止可否を推測しないでください。
ユーザーが持つコンテクストを引き出すため、この業務に必要な質問を4〜8問だけ選びます。purpose、process、decision、outputNeedは必須です。必要に応じてstakeholders、exceptions、constraints、dependencies、risksを追加します。
各質問には、キーボード入力を減らす3〜4個の具体的な回答候補を付けてください。候補の最後には必要に応じて「まだ分からない」を含め、断定を強制しません。
purpose候補は成果物名・ツール名を含めず「誰が何を把握・判断・達成するか」にします。outputNeedでは、現行成果物・会議が本当に必要かを確認します。
必ず次のキーだけを持つ日本語のjsonを返してください。
{"questions":[{"id":"purpose | stakeholders | process | decision | exceptions | constraints | dependencies | risks | outputNeed","prompt":"string","hint":"string","options":["string","string","string"]}]}`

const designPrompt = `あなたはFlowShiftの業務再設計パートナーです。目的は改善案を断定することではなく、ユーザーが確認したBusinessTaskから別の設計可能性と検証方法を提示することです。
次の原則を厳守してください。
- AIは最終判断者ではない。Calendar情報だけで廃止・自動化を断定しない。
- factsは観測事実と回答済み事項だけ。成立条件はassumptions、判断前の不足情報はunknownsへ分ける。
- constraints、dependencies、risksのいずれかがUNKNOWNならreadinessはNEEDS_CONTEXT、strategyはKEEPとし、廃止可否を判断できない旨とnextQuestionsを示す。
- HYPOTHESIS_READYでもhypothesisは「〜であり、〜が存在しない場合、〜へ変更できる可能性がある」という条件付き表現にする。
- 「この作業をAIで速くする」より「そもそもこの作業・成果物は必要か」を先に検討する。ただし不要と確認されていないものを消さない。
- systemは決定論的な取得・通知、aiは意味整理・候補提示、人は確認・判断を担当する。
- 時間は入力頻度を変換せず、根拠のない年間換算や精密値を作らない。
- validationPlanは固定期間にせず、案に応じてPILOT、TECHNICAL_FEASIBILITY、OFFLINE_EVALUATION、REQUIREMENT_VALIDATION、STAKEHOLDER_REVIEWから必要な方法だけを選ぶ。

必ず次のキーだけを持つ日本語のjsonを返してください。
{
  "analysis":{"readiness":"HYPOTHESIS_READY | NEEDS_CONTEXT","conclusion":"string","purposeCheck":{"outcome":"string","currentMeans":"string","outputDecision":"string"},"problems":[{"value":"string","label":"string","detail":"string"}],"ratings":{"opportunity":"HIGH | MEDIUM | LOW","implementation":"HIGH | MEDIUM | LOW","aiFit":"HIGH | MEDIUM | LOW"},"ratingReasons":["string"],"facts":["string"],"assumptions":["string"],"unknowns":["string"],"nextQuestions":["string"],"conventional":{"summary":"string","steps":["string"]}},
  "redesign":{"strategy":"ELIMINATE | ON_DEMAND | AUTOMATE | KEEP","hypothesis":"条件付きの再設計仮説","headline":"短い仮説名","insight":"現在の仕事から何を判断する仕事へ変える可能性か","workflow":[{"label":"string","detail":"string","kind":"human | system | ai | decision | output"}],"roles":{"system":["string"],"ai":["string"],"human":["string"]},"metrics":{"scheduledOutputBefore":"string","scheduledOutputAfter":"string","routineHumanWorkBefore":"string","routineHumanWorkAfter":"string","detectionBefore":"string","detectionAfter":"string","outputBefore":"string","outputAfter":"string"},"impact":{"routineMinutesPerCycle":0,"exceptionMinutesMin":0,"exceptionMinutesMax":0,"confidence":"HIGH | MEDIUM | LOW","assumption":"string"}},
  "validationPlan":{"summary":"string","items":[{"type":"PILOT | TECHNICAL_FEASIBILITY | OFFLINE_EVALUATION | REQUIREMENT_VALIDATION | STAKEHOLDER_REVIEW","title":"string","description":"string","checks":["string"]}]}
}`

export async function extractBusinessTask(apiKey: string, input: unknown): Promise<DeepSeekResult<BusinessTask>> {
  return generateJson(apiKey, businessTaskPrompt, input, businessTaskSchema)
}

export async function createInterviewOptions(apiKey: string, input: unknown): Promise<DeepSeekResult<InterviewPlan>> {
  return generateJson(apiKey, interviewOptionsPrompt, input, interviewPlanSchema, 2200)
}

export async function createBusinessDesign(apiKey: string, businessTask: BusinessTask): Promise<DeepSeekResult<DesignOutput>> {
  return generateJson(apiKey, designPrompt, { approvedBusinessTask: businessTask }, designOutputSchemaFor(businessTask))
}

export const deepSeekModel = MODEL
