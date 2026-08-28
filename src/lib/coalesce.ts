const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` for `key`, or returns the already-running promise for that key
 * if one exists. Collapses concurrent calls that would otherwise duplicate
 * expensive work — e.g. a household-wide AI pass triggered independently by
 * several accounts syncing in parallel — into a single execution.
 */
export function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
