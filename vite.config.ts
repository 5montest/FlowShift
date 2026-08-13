import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'

process.env.WRANGLER_WRITE_LOGS ??= 'false'
process.env.MINIFLARE_REGISTRY_PATH ??= resolve('.wrangler', 'registry')

export default defineConfig({
  plugins: [react(), cloudflare()],
})
