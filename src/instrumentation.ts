/**
 * Next.js bootstrap hook — runs once per server process at startup.
 * See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use it to kick off the in-process scheduler. The check on NEXT_RUNTIME
 * skips edge-runtime contexts where node-cron can't run.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
