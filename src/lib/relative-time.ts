/**
 * Short relative time for sync timestamps ("3m ago", "6h ago").
 *
 * Lifted out of institution-header.tsx so the accounts toolbar can report the
 * freshest sync across all connections in the same wording the per-institution
 * rows use — two phrasings for the same fact on one page read as two facts.
 */
export function formatRelativeTime(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
