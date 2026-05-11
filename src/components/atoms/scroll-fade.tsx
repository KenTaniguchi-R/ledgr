import { cn } from "@/lib/utils";

interface ScrollFadeProps {
  minWidth: string;
  children: React.ReactNode;
  className?: string;
}

export function ScrollFade({ minWidth, children, className }: ScrollFadeProps) {
  return (
    <div className={cn("overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]", className)}>
      <div style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}
