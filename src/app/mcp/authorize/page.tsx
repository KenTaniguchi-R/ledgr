import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getClient } from "@/lib/mcp/auth/oauth-server";
import { getMcpSettings } from "@/queries/mcp-settings";
import { SCOPE_LABELS } from "@/lib/mcp/constants";
import { ConsentForm } from "./consent-form";

interface Props {
  searchParams: Promise<{
    client_id?: string;
    redirect_uri?: string;
    code_challenge?: string;
    scope?: string;
    state?: string;
  }>;
}

export default async function ConsentPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  if (!session?.user) {
    const returnUrl = `/mcp/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/login?redirect=${encodeURIComponent(returnUrl)}`);
  }

  const mcp = await getMcpSettings(session.user.id);
  if (!mcp.mcpEnabled) {
    return (
      <div className="text-destructive">
        MCP access is disabled. Enable it in Settings before connecting an app.
      </div>
    );
  }

  const { client_id, redirect_uri, code_challenge, scope, state } = params;

  if (!client_id || !redirect_uri || !code_challenge) {
    return <div className="text-destructive">Missing required parameters.</div>;
  }

  const client = await getClient(client_id);
  if (!client) {
    return <div className="text-destructive">Unknown application.</div>;
  }

  const scopeList = (scope ?? "ledgr:read").split(" ");

  return (
    <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
      <h1 className="mb-2 text-xl font-semibold">Authorize Access</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        <strong>{client.clientName ?? "An application"}</strong> wants to access
        your Ledgr financial data.
      </p>
      <div className="mb-6 space-y-2">
        <p className="text-sm font-medium">This will allow the app to:</p>
        <ul className="space-y-1">
          {scopeList.map((s) => (
            <li key={s} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-primary">&#10003;</span>
              <span>{SCOPE_LABELS[s] ?? s}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        After approval you will be redirected to{" "}
        <span className="font-mono">
          {(() => {
            try {
              return new URL(redirect_uri).host;
            } catch {
              return redirect_uri;
            }
          })()}
        </span>
      </p>
      <ConsentForm
        clientId={client_id}
        redirectUri={redirect_uri}
        codeChallenge={code_challenge}
        scope={scope ?? "ledgr:read"}
        state={state ?? null}
      />
    </div>
  );
}
