import { Hono } from 'hono'
import { designRequestSchema, interviewOptionsRequestSchema, interviewRequestSchema } from '../shared/design-schema'
import { createProjectRequestSchema, improvementProjectSchema, projectListSchema, updateProjectStatusRequestSchema } from '../shared/project-schema'
import { createBusinessDesign, createInterviewOptions, DeepSeekError, deepSeekModel, extractBusinessTask } from './deepseek'
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

const app = new Hono<{ Bindings: Env }>()

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

const aiPaths = new Set(['/api/interview-options', '/api/business-task', '/api/design'])

app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  const needsSession = aiPaths.has(path) || path.startsWith('/api/projects')
  if (needsSession && !isLocalRequest(c.req.raw) && !(await getGoogleSession(c.req.raw, c.env))) {
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
  if (c.req.header('Origin') !== new URL(c.req.url).origin) {
    return errorResponse('invalid_origin', 'リクエスト元を確認できません。', crypto.randomUUID(), 403)
  }
  await disconnectGoogleCalendar(c.req.raw, c.env)
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearGoogleSessionCookie(c.req.raw), 'Cache-Control': 'no-store' },
  })
})

app.get('/api/calendar/events', async (c) => c.json(await listGoogleCalendarEvents(c.req.raw, c.env), 200, { 'Cache-Control': 'no-store' }))

app.post('/api/interview-options', async (c) => {
  const requestId = crypto.randomUUID()
  if (requestIsTooLarge(c.req.raw)) return errorResponse('payload_too_large', 'Request body is too large.', requestId, 413)

  const body = await c.req.json<unknown>().catch(() => null)
  const input = interviewOptionsRequestSchema.safeParse(body)
  if (!input.success) return errorResponse('invalid_request', 'Interview option input is invalid.', requestId, 400)

  const result = await createInterviewOptions(c.env.DEEPSEEK_API_KEY, input.data)
  return c.json({
    options: result.value,
    meta: { requestId, model: deepSeekModel, usage: result.usage },
  })
})

app.post('/api/business-task', async (c) => {
  const requestId = crypto.randomUUID()
  if (requestIsTooLarge(c.req.raw)) return errorResponse('payload_too_large', 'Request body is too large.', requestId, 413)

  const body = await c.req.json<unknown>().catch(() => null)
  const input = interviewRequestSchema.safeParse(body)
  if (!input.success) return errorResponse('invalid_request', 'Interview input is invalid.', requestId, 400)

  const result = await extractBusinessTask(c.env.DEEPSEEK_API_KEY, input.data)
  return c.json({
    businessTask: result.value,
    meta: { requestId, model: deepSeekModel, usage: result.usage },
  })
})

app.post('/api/design', async (c) => {
  const requestId = crypto.randomUUID()
  if (requestIsTooLarge(c.req.raw)) return errorResponse('payload_too_large', 'Request body is too large.', requestId, 413)

  const body = await c.req.json<unknown>().catch(() => null)
  const input = designRequestSchema.safeParse(body)
  if (!input.success) return errorResponse('invalid_request', 'BusinessTask input is invalid.', requestId, 400)

  const result = await createBusinessDesign(c.env.DEEPSEEK_API_KEY, input.data.businessTask)
  return c.json({
    design: { businessTask: input.data.businessTask, ...result.value },
    meta: { requestId, model: deepSeekModel, usage: result.usage },
  })
})

app.get('/api/projects', async (c) => {
  const session = await getGoogleSession(c.req.raw, c.env)
  if (!session) return c.json(projectListSchema.parse({ projects: [] }), 200, { 'Cache-Control': 'no-store' })
  const rows = await c.env.DB.prepare(
    'SELECT project_json FROM improvement_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200',
  ).bind(session.userId).all<{ project_json: string }>()
  const projects = rows.results.flatMap((row) => {
    try {
      const parsed = improvementProjectSchema.safeParse(JSON.parse(row.project_json))
      return parsed.success ? [parsed.data] : []
    } catch {
      return []
    }
  })
  return c.json(projectListSchema.parse({ projects }), 200, { 'Cache-Control': 'no-store' })
})

