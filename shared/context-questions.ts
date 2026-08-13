import type { BusinessTask, ContextDimension, InterviewPlan, InterviewQuestion } from './design-schema.ts'

// 連続インタビューの質問数上限（CORE3問＋追加質問）
export const QUESTION_BUDGET = 9

// LLMの追加質問生成（実測20秒前後）を待つ間に出す「つなぎ質問」。
// 判断保留の3大原因（制約・依存関係・リスク）のうちUNKNOWNの次元のカタログ質問を即時に返す。
export function bridgeQuestionsFor(contextStatus: BusinessTask['contextStatus'], excludeDimensions: Iterable<string> = []): InterviewQuestion[] {
  const excluded = new Set(excludeDimensions)
  return (['constraints', 'dependencies', 'risks'] as const)
    .filter((key) => contextStatus[key] === 'UNKNOWN' && !excluded.has(key))
    .map((key) => questionForContext(key).questions[0])
}

// contextStatusのキーごとに用意した決定論的な追加質問カタログ。
// LLM生成の追加質問が使えないときのフォールバック、および「情報を追加」導線の供給源。
export function questionForContext(key: ContextDimension): InterviewPlan {
  const base = { id: `context-${key}`, dimension: key, phase: 'FOLLOW_UP' as const }
  const definitions: Record<ContextDimension, Omit<InterviewPlan['questions'][number], keyof typeof base>> = {
    purpose: {
      prompt: 'この業務によって、誰が何を把握・判断できる状態にしたいですか？', hint: '会議や成果物ではなく、達成したい状態を選びます。',
      options: [
        { id: 'purpose-team', label: 'チームが変化を把握し、対応を判断できる', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'purpose-lead', label: '責任者が状況を把握し、支援を判断できる', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'purpose-coordinate', label: '関係者が情報を揃え、調整を判断できる', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'purpose-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    stakeholders: {
      prompt: 'この業務に参加する人と、結果を使う人を選んでください。', hint: '具体的な対象を複数選べます。存在だけでは確認済みにしません。', selection: 'MULTIPLE',
      options: [
        { id: 'stakeholder-team', label: 'チームメンバー', meaning: { roles: [], stakeholders: ['チームメンバー'], contextState: 'CONFIRMED' } },
        { id: 'stakeholder-lead', label: 'チーム責任者', meaning: { roles: [], stakeholders: ['チーム責任者'], contextState: 'CONFIRMED' } },
        { id: 'stakeholder-department', label: '他部署', meaning: { roles: [], stakeholders: ['他部署'], contextState: 'CONFIRMED' } },
        { id: 'stakeholder-customer', label: '顧客', meaning: { roles: [], stakeholders: ['顧客'], contextState: 'CONFIRMED' } },
        { id: 'stakeholder-unknown', label: '具体的な対象はまだ分からない', exclusive: true, meaning: { roles: [], stakeholders: [], contextState: 'UNKNOWN' } },
      ],
    },
    roles: {
      prompt: '予定共有以外に、この業務が担っている役割を選んでください。', hint: '一部にだけ必要な役割は、その範囲も含めて保存します。', selection: 'MULTIPLE',
      options: [
        { id: 'role-consult', label: '困りごとの相談・担当調整', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'role-training', label: '新人教育（新人が参加する回のみ）', meaning: { roles: [{ name: '新人教育', present: true, scope: 'PARTIAL', scopeDetail: '新人が参加する回のみ' }], contextState: 'PARTIAL' } },
        { id: 'role-relationship', label: '関係づくり（一部の参加者のみ）', meaning: { roles: [{ name: '関係づくり', present: true, scope: 'PARTIAL', scopeDetail: '一部の参加者のみ' }], contextState: 'PARTIAL' } },
        { id: 'role-none', label: '予定共有以外の役割はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'role-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    process: {
      prompt: '普段、この業務で行っていることを選んでください。', hint: '現在の工程を複数選べます。', selection: 'MULTIPLE',
      options: [
        { id: 'process-share', label: '情報・予定の共有', meaning: { roles: [], processItems: ['情報・予定の共有'], contextState: 'CONFIRMED' } },
        { id: 'process-change', label: '変更点の確認', meaning: { roles: [], processItems: ['変更点の確認'], contextState: 'CONFIRMED' } },
        { id: 'process-consult', label: '困りごとの相談', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], processItems: ['困りごとの相談'], contextState: 'CONFIRMED' } },
        { id: 'process-adjust', label: '担当・時間の調整', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], processItems: ['担当・時間の調整'], contextState: 'CONFIRMED' } },
        { id: 'process-approve', label: '承認・決裁', meaning: { roles: [], processItems: ['承認・決裁'], contextState: 'CONFIRMED' } },
        { id: 'process-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], processItems: [], contextState: 'UNKNOWN' } },
      ],
    },
    decision: {
      prompt: 'この業務で、人が最終的に判断していることは何ですか？', hint: '最も近いものを選ぶか、具体的な内容を入力します。',
      options: [
        { id: 'decision-priority', label: '対応の要否や優先順位', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'decision-assignment', label: '担当者や実施時間の調整', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'decision-approval', label: '承認・差し戻し', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'decision-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    exceptions: {
      prompt: '通常と違う対応が必要になるのは、どんな場合ですか？', hint: '仮説を安全に運用するための例外を確認します。',
      options: [
        { id: 'exception-urgent', label: '緊急・重大な変更があった場合', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'exception-missing', label: '情報の欠損や矛盾がある場合', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'exception-special', label: '特定の顧客・案件だけ別対応', meaning: { roles: [], contextState: 'PARTIAL' } },
        { id: 'exception-none', label: '確認できている例外はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'exception-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    constraints: {
      prompt: '形式を変えるときに守る必要がある条件はありますか？', hint: '制度・権限・セキュリティなどを確認します。',
      options: [
        { id: 'constraint-report', label: '定期報告・監査の義務がある', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'constraint-security', label: '共有範囲や機密情報に制限がある', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'constraint-system', label: '利用システム・権限に制限がある', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'constraint-none', label: '確認できている制約はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'constraint-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    dependencies: {
      prompt: 'この業務を変えると影響を受ける相手を選んでください。', hint: '影響先が具体的に分かるものを選びます。', selection: 'MULTIPLE',
      options: [
        { id: 'dependency-team', label: 'チーム内の別業務', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'dependency-department', label: '他部署', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'dependency-customer', label: '顧客・取引先', meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'dependency-none', label: '確認できている影響先はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED' } },
        { id: 'dependency-unknown', label: 'まだ分からない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    risks: {
      prompt: 'この業務を変えるとき、最も避けたいことは何ですか？', hint: '検証時の停止条件に使います。',
      options: [
        { id: 'risk-miss', label: '重要な変更・異常の見逃し', meaning: { roles: [], contextState: 'CONFIRMED', failureCost: 'HIGH' } },
        { id: 'risk-consult', label: '相談や支援の機会が減ること', meaning: { roles: [{ name: '困りごとの相談と担当調整', present: true, scope: 'ALL' }], contextState: 'CONFIRMED', failureCost: 'HIGH' } },
        { id: 'risk-responsibility', label: '責任所在が曖昧になること', meaning: { roles: [], contextState: 'CONFIRMED', failureCost: 'HIGH' } },
        { id: 'risk-none', label: '変えても大きな影響はない', exclusive: true, meaning: { roles: [], contextState: 'CONFIRMED', failureCost: 'LOW' } },
        { id: 'risk-unknown', label: 'まだ整理できていない', exclusive: true, meaning: { roles: [], contextState: 'UNKNOWN' } },
      ],
    },
    outputNeed: {
      prompt: '現在の会議・成果物は、目的達成にどの程度必要ですか？', hint: '共有方法と、同期で話す役割を分けて選びます。',
      options: [
        { id: 'context-async', label: '非同期の共有だけで目的を達成できる', meaning: { outputNeed: 'ASYNC_OK', roles: [], contextState: 'CONFIRMED' } },
        { id: 'context-sync', label: '共有は非同期化できるが、相談時間は別途必要', meaning: { outputNeed: 'SYNC_DISCUSSION_STILL_REQUIRED', roles: [{ name: '同期での相談・調整', present: true, scope: 'ALL' }], contextState: 'CONFIRMED' } },
        { id: 'context-current', label: '現在の形式そのものを残す必要がある', meaning: { outputNeed: 'CURRENT_FORMAT_REQUIRED', roles: [], contextState: 'CONFIRMED' } },
        { id: 'context-unknown', label: 'まだ確認できていない', exclusive: true, meaning: { outputNeed: 'UNKNOWN', roles: [], contextState: 'UNKNOWN' } },
      ],
    },
  }
  return { phase: 'FOLLOW_UP', questions: [{ ...base, ...definitions[key] }] }
}

// LLMによる質問生成が使えないときに、即座にインタビューを始めるための汎用Core 3問。
export function fallbackCorePlan(): InterviewPlan {
  const pick = (key: ContextDimension, id: string) => ({ ...questionForContext(key).questions[0], id, phase: 'CORE' as const })
  return { phase: 'CORE', questions: [pick('purpose', 'core-purpose'), pick('decision', 'core-decision'), pick('outputNeed', 'core-output')] }
}
