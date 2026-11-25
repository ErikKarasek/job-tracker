// The scout's own Worker: Pages Functions cannot run on a schedule, so this one exists only to
// fire tick() from a cron. It shares the D1 database, Workers AI and all the code with the app.
import { tick, type ScoutEnv } from '../server/scout/tick'

export default {
  // No HTTP API. Without a fetch handler any request (Cloudflare touches a Worker once on every
  // deploy) threw "no fetch handler", and site-watch reported each deploy as a failing Worker.
  async fetch() {
    return new Response('The job scout runs on a cron trigger only.', { status: 404 })
  },
  async scheduled(_event: ScheduledController, env: ScoutEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      tick(env).then(
        (r) => console.log(`[scout] ${r.step}: ${r.detail}`),
        (err) => console.error('[scout] tick failed', err),
      ),
    )
  },
} satisfies ExportedHandler<ScoutEnv>
