import { Hono } from 'hono'
import { z } from 'zod'
import { designRequestSchema, followUpRequestSchema, interviewOptionsRequestSchema, interviewRequestSchema } from '../shared/design-schema'
import { createProjectRequestSchema, improvementProjectSchema, parseStoredProject, projectListSchema, projectName, updateProjectRequestSchema, type ImprovementProject } from '../shared/project-schema'
import { userProfileSchema } from '../shared/profile-schema'
import { workClassificationRequestSchema } from '../shared/work-group'
import { classifyWork, createBusinessDesign, createFollowUpQuestions, createInterviewOptions, DeepSeekError, deepSeekModel, extractBusinessTask } from './deepseek'
import {
  clearGoogleOAuthCookie,
  clearGoogleSessionCookie,
  createGoogleAuthorization,
  disconnectGoogleCalendar,
  finishGoogleAuthorization,
  getGoogleCalendarStatus,
  getGoogleSession,
  GoogleCalendarError,
  googleCalendarConfigured,
  listGoogleCalendarEvents,
} from './google-calendar'

type GoogleSession = NonNullable<Awaited<ReturnType<typeof getGoogleSession>>>

const app = new Hono<{ Bindings: Env; Variables: { session: GoogleSession | null } }>()
const projectStatusLabels = { DRAFT: '下書き', VALIDATING: '検証中', ADOPTED: '採用', REJECTED: '却下', ON_HOLD: '保留' } as const

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function requestIsTooLarge(request: Request): boolean {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  return contentLength > 65_536
}

function errorResponse(code: string, message: string, requestId: string, status: 400 | 401 | 403 | 404 | 413 | 500 | 502 | 503, details?: string[]) {
  return Response.json({ error: { code, message, requestId, ...(details ? { details } : {}) } }, { status })
}

// ブラウザからの変更系リクエストに共通のガード（Origin・サイズ）
function mutationGuard(c: { req: { raw: Request; url: string; header: (name: string) => string | undefined } }, requestId: string): Response | null {
  if (c.req.header('Origin') !== new URL(c.req.url).origin) return errorResponse('invalid_origin', 'リクエスト元を確認できません。', requestId, 403)
  if (requestIsTooLarge(c.req.raw)) return errorResponse('payload_too_large', 'Request body is too large.', requestId, 413)
  return null
}

const aiPaths = new Set(['/api/interview-options', '/api/follow-up-questions', '/api/business-task', '/api/design', '/api/classify-work'])

// セッションはここで一度だけ解決し、各ルートはc.get('session')を読む
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  const needsSession = aiPaths.has(path) || path.startsWith('/api/projects') || path === '/api/profile'
  const session = needsSession ? await getGoogleSession(c.req.raw, c.env) : null
  c.set('session', session)
  if (needsSession && !isLocalRequest(c.req.raw) && !session) {
    return c.json({ error: { code: 'authentication_required', message: 'Google Calendarを接続してください。' } }, 401)
  }
  await next()
})

app.get('/api/health', (c) => c.json({
  status: 'ok',
  aiConfigured: Boolean(c.env.DEEPSEEK_API_KEY),
  googleCalendarConfigured: googleCalendarConfigured(c.env),
}))

app.get('/api/google/status', async (c) => c.json(await getGoogleCalendarStatus(c.req.raw, c.env), 200, { 'Cache-Control': 'no-store' }))

app.get('/api/google/connect', async (c) => {
  const authorization = await createGoogleAuthorization(c.req.raw, c.env)
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorization.location,
      'Set-Cookie': authorization.cookie,
      'Cache-Control': 'no-store',
    },
  })
})

app.get('/api/google/callback', async (c) => {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', clearGoogleOAuthCookie(c.req.raw))
  try {
    const result = await finishGoogleAuthorization(c.req.raw, c.env)
    headers.set('Location', new URL('/?calendar=connected', c.req.url).toString())
    headers.append('Set-Cookie', result.cookie)
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Google OAuth callback failed',
      errorCode: error instanceof GoogleCalendarError ? error.code : 'internal',
    }))
    headers.set('Location', new URL('/?calendar=error', c.req.url).toString())
  }
  return new Response(null, { status: 302, headers })
})

app.post('/api/google/disconnect', async (c) => {
  const requestId = crypto.randomUUID()
  if (c.req.header('Origin') !== new URL(c.req.url).origin) {
    return errorResponse('invalid_origin', 'リクエスト元を確認できません。', requestId, 403)
  }
  await disconnectGoogleCalendar(c.req.raw, c.env)
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearGoogleSessionCookie(c.req.raw), 'Cache-Control': 'no-store' },
  })
})

app.get('/api/calendar/events', async (c) => c.json(await listGoogleCalendarEvents(c.req.raw, c.env), 200, { 'Cache-Control': 'no-store' }))

