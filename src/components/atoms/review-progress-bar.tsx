import { Progress } from "@/components/ui/progress";

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
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}
