import * as cron from "node-cron";
import { getSchedulerConfig } from "./config";
import { runTask } from "./runner";
import { runNightlySnapshot } from "./tasks/nightly-snapshot";
import { runDailySafetySync } from "./tasks/daily-safety-sync";

let started = false;
let jobs: Array<ReturnType<typeof cron.schedule>> = [];

/**
 * Starts all scheduled jobs. Idempotent — repeated calls are no-ops.
 * Called once from src/instrumentation.ts on server startup.
 */
export function startScheduler(): void {
  if (started) return;

  let config;
  try {
    config = getSchedulerConfig();
  } catch (err) {
    console.error("[scheduler] invalid config — scheduler not started", err);
    return;
  }

  if (!config.enabled) {
    console.log("[scheduler] disabled via SCHEDULER_ENABLED");
    started = true;
    return;
  }

  jobs.push(
    cron.schedule(config.snapshotCron, () =>
      runTask("nightly-snapshot", runNightlySnapshot),
    ),
  );
  jobs.push(
    cron.schedule(config.safetySyncCron, () =>
      runTask("daily-safety-sync", runDailySafetySync),
    ),
  );

  started = true;
  console.log(
    `[scheduler] started: snapshot=${config.snapshotCron}, safety-sync=${config.safetySyncCron}`,
  );
}

/** Stops all scheduled jobs. Used in tests and graceful shutdown. */
export function stopScheduler(): void {
  for (const job of jobs) job.stop();
  jobs = [];
  started = false;
}
