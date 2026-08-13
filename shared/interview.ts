import { businessTaskSchema, type BusinessTask, type BusinessTaskDraft, type InterviewAnswer, type WorkObservation } from './design-schema.ts'

const outputRequirementByMeaning = {
  ASYNC_OK: 'NOT_REQUIRED',
  ON_DEMAND: 'ON_DEMAND',
  SYNC_DISCUSSION_STILL_REQUIRED: 'UNKNOWN',
  CURRENT_FORMAT_REQUIRED: 'REQUIRED',
  UNKNOWN: 'UNKNOWN',
} as const

const deliveryByMeaning = {
  ASYNC_OK: { sharingMode: 'ASYNC_POSSIBLE', synchronousRole: 'NONE', currentFormat: 'NOT_REQUIRED' },
  ON_DEMAND: { sharingMode: 'ASYNC_POSSIBLE', synchronousRole: 'NONE', currentFormat: 'NOT_REQUIRED' },
  SYNC_DISCUSSION_STILL_REQUIRED: { sharingMode: 'ASYNC_POSSIBLE', synchronousRole: 'SEPARATE_REQUIRED', currentFormat: 'UNKNOWN' },
  CURRENT_FORMAT_REQUIRED: { sharingMode: 'SYNC_REQUIRED', synchronousRole: 'CURRENT_FORMAT_REQUIRED', currentFormat: 'REQUIRED' },
  UNKNOWN: { sharingMode: 'UNKNOWN', synchronousRole: 'UNKNOWN', currentFormat: 'UNKNOWN' },
} as const

function selectedOptionIds(answer: InterviewAnswer): string[] {
  return answer.optionIds ?? (answer.optionId ? [answer.optionId] : [])
}

// 自由入力（最大2000字）を、スキーマ上限のある派生フィールドへ入れるときの切り詰め。
// answerEvidenceの原文は失わない。
function clip(value: string, max = 240): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function clipped(value: string | undefined): string | undefined {
  return value === undefined ? undefined : clip(value)
}

export function finalizeBusinessTask(observed: WorkObservation, answers: InterviewAnswer[], draft: BusinessTaskDraft): BusinessTask {
  const roleSignals = new Map<string, BusinessTask['businessRoleDetails'][number]>()
  for (const answer of answers) {
    for (const role of answer.meaning?.roles ?? []) {
      roleSignals.set(role.name, {
        ...role,
        scope: role.scope ?? 'ALL',
        sourceQuestionId: answer.questionId,
        sourceOptionIds: selectedOptionIds(answer),
      })
    }
  }
  const roleDetails = [...roleSignals.values()]
  const explicitRoles = roleDetails.filter((role) => role.present).map((role) => role.name)
  const rejectedRoles = new Set(roleDetails.filter((role) => !role.present).map((role) => role.name))
  const latestOutputAnswer = answers.filter((answer) => answer.meaning?.outputNeed).at(-1)
  const outputMeaning = latestOutputAnswer?.meaning?.outputNeed
  const roleAnswers = answers.filter((answer) => answer.dimension === 'roles' || answer.meaning?.roles.length)
  const freeTextRoleAnswers = answers.filter((answer) => answer.dimension === 'roles' && answer.source === 'FREE_TEXT')
  const roleState = roleDetails.some((role) => role.present && role.scope !== 'ALL')
    ? 'PARTIAL'
    : roleAnswers.at(-1)?.meaning?.contextState
  const latestStakeholderAnswer = answers.filter((answer) => answer.dimension === 'stakeholders').at(-1)
  const stakeholderAnswer = latestStakeholderAnswer?.source === 'OPTION' ? latestStakeholderAnswer : undefined
  const stakeholderValues = stakeholderAnswer?.meaning?.stakeholders ?? []
  const latestProcessAnswer = answers.filter((answer) => answer.dimension === 'process').at(-1)
  const processAnswer = latestProcessAnswer?.source === 'OPTION' ? latestProcessAnswer : undefined
  const processValues = processAnswer?.meaning?.processItems ?? []
  const contextStatus = {
    ...draft.contextStatus,
    ...(outputMeaning ? { outputNeed: outputMeaning === 'UNKNOWN' ? 'UNKNOWN' as const : 'CONFIRMED' as const } : {}),
    ...(roleAnswers.length ? { roles: roleState ?? 'UNKNOWN' } : {}),
    ...(stakeholderAnswer ? { stakeholders: stakeholderValues.length ? stakeholderAnswer.meaning?.contextState ?? 'CONFIRMED' : 'UNKNOWN' as const } : {}),
    ...(processAnswer ? { process: processValues.length ? 'CONFIRMED' as const : 'UNKNOWN' as const } : {}),
  }

  return businessTaskSchema.parse({
    ...draft,
    observed,
    answerEvidence: answers,
    // 構造化された役割回答がある場合は、その明示的な意味だけを正本にする。
    // LLMが同義語で「ない」と答えた役割を復活させる余地を残さない。
    businessRoles: roleSignals.size
      ? [...new Set([...(freeTextRoleAnswers.length ? draft.businessRoles : []), ...explicitRoles])]
      : [...new Set(draft.businessRoles.filter((role) => !rejectedRoles.has(role)))],
    businessRoleDetails: roleSignals.size ? [
      ...roleDetails,
      ...(freeTextRoleAnswers.length ? draft.businessRoles.filter((name) => !roleSignals.has(name)).map((name) => ({
        name,
        present: true,
        scope: 'UNKNOWN' as const,
        sourceQuestionId: freeTextRoleAnswers.at(-1)!.questionId,
        sourceOptionIds: [],
      })) : []),
    ] : draft.businessRoleDetails,
    ...(stakeholderAnswer ? {
      stakeholders: stakeholderValues,
      consumer: stakeholderValues.length ? stakeholderValues.join('、') : '未確認',
    } : {}),
    ...(processAnswer ? { steps: processValues } : {}),
    ...(outputMeaning ? {
      outputRequirement: outputRequirementByMeaning[outputMeaning],
      outputRequirementReason: clip(`回答「${latestOutputAnswer?.answer}」に基づいています`, 800),
      deliveryModel: {
        ...deliveryByMeaning[outputMeaning],
        sourceQuestionId: latestOutputAnswer?.questionId,
        sourceOptionIds: latestOutputAnswer ? selectedOptionIds(latestOutputAnswer) : [],
      },
    } : {}),
    contextStatus,
  })
}

