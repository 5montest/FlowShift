import { z } from 'zod'
import type { CalendarEvent, CalendarEventsResponse, CalendarListResponse, CalendarStatus } from '../shared/calendar-schema'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_CERTS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs'
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
// アクセス可能なカレンダーの一覧に必要（events.readonlyだけでは一覧が取れない）。
// 旧接続のトークンにはこのスコープが無い→/api/calendar/listが403になり、UIは再接続を促す
const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
const OAUTH_COOKIE = 'flowshift_oauth'
const SESSION_COOKIE = 'flowshift_session'
const OAUTH_COOKIE_SECONDS = 10 * 60
const SESSION_SECONDS = 30 * 24 * 60 * 60
const MAX_CALENDAR_RANGE_MS = 31 * 24 * 60 * 60 * 1000

const oauthStateSchema = z.object({
  state: z.string().min(32).max(256),
  verifier: z.string().min(43).max(128),
  createdAt: z.number().int().positive(),
}).strict()

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string(),
  id_token: z.string().min(1),
}).passthrough()

const refreshResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  token_type: z.string(),
}).passthrough()

const storedTokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
  scope: z.string(),
}).strict()

const jwtHeaderSchema = z.object({
  alg: z.literal('RS256'),
  kid: z.string().min(1),
}).passthrough()

const jwtPayloadSchema = z.object({
  iss: z.enum(['accounts.google.com', 'https://accounts.google.com']),
  aud: z.union([z.string(), z.array(z.string()).min(1)]),
  azp: z.string().optional(),
  sub: z.string().min(1).max(255),
  email: z.string().email().optional(),
  // pictureの不備でログイン自体を失敗させない（Googleのアバター URLは1KBを超えることがある）
  picture: z.string().url().max(4096).optional().catch(undefined),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
}).passthrough()

const userinfoSchema = z.object({
  email: z.string().email().optional().catch(undefined),
  picture: z.string().url().max(4096).optional().catch(undefined),
}).passthrough()

const certsSchema = z.object({
  keys: z.array(z.object({
    kty: z.literal('RSA'),
    kid: z.string(),
    use: z.string().optional(),
    alg: z.string().optional(),
    n: z.string(),
    e: z.string(),
  }).passthrough()).min(1),
}).passthrough()

const googleEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  status: z.string().optional(),
  start: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).passthrough(),
  end: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).passthrough(),
  recurringEventId: z.string().optional(),
}).passthrough()

const googleEventsSchema = z.object({
  items: z.array(googleEventSchema).max(2500).optional(),
  nextPageToken: z.string().optional(),
}).passthrough()

type StoredToken = z.infer<typeof storedTokenSchema>
type Session = { userId: number; email?: string; picture?: string }
type CredentialRow = { token_ciphertext: string; token_iv: string; key_version: string }

export class GoogleCalendarError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 500 | 502 | 503,
  ) {
    super(message)
  }
}

export function googleCalendarConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() && env.TOKEN_ENCRYPTION_KEY?.trim())
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new GoogleCalendarError('invalid_token', '認証情報の形式が不正です。', 401)
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)])
  let difference = 0
  for (let index = 0; index < leftHash.length; index += 1) difference |= leftHash[index] ^ rightHash[index]
  return difference === 0
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const keyBytes = await sha256(secret)
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptJson(value: unknown, secret: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return { ciphertext: encodeBase64Url(new Uint8Array(ciphertext)), iv: encodeBase64Url(iv) }
}

async function decryptJson<T>(ciphertext: string, iv: string, secret: string, schema: z.ZodType<T>): Promise<T> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64Url(iv) },
      await encryptionKey(secret),
      decodeBase64Url(ciphertext),
    )
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext))
    const result = schema.safeParse(parsed)
    if (result.success) return result.data
  } catch {
    // A single generic error avoids exposing whether parsing or authentication failed.
  }
  throw new GoogleCalendarError('invalid_token', '保存されたGoogle認証情報を確認できません。再連携してください。', 401)
}