app.post('/api/projects', async (c) => {
  const requestId = crypto.randomUUID()
  if (c.req.header('Origin') !== new URL(c.req.url).origin) return errorResponse('invalid_origin', 'リクエスト元を確認できません。', requestId, 403)
  if (requestIsTooLarge(c.req.raw)) return errorResponse('payload_too_large', 'Request body is too large.', requestId, 413)
  const session = await getGoogleSession(c.req.raw, c.env)
  if (!session) return errorResponse('authentication_required', 'Google Calendarを接続してください。', requestId, 401)
  const body = await c.req.json<unknown>().catch(() => null)
  const input = createProjectRequestSchema.safeParse(body)
  if (!input.success) return errorResponse('invalid_request', 'ImprovementProject input is invalid.', requestId, 400)

  const now = new Date()
  const project = improvementProjectSchema.parse({
    id: crypto.randomUUID(),
    ...input.data,
    status: 'DRAFT',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })
  await c.env.DB.prepare(
    'INSERT INTO improvement_projects (id, user_id, task_name, status, project_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(project.id, session.userId, project.taskName, project.status, JSON.stringify(project), now.getTime(), now.getTime()).run()
  return c.json({ project }, 201, { 'Cache-Control': 'no-store' })
})

app.patch('/api/projects/:id/status', async (c) => {
  const requestId = crypto.randomUUID()
  if (c.req.header('Origin') !== new URL(c.req.url).origin) return errorResponse('invalid_origin', 'リクエスト元を確認できません。', requestId, 403)
  const session = await getGoogleSession(c.req.raw, c.env)
  if (!session) return errorResponse('authentication_required', 'Google Calendarを接続してください。', requestId, 401)
  const input = updateProjectStatusRequestSchema.safeParse(await c.req.json<unknown>().catch(() => null))
  if (!input.success) return errorResponse('invalid_request', 'Project status input is invalid.', requestId, 400)

  const row = await c.env.DB.prepare(
    'SELECT project_json FROM improvement_projects WHERE id = ? AND user_id = ?',
  ).bind(c.req.param('id'), session.userId).first<{ project_json: string }>()
  if (!row) return errorResponse('project_not_found', '改善プロジェクトが見つかりません。', requestId, 404)
  const current = improvementProjectSchema.safeParse(JSON.parse(row.project_json))
  if (!current.success) return errorResponse('invalid_project', '保存済みデータを確認できませんでした。', requestId, 500)
  const now = new Date()
  const project = improvementProjectSchema.parse({
    ...current.data,
    status: input.data.status,
    updatedAt: now.toISOString(),
    ...(input.data.reviewAt ? { reviewAt: input.data.reviewAt } : {}),
  })
  await c.env.DB.prepare(
    'UPDATE improvement_projects SET status = ?, project_json = ?, updated_at = ?, review_at = ? WHERE id = ? AND user_id = ?',
  ).bind(project.status, JSON.stringify(project), now.getTime(), project.reviewAt ? Date.parse(project.reviewAt) : null, project.id, session.userId).run()
  return c.json({ project }, 200, { 'Cache-Control': 'no-store' })
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
  }))

  if (deepSeekError) return errorResponse(error.code, 'AIの応答を検証できませんでした。再試行してください。', requestId, 502, [error.message, ...(error.details ?? [])])
  if (googleError) return errorResponse(error.code, error.message, requestId, error.status)
  if (error instanceof DOMException && error.name === 'TimeoutError') return errorResponse('timeout', 'AIの応答がタイムアウトしました。', requestId, 502)
  return errorResponse('internal', '予期しないエラーが発生しました。', requestId, 500)
})

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'API endpoint not found.' } }, 404))

export default app
