"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CodeBlock } from "@/components/molecules/code-block";

interface McpSetupInstructionsProps {
  mcpUrl: string;
}

export function McpSetupInstructions({ mcpUrl }: McpSetupInstructionsProps) {
  const [open, setOpen] = useState(false);

  const cliCommand = `claude mcp add ledgr \\\n  --transport http \\\n  ${mcpUrl}`;
  const cliCopyText = `claude mcp add ledgr --transport http ${mcpUrl}`;
  const jsonConfig = JSON.stringify(
    { mcpServers: { ledgr: { url: mcpUrl, type: "http" } } },
    null,
    2,
  );

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        Setup Instructions
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t px-4 py-4 space-y-4 text-sm">
          <CodeBlock label="Endpoint URL" code={mcpUrl} inline />

          <CodeBlock
            label="Claude Code"
            description="Run this command in your terminal:"
            code={cliCommand}
            copyText={cliCopyText}
          />

          <CodeBlock
            label="Claude Desktop / Cursor / Windsurf"
            description="Add to your MCP config file (mcp.json or claude_desktop_config.json):"
            code={jsonConfig}
          />

          <p className="text-xs text-muted-foreground">
            On first connect, your client will open an authorization page where
            you grant access. Three scopes are available:{" "}
            <strong>ledgr:read</strong> (view data),{" "}
            <strong>ledgr:write</strong> (edit categories &amp; budgets), and{" "}
            <strong>ledgr:sync</strong> (trigger bank syncs).
          </p>
        </div>
      )}
    </div>
  );
}