function readCookie(request: Request, name: string): string | undefined {
  const prefix = `${name}=`
  return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length)
}

function cookieHeader(name: string, value: string, request: Request, maxAge: number, path = '/'): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

export function clearGoogleOAuthCookie(request: Request): string {
  return cookieHeader(OAUTH_COOKIE, '', request, 0, '/api/google')
}

export function clearGoogleSessionCookie(request: Request): string {
  return cookieHeader(SESSION_COOKIE, '', request, 0)
}

function redirectUri(request: Request): string {
  return new URL('/api/google/callback', request.url).toString()
}

function requireConfiguration(env: Env): void {
  if (!googleCalendarConfigured(env)) {
    throw new GoogleCalendarError('google_not_configured', 'Google Calendar連携が設定されていません。', 503)
  }
}

export async function createGoogleAuthorization(request: Request, env: Env): Promise<{ location: string; cookie: string }> {
  requireConfiguration(env)
  const state = randomToken()
  const verifier = randomToken()
  const challenge = encodeBase64Url(await sha256(verifier))
  const oauthState = await encryptJson({ state, verifier, createdAt: Date.now() }, env.TOKEN_ENCRYPTION_KEY)
  const authorizationUrl = new URL(AUTH_ENDPOINT)
  authorizationUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: `openid email profile ${CALENDAR_SCOPE} ${CALENDAR_LIST_SCOPE}`,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()
  return {
    location: authorizationUrl.toString(),
    cookie: cookieHeader(OAUTH_COOKIE, `${oauthState.iv}.${oauthState.ciphertext}`, request, OAUTH_COOKIE_SECONDS, '/api/google'),
  }
}

async function parseOAuthState(request: Request, returnedState: string, secret: string): Promise<z.infer<typeof oauthStateSchema>> {
  const value = readCookie(request, OAUTH_COOKIE)
  const [iv, ciphertext, extra] = value?.split('.') ?? []
  if (!iv || !ciphertext || extra) throw new GoogleCalendarError('invalid_state', 'Google認証を開始したブラウザーを確認できません。', 400)
  const state = await decryptJson(ciphertext, iv, secret, oauthStateSchema)
  if (Date.now() - state.createdAt > OAUTH_COOKIE_SECONDS * 1000 || !(await secureEqual(state.state, returnedState))) {
    throw new GoogleCalendarError('invalid_state', 'Google認証の有効期限が切れたか、stateが一致しません。', 400)
  }
  return state
}

async function postToken(body: URLSearchParams): Promise<unknown> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20_000),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new GoogleCalendarError('google_token_failed', 'Googleの認証トークンを取得できませんでした。', 502)
  return payload
}

function decodeJwtSegment(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment))) as unknown
  } catch {
    throw new GoogleCalendarError('invalid_id_token', 'Google ID Tokenの形式が不正です。', 401)
  }
}

async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<z.infer<typeof jwtPayloadSchema>> {
  if (idToken.length > 16_384) throw new GoogleCalendarError('invalid_id_token', 'Google ID Tokenが大きすぎます。', 401)
  const [encodedHeader, encodedPayload, encodedSignature, extra] = idToken.split('.')
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) throw new GoogleCalendarError('invalid_id_token', 'Google ID Tokenの形式が不正です。', 401)
  const header = jwtHeaderSchema.safeParse(decodeJwtSegment(encodedHeader))
  const payload = jwtPayloadSchema.safeParse(decodeJwtSegment(encodedPayload))
  if (!header.success || !payload.success) throw new GoogleCalendarError('invalid_id_token', 'Google ID Tokenの内容を検証できません。', 401)

  const certResponse = await fetch(GOOGLE_CERTS_ENDPOINT, { signal: AbortSignal.timeout(15_000) })
  if (!certResponse.ok || Number(certResponse.headers.get('content-length') ?? 0) > 200_000) {
    throw new GoogleCalendarError('google_certs_failed', 'Googleの公開鍵を取得できませんでした。', 502)
  }
  const certs = certsSchema.safeParse(await certResponse.json())
  const matchingKey = certs.success ? certs.data.keys.find((key) => key.kid === header.data.kid) : undefined
  if (!matchingKey) throw new GoogleCalendarError('invalid_id_token', 'Google ID Tokenの署名鍵を確認できません。', 401)

  const jwk: JsonWebKey = {
    kty: matchingKey.kty,
    n: matchingKey.n,
    e: matchingKey.e,
    alg: 'RS256',
    use: 'sig',
    key_ops: ['verify'],
    ext: true,
  }
  const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const signatureValid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  )
  const audiences = Array.isArray(payload.data.aud) ? payload.data.aud : [payload.data.aud]
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (!signatureValid || !audiences.includes(clientId) || (payload.data.azp && payload.data.azp !== clientId) || payload.data.exp <= nowSeconds || payload.data.iat > nowSeconds + 300) {
    throw new GoogleCalendarError('invalid_id_token', 'Google ID Tokenの署名またはclaimsを検証できません。', 401)
  }
  return payload.data
}