// 4つのAIルートは同じ形（サイズ検査→検証→呼び出し→meta付き応答）。テーブル駆動で1本化。
function aiRoute<Schema extends z.ZodType>(path: string, schema: Schema, run: (apiKey: string, input: z.infer<Schema>) => Promise<{ body: Record<string, unknown>; usage?: unknown }>) {
  app.post(path, async (c) => {
    const requestId = crypto.randomUUID()
    // クロスオリジンからログイン済みブラウザを使ったLLM呼び出しの悪用を防ぐ
    // （localhostはスモークテスト用に免除）
    if (!isLocalRequest(c.req.raw) && c.req.header('Origin') !== new URL(c.req.url).origin) {
      return errorResponse('invalid_origin', 'リクエスト元を確認できません。', requestId, 403)
    }
    if (requestIsTooLarge(c.req.raw)) return errorResponse('payload_too_large', 'Request body is too large.', requestId, 413)
    const body = await c.req.json<unknown>().catch(() => null)
    const input = schema.safeParse(body)
    if (!input.success) return errorResponse('invalid_request', '入力内容を確認できませんでした。', requestId, 400)
    const result = await run(c.env.DEEPSEEK_API_KEY, input.data)
    return c.json({ ...result.body, meta: { requestId, model: deepSeekModel, usage: result.usage } })
  })
}

aiRoute('/api/interview-options', interviewOptionsRequestSchema, async (apiKey, input) => {
  const result = await createInterviewOptions(apiKey, { observation: input.observation, profile: input.profile })
  return { body: { options: result.value }, usage: result.usage }
})
aiRoute('/api/business-task', interviewRequestSchema, async (apiKey, input) => {
  const result = await extractBusinessTask(apiKey, input)
  return { body: { businessTask: result.value }, usage: result.usage }
})
aiRoute('/api/follow-up-questions', followUpRequestSchema, async (apiKey, input) => {
  const result = await createFollowUpQuestions(apiKey, input.businessTask)
  return { body: { plan: result.value }, usage: result.usage }
})
aiRoute('/api/design', designRequestSchema, async (apiKey, input) => {
  const result = await createBusinessDesign(apiKey, input.businessTask, input.profile)
  return { body: { design: { businessTask: input.businessTask, ...result.value } }, usage: result.usage }
})
aiRoute('/api/classify-work', workClassificationRequestSchema, async (apiKey, input) => {
  const result = await classifyWork(apiKey, input.titles, input.profile)
  return { body: { categories: result.value.categories }, usage: result.usage }
})

app.get('/api/profile', async (c) => {
  const session = c.get('session')
  if (!session) return c.json({ profile: null }, 200, { 'Cache-Control': 'no-store' })
  const row = await c.env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(session.userId).first<{ profile_json: string | null }>()
  if (!row?.profile_json) return c.json({ profile: null }, 200, { 'Cache-Control': 'no-store' })
  try {
    const parsed = userProfileSchema.safeParse(JSON.parse(row.profile_json))
    return c.json({ profile: parsed.success ? parsed.data : null }, 200, { 'Cache-Control': 'no-store' })
  } catch {
    return c.json({ profile: null }, 200, { 'Cache-Control': 'no-store' })
  }
})

app.put('/api/profile', async (c) => {
  const requestId = crypto.randomUUID()
  const guarded = mutationGuard(c, requestId)
  if (guarded) return guarded
  const session = c.get('session')
  if (!session) return errorResponse('authentication_required', 'Google Calendarを接続してください。', requestId, 401)
  const input = userProfileSchema.safeParse(await c.req.json<unknown>().catch(() => null))
  if (!input.success) return errorResponse('invalid_request', 'プロフィールの内容を確認できませんでした。', requestId, 400)
  await c.env.DB.prepare('UPDATE users SET profile_json = ? WHERE id = ?').bind(JSON.stringify(input.data), session.userId).run()
  return c.json({ profile: input.data }, 200, { 'Cache-Control': 'no-store' })
})

app.get('/api/projects', async (c) => {
  const session = c.get('session')
  if (!session) return c.json(projectListSchema.parse({ projects: [] }), 200, { 'Cache-Control': 'no-store' })
  const rows = await c.env.DB.prepare(
    'SELECT project_json FROM improvement_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200',
  ).bind(session.userId).all<{ project_json: string }>()
  const projects = rows.results.flatMap((row) => {
    try {
      const parsed = parseStoredProject(JSON.parse(row.project_json))
      return parsed ? [parsed] : []
    } catch {
      return []
    }
  })
  return c.json(projectListSchema.parse({ projects }), 200, { 'Cache-Control': 'no-store' })
})

