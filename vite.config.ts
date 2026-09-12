import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { app } from './server/hono-app'

// Mounts the same Hono app locally that runs in production as functions/api/[[route]].ts,
// so `npm run dev` and the deployed Pages Function share identical routing/handler logic.
// No real D1 binding here — use `wrangler pages dev` when a task needs real persistence.
const api: Plugin = {
  name: 'local-api',
  configureServer: (server) => mountApi(server.middlewares),
  configurePreviewServer: (server) => mountApi(server.middlewares),
}

function mountApi(middlewares: Connect.Server) {
  middlewares.use('/api', async (req, res) => {
    const url = `http://localhost${req.url?.startsWith('/api') ? req.url : `/api${req.url}`}`
    const body = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : new Uint8Array(await readBody(req))
    const request = new Request(url, { method: req.method, headers: req.headers as HeadersInit, body })
    const response = await app.fetch(request, {} as never)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
}

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default defineConfig({
  plugins: [react(), tailwindcss(), api],
  server: { port: 5191 },
})