async function credentialForUser(userId: number, env: Env): Promise<CredentialRow | null> {
  return env.DB.prepare('SELECT token_ciphertext, token_iv, key_version FROM oauth_credentials WHERE user_id = ?').bind(userId).first<CredentialRow>()
}

async function decryptCredential(row: CredentialRow, env: Env): Promise<StoredToken> {
  if (row.key_version !== env.TOKEN_KEY_VERSION) throw new GoogleCalendarError('token_key_changed', '暗号鍵のバージョンが変わりました。Google Calendarを再連携してください。', 401)
  return decryptJson(row.token_ciphertext, row.token_iv, env.TOKEN_ENCRYPTION_KEY, storedTokenSchema)
}

async function saveCredential(userId: number, token: StoredToken, env: Env): Promise<void> {
  const encrypted = await encryptJson(token, env.TOKEN_ENCRYPTION_KEY)
  await env.DB.prepare(`
    INSERT INTO oauth_credentials (user_id, token_ciphertext, token_iv, key_version, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      token_ciphertext = excluded.token_ciphertext,
      token_iv = excluded.token_iv,
      key_version = excluded.key_version,
      updated_at = excluded.updated_at
  `).bind(userId, encrypted.ciphertext, encrypted.iv, env.TOKEN_KEY_VERSION, Date.now()).run()
}

