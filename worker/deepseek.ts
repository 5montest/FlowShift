import { z } from 'zod'
import {
  businessTaskDraftSchema,
  designOutputSchemaFor,
  interviewPlanSchema,
  type BusinessTask,
  type BusinessTaskDraft,
  type DesignOutput,
  type InterviewPlan,
  type InterviewRequest,
} from '../shared/design-schema.ts'
import { finalizeBusinessTask } from '../shared/interview.ts'

const MODEL = 'deepseek-v4-flash'
const ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'

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

const businessTaskPrompt = `あなたはFlowShiftの業務コンテクスト整理役です。Calendarの観測事実と、ユーザー本人への質問・回答だけからBusinessTaskの要約部分を構造化します。
各回答のmeaningはユーザーが選択した機械的な意味です。answer本文より優先し、絶対に逆の意味へ変更しないでください。特にSYNC_DISCUSSION_STILL_REQUIRED、rolesのscope、stakeholders、processItemsを弱めたり一般化したりしてはいけません。
自由回答だけは文意を整理できますが、内容を弱めたり追加したりしないでください。回答にない内容は推測せず、配列は空、文字列は「未確認」、contextStatusはUNKNOWNにしてください。一部だけ分かる場合はPARTIALです。
purposeは「誰が、何を把握・判断・達成するか」という目的だけにし、成果物名やツール名を含めません。outputは現在の手段・成果物です。
frequencyとdurationはobservationの観測事実を自然な日本語にします。
outputRequirementは回答から明示的に判断できる場合だけNOT_REQUIRED、ON_DEMAND、REQUIREDとし、それ以外はUNKNOWNです。共有を非同期化できても別の相談時間が必要という回答は、現在の会議形式が必要という意味ではありません。
contextStatusは、各情報が回答で確認できたかを項目ごとに示します。質問されていない項目は必ずUNKNOWNです。
必ず次のキーだけを持つ日本語のjsonを返してください。
{
  "name":"string","purpose":"string","frequency":"string","duration":"string","trigger":"string",
  "stakeholders":["string"],"consumer":"string","businessRoles":["string"],"tools":["string"],"inputs":["string"],"output":"string",
  "steps":["string"],"decisionPoints":["string"],"exceptions":["string"],"constraints":["string"],"dependencies":["string"],"risks":["string"],
  "outputRequirement":"NOT_REQUIRED | ON_DEMAND | REQUIRED | UNKNOWN","outputRequirementReason":"string",
  "contextStatus":{"purpose":"CONFIRMED | PARTIAL | UNKNOWN","stakeholders":"CONFIRMED | PARTIAL | UNKNOWN","roles":"CONFIRMED | PARTIAL | UNKNOWN","process":"CONFIRMED | PARTIAL | UNKNOWN","decision":"CONFIRMED | PARTIAL | UNKNOWN","exceptions":"CONFIRMED | PARTIAL | UNKNOWN","constraints":"CONFIRMED | PARTIAL | UNKNOWN","dependencies":"CONFIRMED | PARTIAL | UNKNOWN","risks":"CONFIRMED | PARTIAL | UNKNOWN","outputNeed":"CONFIRMED | PARTIAL | UNKNOWN"}
}`

const interviewOptionsPrompt = `あなたはFlowShiftのCore Interview設計役です。Calendarは質問を始める索引にすぎず、予定名から業務内容や廃止可否を推測しません。
質問は必ず3問だけです。phaseはCORE、dimensionはpurpose、decision、outputNeedを1問ずつにします。
各質問にはキーボード入力を減らす3〜4個の回答候補を付け、候補の意味をmeaningへ機械的に記録します。labelとmeaningを矛盾させてはいけません。
purposeは成果物・ツールではなく「誰が何を把握・判断・達成するか」、decisionは人が行う重要な判断、outputNeedは現在の会議・成果物・作業が目的達成に必須かを聞きます。
outputNeedの候補には次を含めてください。
- 非同期化してよく同期の役割もない: ASYNC_OK
- 共有は非同期化できるが相談・調整など同期の役割が必要: SYNC_DISCUSSION_STILL_REQUIRED。rolesへ具体的な役割をpresent=trueで入れる
- 現在形式が制度・運用上必要: CURRENT_FORMAT_REQUIRED
- 判断できない: UNKNOWN
必ず次のキーだけを持つ日本語のjsonを返してください。
{"phase":"CORE","questions":[{"id":"core-purposeなどの一意ID","dimension":"purpose | decision | outputNeed","phase":"CORE","prompt":"string","hint":"string","options":[{"id":"一意ID","label":"string","meaning":{"outputNeed":"ASYNC_OK | ON_DEMAND | SYNC_DISCUSSION_STILL_REQUIRED | CURRENT_FORMAT_REQUIRED | UNKNOWN（outputNeedの質問だけ）","roles":[{"name":"string","present":true}],"contextState":"CONFIRMED | PARTIAL | UNKNOWN"}}]}]}`

