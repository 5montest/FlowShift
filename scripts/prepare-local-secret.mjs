import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const deepSeekSource = new URL('../apikey.txt', import.meta.url)
const googleSource = new URL('../google-oauth.json', import.meta.url)
const encryptionKeySource = new URL('../token-encryption-key.txt', import.meta.url)
const target = new URL('../.dev.vars', import.meta.url)
const apiKey = (await readFile(deepSeekSource, 'utf8')).trim()

if (!apiKey || /[\r\n]/.test(apiKey)) {
  throw new Error('apikey.txt must contain exactly one non-empty API key')
}

let encryptionKey
try {
  encryptionKey = (await readFile(encryptionKeySource, 'utf8')).trim()
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  encryptionKey = randomBytes(32).toString('base64url')
  await writeFile(encryptionKeySource, `${encryptionKey}\n`, { mode: 0o600, flag: 'wx' })
}
if (encryptionKey.length < 32 || /[\r\n]/.test(encryptionKey)) {
  throw new Error('token-encryption-key.txt must contain one secret of at least 32 characters')
}

const variables = {
  DEEPSEEK_API_KEY: apiKey,
  TOKEN_ENCRYPTION_KEY: encryptionKey,
}

try {
  const credentials = JSON.parse(await readFile(googleSource, 'utf8'))
  const clientId = credentials?.web?.client_id?.trim()
  const clientSecret = credentials?.web?.client_secret?.trim()
  if (!clientId || !clientSecret || /[\r\n]/.test(clientId) || /[\r\n]/.test(clientSecret)) {
    throw new Error('google-oauth.json must be a Google OAuth Web application credential file')
  }
  variables.GOOGLE_CLIENT_ID = clientId
  variables.GOOGLE_CLIENT_SECRET = clientSecret
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const contents = Object.entries(variables).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n')
await writeFile(target, `${contents}\n`, { mode: 0o600 })
console.log(`Local Worker secrets prepared${variables.GOOGLE_CLIENT_ID ? ' with Google OAuth credentials' : ' (Google OAuth credentials not found)'}.`)
