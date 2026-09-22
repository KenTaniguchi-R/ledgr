import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Grouped label/value rows, iOS-settings style: one card, hairlines between the
 * rows inside it, nothing floating. This replaces a column of free-standing
 * `Separator`s, which spent a full-weight rule on every pair of one-line fields
 * and left the panel reading as six unrelated blocks instead of one list.
 */
export function DetailGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10",
        "[&>*+*]:border-t [&>*+*]:border-border/70",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface DetailRowProps {
  label: string;
  /** Second line under the label — a summary of what the row opens. */
  hint?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function DetailRow({ label, hint, children, onClick, disabled = false }: DetailRowProps) {
  const body = (
    <>
      <span className="min-w-0 shrink-0 text-left">
        <span className="block text-sm">{label}</span>
        {hint !== undefined && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-2 text-sm">
        {children}
        {onClick && (
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
        )}
      </span>
    </>
  );

  const shell = "flex min-h-[50px] w-full items-center justify-between gap-3 px-3.5 py-2";

  if (!onClick) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        shell,
        "cursor-pointer text-left transition-colors hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {body}
    </button>
  );
}
