// The scout's own Worker: Pages Functions cannot run on a schedule, so this one exists only to
// fire tick() from a cron. It shares the D1 database, Workers AI and all the code with the app.
import { tick, type ScoutEnv } from '../server/scout/tick'

export default {
  async scheduled(_event: ScheduledController, env: ScoutEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      tick(env).then(
        (r) => console.log(`[scout] ${r.step}: ${r.detail}`),
        (err) => console.error('[scout] tick failed', err),
      ),
    )
  },
} satisfies ExportedHandler<ScoutEnv>
