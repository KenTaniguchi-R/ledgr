import { Clock } from "lucide-react";

interface WidgetPlaceholderProps {
  title: string;
  description: string;
}

export function WidgetPlaceholder({ title, description }: WidgetPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2 p-6">
      <Clock className="size-8" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-center">{description}</p>
    </div>
  );
}