const followUpPrompt = `あなたはFlowShiftのAdaptive Interview設計役です。暫定BusinessTaskを確認し、再設計判断を左右するCritical Unknownだけを追加質問にします。
phaseはFOLLOW_UP、質問数は0〜4問です。確認済みの内容を聞き直さず、制約・例外・業務の隠れた役割・他部署への影響・変更リスクのうち、仮説を変え得るものだけを選んでください。十分ならquestionsを空配列にします。
各質問には3〜6個の選択肢を付けます。「情報がある／ない」ではなく内容を聞いてください。関係者は具体的な対象をmeaning.stakeholders、現在工程は具体的な行為をmeaning.processItemsへ保存し、複数該当する質問はselectionをMULTIPLEにします。役割はmeaning.rolesへ具体名、present、scope（ALL | PARTIAL | CONDITIONAL | UNKNOWN）、必要ならscopeDetailを保存します。「まだ分からない」はcontextStateをUNKNOWNにします。
存在だけ分かって具体的な対象が分からない場合、その項目をCONFIRMEDにしないでください。
必ず次のキーだけを持つ日本語のjsonを返してください。
{"phase":"FOLLOW_UP","questions":[{"id":"followup-trainingなどの一意ID","dimension":"stakeholders | roles | process | exceptions | constraints | dependencies | risks | outputNeed","phase":"FOLLOW_UP","prompt":"string","hint":"string","selection":"SINGLE | MULTIPLE","options":[{"id":"一意ID","label":"string","meaning":{"roles":[{"name":"string","present":true,"scope":"ALL | PARTIAL | CONDITIONAL | UNKNOWN","scopeDetail":"一部の場合の範囲"}],"stakeholders":["具体的な関係者"],"processItems":["具体的な工程"],"contextState":"CONFIRMED | PARTIAL | UNKNOWN"}}]}]}`

const designPrompt = `あなたはFlowShiftの業務再設計パートナーです。目的は改善案を断定することではなく、ユーザーが確認したBusinessTaskから別の設計可能性と検証方法を提示することです。
次の原則を厳守してください。
- AIは最終判断者ではない。Calendar情報だけで廃止・自動化を断定しない。
- businessTask.answerEvidenceの原文とmeaningはユーザー回答の正本であり、別の意味へ解釈し直さない。businessRolesにある役割を「未確認」と書かない。
- factsは観測事実と回答済み事項だけ。成立条件はassumptions、判断前の不足情報はunknownsへ分ける。
- constraints、dependencies、risksのいずれかがUNKNOWNならreadinessはNEEDS_CONTEXT、strategyはKEEPとし、conclusionで廃止可否を判断できない旨を示す。
- HYPOTHESIS_READYでもhypothesisは「〜であり、〜が存在しない場合、〜へ変更できる可能性がある」という条件付き表現にする。hypothesisは全角200字以内に収める。
- 「この作業をAIで速くする」より「そもそもこの作業・成果物は必要か」を先に検討する。ただし不要と確認されていないものを消さない。
- systemは決定論的な取得・通知、aiは意味整理・候補提示、人は確認・判断を担当する。
- 時間は入力頻度を変換せず、根拠のない年間換算や精密値を作らない。
- validationPlanは固定期間にせず、案に応じてPILOT、TECHNICAL_FEASIBILITY、OFFLINE_EVALUATION、REQUIREMENT_VALIDATION、STAKEHOLDER_REVIEWから必要な方法だけを選ぶ。

必ず次のキーだけを持つ日本語のjsonを返してください。
{
  "analysis":{"readiness":"HYPOTHESIS_READY | NEEDS_CONTEXT","conclusion":"string","facts":["string"],"assumptions":["string"],"unknowns":["string"],"criticalUnknowns":[{"id":"英数字ID","dimension":"roles | constraints | dependencies | risksなど","question":"確認する質問","reason":"仮説へ与える影響"}]},
  "redesign":{"strategy":"ELIMINATE | ON_DEMAND | AUTOMATE | KEEP","hypothesis":"条件付きの再設計仮説（200字以内）","headline":"短い仮説名","workflow":[{"label":"string","detail":"string","kind":"human | system | ai | decision | output"}],"roles":{"system":["string"],"ai":["string"],"human":["string"]},"metrics":{"scheduledOutputBefore":"string","scheduledOutputAfter":"string","routineHumanWorkBefore":"string","routineHumanWorkAfter":"string","detectionBefore":"string","detectionAfter":"string","outputBefore":"string","outputAfter":"string"},"impact":{"assumption":"string"}},
  "validationPlan":{"summary":"string","items":[{"type":"PILOT | TECHNICAL_FEASIBILITY | OFFLINE_EVALUATION | REQUIREMENT_VALIDATION | STAKEHOLDER_REVIEW","title":"string","description":"string","checks":["string"]}]}
}`

