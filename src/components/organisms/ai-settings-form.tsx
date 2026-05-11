"use client";

import { useState, useTransition } from "react";
import { updateAiSettings, testAiConnection } from "@/actions/settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";

type AiProvider = "openai" | "anthropic" | "google" | "custom";

const PROVIDER_HELP: Record<AiProvider, { text: string; url?: string }> = {
  openai: { text: "Get your API key", url: "https://platform.openai.com/api-keys" },
  anthropic: { text: "Get your API key", url: "https://console.anthropic.com/settings/keys" },
  google: { text: "Get your API key", url: "https://aistudio.google.com/apikey" },
  custom: { text: "Enter your OpenAI-compatible endpoint URL (e.g. http://localhost:11434/v1)" },
};

const PROVIDER_MODEL_PLACEHOLDER: Record<AiProvider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-opus-4-5",
  google: "gemini-2.0-flash",
  custom: "model-name",
};

const THRESHOLD_LABELS: Record<number, string> = {
  0.5: "Very permissive",
  0.6: "Permissive",
  0.7: "Balanced",
  0.75: "Moderate",
  0.8: "Strict",
  0.85: "Very strict",
  0.9: "Maximum",
};

function getThresholdLabel(value: number): string {
  const closest = Object.keys(THRESHOLD_LABELS)
    .map(Number)
    .reduce((prev, curr) =>
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
  return THRESHOLD_LABELS[closest];
}

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
        <CardDescription>
          Connect an AI provider for automatic transaction categorization and
          chat.
        </CardDescription>
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
              <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
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
              {PROVIDER_HELP.custom.text}
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
              <a
                href={PROVIDER_HELP[typedProvider].url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {PROVIDER_HELP[typedProvider].text}
                <ExternalLink className="size-3" />
              </a>
            </p>
          )}
        </div>

        {/* Confidence threshold */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-threshold">
              Auto-categorization confidence
            </Label>
            <span className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
              {threshold.toFixed(2)}
            </span>
          </div>
          <Slider
            id="ai-threshold"
            min={0.5}
            max={0.9}
            step={0.05}
            value={[threshold]}
            onValueChange={(v) => {
              const val = Array.isArray(v) ? v[0] : v;
              setThreshold(val);
            }}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Permissive</span>
            <span className="font-medium text-foreground">
              {getThresholdLabel(threshold)}
            </span>
            <span>Strict</span>
          </div>
        </div>

        {/* Test connection result */}
        {testResult && (
          <Alert variant={"success" in testResult ? "default" : "destructive"}>
            {"success" in testResult ? (
              <CheckCircle2 className="size-4 text-green-600" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <AlertDescription>
              {"success" in testResult
                ? `Connected successfully. Tool calling: ${testResult.toolCallingSupported ? "supported" : "not supported"}`
                : testResult.error}
            </AlertDescription>
          </Alert>
        )}

        {/* Save result */}
        {saveResult && (
          <Alert variant={"success" in saveResult ? "default" : "destructive"}>
            {"success" in saveResult ? (
              <CheckCircle2 className="size-4 text-green-600" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <AlertDescription>
              {"success" in saveResult
                ? "Settings saved successfully."
                : saveResult.error}
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || !provider || !model || !apiKey}
          >
            {isTesting && <Loader2 className="size-4 animate-spin" />}
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !provider || !model}
          >
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