export async function finishGoogleAuthorization(request: Request, env: Env): Promise<{ cookie: string }> {
  requireConfiguration(env)
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  if (!code || !returnedState || url.searchParams.has('error')) throw new GoogleCalendarError('google_authorization_denied', 'Google Calendarへのアクセスが許可されませんでした。', 400)

  const oauthState = await parseOAuthState(request, returnedState, env.TOKEN_ENCRYPTION_KEY)
  const tokenResult = tokenResponseSchema.safeParse(await postToken(new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(request),
    grant_type: 'authorization_code',
    code_verifier: oauthState.verifier,
  })))
  if (!tokenResult.success || (tokenResult.data.scope && !tokenResult.data.scope.split(' ').includes(CALENDAR_SCOPE))) {
    throw new GoogleCalendarError('invalid_google_token', 'Googleから必要な読み取り権限を取得できませんでした。', 401)
  }

  const identity = await verifyGoogleIdToken(tokenResult.data.id_token, env.GOOGLE_CLIENT_ID)
  let email = identity.email ?? null
  let picture = identity.picture ?? null
  if (!email || !picture) {
    // Workspaceアカウント等ではID Tokenにpictureが載らないことがあるため、userinfoで補完（失敗しても連携は続行）
    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenResult.data.access_token}` },
      signal: AbortSignal.timeout(10_000),
    }).then((response) => response.ok ? response.json() : null).catch(() => null)
    const parsed = userinfoSchema.safeParse(info)
    if (parsed.success) {
      email = email ?? parsed.data.email ?? null
      picture = picture ?? parsed.data.picture ?? null
    }
  }
  const now = Date.now()
  await env.DB.prepare(`
    INSERT INTO users (google_sub, email, picture, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, picture = excluded.picture, updated_at = excluded.updated_at
  `).bind(identity.sub, email, picture, now, now).run()
  const user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(identity.sub).first<{ id: number }>()
  if (!user) throw new GoogleCalendarError('database_error', 'Googleユーザーを保存できませんでした。', 500)

  let refreshToken = tokenResult.data.refresh_token
  if (!refreshToken) {
    const existing = await credentialForUser(user.id, env)
    if (existing) refreshToken = (await decryptCredential(existing, env)).refreshToken
  }
  if (!refreshToken) throw new GoogleCalendarError('missing_refresh_token', 'Refresh Tokenを取得できませんでした。Googleのアクセス許可を解除して再試行してください。', 401)

  await saveCredential(user.id, {
    accessToken: tokenResult.data.access_token,
    refreshToken,
    expiresAt: now + tokenResult.data.expires_in * 1000,
    scope: tokenResult.data.scope ?? CALENDAR_SCOPE,
  }, env)

  const sessionToken = randomToken()
  const sessionHash = encodeBase64Url(await sha256(sessionToken))
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(sessionHash, user.id, now + SESSION_SECONDS * 1000, now),
  ])
  return { cookie: cookieHeader(SESSION_COOKIE, sessionToken, request, SESSION_SECONDS) }
}

export async function getGoogleSession(request: Request, env: Env): Promise<Session | null> {
  const sessionToken = readCookie(request, SESSION_COOKIE)
  if (!sessionToken) return null
  const sessionHash = encodeBase64Url(await sha256(sessionToken))
  const row = await env.DB.prepare(`
    SELECT sessions.user_id, users.email, users.picture
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id_hash = ? AND sessions.expires_at > ?
  `).bind(sessionHash, Date.now()).first<{ user_id: number; email: string | null; picture: string | null }>()
  return row ? { userId: row.user_id, ...(row.email ? { email: row.email } : {}), ...(row.picture ? { picture: row.picture } : {}) } : null
}

export async function getGoogleCalendarStatus(request: Request, env: Env): Promise<CalendarStatus> {
  const configured = googleCalendarConfigured(env)
  if (!configured) return { configured: false, connected: false }
  const session = await getGoogleSession(request, env)
  return { configured: true, connected: Boolean(session), ...(session?.email ? { email: session.email } : {}), ...(session?.picture ? { picture: session.picture } : {}) }
}

async function refreshCredential(userId: number, token: StoredToken, env: Env): Promise<StoredToken> {
  const result = refreshResponseSchema.safeParse(await postToken(new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: token.refreshToken,
    grant_type: 'refresh_token',
  })))
  if (!result.success) throw new GoogleCalendarError('google_refresh_failed', 'Google Calendarの認証を更新できませんでした。再連携してください。', 401)
  const refreshed: StoredToken = {
    accessToken: result.data.access_token,
    refreshToken: token.refreshToken,
    expiresAt: Date.now() + result.data.expires_in * 1000,
    scope: result.data.scope ?? token.scope,
  }
  await saveCredential(userId, refreshed, env)
  return refreshed
}

async function authenticatedCredential(request: Request, env: Env): Promise<{ session: Session; token: StoredToken }> {
  requireConfiguration(env)
  const session = await getGoogleSession(request, env)
  if (!session) throw new GoogleCalendarError('google_not_connected', 'Google Calendarを接続してください。', 401)
  const row = await credentialForUser(session.userId, env)
  if (!row) throw new GoogleCalendarError('google_not_connected', 'Google Calendarの認証情報がありません。再連携してください。', 401)
  const stored = await decryptCredential(row, env)
  const token = stored.expiresAt <= Date.now() + 60_000 ? await refreshCredential(session.userId, stored, env) : stored
  return { session, token }
}

function calendarRange(request: Request): { timeMin: string; timeMax: string } {
  const url = new URL(request.url)
  const now = Date.now()
  const timeMin = url.searchParams.get('timeMin') ?? new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = url.searchParams.get('timeMax') ?? new Date(now).toISOString()
  const [minMs, maxMs] = [Date.parse(timeMin), Date.parse(timeMax)]
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs || maxMs - minMs > MAX_CALENDAR_RANGE_MS) {
    throw new GoogleCalendarError('invalid_range', '取得期間は31日以内の有効な日時で指定してください。', 400)
  }
  return { timeMin: new Date(minMs).toISOString(), timeMax: new Date(maxMs).toISOString() }
}

// 表示するカレンダー。既定は自分（primary）。共有カレンダーはアクセス権があれば
// events.readonlyスコープのまま読める
function requestedCalendarId(request: Request): string {
  const raw = new URL(request.url).searchParams.get('calendarId')?.trim()
  if (!raw) return 'primary'
  if (raw.length > 512) throw new GoogleCalendarError('invalid_calendar_id', 'カレンダーIDが不正です。', 400)
  return raw
}

function googleEventUrl(calendarId: string, range: { timeMin: string; timeMax: string }, pageToken?: string): string {
  const url = new URL(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`)
  url.search = new URLSearchParams({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
    maxResults: '250',
    fields: 'nextPageToken,items(id,summary,status,start,end,recurringEventId)',
  }).toString()
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  return url.toString()
}

