"use client";

import { useState } from "react";
import { Loader2, Link as LinkIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { reconnectSimplefin } from "@/actions/simplefin";

interface SimplefinReconnectFlowProps {
  connectionId: string;
  institutionName: string;
  onReconnectSuccess?: () => void;
  onError?: (error: string) => void;
}

export function SimplefinReconnectFlow({
  connectionId,
  institutionName,
  onReconnectSuccess,
  onError,
}: SimplefinReconnectFlowProps) {
  const [open, setOpen] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSetupToken("");
      setError(null);
    }
  }

  async function handleReconnect() {
    setReconnecting(true);
    setError(null);
    try {
      const result = await reconnectSimplefin(connectionId, setupToken);
      if ("error" in result && result.error) {
        setError(result.error);
        onError?.(result.error);
        return;
      }
      setOpen(false);
      setSetupToken("");
      onReconnectSuccess?.();
    } catch {
      const msg = "Reconnection failed";
      setError(msg);
      onError?.(msg);
    } finally {
      setReconnecting(false);
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <LinkIcon className="size-3.5" />
        Reconnect
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reconnect {institutionName}</DialogTitle>
            <DialogDescription>
              Your SimpleFIN access has expired or was revoked. Generate a fresh Setup
              Token from your Bridge and paste it here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reconnect-token">New Setup Token</Label>
            <Textarea
              id="reconnect-token"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              placeholder="Paste your new Setup Token"
              className="font-mono text-xs min-h-24"
              spellCheck={false}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReconnect}
              disabled={reconnecting || setupToken.trim().length === 0}
            >
              {reconnecting && <Loader2 className="size-4 animate-spin" />}
              {reconnecting ? "Reconnecting..." : "Reconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
