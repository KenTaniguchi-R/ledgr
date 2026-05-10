import { getSession } from "@/lib/auth/session";
import { getUserAiSettings } from "@/queries/settings";
import { AiSettingsForm } from "@/components/organisms/ai-settings-form";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const settings = getUserAiSettings(session.user.id);

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
    </div>
  );
}
