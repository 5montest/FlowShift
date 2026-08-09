import { rm } from 'node:fs/promises'
import path from 'node:path'

const localVarsPath = path.resolve(import.meta.dirname, '..', '.dev.vars')
await rm(localVarsPath, { force: true })
console.log('Local development secret cleared before production build.')
