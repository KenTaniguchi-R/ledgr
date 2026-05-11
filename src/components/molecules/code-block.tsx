import { CopyButton } from "@/components/molecules/copy-button";

interface CodeBlockProps {
  label: string;
  description?: string;
  code: string;
  copyText?: string;
  inline?: boolean;
}

export function CodeBlock({
  label,
  description,
  code,
  copyText,
  inline,
}: CodeBlockProps) {
  return (
    <div className="space-y-2">
      <p className="font-medium">{label}</p>
      {description && <p className="text-muted-foreground">{description}</p>}
      <div className={`flex gap-2 ${inline ? "items-center" : "items-start"}`}>
        {inline ? (
          <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-xs break-all">
            {code}
          </code>
        ) : (
          <pre className="flex-1 rounded bg-muted px-3 py-2 font-mono text-xs overflow-x-auto whitespace-pre">
            {code}
          </pre>
        )}
        <CopyButton
          text={copyText ?? code}
          className={`shrink-0 size-8 p-0 ${inline ? "" : "mt-1"}`}
        />
      </div>
    </div>
  );
}
