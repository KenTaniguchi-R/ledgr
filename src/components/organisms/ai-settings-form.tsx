"use client";

import { useState, useTransition } from "react";
import { updateAiSettings, testAiConnection } from "@/actions/settings";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AiProvider = "openai" | "anthropic" | "google" | "custom";

const PROVIDER_HELP: Record<AiProvider, string> = {
  openai: "Get your key at platform.openai.com/api-keys",
  anthropic: "Get your key at console.anthropic.com/settings/keys",
  google: "Get your key at aistudio.google.com/apikey",
  custom:
    "Enter your OpenAI-compatible endpoint URL (e.g. http://localhost:11434/v1)",
};

const PROVIDER_MODEL_PLACEHOLDER: Record<AiProvider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-opus-4-5",
  google: "gemini-2.0-flash",
  custom: "model-name",
};

interface AiSettingsFormProps {
  initialProvider: AiProvider | null;
  initialModel: string | null;
  initialBaseUrl: string | null;
  initialThreshold: number;
  hasExistingKey: boolean;
}

export function AiSettingsForm({
  initialProvider,
  initialModel,
  initialBaseUrl,
  initialThreshold,
  hasExistingKey,
}: AiSettingsFormProps) {
  const [provider, setProvider] = useState<AiProvider | "">(
    initialProvider ?? ""
  );
  const [model, setModel] = useState(initialModel ?? "");
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? "");
  const [threshold, setThreshold] = useState(initialThreshold);
  const [apiKey, setApiKey] = useState("");
  const [changingKey, setChangingKey] = useState(!hasExistingKey);

  const [saveResult, setSaveResult] = useState<
    { success: true } | { error: string } | null
  >(null);
  const [testResult, setTestResult] = useState<
    | { success: true; response: string; toolCallingSupported: boolean }
    | { error: string }
    | null
  >(null);

  const [isSaving, startSave] = useTransition();
  const [isTesting, setIsTesting] = useState(false);

  function handleProviderChange(value: string | null) {
    if (!value) return;
    setProvider(value as AiProvider);
    setModel("");
    setSaveResult(null);
    setTestResult(null);
  }

  async function handleSave() {
    if (!provider) return;
    setSaveResult(null);
    startSave(async () => {
      const result = await updateAiSettings({
        aiProvider: provider as AiProvider,
        aiModel: model,
        aiApiKey: changingKey && apiKey ? apiKey : undefined,
        aiBaseUrl: provider === "custom" ? baseUrl : undefined,
        aiConfidenceThreshold: threshold,
      });
      setSaveResult(result);
    });
  }

  async function handleTest() {
    if (!provider || !model || !apiKey) return;
    setIsTesting(true);
    setTestResult(null);
    const result = await testAiConnection({
      aiProvider: provider as AiProvider,
      aiModel: model,
      aiApiKey: apiKey,
      aiBaseUrl: provider === "custom" ? baseUrl : undefined,
    });
    setTestResult(result);
    setIsTesting(false);
  }

  const typedProvider = provider as AiProvider | "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Provider */}
        <div className="space-y-1.5">
          <Label htmlFor="ai-provider">Provider</Label>
          <Select value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger id="ai-provider" className="w-full">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Base URL — only for custom */}
        {typedProvider === "custom" && (
          <div className="space-y-1.5">
            <Label htmlFor="ai-base-url">Base URL</Label>
            <Input
              id="ai-base-url"
              placeholder="http://localhost:11434/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {PROVIDER_HELP.custom}
            </p>
          </div>
        )}

        {/* Model */}
        <div className="space-y-1.5">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            placeholder={
              typedProvider
                ? PROVIDER_MODEL_PLACEHOLDER[typedProvider]
                : "Select a provider first"
            }
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!provider}
          />
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <Label htmlFor="ai-api-key">API Key</Label>
          {hasExistingKey && !changingKey ? (
            <div className="flex items-center gap-2">
              <Input
                id="ai-api-key"
                value="••••••••"
                readOnly
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setChangingKey(true)}
              >
                Change
              </Button>
            </div>
          ) : (
            <Input
              id="ai-api-key"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          )}
          {typedProvider && typedProvider !== "custom" && (
            <p className="text-xs text-muted-foreground">
              {PROVIDER_HELP[typedProvider]}
            </p>
          )}
        </div>

        {/* Confidence threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-threshold">
              Auto-categorization confidence threshold
            </Label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {threshold.toFixed(2)}
            </span>
          </div>
          <input
            id="ai-threshold"
            type="range"
            min={0.5}
            max={0.9}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.50 (permissive)</span>
            <span>0.90 (strict)</span>
          </div>
        </div>

        {/* Test connection result */}
        {testResult && (
          <p
            className={
              "success" in testResult
                ? "text-sm text-green-600 dark:text-green-400"
                : "text-sm text-destructive"
            }
          >
            {"success" in testResult
              ? `Connected — response: "${testResult.response}" | Tool calling: ${testResult.toolCallingSupported ? "supported" : "unsupported"}`
              : `Error: ${testResult.error}`}
          </p>
        )}

        {/* Save result */}
        {saveResult && (
          <p
            className={
              "success" in saveResult
                ? "text-sm text-green-600 dark:text-green-400"
                : "text-sm text-destructive"
            }
          >
            {"success" in saveResult
              ? "Settings saved successfully."
              : `Error: ${saveResult.error}`}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || !provider || !model || !apiKey}
          >
            {isTesting ? "Testing…" : "Test Connection"}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !provider || !model}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
