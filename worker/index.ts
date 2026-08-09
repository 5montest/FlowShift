import { Hono } from 'hono'
import { designRequestSchema, interviewOptionsRequestSchema, interviewRequestSchema } from '../shared/design-schema'
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
  return contentLength > 16_384
}

function errorResponse(code: string, message: string, requestId: string, status: 400 | 401 | 403 | 413 | 500 | 502 | 503, details?: string[]) {
  return Response.json({ error: { code, message, requestId, ...(details ? { details } : {}) } }, { status })
}

const aiPaths = new Set(['/api/interview-options', '/api/business-task', '/api/design'])

app.use('/api/*', async (c, next) => {
  if (aiPaths.has(new URL(c.req.url).pathname) && !isLocalRequest(c.req.raw) && !(await getGoogleSession(c.req.raw, c.env))) {
    return c.json({ error: { code: 'authentication_required', message: 'Google Calendarを接続してください。' } }, 401)
  }
  await next()
})

app.get('/api/health', (c) => c.json({
  status: 'ok',
  provider: 'deepseek',
  model: deepSeekModel,
  configured: Boolean(c.env.DEEPSEEK_API_KEY),
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