export async function extractBusinessTask(apiKey: string, input: InterviewRequest): Promise<DeepSeekResult<BusinessTask>> {
  const result = await generateJson<BusinessTaskDraft>(apiKey, businessTaskPrompt, input, businessTaskDraftSchema)
  return { ...result, value: finalizeBusinessTask(input.observation, input.answers, result.value) }
}

export async function createInterviewOptions(apiKey: string, input: unknown): Promise<DeepSeekResult<InterviewPlan>> {
  return generateJson(apiKey, interviewOptionsPrompt, input, interviewPlanSchema, 2200)
}

export async function createFollowUpQuestions(apiKey: string, businessTask: BusinessTask): Promise<DeepSeekResult<InterviewPlan>> {
  return generateJson(apiKey, followUpPrompt, { provisionalBusinessTask: businessTask }, interviewPlanSchema, 2200)
}

function finalizeBusinessDesign(businessTask: BusinessTask, design: DesignOutput): DesignOutput {
  const requiredRoles = businessTask.businessRoles
  const roleLabels = businessTask.businessRoleDetails.filter((role) => role.present).map((role) => role.scope === 'ALL' ? role.name : `${role.name}（${role.scopeDetail ?? '条件付き'}）`)
  const roleKeywords = requiredRoles.flatMap((role) => [role, ...(['相談', '新人教育', '関係づくり', '他部署調整'] as const).filter((keyword) => role.includes(keyword))])
  const roleIsMentioned = (value: string) => roleKeywords.some((keyword) => value.includes(keyword))
  const unknowns = design.analysis.unknowns.filter((item) => !roleIsMentioned(item))
  const criticalUnknowns = design.analysis.criticalUnknowns.filter((item) => !roleIsMentioned(item.question))
  const facts = [...design.analysis.facts, ...roleLabels.map((role) => `回答で「${role}」の役割を確認`)].slice(0, 12)
  const hasRequiredRoleStep = design.redesign.workflow.some((step) => roleIsMentioned(`${step.label}${step.detail}`))
  const workflow = requiredRoles.length && !hasRequiredRoleStep
    ? [...design.redesign.workflow.slice(0, 6), { label: '確認済みの役割を残す', detail: `${roleLabels.join('・')}は人が行う`, kind: 'human' as const }]
    : design.redesign.workflow
  const roleNote = roleLabels.length ? `確認済みの役割（${roleLabels.join('・')}）は、その範囲を変えずに残します。` : ''
  const combinedHypothesis = roleNote && !roleIsMentioned(design.redesign.hypothesis)
    ? `${design.redesign.hypothesis} ${roleNote}`
    : design.redesign.hypothesis
  const hypothesis = combinedHypothesis.length <= 200
    ? combinedHypothesis
    : `${design.redesign.hypothesis.slice(0, Math.max(1, 199 - roleNote.length))} ${roleNote}`
  const requiresSynchronousRole = businessTask.deliveryModel.synchronousRole === 'SEPARATE_REQUIRED'
  const requiresCurrentFormat = businessTask.deliveryModel.currentFormat === 'REQUIRED'

  return designOutputSchemaFor(businessTask).parse({
    ...design,
    analysis: { ...design.analysis, facts, unknowns, criticalUnknowns },
    redesign: {
      ...design.redesign,
      ...(businessTask.outputRequirement === 'REQUIRED' ? { strategy: 'KEEP' as const } : {}),
      ...(requiresSynchronousRole ? { headline: '共有部分と、同期で行う相談・調整を分ける' } : {}),
      hypothesis,
      workflow,
      roles: { ...design.redesign.roles, human: [...new Set([...design.redesign.roles.human, ...requiredRoles])] },
      metrics: {
        ...design.redesign.metrics,
        ...(requiresSynchronousRole ? {
          scheduledOutputAfter: '共有は非同期化し、相談・調整の時間は別途維持',
          routineHumanWorkAfter: '相談・調整が必要なときに人が対応',
          outputAfter: '変更通知と、別途確保する相談・調整',
        } : {}),
        ...(requiresCurrentFormat ? {
          scheduledOutputAfter: '現在の形式を維持',
          routineHumanWorkAfter: '現在の人の役割を維持',
          outputAfter: businessTask.output,
        } : {}),
      },
    },
  })
}

export async function createBusinessDesign(apiKey: string, businessTask: BusinessTask): Promise<DeepSeekResult<DesignOutput>> {
  const result = await generateJson(apiKey, designPrompt, { approvedBusinessTask: businessTask }, designOutputSchemaFor(businessTask))
  return { ...result, value: finalizeBusinessDesign(businessTask, result.value) }
}

export const deepSeekModel = MODEL
