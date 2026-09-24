import { app } from '../../server/hono-app'
import type { Env } from '../../server/types'

// The context goes along so routes can hand slow work (an interview brief) to waitUntil.
export const onRequest: PagesFunction<Env> = (ctx) => app.fetch(ctx.request, ctx.env, ctx as unknown as ExecutionContext)
