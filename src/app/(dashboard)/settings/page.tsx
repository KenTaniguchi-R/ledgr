import { getSession } from "@/lib/auth/session";
import { getMcpSettings } from "@/queries/mcp-settings";
import { McpSettingsForm } from "@/components/organisms/mcp-settings-form";
import { DemoModeToggle } from "@/components/molecules/demo-mode-toggle";
import { isDemoMode } from "@/lib/demo-mode";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const [mcpSettings, demoEnabled] = await Promise.all([
    getMcpSettings(session.user.id),
    isDemoMode(session.user.id),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure integrations and access controls.
        </p>
      </div>
      <DemoModeToggle initialEnabled={demoEnabled} />
      <McpSettingsForm
        mcpEnabled={mcpSettings.mcpEnabled}
        connectedClients={mcpSettings.connectedClients}
      />
    </div>
  );
}