async function fetchGoogleEvents(accessToken: string, calendarId: string, range: { timeMin: string; timeMax: string }, pageToken?: string): Promise<Response> {
  return fetch(googleEventUrl(calendarId, range, pageToken), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  })
}

function normalizeEvent(item: z.infer<typeof googleEventSchema>): CalendarEvent | null {
  if (item.status === 'cancelled') return null
  const allDay = Boolean(item.start.date && item.end.date)
  const start = item.start.dateTime ?? (item.start.date ? `${item.start.date}T00:00:00Z` : undefined)
  const end = item.end.dateTime ?? (item.end.date ? `${item.end.date}T00:00:00Z` : undefined)
  if (!start || !end) return null
  const [startMs, endMs] = [Date.parse(start), Date.parse(end)]
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  return {
    id: item.id,
    title: item.summary?.trim() || '予定',
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    durationMinutes: allDay ? 0 : Math.round((endMs - startMs) / 60_000),
    ...(item.recurringEventId ? { recurringEventId: item.recurringEventId } : {}),
    allDay,
  }
}

export async function listGoogleCalendarEvents(request: Request, env: Env): Promise<CalendarEventsResponse> {
  const range = calendarRange(request)
  const calendarId = requestedCalendarId(request)
  let { session, token } = await authenticatedCredential(request, env)
  const events: CalendarEvent[] = []
  let pageToken: string | undefined

  for (let page = 0; page < 10; page += 1) {
    let response = await fetchGoogleEvents(token.accessToken, calendarId, range, pageToken)
    if (response.status === 401) {
      token = await refreshCredential(session.userId, token, env)
      response = await fetchGoogleEvents(token.accessToken, calendarId, range, pageToken)
    }
    if (response.status === 401) throw new GoogleCalendarError('google_not_connected', 'Google Calendarの認証が無効です。再連携してください。', 401)
    if (response.status === 403) throw new GoogleCalendarError('google_scope_denied', 'Google Calendarの読み取り権限がありません。再連携してください。', 403)
    if (response.status === 404) throw new GoogleCalendarError('calendar_not_found', 'このカレンダーにアクセスできません。共有設定を確認してください。', 404)
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 1_000_000) {
      throw new GoogleCalendarError('google_calendar_failed', 'Google Calendarから予定を取得できませんでした。', 502)
    }
    const responseText = await response.text()
    if (responseText.length > 1_000_000) throw new GoogleCalendarError('google_calendar_failed', 'Google Calendarの応答が大きすぎます。', 502)
    let responseBody: unknown
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      throw new GoogleCalendarError('invalid_calendar_response', 'Google Calendarの応答形式を確認できませんでした。', 502)
    }
    const parsed = googleEventsSchema.safeParse(responseBody)
    if (!parsed.success) throw new GoogleCalendarError('invalid_calendar_response', 'Google Calendarの応答形式を確認できませんでした。', 502)
    events.push(...(parsed.data.items ?? []).map(normalizeEvent).filter((event): event is CalendarEvent => Boolean(event)))
    pageToken = parsed.data.nextPageToken
    if (!pageToken) return { events, range }
  }

  throw new GoogleCalendarError('calendar_result_too_large', '過去28日間の予定が多すぎるため、全件を取得できませんでした。期間を短くして再試行してください。', 502)
}

const googleCalendarListSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    summary: z.string().optional(),
    summaryOverride: z.string().optional(),
    primary: z.boolean().optional(),
    accessRole: z.string().optional(),
  }).passthrough()).optional(),
  nextPageToken: z.string().optional(),
}).passthrough()

// アクセス可能なカレンダーの一覧（自分＋共有）。calendarlist.readonlyスコープが必要で、
// 旧接続では403になる（クライアントは再接続を促す）
export async function listGoogleCalendars(request: Request, env: Env): Promise<CalendarListResponse> {
  let { session, token } = await authenticatedCredential(request, env)
  const calendars: CalendarListResponse['calendars'] = []
  let pageToken: string | undefined

  for (let page = 0; page < 2; page += 1) {
    const url = new URL(`${CALENDAR_API_BASE}/users/me/calendarList`)
    url.search = new URLSearchParams({
      maxResults: '250',
      minAccessRole: 'reader',
      fields: 'nextPageToken,items(id,summary,summaryOverride,primary,accessRole)',
      ...(pageToken ? { pageToken } : {}),
    }).toString()
    let response = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` }, signal: AbortSignal.timeout(20_000) })
    if (response.status === 401) {
      token = await refreshCredential(session.userId, token, env)
      response = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` }, signal: AbortSignal.timeout(20_000) })
    }
    if (response.status === 401) throw new GoogleCalendarError('google_not_connected', 'Google Calendarの認証が無効です。再連携してください。', 401)
    if (response.status === 403) throw new GoogleCalendarError('google_scope_denied', 'カレンダー一覧の権限がありません。接続を解除して再接続すると、他のカレンダーを表示できます。', 403)
    if (!response.ok) throw new GoogleCalendarError('google_calendar_failed', 'カレンダーの一覧を取得できませんでした。', 502)
    const parsed = googleCalendarListSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) throw new GoogleCalendarError('invalid_calendar_response', 'Google Calendarの応答形式を確認できませんでした。', 502)
    for (const item of parsed.data.items ?? []) {
      const summary = (item.summaryOverride ?? item.summary ?? item.id).trim().slice(0, 500) || item.id.slice(0, 500)
      if (item.id.length <= 512) calendars.push({ id: item.id, summary, ...(item.primary ? { primary: true } : {}), ...(item.accessRole ? { accessRole: item.accessRole.slice(0, 100) } : {}) })
    }
    pageToken = parsed.data.nextPageToken
    if (!pageToken) break
  }

  calendars.sort((left, right) => Number(Boolean(right.primary)) - Number(Boolean(left.primary)) || left.summary.localeCompare(right.summary, 'ja'))
  return { calendars: calendars.slice(0, 250) }
}

export async function disconnectGoogleCalendar(request: Request, env: Env): Promise<void> {
  const session = await getGoogleSession(request, env)
  if (!session) return
  const credential = await credentialForUser(session.userId, env)
  if (credential) {
    try {
      const token = await decryptCredential(credential, env)
      const response = await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: token.refreshToken }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) console.error(JSON.stringify({ message: 'Google token revocation was not acknowledged', status: response.status }))
    } catch (error) {
      console.error(JSON.stringify({ message: 'Google token revocation failed', error: error instanceof Error ? error.message : 'unknown' }))
    }
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_credentials WHERE user_id = ?').bind(session.userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.userId),
  ])
}
