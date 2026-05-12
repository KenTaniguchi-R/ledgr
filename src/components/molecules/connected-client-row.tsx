"use client";

import type { ConnectedClient } from "@/queries/mcp-settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ConnectedClientRowProps {
  client: ConnectedClient;
  onRevoke: (clientId: string) => void;
  disabled?: boolean;
}

export function ConnectedClientRow({
  client,
  onRevoke,
  disabled,
}: ConnectedClientRowProps) {
  return (
    <li className="flex items-center justify-between rounded-lg border px-4 py-3">
      <div className="space-y-1">
        <p className="text-sm font-medium leading-none">
          {client.clientName ?? client.clientId}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {client.scope.split(" ").map((scope) => (
            <Badge
              key={scope}
              variant="secondary"
              className="text-[10px] font-mono"
            >
              {scope}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">
            Granted {new Date(client.grantedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRevoke(client.clientId)}
        disabled={disabled}
        className="ml-4 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
      >
        Revoke
      </Button>
    </li>
  );
}
