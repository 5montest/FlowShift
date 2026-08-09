import { z } from 'zod'
import {
  businessTaskSchema,
  designOutputSchemaFor,
  interviewOptionsSchema,
  type BusinessTask,
  type DesignOutput,
  type InterviewOptions,
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

const businessTaskPrompt = `あなたはBusiness Process Redesignのための業務分析者です。ユーザーのカレンダー予定と4〜5問の回答から、確認できた情報だけでBusinessTaskを構造化します。
必ず日本語のjsonだけを返してください。推測が必要な内容はconstraintsへ「未確認」として記録し、事実のように補完しないでください。
purposeは「誰が、何を把握・判断・達成するか」という目的だけにしてください。レポート、報告書、資料、メール、Excel、PowerPointなどの成果物名・ツール名・現行手段を絶対に含めないでください。
outputは現在作っている成果物です。purposeとoutputを混同しないでください。
4問目からoutputRequirementを次のように決めてください。
- 定期成果物は不要、重要な変化の通知だけでよい: NOT_REQUIRED
- 必要なときにだけ確認・生成できればよい: ON_DEMAND
- 法令、監査、定例会議などで定期成果物が必要: REQUIRED
- 判断できない、未回答: UNKNOWN
出力は次の型とキーだけを使ってください。stringと指定した項目を数値やobjectにしないでください。
{
  "name": "string",
  "purpose": "string",
  "frequency": "string",
  "duration": "string（例: 45分）",
  "trigger": "string",
  "consumer": "string",
  "tools": ["string"],
  "inputs": ["string"],
  "output": "string",
  "steps": ["string"],
  "decisionPoints": ["string"],
  "constraints": ["string"],
  "outputRequirement": "NOT_REQUIRED | ON_DEMAND | REQUIRED | UNKNOWN",
  "outputRequirementReason": "string"
}
すべての値を具体的にし、配列を空にしないでください。`

const interviewOptionsPrompt = `あなたは業務ヒアリングの補助者です。予定名と所要時間から、ユーザーがキーボード入力せず選べる回答候補を作ります。
必ず日本語のjsonだけを返してください。候補は断定ではなく、一般的にあり得る具体例にしてください。
purpose候補にはレポート、報告書、資料、メール、Excel、PowerPointなどの成果物名・ツール名・現行手段を含めず、「誰が何を把握・判断するか」だけを書いてください。
outputNeedは成果物を廃止できるか確認する4つの選択肢で、必ず下記の意味を1つずつ含めてください。
出力は次の型とキーだけを使い、purpose、process、exceptionsには重複しない候補を3つ、outputNeedには4つ入れてください。
{
  "purpose": ["誰が何を判断するための業務か"],
  "process": ["利用ツールと開始から共有までの流れ"],
  "exceptions": ["人が判断する例外や条件"],
  "outputNeed": [
    "重要な変化があるときだけ通知されればよい",
    "必要なときに確認できればよい",
    "法令・監査上、定期的な成果物が必要",
    "定例会議のため、毎回必要"
  ]
}`

const designPrompt = `あなたはBusiness Process Redesignの専門家です。仕事をAIに置き換えるのではなく、AI前提で仕事を作り直します。ユーザーが承認したBusinessTaskを変更せず、purpose（達成したい結果）とoutput（現在の手段）を明確に分離して設計してください。

最初に、現行成果物を廃止できるかをoutputRequirementで判断します。
- NOT_REQUIRED: strategyはELIMINATE。定期レポート作成、毎回のレビュー・承認、定期メール配信を新工程へ絶対に含めない。通常時の人の定期作業は0分。データを継続監視し、重要な変化を検知し、原因候補と影響を整理し、必要なときだけ通知し、人が原因確認と施策判断を行う。必要時の説明は通知に含める。
- ON_DEMAND: strategyはON_DEMANDまたはELIMINATE。定期成果物と定期確認をなくし、必要時だけ確認・生成する。通常時の人の定期作業は0分。
- REQUIRED: strategyはAUTOMATEまたはKEEP。法令・監査・会議上の要件を守りながら工程を減らす。
- UNKNOWN: strategyはAUTOMATEまたはKEEP。廃止を断定せず、成果物の必要性をunknownsへ入れる。

conventionalは、現在の成果物を維持して自動化する従来案との比較用です。conventionalの工程をredesignへ流用しないでください。
時間削減は補助指標です。頻度を勝手に週次・月次へ変換せず、年間削減時間を算出しないでください。数値効果は推定レンジとし、根拠のない精密な値を作らないでください。
必ず日本語のjsonだけを返してください。トップレベルはanalysisとredesignです。
{
  "analysis": {
    "conclusion": "目的と成果物の必要性を踏まえた短い結論",
    "purposeCheck": {
      "outcome": "本来達成したい結果",
      "currentMeans": "現在の手段・成果物",
      "outputDecision": "成果物を廃止・必要時化・維持する判断と理由"
    },
    "problems": [{"value":"string","label":"string","detail":"string"}],
    "ratings": {"opportunity":"HIGH | MEDIUM | LOW","implementation":"HIGH | MEDIUM | LOW","aiFit":"HIGH | MEDIUM | LOW"},
    "ratingReasons": ["string"],
    "facts": ["string"],
    "assumptions": ["string"],
    "unknowns": ["string"],
    "conventional": {"summary":"string","steps":["string"]}
  },
  "redesign": {
    "strategy": "ELIMINATE | ON_DEMAND | AUTOMATE | KEEP",
    "headline": "編集された短い提案名",
    "insight": "何を作る仕事から、何を判断する仕事へ変えるか",
    "workflow": [{"label":"string","detail":"string","kind":"human | system | ai | decision | output"}],
    "roles": {"system":["string"],"ai":["string"],"human":["string"]},
    "metrics": {
      "scheduledOutputBefore":"現在の定期成果物回数・頻度",
      "scheduledOutputAfter":"見直し後の定期成果物回数・頻度",
      "routineHumanWorkBefore":"現在の人の定期作業",
      "routineHumanWorkAfter":"見直し後の人の定期作業",
      "detectionBefore":"現在の変化検知タイミング",
      "detectionAfter":"見直し後の変化検知タイミング",
      "outputBefore":"現在の成果物",
      "outputAfter":"見直し後の成果物"
    },
    "impact": {
      "routineMinutesPerCycle": 0,
      "exceptionMinutesMin": 5,
      "exceptionMinutesMax": 10,
      "confidence":"HIGH | MEDIUM | LOW",
      "assumption":"推定の前提"
    }
  }
}
problemsは3〜5件、workflowは3〜7工程です。factsには入力に明記された事実だけを含め、実現可否が未確認の内容はassumptionsまたはunknownsへ分離してください。`

export async function extractBusinessTask(apiKey: string, input: unknown): Promise<DeepSeekResult<BusinessTask>> {
  return generateJson(apiKey, businessTaskPrompt, input, businessTaskSchema)
}

export async function createInterviewOptions(apiKey: string, input: unknown): Promise<DeepSeekResult<InterviewOptions>> {
  return generateJson(apiKey, interviewOptionsPrompt, input, interviewOptionsSchema, 1200)
}

export async function createBusinessDesign(apiKey: string, businessTask: BusinessTask): Promise<DeepSeekResult<DesignOutput>> {
  return generateJson(apiKey, designPrompt, { approvedBusinessTask: businessTask }, designOutputSchemaFor(businessTask))
}

export const deepSeekModel = MODEL
