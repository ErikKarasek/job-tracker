import { app } from '../../server/hono-app'
import type { Env } from '../../server/types'

export const onRequest: PagesFunction<Env> = (ctx) => app.fetch(ctx.request, ctx.env)
