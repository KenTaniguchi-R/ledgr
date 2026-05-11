interface ReviewProgressBarProps {
  current: number;
  total: number;
}

export function ReviewProgressBar({ current, total }: ReviewProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{current} of {total} reviewed</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
