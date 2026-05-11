import { getSession } from "@/lib/auth/session";
import { getUserAiSettings } from "@/queries/settings";
import { AiSettingsForm } from "@/components/organisms/ai-settings-form";
import { McpSettings } from "@/components/settings/mcp-settings";
import { getConsentsForUser } from "@/lib/mcp/auth/oauth-server";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const settings = getUserAiSettings(session.user.id);

  const userSettingsRow = db
    .select({ mcpEnabled: userSettings.mcpEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .get();

  const mcpEnabled = userSettingsRow?.mcpEnabled === 1;
  const connectedClients = getConsentsForUser(session.user.id);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <AiSettingsForm
        initialProvider={settings?.aiProvider ?? null}
        initialModel={settings?.aiModel ?? null}
        initialBaseUrl={settings?.aiBaseUrl ?? null}
        initialThreshold={settings?.aiConfidenceThreshold ?? 0.7}
        hasExistingKey={settings?.hasKey ?? false}
      />
      <McpSettings
        mcpEnabled={mcpEnabled}
        connectedClients={connectedClients.map((c) => ({
          clientId: c.clientId,
          clientName: c.clientName ?? null,
          scope: c.scope,
          grantedAt: c.grantedAt,
        }))}
      />
    </div>
  );
}
