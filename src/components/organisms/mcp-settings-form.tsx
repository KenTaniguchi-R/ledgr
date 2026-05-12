"use client";

import { useState, useTransition } from "react";
import { toggleMcpEndpoint, revokeMcpClient } from "@/actions/mcp-settings";
import type { ConnectedClient } from "@/queries/mcp-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Unplug } from "lucide-react";
import { McpSetupInstructions } from "@/components/molecules/mcp-setup-instructions";
import { ConnectedClientRow } from "@/components/molecules/connected-client-row";

interface McpSettingsFormProps {
  mcpEnabled: boolean;
  connectedClients: ConnectedClient[];
}

function useMcpUrl() {
  return typeof window !== "undefined"
    ? `${window.location.origin}/api/mcp`
    : "http://localhost:4200/api/mcp";
}

export function McpSettingsForm({
  mcpEnabled: initialEnabled,
  connectedClients: initialClients,
}: McpSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [clients, setClients] = useState(initialClients);
  const [isPending, startTransition] = useTransition();
  const mcpUrl = useMcpUrl();

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      const result = await toggleMcpEndpoint({ mcpEnabled: checked });
      if ("success" in result) setEnabled(checked);
    });
  }

  function handleRevoke(clientId: string) {
    startTransition(async () => {
      const result = await revokeMcpClient({ clientId });
      if ("success" in result) {
        setClients((prev) => prev.filter((c) => c.clientId !== clientId));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>MCP Access</CardTitle>
        <CardDescription>
          Allow AI clients to connect to Ledgr via the Model Context Protocol.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <Label htmlFor="mcp-toggle" className="cursor-pointer">
            Enable MCP endpoint
          </Label>
          <Switch
            id="mcp-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isPending}
          />
        </div>

        {enabled && <McpSetupInstructions mcpUrl={mcpUrl} />}

        <div className="space-y-3">
          <p className="text-sm font-medium">Connected Clients</p>
          {clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-6 text-center">
              <Unplug className="size-5 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No clients connected yet.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {clients.map((client) => (
                <ConnectedClientRow
                  key={client.clientId}
                  client={client}
                  onRevoke={handleRevoke}
                  disabled={isPending}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