export function createDeterministicTask(observed: WorkObservation, answers: InterviewAnswer[]): BusinessTask {
  const latest = (dimension: InterviewAnswer['dimension']) => answers.filter((answer) => answer.dimension === dimension).at(-1)
  const purpose = clip(latest('purpose')?.answer ?? '未確認', 800)
  const decision = clipped(latest('decision')?.answer)
  const process = clipped(latest('process')?.answer)
  const stakeholders = clipped(latest('stakeholders')?.answer)
  const fields = {
    exceptions: clipped(latest('exceptions')?.answer),
    constraints: clipped(latest('constraints')?.answer),
    dependencies: clipped(latest('dependencies')?.answer),
    risks: clipped(latest('risks')?.answer),
  }
  const state = (dimension: InterviewAnswer['dimension']) => {
    const answer = latest(dimension)
    return answer ? answer.meaning?.contextState ?? 'CONFIRMED' : 'UNKNOWN'
  }

  return finalizeBusinessTask(observed, answers, {
    name: clip(observed.title),
    purpose,
    frequency: `過去4週間で${observed.occurrences}回`,
    duration: `1回平均${observed.averageMinutes}分、合計${observed.totalMinutes}分`,
    trigger: 'Calendarに登録されたタイミング',
    stakeholders: stakeholders ? [stakeholders] : [],
    consumer: stakeholders ?? '未確認',
    businessRoles: [],
    businessRoleDetails: [],
    tools: [],
    inputs: [],
    output: '未確認',
    steps: process ? [process] : [],
    decisionPoints: decision ? [decision] : [],
    exceptions: fields.exceptions ? [fields.exceptions] : [],
    constraints: fields.constraints ? [fields.constraints] : [],
    dependencies: fields.dependencies ? [fields.dependencies] : [],
    risks: fields.risks ? [fields.risks] : [],
    outputRequirement: 'UNKNOWN',
    outputRequirementReason: '未確認',
    deliveryModel: {
      sharingMode: 'UNKNOWN',
      synchronousRole: 'UNKNOWN',
      currentFormat: 'UNKNOWN',
      sourceOptionIds: [],
    },
    contextStatus: {
      purpose: state('purpose'),
      stakeholders: state('stakeholders'),
      roles: state('roles'),
      process: state('process'),
      decision: state('decision'),
      exceptions: state('exceptions'),
      constraints: state('constraints'),
      dependencies: state('dependencies'),
      risks: state('risks'),
      outputNeed: state('outputNeed'),
    },
  })
}
