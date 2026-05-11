"use client";

import { useState, useTransition } from "react";

export interface ConnectedClient {
  clientId: string;
  clientName: string | null;
  scope: string;
  grantedAt: string;
}

interface McpSettingsProps {
  mcpEnabled: boolean;
  connectedClients: ConnectedClient[];
}

export function McpSettings({ mcpEnabled: initialEnabled, connectedClients: initialClients }: McpSettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [clients, setClients] = useState(initialClients);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !enabled;
    startTransition(async () => {
      await fetch("/api/settings/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpEnabled: next }),
      });
      setEnabled(next);
    });
  }

  function handleRevoke(clientId: string) {
    startTransition(async () => {
      await fetch("/api/settings/mcp/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      setClients((prev) => prev.filter((c) => c.clientId !== clientId));
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <div>
        <h2 className="text-lg font-semibold">MCP Access</h2>
        <p className="text-sm text-muted-foreground">
          Allow AI clients to connect to Ledgr via the Model Context Protocol.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Enable MCP endpoint</span>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          aria-pressed={enabled}
          className={[
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
            enabled ? "bg-primary" : "bg-input",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            ].join(" ")}
          />
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Connected Clients</h3>
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients connected.</p>
        ) : (
          <ul className="space-y-2">
            {clients.map((client) => (
              <li
                key={client.clientId}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{client.clientName ?? client.clientId}</p>
                  <p className="text-xs text-muted-foreground">
                    Scopes: {client.scope} &middot; Granted{" "}
                    {new Date(client.grantedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(client.clientId)}
                  disabled={isPending}
                  className="ml-4 rounded-md px-3 py-1.5 text-xs font-medium text-destructive ring-1 ring-destructive/30 hover:bg-destructive/10 disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
