import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WidgetPlaceholderProps {
  title: string;
  description: string;
  actions?: { label: string; href: string; primary?: boolean }[];
}

export function WidgetPlaceholder({ title, description, actions }: WidgetPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1.5 p-6 rounded-lg border border-dashed text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/70 max-w-[36ch]">{description}</p>
      {actions && actions.length > 0 && (
        <div className="flex gap-2 mt-2.5">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={cn(buttonVariants({ variant: a.primary ? "default" : "outline", size: "sm" }))}
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
