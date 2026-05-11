import { getSession } from "@/lib/auth/session";
import { getUserAiSettings, getMcpSettings } from "@/queries/settings";
import { AiSettingsForm } from "@/components/organisms/ai-settings-form";
import { McpSettingsForm } from "@/components/organisms/mcp-settings-form";
import { DemoModeToggle } from "@/components/molecules/demo-mode-toggle";
import { isDemoMode } from "@/lib/demo-mode";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const aiSettings = await getUserAiSettings(session.user.id);
  const mcpSettings = await getMcpSettings(session.user.id);
  const demoEnabled = await isDemoMode(session.user.id);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure AI providers, integrations, and access controls.
        </p>
      </div>
      <DemoModeToggle initialEnabled={demoEnabled} />
      <AiSettingsForm
        initialProvider={aiSettings?.aiProvider ?? null}
        initialModel={aiSettings?.aiModel ?? null}
        initialBaseUrl={aiSettings?.aiBaseUrl ?? null}
        initialThreshold={aiSettings?.aiConfidenceThreshold ?? 0.7}
        hasExistingKey={aiSettings?.hasKey ?? false}
      />
      <McpSettingsForm
        mcpEnabled={mcpSettings.mcpEnabled}
        connectedClients={mcpSettings.connectedClients}
      />
    </div>
  );
}