app.post('/api/projects', async (c) => {
  const requestId = crypto.randomUUID()
  const guarded = mutationGuard(c, requestId)
  if (guarded) return guarded
  const session = c.get('session')
  if (!session) return errorResponse('authentication_required', 'Google Calendarを接続してください。', requestId, 401)
  const body = await c.req.json<unknown>().catch(() => null)
  const input = createProjectRequestSchema.safeParse(body)
  if (!input.success) return errorResponse('invalid_request', 'ImprovementProject input is invalid.', requestId, 400)

  const now = new Date()
  const project = improvementProjectSchema.parse({
    id: crypto.randomUUID(),
    proposal: input.data.proposal,
    status: 'DRAFT',
    history: [{ id: crypto.randomUUID(), type: 'CREATED', summary: '再設計仮説を保存', createdAt: now.toISOString() }],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })
  await c.env.DB.prepare(
    'INSERT INTO improvement_projects (id, user_id, task_name, status, project_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(project.id, session.userId, projectName(project), project.status, JSON.stringify(project), now.getTime(), now.getTime()).run()
  return c.json({ project }, 201, { 'Cache-Control': 'no-store' })
})

app.patch('/api/projects/:id', async (c) => {
  const requestId = crypto.randomUUID()
  const guarded = mutationGuard(c, requestId)
  if (guarded) return guarded
  const session = c.get('session')
  if (!session) return errorResponse('authentication_required', 'Google Calendarを接続してください。', requestId, 401)
  const input = updateProjectRequestSchema.safeParse(await c.req.json<unknown>().catch(() => null))
  if (!input.success) return errorResponse('invalid_request', 'Project update input is invalid.', requestId, 400)

  const row = await c.env.DB.prepare(
    'SELECT project_json FROM improvement_projects WHERE id = ? AND user_id = ?',
  ).bind(c.req.param('id'), session.userId).first<{ project_json: string }>()
  if (!row) return errorResponse('project_not_found', '改善プロジェクトが見つかりません。', requestId, 404)
  const current = parseStoredProject(JSON.parse(row.project_json))
  if (!current) return errorResponse('invalid_project', '保存済みデータを確認できませんでした。', requestId, 500)

  const now = new Date()
  const history = (type: 'STATUS_UPDATED' | 'CONTEXT_UPDATED' | 'HYPOTHESIS_UPDATED', summary: string) => [
    ...current.history,
    { id: crypto.randomUUID(), type, summary, createdAt: now.toISOString() },
  ]
  let project: ImprovementProject
  if (input.data.action === 'status') {
    project = improvementProjectSchema.parse({
      ...current,
      status: input.data.status,
      history: history('STATUS_UPDATED', `状態を「${projectStatusLabels[input.data.status]}」へ変更`),
      updatedAt: now.toISOString(),
    })
  } else if (input.data.action === 'context') {
    project = improvementProjectSchema.parse({
      ...current,
      pendingContext: input.data.pendingContext,
      history: history('CONTEXT_UPDATED', input.data.revisionSummary),
      updatedAt: now.toISOString(),
    })
  } else {
    // 仮説を更新したら、反映待ちの業務コンテクストは解消される
    const { pendingContext: _resolved, ...rest } = current
    project = improvementProjectSchema.parse({
      ...rest,
      proposal: input.data.proposal,
      history: history('HYPOTHESIS_UPDATED', input.data.revisionSummary ?? '追加した業務情報を反映して仮説を更新'),
      updatedAt: now.toISOString(),
    })
  }
  await c.env.DB.prepare(
    'UPDATE improvement_projects SET task_name = ?, status = ?, project_json = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  ).bind(projectName(project), project.status, JSON.stringify(project), now.getTime(), project.id, session.userId).run()
  return c.json({ project }, 200, { 'Cache-Control': 'no-store' })
})

app.delete('/api/projects/:id', async (c) => {
  const requestId = crypto.randomUUID()
  if (c.req.header('Origin') !== new URL(c.req.url).origin) {
    return errorResponse('invalid_origin', 'リクエスト元を確認できません。', requestId, 403)
  }
  const session = c.get('session')
  if (!session) return errorResponse('authentication_required', 'Google Calendarを接続してください。', requestId, 401)
  const result = await c.env.DB.prepare(
    'DELETE FROM improvement_projects WHERE id = ? AND user_id = ?',
  ).bind(c.req.param('id'), session.userId).run()
  if (!result.meta.changes) return errorResponse('project_not_found', '改善プロジェクトが見つかりません。', requestId, 404)
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
})

app.onError((error, c) => {
  const requestId = crypto.randomUUID()
  const deepSeekError = error instanceof DeepSeekError
  const googleError = error instanceof GoogleCalendarError
  console.error(JSON.stringify({
    message: 'API request failed',
    requestId,
    path: new URL(c.req.url).pathname,
    errorCode: deepSeekError || googleError ? error.code : 'internal',
    // スキーマ検証の失敗箇所が分からないと再発時に調査できないため、詳細も残す（回答本文は含まれない）
    ...(deepSeekError && error.details?.length ? { details: error.details.slice(0, 10) } : {}),
  }))

  if (deepSeekError) return errorResponse(error.code, '整理に失敗しました。もう一度お試しください。', requestId, 502, [error.message, ...(error.details ?? [])])
  if (googleError) return errorResponse(error.code, error.message, requestId, error.status)
  if (error instanceof DOMException && error.name === 'TimeoutError') return errorResponse('timeout', '応答に時間がかかったため中断しました。もう一度お試しください。', requestId, 502)
  return errorResponse(
    'internal',
    '予期しないエラーが発生しました。',
    requestId,
    500,
    isLocalRequest(c.req.raw) && error instanceof Error ? [error.message] : undefined,
  )
})

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'API endpoint not found.' } }, 404))

export default app
