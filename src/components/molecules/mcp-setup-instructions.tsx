import { CodeBlock } from "@/components/molecules/code-block";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

const GITHUB_REPO = "KenTaniguchi-R/ledgr";

interface ToolConfig {
  value: string;
  label: string;
  instruction: string;
  code: string;
  copyText?: string;
}

function getPluginTools(): ToolConfig[] {
  return [
    {
      value: "claude-code",
      label: "Claude Code",
      instruction: "Run these commands in Claude Code:",
      code: `/plugin marketplace add ${GITHUB_REPO}\n/plugin install ledgr@ledgr`,
      copyText: `/plugin marketplace add ${GITHUB_REPO} && /plugin install ledgr@ledgr`,
    },
    {
      value: "codex",
      label: "Codex",
      instruction: "Run this command in your terminal:",
      code: `codex plugin marketplace add ${GITHUB_REPO}`,
    },
    {
      value: "opencode",
      label: "OpenCode",
      instruction: "Add to your opencode.json config:",
      code: JSON.stringify(
        { $schema: "https://opencode.ai/config.json", plugin: ["ledgr"] },
        null,
        2,
      ),
    },
    {
      value: "openclaw",
      label: "OpenClaw",
      instruction: "Run this command in your terminal:",
      code: `openclaw plugins install ledgr --marketplace ${GITHUB_REPO}`,
    },
    {
      value: "hermes",
      label: "Hermes",
      instruction: "Run this command in your terminal:",
      code: `hermes plugins install ${GITHUB_REPO}`,
    },
  ];
}

interface McpSetupInstructionsProps {
  mcpUrl: string;
}

export function McpSetupInstructions({ mcpUrl }: McpSetupInstructionsProps) {
  const pluginTools = getPluginTools();
  const mcpConfig = JSON.stringify(
    { mcpServers: { ledgr: { url: mcpUrl, type: "http" } } },
    null,
    2,
  );

  return (
    <div className="space-y-4 text-sm">
      <Tabs defaultValue="claude-code">
        <TabsList className="w-full">
          {pluginTools.map((tool) => (
            <TabsTrigger
              key={tool.value}
              value={tool.value}
              className="text-xs"
            >
              {tool.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="other" className="text-xs">
            Other
          </TabsTrigger>
        </TabsList>

        {pluginTools.map((tool) => (
          <TabsContent key={tool.value} value={tool.value} className="mt-3">
            <CodeBlock
              label={tool.instruction}
              code={tool.code}
              copyText={tool.copyText}
            />
          </TabsContent>
        ))}

        <TabsContent value="other" className="mt-3 space-y-3">
          <CodeBlock
            label="For Cursor, Windsurf, Cline, and other MCP-compatible tools — add to your MCP config:"
            code={mcpConfig}
          />
          <CodeBlock label="Endpoint URL" code={mcpUrl} inline />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        On first connect, your client will open an authorization page where
        you grant access. Three scopes are available:{" "}
        <strong>ledgr:read</strong> (view data),{" "}
        <strong>ledgr:write</strong> (edit categories &amp; budgets), and{" "}
        <strong>ledgr:sync</strong> (trigger bank syncs).
      </p>
    </div>
  );
}
