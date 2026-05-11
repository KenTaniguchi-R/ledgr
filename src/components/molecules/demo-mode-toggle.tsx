"use client";

import { useState } from "react";
import { useActionTransition } from "@/hooks/use-action-transition";
import { toggleDemoMode } from "@/actions/demo-mode";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface DemoModeToggleProps {
  initialEnabled: boolean;
}

export function DemoModeToggle({ initialEnabled }: DemoModeToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const { isPending, execute } = useActionTransition();

  function handleToggle(checked: boolean) {
    execute(async () => {
      const result = await toggleDemoMode();
      if ("success" in result) setEnabled(checked);
      return result;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo Mode</CardTitle>
        <CardDescription>
          Browse the app with sample financial data. Your real data is untouched
          while active.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Label htmlFor="demo-toggle" className="cursor-pointer">
            Enable demo mode
          </Label>
          <Switch
            id="demo-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
