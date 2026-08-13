import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const forbiddenPath = /(^|\/)(?:apikey\.txt|google-oauth\.json|token-encryption-key\.txt|\.dev\.vars[^/]*|\.env(?:\..*)?)$/i
const tokenPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:gh[opusr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]

async function readIfPresent(relativePath) {
  try {
    return await readFile(path.join(projectRoot, relativePath), 'utf8')
  } catch {
    return ''
  }
}

const repositoryFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: projectRoot,
  encoding: 'utf8',
}).split('\0').filter(Boolean)

const forbiddenFiles = repositoryFiles.filter((file) => forbiddenPath.test(file.replaceAll('\\', '/')))
if (forbiddenFiles.length) {
  throw new Error(`Secret check failed: forbidden local file staged (${forbiddenFiles.join(', ')})`)
}

const [deepSeekKey, tokenKey, googleJson, localVars] = await Promise.all([
  readIfPresent('apikey.txt'),
  readIfPresent('token-encryption-key.txt'),
  readIfPresent('google-oauth.json'),
  readIfPresent('.dev.vars'),
])

let googleSecrets = []
try {
  const credentials = JSON.parse(googleJson)
  const application = credentials.web ?? credentials.installed ?? {}
  googleSecrets = [application.client_id, application.client_secret]
} catch {
  // Missing local Google credentials is valid.
}

const localSecrets = localVars.split(/\r?\n/).flatMap((line) => {
  const separator = line.indexOf('=')
  if (separator < 0) return []
  const raw = line.slice(separator + 1)
  try { return [JSON.parse(raw)] } catch { return [raw.replace(/^['"]|['"]$/g, '')] }
})

const knownSecrets = [deepSeekKey.trim(), tokenKey.trim(), ...googleSecrets, ...localSecrets]
  .filter((value) => typeof value === 'string' && value.length >= 12)

const leakedFiles = []
for (const file of repositoryFiles) {
  const content = await readIfPresent(file)
  if (knownSecrets.some((secret) => content.includes(secret)) || tokenPatterns.some((pattern) => pattern.test(content))) {
    leakedFiles.push(file)
  }
}

if (leakedFiles.length) {
  throw new Error(`Secret check failed: possible credential found in ${leakedFiles.join(', ')}`)
}

console.log(`Repository secret check passed for ${repositoryFiles.length} tracked or untracked candidate file(s).`)
