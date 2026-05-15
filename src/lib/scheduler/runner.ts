const inFlight = new Map<string, Promise<void>>();

/**
 * Wraps a scheduled task with:
 *   - per-name mutex (skips overlapping runs with a warn log)
 *   - try/catch (errors logged, never thrown to cron)
 *   - timing log on success
 *
 * `runTask` itself never throws — that's the contract with cron.
 */
export async function runTask(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (inFlight.has(name)) {
    console.warn(`[scheduler] ${name} already running, skipping this tick`);
    return;
  }

  const started = Date.now();
  const promise = (async () => {
    try {
      await fn();
      console.log(`[scheduler] ${name} done in ${Date.now() - started}ms`);
    } catch (err) {
      console.error(`[scheduler] ${name} failed after ${Date.now() - started}ms`, err);
    }
  })();

  inFlight.set(name, promise);
  try {
    await promise;
  } finally {
    inFlight.delete(name);
  }
}

/** Test-only: clears the mutex map between tests. */
export function __resetRunnerState(): void {
  inFlight.clear();
}
