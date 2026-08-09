import { readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const distRoot = path.join(projectRoot, 'dist')
const sourceSecretPath = path.join(projectRoot, 'apikey.txt')
const encryptionKeyPath = path.join(projectRoot, 'token-encryption-key.txt')
const googleCredentialsPath = path.join(projectRoot, 'google-oauth.json')
const localVarsPath = path.join(projectRoot, '.dev.vars')

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath]
  }))
  return nested.flat()
}

const files = await collectFiles(distRoot)
const localSecretFiles = files.filter((file) => path.basename(file).startsWith('.dev.vars'))

for (const file of localSecretFiles) {
  await rm(file, { force: true })
}

async function readIfPresent(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return ''
  }
}

const [deepSeekSecret, encryptionSecret, googleJson, localVars] = await Promise.all([
  readIfPresent(sourceSecretPath),
  readIfPresent(encryptionKeyPath),
  readIfPresent(googleCredentialsPath),
  readIfPresent(localVarsPath),
])

let googleSecrets = []
try {
  const credentials = JSON.parse(googleJson)
  googleSecrets = [credentials?.web?.client_id, credentials?.web?.client_secret]
} catch {
  // An absent file is valid for builds without Google OAuth configured.
}

const localVariableSecrets = localVars.split(/\r?\n/).flatMap((line) => {
  const separator = line.indexOf('=')
  if (separator < 0) return []
  const raw = line.slice(separator + 1)
  try { return [JSON.parse(raw)] } catch { return [raw.replace(/^['"]|['"]$/g, '')] }
})

const secrets = [deepSeekSecret.trim(), encryptionSecret.trim(), ...googleSecrets, ...localVariableSecrets]
  .filter((value) => typeof value === 'string' && value.length >= 16)
const remainingFiles = await collectFiles(distRoot)

for (const file of remainingFiles) {
  const content = await readFile(file)
  if (secrets.some((secret) => content.includes(Buffer.from(secret)))) {
    throw new Error(`Build stopped: a local secret was found in ${path.relative(projectRoot, file)}`)
  }
}

console.log(`Build secret check passed; removed ${localSecretFiles.length} local secret file(s).`)
