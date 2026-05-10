# Phase 11: AI Assistant + CSV/OFX Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BYOK AI categorization, streaming chat with financial tools, and CSV/OFX file import to Ledgr.

**Architecture:** Provider factory creates per-request LLM instances from user's encrypted key. AI categorization runs as a separate async step after sync. Chat streams via API route with read-only DB tools. Import uses server-side parsing via API route with auto-detect column mapping.

**Tech Stack:** Vercel AI SDK 6.x (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`), PapaParse, shadcn Sheet/Select/Progress/Slider, Drizzle ORM, Zod.

---

## Task 1: Schema Migration

**Files:**
- Modify: `src/db/schema/households.ts`
- Modify: `src/db/schema/transactions.ts`

- [ ] **Step 1: Add new columns to userSettings**

```typescript
// src/db/schema/households.ts — replace the userSettings table definition
export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  theme: text("theme").default("system"),
  currency: text("currency").default("USD"),
  aiProvider: text("ai_provider", {
    enum: ["openai", "anthropic", "google", "custom"],
  }),
  aiModel: text("ai_model"),
  aiApiKey: text("ai_api_key"),
  aiBaseUrl: text("ai_base_url"),
  aiConfidenceThreshold: text("ai_confidence_threshold").default("0.7"),
  toolCallingSupported: integer("tool_calling_supported", { mode: "boolean" }),
  dashboardLayout: text("dashboard_layout"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});
```

- [ ] **Step 2: Add columns to transactions table**

Add after `updatedAt` in `src/db/schema/transactions.ts`:

```typescript
    externalId: text("external_id"),
    aiCategorizationAttemptedAt: text("ai_categorization_attempted_at"),
```

Add to the indexes array:

```typescript
    index("idx_txn_external_id").on(table.accountId, table.externalId),
```

- [ ] **Step 3: Generate and run migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: Migration files generated in `drizzle/` and applied successfully.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/households.ts src/db/schema/transactions.ts drizzle/
git commit -m "feat(phase11): add AI settings and import columns to schema"
```

---

## Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install AI SDK provider packages + PapaParse**

Run: `pnpm add @ai-sdk/openai-compatible papaparse && pnpm add -D @types/papaparse`

Note: `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` are already installed.

- [ ] **Step 2: Verify install**

Run: `pnpm typecheck`
Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(phase11): add openai-compatible provider and papaparse deps"
```

---

## Task 3: AI Provider Factory

**Files:**
- Create: `src/lib/ai/provider.ts`
- Create: `src/lib/ai/provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/ai/provider.test.ts
import { describe, test, expect } from "vitest";
import { createUserModel } from "./provider";

describe("createUserModel", () => {
  test("creates OpenAI model", () => {
    const model = createUserModel({
      aiProvider: "openai",
      aiModel: "gpt-4.1",
      aiApiKey: "sk-test-key",
    });
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4.1");
  });

  test("creates Anthropic model", () => {
    const model = createUserModel({
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-4-20250514",
      aiApiKey: "sk-ant-test",
    });
    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-sonnet-4-20250514");
  });

  test("creates Google model", () => {
    const model = createUserModel({
      aiProvider: "google",
      aiModel: "gemini-2.5-flash",
      aiApiKey: "test-key",
    });
    expect(model).toBeDefined();
  });

  test("creates custom OpenAI-compatible model", () => {
    const model = createUserModel({
      aiProvider: "custom",
      aiModel: "llama3.1:8b",
      aiApiKey: "",
      aiBaseUrl: "http://localhost:11434/v1",
    });
    expect(model).toBeDefined();
  });

  test("throws on custom provider without baseUrl", () => {
    expect(() =>
      createUserModel({
        aiProvider: "custom",
        aiModel: "llama3.1:8b",
        aiApiKey: "",
      }),
    ).toThrow("aiBaseUrl is required");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ai/provider.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement provider factory**

```typescript
// src/lib/ai/provider.ts
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type AiProvider = "openai" | "anthropic" | "google" | "custom";

export interface ProviderConfig {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl?: string;
}

export function createUserModel(config: ProviderConfig): LanguageModel {
  switch (config.aiProvider) {
    case "openai": {
      const provider = createOpenAI({ apiKey: config.aiApiKey });
      return provider(config.aiModel);
    }
    case "anthropic": {
      const provider = createAnthropic({ apiKey: config.aiApiKey });
      return provider(config.aiModel);
    }
    case "google": {
      const provider = createGoogleGenerativeAI({ apiKey: config.aiApiKey });
      return provider(config.aiModel);
    }
    case "custom": {
      if (!config.aiBaseUrl) {
        throw new Error("aiBaseUrl is required for custom provider");
      }
      const provider = createOpenAICompatible({
        baseURL: config.aiBaseUrl,
        apiKey: config.aiApiKey || "none",
        name: "custom",
      });
      return provider(config.aiModel);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ai/provider.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/provider.ts src/lib/ai/provider.test.ts
git commit -m "feat(phase11): add BYOK AI provider factory"
```

---

## Task 4: Settings Queries + Actions

**Files:**
- Create: `src/queries/settings.ts`
- Create: `src/actions/settings.ts`
- Create: `tests/integration/settings.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/integration/settings.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { v4 as uuid } from "uuid";

import { getUserAiSettings, upsertAiSettings } from "@/queries/settings";

describe("settings queries", () => {
  let db: LedgrDb;
  const userId = "user-1";

  beforeEach(() => {
    db = createTestDb();
  });

  test("returns null when no settings exist", () => {
    const result = getUserAiSettings(userId, db);
    expect(result).toBeNull();
  });

  test("returns settings with masked key hint", () => {
    db.insert(userSettings).values({
      id: uuid(),
      userId,
      aiProvider: "openai",
      aiModel: "gpt-4.1",
      aiApiKey: "encrypted-value-ending-in-abcd",
    }).run();

    const result = getUserAiSettings(userId, db);
    expect(result).not.toBeNull();
    expect(result!.aiProvider).toBe("openai");
    expect(result!.aiModel).toBe("gpt-4.1");
    expect(result!.hasKey).toBe(true);
    expect(result!.rawEncryptedKey).toBe("encrypted-value-ending-in-abcd");
  });

  test("upserts settings — insert then update", () => {
    upsertAiSettings(userId, {
      aiProvider: "openai",
      aiModel: "gpt-4.1",
      aiApiKey: "encrypted-key-1",
    }, db);

    let result = getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("openai");

    upsertAiSettings(userId, {
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-4-20250514",
    }, db);

    result = getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("anthropic");
    expect(result!.hasKey).toBe(true); // key preserved from first upsert
  });

  test("upserts with custom provider and base URL", () => {
    upsertAiSettings(userId, {
      aiProvider: "custom",
      aiModel: "llama3.1:8b",
      aiBaseUrl: "http://localhost:11434/v1",
    }, db);

    const result = getUserAiSettings(userId, db);
    expect(result!.aiProvider).toBe("custom");
    expect(result!.aiBaseUrl).toBe("http://localhost:11434/v1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/settings.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement queries/settings.ts**

```typescript
// src/queries/settings.ts
import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { v4 as uuid } from "uuid";

export interface AiSettings {
  aiProvider: "openai" | "anthropic" | "google" | "custom" | null;
  aiModel: string | null;
  hasKey: boolean;
  rawEncryptedKey: string | null;
  aiBaseUrl: string | null;
  aiConfidenceThreshold: number;
  toolCallingSupported: boolean | null;
}

export function getUserAiSettings(
  userId: string,
  db: LedgrDb = defaultDb,
): AiSettings | null {
  const row = db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!row) return null;

  return {
    aiProvider: row.aiProvider as AiSettings["aiProvider"],
    aiModel: row.aiModel,
    hasKey: !!row.aiApiKey,
    rawEncryptedKey: row.aiApiKey,
    aiBaseUrl: row.aiBaseUrl ?? null,
    aiConfidenceThreshold: parseFloat(row.aiConfidenceThreshold ?? "0.7"),
    toolCallingSupported: row.toolCallingSupported ?? null,
  };
}

export interface UpsertAiInput {
  aiProvider: string;
  aiModel: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiConfidenceThreshold?: number;
  toolCallingSupported?: boolean;
}

export function upsertAiSettings(
  userId: string,
  input: UpsertAiInput,
  db: LedgrDb = defaultDb,
): void {
  const existing = db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  const now = new Date().toISOString();

  if (existing) {
    const updates: Record<string, unknown> = {
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      updatedAt: now,
    };
    if (input.aiApiKey !== undefined) updates.aiApiKey = input.aiApiKey;
    if (input.aiBaseUrl !== undefined) updates.aiBaseUrl = input.aiBaseUrl;
    if (input.aiConfidenceThreshold !== undefined)
      updates.aiConfidenceThreshold = String(input.aiConfidenceThreshold);
    if (input.toolCallingSupported !== undefined)
      updates.toolCallingSupported = input.toolCallingSupported;

    db.update(userSettings)
      .set(updates)
      .where(eq(userSettings.id, existing.id))
      .run();
  } else {
    db.insert(userSettings).values({
      id: uuid(),
      userId,
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      aiApiKey: input.aiApiKey ?? null,
      aiBaseUrl: input.aiBaseUrl ?? null,
      aiConfidenceThreshold: input.aiConfidenceThreshold
        ? String(input.aiConfidenceThreshold)
        : "0.7",
      toolCallingSupported: input.toolCallingSupported ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
  }
}
```

- [ ] **Step 4: Implement actions/settings.ts**

```typescript
// src/actions/settings.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { encrypt, decrypt } from "@/lib/encryption";
import { getUserAiSettings, upsertAiSettings } from "@/queries/settings";
import { createUserModel, type AiProvider } from "@/lib/ai/provider";
import { generateText } from "ai";

const aiSettingsSchema = z.object({
  aiProvider: z.enum(["openai", "anthropic", "google", "custom"]),
  aiModel: z.string().min(1, "Model is required"),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().url().optional().or(z.literal("")),
  aiConfidenceThreshold: z.number().min(0.5).max(0.9).optional(),
});

export async function updateAiSettings(
  input: z.infer<typeof aiSettingsSchema>,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const parsed = aiSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { aiProvider, aiModel, aiApiKey, aiBaseUrl, aiConfidenceThreshold } = parsed.data;

  const encryptedKey = aiApiKey ? encrypt(aiApiKey) : undefined;

  upsertAiSettings(session.user.id, {
    aiProvider,
    aiModel,
    aiApiKey: encryptedKey,
    aiBaseUrl: aiBaseUrl || undefined,
    aiConfidenceThreshold,
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function testAiConnection(input: {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl?: string;
}): Promise<{ success: true; response: string; toolCallingSupported: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  try {
    const model = createUserModel({
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      aiApiKey: input.aiApiKey,
      aiBaseUrl: input.aiBaseUrl,
    });

    const { text } = await generateText({
      model,
      prompt: "Say 'connected' in one word.",
      maxTokens: 10,
    });

    let toolCallingSupported = true;
    try {
      await generateText({
        model,
        prompt: "What is 1+1?",
        tools: {
          add: {
            description: "Add two numbers",
            parameters: z.object({ a: z.number(), b: z.number() }),
            execute: async ({ a, b }) => ({ result: a + b }),
          },
        },
        maxSteps: 2,
        maxTokens: 50,
      });
    } catch {
      toolCallingSupported = false;
    }

    // Persist tool-calling capability
    upsertAiSettings(session.user.id, {
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      toolCallingSupported,
    });

    return { success: true, response: text, toolCallingSupported };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Connection failed";
    return { error: message };
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/integration/settings.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/queries/settings.ts src/actions/settings.ts tests/integration/settings.test.ts
git commit -m "feat(phase11): add settings queries and actions with encryption"
```

---

## Task 5: Settings Page UI

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/components/organisms/ai-settings-form.tsx`
- Modify: `src/components/organisms/sidebar-nav.tsx`

- [ ] **Step 1: Create settings page server component**

```typescript
// src/app/(dashboard)/settings/page.tsx
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
```

- [ ] **Step 2: Create AI settings form organism**

```typescript
// src/components/organisms/ai-settings-form.tsx
"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateAiSettings, testAiConnection } from "@/actions/settings";
import type { AiProvider } from "@/lib/ai/provider";

const PROVIDER_HELP: Record<string, string> = {
  openai: "Get your key at platform.openai.com/api-keys",
  anthropic: "Get your key at console.anthropic.com/settings/keys",
  google: "Get your key at aistudio.google.com/apikey",
  custom: "Enter your OpenAI-compatible endpoint URL (e.g. http://localhost:11434/v1)",
};

interface Props {
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
}: Props) {
  const [provider, setProvider] = useState<AiProvider | "">(initialProvider ?? "");
  const [model, setModel] = useState(initialModel ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? "");
  const [threshold, setThreshold] = useState(initialThreshold);
  const [showKeyInput, setShowKeyInput] = useState(!hasExistingKey);
  const [testResult, setTestResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);

  function handleSave() {
    if (!provider || !model) return;
    startTransition(async () => {
      const result = await updateAiSettings({
        aiProvider: provider,
        aiModel: model,
        aiApiKey: apiKey || undefined,
        aiBaseUrl: provider === "custom" ? baseUrl : undefined,
        aiConfidenceThreshold: threshold,
      });
      if ("error" in result) {
        setTestResult({ type: "error", message: result.error });
      } else {
        setTestResult({ type: "success", message: "Settings saved" });
      }
    });
  }

  async function handleTest() {
    if (!provider || !model) return;
    const keyToTest = apiKey || "";
    if (!keyToTest && !hasExistingKey && provider !== "custom") {
      setTestResult({ type: "error", message: "Enter an API key first" });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    const result = await testAiConnection({
      aiProvider: provider,
      aiModel: model,
      aiApiKey: keyToTest,
      aiBaseUrl: provider === "custom" ? baseUrl : undefined,
    });
    setIsTesting(false);
    if ("error" in result) {
      setTestResult({ type: "error", message: result.error });
    } else {
      const toolNote = result.toolCallingSupported
        ? ""
        : " (Note: tool-calling not supported — chat insights will be limited)";
      setTestResult({ type: "success", message: `Connected: "${result.response}"${toolNote}` });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
            <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
            </SelectContent>
          </Select>
          {provider && (
            <p className="text-xs text-muted-foreground">{PROVIDER_HELP[provider]}</p>
          )}
        </div>

        {provider === "custom" && (
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Model</Label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === "openai" ? "gpt-4.1" : provider === "anthropic" ? "claude-sonnet-4-20250514" : "model-name"}
          />
        </div>

        <div className="space-y-2">
          <Label>API Key</Label>
          {hasExistingKey && !showKeyInput ? (
            <div className="flex items-center gap-2">
              <Input value="••••••��•••••" disabled className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setShowKeyInput(true)}>
                Change
              </Button>
            </div>
          ) : (
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "custom" ? "Optional for local models" : "sk-..."}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>Auto-categorization confidence threshold: {Math.round(threshold * 100)}%</Label>
          <input
            type="range"
            min="0.5"
            max="0.9"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full"
            aria-label="AI confidence threshold"
          />
          <p className="text-xs text-muted-foreground">
            Transactions below this confidence stay uncategorized for manual review.
          </p>
        </div>

        {testResult && (
          <p className={`text-sm ${testResult.type === "error" ? "text-destructive" : "text-green-600"}`}>
            {testResult.message}
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTest} disabled={isTesting || !provider || !model}>
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
          <Button onClick={handleSave} disabled={isPending || !provider || !model}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Add Settings + Import to sidebar nav**

In `src/components/organisms/sidebar-nav.tsx`, add imports and nav items:

```typescript
// Add to imports:
import { Upload, Settings } from "lucide-react";

// Add to NAV_ITEMS array after reports:
  { href: "/investments", label: "Investments", icon: BarChart3 },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
```

- [ ] **Step 4: Verify page renders**

Run: `pnpm dev`
Navigate to `http://localhost:3000/settings` — verify form renders with provider dropdown, model input, API key field, and threshold slider.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/settings/ src/components/organisms/ai-settings-form.tsx src/components/organisms/sidebar-nav.tsx
git commit -m "feat(phase11): add AI settings page with provider config form"
```

---

## Task 6: CSV Parser + Column Mapper

**Files:**
- Create: `src/lib/import/csv.ts`
- Create: `src/lib/import/mapper.ts`
- Create: `src/lib/import/mapper.test.ts`

- [ ] **Step 1: Write mapper test**

```typescript
// src/lib/import/mapper.test.ts
import { describe, test, expect } from "vitest";
import { autoDetectMapping } from "./mapper";

describe("autoDetectMapping", () => {
  test("detects standard headers", () => {
    const mapping = autoDetectMapping(["Date", "Amount", "Description"]);
    expect(mapping.date).toBe("Date");
    expect(mapping.amount).toBe("Amount");
    expect(mapping.description).toBe("Description");
  });

  test("detects Chase CSV format", () => {
    const mapping = autoDetectMapping(["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"]);
    expect(mapping.date).toBe("Transaction Date");
    expect(mapping.amount).toBe("Amount");
    expect(mapping.description).toBe("Description");
    expect(mapping.category).toBe("Category");
  });

  test("detects split credit/debit columns", () => {
    const mapping = autoDetectMapping(["Date", "Description", "Debit", "Credit", "Balance"]);
    expect(mapping.date).toBe("Date");
    expect(mapping.description).toBe("Description");
    expect(mapping.debit).toBe("Debit");
    expect(mapping.credit).toBe("Credit");
    expect(mapping.amount).toBeUndefined();
  });

  test("detects case-insensitive headers", () => {
    const mapping = autoDetectMapping(["DATE", "AMOUNT", "NARRATION"]);
    expect(mapping.date).toBe("DATE");
    expect(mapping.amount).toBe("AMOUNT");
    expect(mapping.description).toBe("NARRATION");
  });

  test("returns empty for unrecognized headers", () => {
    const mapping = autoDetectMapping(["Col1", "Col2", "Col3"]);
    expect(mapping.date).toBeUndefined();
    expect(mapping.amount).toBeUndefined();
    expect(mapping.description).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/import/mapper.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement mapper**

```typescript
// src/lib/import/mapper.ts
export interface ColumnMapping {
  date?: string;
  amount?: string;
  credit?: string;
  debit?: string;
  description?: string;
  category?: string;
  reference?: string;
}

const REQUIRED_PATTERNS: Record<"date" | "amount" | "description", RegExp[]> = {
  date: [/^(transaction\s*)?date$/i, /^posted$/i, /^booking$/i, /^settlement/i],
  amount: [/^amount$/i, /^sum$/i, /^value$/i, /^total$/i],
  description: [/^desc(ription)?$/i, /^narr(ation)?$/i, /^memo$/i, /^detail$/i, /^payee$/i, /^merchant$/i, /^name$/i],
};

const OPTIONAL_PATTERNS: Record<"credit" | "debit" | "category" | "reference", RegExp[]> = {
  credit: [/^credit$/i, /^deposit$/i, /^cr$/i],
  debit: [/^debit$/i, /^withdrawal$/i, /^dr$/i, /^charge$/i],
  category: [/^category$/i, /^cat$/i, /^type$/i],
  reference: [/^ref(erence)?$/i, /^check$/i, /^cheque$/i],
};

function matchHeader(header: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(header.trim()));
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  for (const header of headers) {
    if (!mapping.date && matchHeader(header, REQUIRED_PATTERNS.date)) {
      mapping.date = header;
    } else if (!mapping.amount && matchHeader(header, REQUIRED_PATTERNS.amount)) {
      mapping.amount = header;
    } else if (!mapping.description && matchHeader(header, REQUIRED_PATTERNS.description)) {
      mapping.description = header;
    } else if (!mapping.credit && matchHeader(header, OPTIONAL_PATTERNS.credit)) {
      mapping.credit = header;
    } else if (!mapping.debit && matchHeader(header, OPTIONAL_PATTERNS.debit)) {
      mapping.debit = header;
    } else if (!mapping.category && matchHeader(header, OPTIONAL_PATTERNS.category)) {
      mapping.category = header;
    } else if (!mapping.reference && matchHeader(header, OPTIONAL_PATTERNS.reference)) {
      mapping.reference = header;
    }
  }

  // If credit/debit found but no single amount, don't set amount
  if (mapping.credit || mapping.debit) {
    mapping.amount = undefined;
  }

  return mapping;
}

export interface ValidatedMapping {
  date: string;
  description: string;
  amount?: string;
  credit?: string;
  debit?: string;
  category?: string;
  reference?: string;
}

export function validateMapping(mapping: ColumnMapping): { valid: true; mapping: ValidatedMapping } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!mapping.date) errors.push("Date column is required");
  if (!mapping.description) errors.push("Description column is required");
  if (!mapping.amount && !mapping.credit && !mapping.debit) {
    errors.push("Amount column (or Credit/Debit columns) required");
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, mapping: mapping as ValidatedMapping };
}
```

- [ ] **Step 4: Implement CSV parser**

```typescript
// src/lib/import/csv.ts
import Papa from "papaparse";

export interface CsvPreview {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
  totalRows: number;
}

export function parsePreview(content: string): CsvPreview {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    preview: 10,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const fullCount = Papa.parse(content, { header: true, skipEmptyLines: true });

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    delimiter: result.meta.delimiter,
    totalRows: fullCount.data.length,
  };
}

export function parseAll(content: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/lib/import/mapper.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/csv.ts src/lib/import/mapper.ts src/lib/import/mapper.test.ts
git commit -m "feat(phase11): add CSV parser and column auto-detection mapper"
```

---

## Task 7: Normalize + Dedup

**Files:**
- Create: `src/lib/import/normalize.ts`
- Create: `src/lib/import/dedup.ts`
- Create: `src/lib/import/normalize.test.ts`

- [ ] **Step 1: Write normalize test**

```typescript
// src/lib/import/normalize.test.ts
import { describe, test, expect } from "vitest";
import { normalizeImportedRows } from "./normalize";
import type { ValidatedMapping } from "./mapper";

describe("normalizeImportedRows", () => {
  const mapping: ValidatedMapping = { date: "Date", amount: "Amount", description: "Description" };
  const accountId = "acc-1";
  const householdId = "hh-1";

  test("converts amount to cents in Plaid convention (positive = expense)", () => {
    const rows = [{ Date: "2024-01-15", Amount: "-50.00", Description: "Paycheck" }];
    const result = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    // -50 in positive_is_expense convention means income → stays -50 in Plaid convention
    expect(result[0].amount).toBe(-5000);
  });

  test("flips sign when positive_is_income convention", () => {
    const rows = [{ Date: "2024-01-15", Amount: "50.00", Description: "Paycheck" }];
    const result = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_income");
    // +50 income in positive_is_income → -50 in Plaid convention (negative = income)
    expect(result[0].amount).toBe(-5000);
  });

  test("handles split credit/debit columns", () => {
    const splitMapping: ValidatedMapping = { date: "Date", credit: "Credit", debit: "Debit", description: "Desc" };
    const rows = [
      { Date: "2024-01-15", Credit: "", Debit: "25.50", Desc: "Coffee" },
      { Date: "2024-01-16", Credit: "100.00", Debit: "", Desc: "Refund" },
    ];
    const result = normalizeImportedRows(rows, splitMapping, accountId, householdId, "positive_is_expense");
    expect(result[0].amount).toBe(2550);   // debit = positive (expense)
    expect(result[1].amount).toBe(-10000); // credit = negative (income)
  });

  test("parses various date formats", () => {
    const rows = [
      { Date: "01/15/2024", Amount: "10", Description: "A" },
      { Date: "2024-01-15", Amount: "10", Description: "B" },
      { Date: "15/01/2024", Amount: "10", Description: "C" },
    ];
    const result = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].date).toBe("2024-01-15");
    expect(result[1].date).toBe("2024-01-15");
  });

  test("generates unique IDs and applies householdId", () => {
    const rows = [{ Date: "2024-01-15", Amount: "10", Description: "Test" }];
    const result = normalizeImportedRows(rows, mapping, accountId, householdId, "positive_is_expense");
    expect(result[0].id).toHaveLength(36); // UUID
    expect(result[0].householdId).toBe(householdId);
    expect(result[0].accountId).toBe(accountId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/import/normalize.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement normalize**

```typescript
// src/lib/import/normalize.ts
import { v4 as uuid } from "uuid";
import type { ValidatedMapping } from "./mapper";

export type AmountConvention = "positive_is_expense" | "positive_is_income";

export interface NormalizedRow {
  id: string;
  accountId: string;
  householdId: string;
  date: string;
  originalName: string;
  name: string;
  amount: number;
  externalId: string | null;
}

function parseDateToISO(dateStr: string): string {
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // MM/DD/YYYY
  const mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YYYY (assume if day > 12)
  const dmyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch && parseInt(dmyMatch[1]) > 12) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Fallback: let Date parse it
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  return dateStr;
}

function parseAmountToCents(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  return Math.round(parseFloat(cleaned) * 100);
}

export function normalizeImportedRows(
  rows: Record<string, string>[],
  mapping: ValidatedMapping,
  accountId: string,
  householdId: string,
  convention: AmountConvention,
): NormalizedRow[] {
  return rows
    .map((row) => {
      const dateStr = row[mapping.date] ?? "";
      const description = row[mapping.description] ?? "";
      if (!dateStr || !description) return null;

      let amountCents: number;

      if (mapping.amount) {
        const raw = parseAmountToCents(row[mapping.amount] ?? "0");
        // Convert to Plaid convention: positive = expense (money out)
        amountCents = convention === "positive_is_income" ? -raw : raw;
      } else {
        // Split credit/debit columns
        const debitStr = row[mapping.debit!] ?? "";
        const creditStr = row[mapping.credit!] ?? "";
        const debit = debitStr ? parseAmountToCents(debitStr) : 0;
        const credit = creditStr ? parseAmountToCents(creditStr) : 0;
        // Debit = positive (expense), Credit = negative (income)
        amountCents = debit > 0 ? debit : -credit;
      }

      return {
        id: uuid(),
        accountId,
        householdId,
        date: parseDateToISO(dateStr),
        originalName: description.trim(),
        name: description.trim(),
        amount: amountCents,
        externalId: null,
      };
    })
    .filter((row): row is NormalizedRow => row !== null);
}
```

- [ ] **Step 4: Implement dedup**

```typescript
// src/lib/import/dedup.ts
import { createHash } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions } from "@/db/schema";
import type { NormalizedRow } from "./normalize";

export function generateDedupHash(row: { date: string; amount: number; description: string }): string {
  const input = `${row.date}|${row.amount}|${row.description.toLowerCase().trim()}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export interface DedupResult {
  unique: NormalizedRow[];
  duplicates: NormalizedRow[];
}

export function findDuplicates(
  rows: NormalizedRow[],
  accountId: string,
  db: LedgrDb = defaultDb,
): DedupResult {
  if (rows.length === 0) return { unique: [], duplicates: [] };

  // Check externalId first (for OFX imports)
  const withExternalId = rows.filter((r) => r.externalId);
  const withoutExternalId = rows.filter((r) => !r.externalId);

  const duplicates: NormalizedRow[] = [];
  const unique: NormalizedRow[] = [];

  if (withExternalId.length > 0) {
    const existingExternal = db
      .select({ externalId: transactions.externalId })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          inArray(transactions.externalId, withExternalId.map((r) => r.externalId!)),
        ),
      )
      .all();
    const existingIds = new Set(existingExternal.map((e) => e.externalId));

    for (const row of withExternalId) {
      if (existingIds.has(row.externalId)) {
        duplicates.push(row);
      } else {
        unique.push(row);
      }
    }
  }

  // Hash-based dedup for rows without externalId
  if (withoutExternalId.length > 0) {
    const existing = db
      .select({
        date: transactions.date,
        amount: transactions.amount,
        originalName: transactions.originalName,
      })
      .from(transactions)
      .where(eq(transactions.accountId, accountId))
      .all();

    const existingHashes = new Set(
      existing.map((t) => generateDedupHash({
        date: t.date,
        amount: t.amount,
        description: t.originalName,
      })),
    );

    for (const row of withoutExternalId) {
      const hash = generateDedupHash({
        date: row.date,
        amount: row.amount,
        description: row.originalName,
      });
      if (existingHashes.has(hash)) {
        duplicates.push(row);
      } else {
        unique.push(row);
      }
    }
  }

  return { unique, duplicates };
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/lib/import/normalize.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/normalize.ts src/lib/import/normalize.test.ts src/lib/import/dedup.ts
git commit -m "feat(phase11): add import normalization and deduplication"
```

---

## Task 8: OFX Parser

**Files:**
- Create: `src/lib/import/ofx.ts`
- Create: `src/lib/import/ofx.test.ts`

- [ ] **Step 1: Write OFX parser test**

```typescript
// src/lib/import/ofx.test.ts
import { describe, test, expect } from "vitest";
import { parseOfx } from "./ofx";

const OFX_V1_SAMPLE = `
OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-25.50
<FITID>TXN001
<NAME>STARBUCKS
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>100.00
<FITID>TXN002
<NAME>PAYROLL DEPOSIT
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const OFX_V2_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20240115</DTPOSTED>
<TRNAMT>-42.00</TRNAMT>
<FITID>XML001</FITID>
<NAME>GROCERY STORE</NAME>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

describe("parseOfx", () => {
  test("parses OFX v1 (SGML) transactions", () => {
    const result = parseOfx(OFX_V1_SAMPLE);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2024-01-15",
      amount: -2550,
      description: "STARBUCKS",
      type: "DEBIT",
      fitId: "TXN001",
    });
    expect(result[1]).toEqual({
      date: "2024-01-16",
      amount: 10000,
      description: "PAYROLL DEPOSIT",
      type: "CREDIT",
      fitId: "TXN002",
    });
  });

  test("parses OFX v2 (XML) transactions", () => {
    const result = parseOfx(OFX_V2_SAMPLE);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2024-01-15",
      amount: -4200,
      description: "GROCERY STORE",
      type: "DEBIT",
      fitId: "XML001",
    });
  });

  test("returns empty array for invalid content", () => {
    const result = parseOfx("not an OFX file at all");
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/import/ofx.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement OFX parser**

```typescript
// src/lib/import/ofx.ts
export interface OfxTransaction {
  date: string;
  amount: number;
  description: string;
  type: string;
  fitId: string;
}

function parseDateOFX(dtStr: string): string {
  const clean = dtStr.trim().slice(0, 8);
  if (clean.length !== 8) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

function amountToCents(amtStr: string): number {
  const cleaned = amtStr.replace(/[,\s]/g, "").trim();
  return Math.round(parseFloat(cleaned) * 100);
}

function extractField(block: string, field: string): string {
  // XML style: <FIELD>value</FIELD>
  const xmlMatch = block.match(new RegExp(`<${field}>([^<]+)</${field}>`, "i"));
  if (xmlMatch) return xmlMatch[1].trim();

  // SGML style: <FIELD>value\n
  const sgmlMatch = block.match(new RegExp(`<${field}>([^\\n<]+)`, "i"));
  if (sgmlMatch) return sgmlMatch[1].trim();

  return "";
}

export function parseOfx(content: string): OfxTransaction[] {
  const transactions: OfxTransaction[] = [];

  // Extract all STMTTRN blocks
  const blocks = content.split(/<STMTTRN>/i).slice(1);

  for (const block of blocks) {
    const endIdx = block.search(/<\/STMTTRN>|<STMTTRN>/i);
    const txnBlock = endIdx > -1 ? block.slice(0, endIdx) : block;

    const type = extractField(txnBlock, "TRNTYPE");
    const dateRaw = extractField(txnBlock, "DTPOSTED");
    const amountRaw = extractField(txnBlock, "TRNAMT");
    const fitId = extractField(txnBlock, "FITID");
    const name = extractField(txnBlock, "NAME") || extractField(txnBlock, "MEMO");

    if (!dateRaw || !amountRaw || !fitId) continue;

    transactions.push({
      date: parseDateOFX(dateRaw),
      amount: amountToCents(amountRaw),
      description: name,
      type: type || "OTHER",
      fitId,
    });
  }

  return transactions;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/import/ofx.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/ofx.ts src/lib/import/ofx.test.ts
git commit -m "feat(phase11): add minimal OFX/QFX parser (SGML + XML)"
```

---

## Task 9: Import API Route

**Files:**
- Create: `src/app/api/import/route.ts`
- Create: `tests/integration/import.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/integration/import.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import { transactions, accounts, households, householdMembers } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { parsePreview, parseAll } from "@/lib/import/csv";
import { autoDetectMapping, validateMapping } from "@/lib/import/mapper";
import { normalizeImportedRows } from "@/lib/import/normalize";
import { findDuplicates } from "@/lib/import/dedup";

const CSV_CONTENT = `Date,Description,Amount
2024-01-15,Coffee Shop,-5.50
2024-01-16,Paycheck,2000.00
2024-01-17,Grocery Store,-45.99`;

describe("import pipeline integration", () => {
  let db: LedgrDb;
  const householdId = "hh-1";
  const accountId = "acc-1";

  beforeEach(() => {
    db = createTestDb();
    db.insert(households).values({ id: householdId, name: "Test" }).run();
    db.insert(accounts).values({
      id: accountId,
      householdId,
      name: "Checking",
      type: "depository",
      subtype: "checking",
      currency: "USD",
    }).run();
  });

  test("full CSV pipeline: parse → map → normalize → insert", () => {
    const preview = parsePreview(CSV_CONTENT);
    expect(preview.headers).toEqual(["Date", "Description", "Amount"]);
    expect(preview.rows).toHaveLength(3);

    const detected = autoDetectMapping(preview.headers);
    const validated = validateMapping(detected);
    expect(validated.valid).toBe(true);
    if (!validated.valid) return;

    const rows = parseAll(CSV_CONTENT);
    const normalized = normalizeImportedRows(rows, validated.mapping, accountId, householdId, "positive_is_expense");
    expect(normalized).toHaveLength(3);
    expect(normalized[0].amount).toBe(-550);   // -5.50 expense
    expect(normalized[1].amount).toBe(200000); // 2000.00 positive = expense in this convention

    // Insert
    db.transaction((tx) => {
      for (const row of normalized) {
        tx.insert(transactions).values({
          id: row.id,
          accountId: row.accountId,
          householdId: row.householdId,
          date: row.date,
          originalName: row.originalName,
          name: row.name,
          amount: row.amount,
          normalizedAmount: -row.amount, // flip for display (depository)
          externalId: row.externalId,
        }).run();
      }
    });

    const inserted = db.select().from(transactions).all();
    expect(inserted).toHaveLength(3);
  });

  test("dedup detects existing transactions", () => {
    // Insert one existing transaction
    db.insert(transactions).values({
      id: uuid(),
      accountId,
      householdId,
      date: "2024-01-15",
      originalName: "Coffee Shop",
      name: "Coffee Shop",
      amount: -550,
      normalizedAmount: 550,
    }).run();

    const rows = parseAll(CSV_CONTENT);
    const detected = autoDetectMapping(["Date", "Description", "Amount"]);
    const validated = validateMapping(detected);
    if (!validated.valid) return;

    const normalized = normalizeImportedRows(rows, validated.mapping, accountId, householdId, "positive_is_expense");
    const { unique, duplicates } = findDuplicates(normalized, accountId, db);
    expect(duplicates).toHaveLength(1);
    expect(unique).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/import.test.ts`
Expected: FAIL (may need schema adjustments in test DB)

- [ ] **Step 3: Implement import API route**

```typescript
// src/app/api/import/route.ts
import { NextResponse } from "next/server";
import { getSession, resolveHouseholdId } from "@/lib/auth/session";
import { scopedQuery } from "@/lib/scoped-query";
import { db } from "@/db";
import { transactions, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { parsePreview, parseAll } from "@/lib/import/csv";
import { parseOfx } from "@/lib/import/ofx";
import { autoDetectMapping } from "@/lib/import/mapper";
import { validateMapping, type ValidatedMapping } from "@/lib/import/mapper";
import { normalizeImportedRows, type AmountConvention, type NormalizedRow } from "@/lib/import/normalize";
import { findDuplicates } from "@/lib/import/dedup";
import { normalizeAmount } from "@/lib/money";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const householdId = resolveHouseholdId(session.user.id);
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const step = formData.get("step") as string;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File must be under 10MB" }, { status: 400 });
  }

  const content = await file.text();
  const ext = file.name.split(".").pop()?.toLowerCase();
  const isOfx = ext === "ofx" || ext === "qfx";

  if (step === "preview") {
    if (isOfx) {
      const ofxTransactions = parseOfx(content);
      return NextResponse.json({
        type: "ofx",
        headers: ["Date", "Amount", "Description", "Type", "FIT ID"],
        rows: ofxTransactions.slice(0, 10).map((t) => ({
          Date: t.date,
          Amount: String(t.amount / 100),
          Description: t.description,
          Type: t.type,
          "FIT ID": t.fitId,
        })),
        totalRows: ofxTransactions.length,
        suggestedMapping: null,
      });
    }

    const preview = parsePreview(content);
    const suggestedMapping = autoDetectMapping(preview.headers);
    return NextResponse.json({
      type: "csv",
      ...preview,
      suggestedMapping,
    });
  }

  if (step === "import") {
    const accountId = formData.get("accountId") as string;
    const skipDuplicates = formData.get("skipDuplicates") === "true";

    if (!accountId) {
      return NextResponse.json({ error: "Account is required" }, { status: 400 });
    }

    // Verify account ownership
    const scoped = scopedQuery(householdId);
    const account = db
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), scoped.where(accounts)))
      .get();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 403 });
    }

    let normalized: NormalizedRow[];

    if (isOfx) {
      const ofxTransactions = parseOfx(content);
      normalized = ofxTransactions.map((t) => ({
        id: uuid(),
        accountId,
        householdId,
        date: t.date,
        originalName: t.description,
        name: t.description,
        amount: t.amount, // OFX amounts already in correct sign convention
        externalId: t.fitId,
      }));
    } else {
      const mappingJson = formData.get("mapping") as string;
      const convention = (formData.get("convention") as AmountConvention) || "positive_is_expense";

      if (!mappingJson) {
        return NextResponse.json({ error: "Column mapping is required" }, { status: 400 });
      }

      const mapping = JSON.parse(mappingJson);
      const validated = validateMapping(mapping);
      if (!validated.valid) {
        return NextResponse.json({ error: validated.errors.join(", ") }, { status: 400 });
      }

      const rows = parseAll(content);
      normalized = normalizeImportedRows(rows, validated.mapping, accountId, householdId, convention);
    }

    // Dedup
    const { unique, duplicates } = findDuplicates(normalized, accountId, db);

    if (duplicates.length > 0 && !skipDuplicates) {
      return NextResponse.json({
        status: "duplicates_found",
        duplicateCount: duplicates.length,
        uniqueCount: unique.length,
        totalCount: normalized.length,
      });
    }

    const toInsert = skipDuplicates ? unique : normalized;

    if (toInsert.length === 0) {
      return NextResponse.json({ imported: 0, skipped: normalized.length });
    }

    // Insert transactions
    const now = new Date().toISOString();
    db.transaction((tx) => {
      for (const row of toInsert) {
        tx.insert(transactions).values({
          id: row.id,
          accountId: row.accountId,
          householdId: row.householdId,
          date: row.date,
          originalName: row.originalName,
          name: row.name,
          amount: row.amount,
          normalizedAmount: normalizeAmount(row.amount, account.type),
          externalId: row.externalId,
          createdAt: now,
          updatedAt: now,
        }).run();
      }
    });

    return NextResponse.json({
      imported: toInsert.length,
      skipped: duplicates.length,
    });
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
```

- [ ] **Step 4: Run integration tests**

Run: `pnpm vitest run tests/integration/import.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/import/route.ts tests/integration/import.test.ts
git commit -m "feat(phase11): add import API route with CSV/OFX parsing and dedup"
```

---

## Task 10: Import Wizard UI

**Files:**
- Create: `src/app/(dashboard)/import/page.tsx`
- Create: `src/components/organisms/import-wizard.tsx`
- Create: `src/components/molecules/file-dropzone.tsx`
- Create: `src/components/molecules/column-mapper.tsx`
- Create: `src/components/molecules/import-preview.tsx`

- [ ] **Step 1: Create file dropzone molecule**

```typescript
// src/components/molecules/file-dropzone.tsx
"use client";

import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

const ACCEPTED = ".csv,.ofx,.qfx";

export function FileDropzone({ onFile, disabled }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-12 cursor-pointer transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <Upload className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">Drop a file here or click to browse</p>
      <p className="text-xs text-muted-foreground">CSV, OFX, QFX files up to 10MB</p>
      <input
        type="file"
        accept={ACCEPTED}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
    </label>
  );
}
```

- [ ] **Step 2: Create column mapper molecule**

```typescript
// src/components/molecules/column-mapper.tsx
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { ColumnMapping } from "@/lib/import/mapper";

interface Props {
  headers: string[];
  mapping: Partial<ColumnMapping>;
  onChange: (mapping: Partial<ColumnMapping>) => void;
}

const FIELDS = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount", required: false },
  { key: "description", label: "Description", required: true },
  { key: "credit", label: "Credit", required: false },
  { key: "debit", label: "Debit", required: false },
  { key: "category", label: "Category", required: false },
] as const;

export function ColumnMapper({ headers, mapping, onChange }: Props) {
  function handleChange(field: string, value: string) {
    const updated = { ...mapping, [field]: value === "__skip__" ? undefined : value };
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Map your file columns to transaction fields.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, label, required }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">
              {label} {required && <span className="text-destructive">*</span>}
            </Label>
            <Select
              value={(mapping as Record<string, string | undefined>)[key] ?? "__skip__"}
              onValueChange={(v) => handleChange(key, v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__skip__">(skip)</SelectItem>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create import preview molecule**

```typescript
// src/components/molecules/import-preview.tsx
"use client";

interface Props {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export function ImportPreview({ headers, rows, totalRows }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Showing {rows.length} of {totalRows} rows
      </p>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                {headers.map((h) => (
                  <td key={h} className="px-3 py-1.5 truncate max-w-[200px]">{row[h]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create import wizard organism**

```typescript
// src/components/organisms/import-wizard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/molecules/file-dropzone";
import { ColumnMapper } from "@/components/molecules/column-mapper";
import { ImportPreview } from "@/components/molecules/import-preview";
import type { ColumnMapping } from "@/lib/import/mapper";

type Step = "upload" | "map" | "preview" | "importing" | "done";

interface Account {
  id: string;
  name: string;
}

interface Props {
  accounts: Account[];
}

export function ImportWizard({ accounts }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"csv" | "ofx">("csv");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [convention, setConvention] = useState<"positive_is_expense" | "positive_is_income">("positive_is_expense");
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ duplicateCount: number; uniqueCount: number } | null>(null);

  async function handleFile(f: File) {
    setFile(f);
    setError(null);

    const formData = new FormData();
    formData.append("file", f);
    formData.append("step", "preview");

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setFileType(data.type);
    setHeaders(data.headers);
    setRows(data.rows);
    setTotalRows(data.totalRows);

    if (data.type === "ofx") {
      setStep("preview");
    } else {
      setMapping(data.suggestedMapping ?? {});
      setStep("map");
    }
  }

  async function handleImport(skipDuplicates = false) {
    if (!file) return;
    setStep("importing");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("step", "import");
    formData.append("accountId", accountId);
    formData.append("convention", convention);
    formData.append("skipDuplicates", String(skipDuplicates));
    if (fileType === "csv") {
      formData.append("mapping", JSON.stringify(mapping));
    }

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setStep("preview");
      return;
    }

    if (data.status === "duplicates_found") {
      setDuplicateInfo({ duplicateCount: data.duplicateCount, uniqueCount: data.uniqueCount });
      setStep("preview");
      return;
    }

    setResult(data);
    setStep("done");
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          {step === "upload" && "Import Transactions"}
          {step === "map" && "Map Columns"}
          {step === "preview" && "Preview"}
          {step === "importing" && "Importing..."}
          {step === "done" && "Import Complete"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {step === "upload" && (
          <FileDropzone onFile={handleFile} />
        )}

        {step === "map" && (
          <>
            <ColumnMapper headers={headers} mapping={mapping} onChange={setMapping} />
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={() => setStep("preview")}>Next</Button>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <ImportPreview headers={headers} rows={rows} totalRows={totalRows} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Target Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {fileType === "csv" && (
                <div className="space-y-1">
                  <Label className="text-xs">Amount Sign Convention</Label>
                  <Select value={convention} onValueChange={(v) => setConvention(v as typeof convention)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive_is_expense">Positive = Expense</SelectItem>
                      <SelectItem value="positive_is_income">Positive = Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {duplicateInfo && (
              <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm">
                <p className="font-medium">{duplicateInfo.duplicateCount} potential duplicates found</p>
                <p className="text-muted-foreground">{duplicateInfo.uniqueCount} unique transactions will be imported.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => handleImport(true)}>Skip Duplicates &amp; Import</Button>
                  <Button size="sm" variant="outline" onClick={() => { setDuplicateInfo(null); handleImport(false); }}>Import All Anyway</Button>
                </div>
              </div>
            )}

            {!duplicateInfo && (
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(fileType === "csv" ? "map" : "upload")}>Back</Button>
                <Button onClick={() => handleImport()}>
                  Import {totalRows} Transactions
                </Button>
              </div>
            )}
          </>
        )}

        {step === "importing" && (
          <div className="space-y-2 py-4">
            <Progress value={undefined} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">Processing...</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 py-4">
            <p className="text-sm">
              Imported <strong>{result.imported}</strong> transactions.
              {result.skipped > 0 && ` Skipped ${result.skipped} duplicates.`}
            </p>
            <Button onClick={() => router.push("/transactions")}>View Transactions</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create import page**

```typescript
// src/app/(dashboard)/import/page.tsx
import { getHouseholdId } from "@/lib/auth/session";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notDeleted } from "@/lib/query-helpers";
import { and } from "drizzle-orm";
import { ImportWizard } from "@/components/organisms/import-wizard";

export default async function ImportPage() {
  const householdId = await getHouseholdId();

  const userAccounts = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), notDeleted(accounts)))
    .all();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Import Transactions</h1>
      <ImportWizard accounts={userAccounts} />
    </div>
  );
}
```

- [ ] **Step 6: Verify wizard works in browser**

Run: `pnpm dev`
Navigate to `/import` — upload a sample CSV, verify column detection, preview, and import flow.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/import/ src/components/organisms/import-wizard.tsx src/components/molecules/file-dropzone.tsx src/components/molecules/column-mapper.tsx src/components/molecules/import-preview.tsx
git commit -m "feat(phase11): add import wizard UI with file upload, column mapping, and dedup"
```

---

## Task 11: AI Batch Categorization

**Files:**
- Create: `src/lib/ai/categorize.ts`
- Create: `src/lib/ai/categorize.test.ts`
- Modify: `src/lib/plaid/sync.ts` (add async AI step after existing categorization)

- [ ] **Step 1: Write categorization test**

```typescript
// src/lib/ai/categorize.test.ts
import { describe, test, expect } from "vitest";
import { buildCategorizationPrompt, validateAssignments } from "./categorize";

describe("buildCategorizationPrompt", () => {
  const categories = [
    { id: "cat-1", name: "Coffee", groupName: "Food & Drink" },
    { id: "cat-2", name: "Groceries", groupName: "Food & Drink" },
    { id: "cat-3", name: "Salary", groupName: "Income" },
  ];

  test("includes all categories with IDs", () => {
    const prompt = buildCategorizationPrompt(
      [{ id: "txn-1", description: "STARBUCKS #123", amount: -550 }],
      categories,
      [],
    );
    expect(prompt).toContain("cat-1");
    expect(prompt).toContain("Coffee");
    expect(prompt).toContain("Food & Drink");
  });

  test("includes transaction details", () => {
    const prompt = buildCategorizationPrompt(
      [{ id: "txn-1", description: "STARBUCKS #123", amount: -550 }],
      categories,
      [],
    );
    expect(prompt).toContain("txn-1");
    expect(prompt).toContain("STARBUCKS #123");
  });
});

describe("validateAssignments", () => {
  const validCategoryIds = new Set(["cat-1", "cat-2", "cat-3"]);
  const batchTransactionIds = new Set(["txn-1", "txn-2"]);

  test("accepts valid assignments", () => {
    const assignments = [
      { transactionId: "txn-1", categoryId: "cat-1", confidence: 0.9 },
    ];
    const result = validateAssignments(assignments, validCategoryIds, batchTransactionIds);
    expect(result).toHaveLength(1);
  });

  test("rejects hallucinated categoryIds", () => {
    const assignments = [
      { transactionId: "txn-1", categoryId: "fake-id", confidence: 0.9 },
    ];
    const result = validateAssignments(assignments, validCategoryIds, batchTransactionIds);
    expect(result).toHaveLength(0);
  });

  test("rejects hallucinated transactionIds", () => {
    const assignments = [
      { transactionId: "txn-99", categoryId: "cat-1", confidence: 0.9 },
    ];
    const result = validateAssignments(assignments, validCategoryIds, batchTransactionIds);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ai/categorize.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement AI categorization**

```typescript
// src/lib/ai/categorize.ts
import { generateText, Output } from "ai";
import { z } from "zod";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, categories, categoryGroups } from "@/db/schema";
import { notDeleted } from "@/lib/query-helpers";
import { createUserModel, type AiProvider } from "./provider";
import { getUserAiSettings } from "@/queries/settings";
import { decrypt } from "@/lib/encryption";
import { resolveHouseholdId } from "@/lib/auth/session";
import { householdMembers } from "@/db/schema";

const categorizationSchema = z.object({
  assignments: z.array(z.object({
    transactionId: z.string(),
    categoryId: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});

interface CategorizationInput {
  id: string;
  description: string;
  amount: number;
}

interface CategoryInfo {
  id: string;
  name: string;
  groupName: string;
}

export function buildCategorizationPrompt(
  txns: CategorizationInput[],
  cats: CategoryInfo[],
  examples: { description: string; categoryName: string }[],
): string {
  let prompt = "Categorize these transactions. Use ONLY the category IDs listed below.\n\n";
  prompt += "## Available Categories\n";
  for (const cat of cats) {
    prompt += `- ID: "${cat.id}" | Name: "${cat.name}" | Group: "${cat.groupName}"\n`;
  }

  if (examples.length > 0) {
    prompt += "\n## Examples of previously categorized transactions\n";
    for (const ex of examples) {
      prompt += `- "${ex.description}" → ${ex.categoryName}\n`;
    }
  }

  prompt += "\n## Transactions to categorize\n";
  for (const txn of txns) {
    const type = txn.amount > 0 ? "expense" : "income";
    prompt += `- ID: "${txn.id}" | "${txn.description}" | $${Math.abs(txn.amount / 100).toFixed(2)} (${type})\n`;
  }

  prompt += "\nReturn low confidence (<0.5) when uncertain. Use ONLY the exact category IDs listed above.";
  return prompt;
}

export function validateAssignments(
  assignments: z.infer<typeof categorizationSchema>["assignments"],
  validCategoryIds: Set<string>,
  batchTransactionIds: Set<string>,
): z.infer<typeof categorizationSchema>["assignments"] {
  return assignments.filter(
    (a) => validCategoryIds.has(a.categoryId) && batchTransactionIds.has(a.transactionId),
  );
}

function getBatchSize(provider: AiProvider): number {
  return provider === "custom" ? 20 : 50;
}

export async function categorizeWithAi(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<{ categorized: number; skipped: number }> {
  // Find household owner's settings
  const owner = db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.role, "owner")))
    .get();

  if (!owner) return { categorized: 0, skipped: 0 };

  const settings = getUserAiSettings(owner.userId, db);
  if (!settings?.aiProvider || !settings?.aiModel || !settings.hasKey) {
    return { categorized: 0, skipped: 0 };
  }

  const model = createUserModel({
    aiProvider: settings.aiProvider as AiProvider,
    aiModel: settings.aiModel,
    aiApiKey: decrypt(settings.rawEncryptedKey!),
    aiBaseUrl: settings.aiBaseUrl ?? undefined,
  });

  // Get uncategorized transactions not already attempted
  const uncategorized = db
    .select({ id: transactions.id, name: transactions.name, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        isNull(transactions.categoryId),
        isNull(transactions.aiCategorizationAttemptedAt),
        notDeleted(transactions),
      ),
    )
    .all();

  if (uncategorized.length === 0) return { categorized: 0, skipped: 0 };

  // Load categories
  const cats = db.select().from(categories).where(eq(categories.householdId, householdId)).all();
  const groups = db.select().from(categoryGroups).where(eq(categoryGroups.householdId, householdId)).all();
  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const categoryInfos: CategoryInfo[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: groupMap.get(c.groupId) ?? "Other",
  }));
  const validCategoryIds = new Set(cats.map((c) => c.id));

  // Load diverse examples
  const examples = db
    .select({ name: transactions.name, categoryId: transactions.categoryId })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.reviewed, true),
      ),
    )
    .limit(10)
    .all()
    .filter((e) => e.categoryId)
    .map((e) => ({
      description: e.name,
      categoryName: cats.find((c) => c.id === e.categoryId)?.name ?? "Unknown",
    }));

  const threshold = settings.aiConfidenceThreshold;
  const batchSize = getBatchSize(settings.aiProvider as AiProvider);
  let categorized = 0;
  const now = new Date().toISOString();

  // Process in batches
  for (let i = 0; i < uncategorized.length; i += batchSize) {
    const batch = uncategorized.slice(i, i + batchSize);
    const batchInputs: CategorizationInput[] = batch.map((t) => ({
      id: t.id,
      description: t.name,
      amount: t.amount,
    }));
    const batchIds = new Set(batch.map((t) => t.id));

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: categorizationSchema }),
        system: "You are a financial transaction categorization assistant. Be precise and conservative.",
        prompt: buildCategorizationPrompt(batchInputs, categoryInfos, examples),
      });

      if (output) {
        const validated = validateAssignments(output.assignments, validCategoryIds, batchIds);
        const aboveThreshold = validated.filter((a) => a.confidence >= threshold);

        if (aboveThreshold.length > 0) {
          db.transaction((tx) => {
            for (const a of aboveThreshold) {
              tx.update(transactions)
                .set({ categoryId: a.categoryId, updatedAt: now })
                .where(eq(transactions.id, a.transactionId))
                .run();
            }
          });
          categorized += aboveThreshold.length;
        }
      }
    } catch (e) {
      console.error(`AI categorization batch failed:`, e);
      // Non-fatal: continue with next batch
    }

    // Mark all batch transactions as attempted
    db.transaction((tx) => {
      for (const id of batchIds) {
        tx.update(transactions)
          .set({ aiCategorizationAttemptedAt: now })
          .where(eq(transactions.id, id))
          .run();
      }
    });
  }

  return { categorized, skipped: uncategorized.length - categorized };
}
```

- [ ] **Step 4: Wire into sync pipeline**

In `src/lib/plaid/sync.ts`, add after the existing `categorizeSyncedTransactions` call (around line 598):

```typescript
    // AI categorization (async, non-fatal, separate from sync engine)
    try {
      const { categorizeWithAi } = await import("@/lib/ai/categorize");
      await categorizeWithAi(householdId, db);
    } catch (aiError) {
      console.error(`AI categorization failed for item ${itemId}:`, aiError);
    }
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/lib/ai/categorize.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/categorize.ts src/lib/ai/categorize.test.ts src/lib/plaid/sync.ts
git commit -m "feat(phase11): add AI batch categorization with post-validation"
```

---

## Task 12: Chat Tools + System Prompt

**Files:**
- Create: `src/lib/ai/chat/tools.ts`
- Create: `src/lib/ai/chat/system-prompt.ts`

- [ ] **Step 1: Implement chat tools**

```typescript
// src/lib/ai/chat/tools.ts
import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { transactions, accounts, categories, categoryGroups, recurringTransactions, budgets, budgetCategories } from "@/db/schema";
import { eq, and, gte, lte, like, desc } from "drizzle-orm";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";

export function financialTools(householdId: string) {
  const scoped = scopedQuery(householdId);

  return {
    getSpendingByCategory: tool({
      description: "Get spending breakdown by category for a date range",
      parameters: z.object({
        startDate: z.string().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().describe("End date (YYYY-MM-DD)"),
      }),
      execute: async ({ startDate, endDate }) => {
        const rows = db
          .select({
            categoryName: categories.name,
            groupName: categoryGroups.name,
            amount: transactions.amount,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoryId, categories.id))
          .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
          .where(
            and(
              scoped.where(transactions),
              gte(transactions.date, startDate),
              lte(transactions.date, endDate),
              notDeleted(transactions),
            ),
          )
          .all();

        const byCategory = new Map<string, number>();
        for (const row of rows) {
          if (row.amount <= 0) continue; // only expenses
          const key = row.categoryName ?? "Uncategorized";
          byCategory.set(key, (byCategory.get(key) ?? 0) + row.amount);
        }

        return Array.from(byCategory.entries())
          .map(([category, totalCents]) => ({ category, amount: `$${(totalCents / 100).toFixed(2)}` }))
          .sort((a, b) => parseFloat(b.amount.slice(1)) - parseFloat(a.amount.slice(1)))
          .slice(0, 15);
      },
    }),

    searchTransactions: tool({
      description: "Search transactions by description, date range, or category",
      parameters: z.object({
        query: z.string().optional().describe("Search text in transaction name"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
        category: z.string().optional().describe("Category name to filter by"),
      }),
      execute: async ({ query, startDate, endDate, category }) => {
        let q = db
          .select({
            date: transactions.date,
            name: transactions.name,
            amount: transactions.amount,
            categoryName: categories.name,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoryId, categories.id))
          .where(and(scoped.where(transactions), notDeleted(transactions)))
          .$dynamic();

        if (query) q = q.where(like(transactions.name, `%${query}%`));
        if (startDate) q = q.where(gte(transactions.date, startDate));
        if (endDate) q = q.where(lte(transactions.date, endDate));

        const rows = q.orderBy(desc(transactions.date)).limit(20).all();

        return rows.map((r) => ({
          date: r.date,
          description: r.name.slice(0, 60),
          amount: `$${(Math.abs(r.amount) / 100).toFixed(2)}`,
          type: r.amount > 0 ? "expense" : "income",
          category: r.categoryName ?? "Uncategorized",
        }));
      },
    }),

    getAccountBalances: tool({
      description: "Get current balances for all accounts",
      parameters: z.object({}),
      execute: async () => {
        const rows = db
          .select({
            name: accounts.name,
            type: accounts.type,
            currentBalance: accounts.currentBalance,
            currency: accounts.currency,
          })
          .from(accounts)
          .where(and(scoped.where(accounts), notDeleted(accounts)))
          .all();

        return rows.map((r) => ({
          name: r.name,
          type: r.type,
          balance: `$${((r.currentBalance ?? 0) / 100).toFixed(2)}`,
        }));
      },
    }),

    getMonthlyTrends: tool({
      description: "Get month-over-month spending totals",
      parameters: z.object({
        months: z.number().min(1).max(12).default(6).describe("Number of months to show"),
      }),
      execute: async ({ months }) => {
        const now = new Date();
        const results: { month: string; spending: string; income: string }[] = [];

        for (let i = 0; i < months; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const start = d.toISOString().split("T")[0];
          const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];

          const rows = db
            .select({ amount: transactions.amount })
            .from(transactions)
            .where(
              and(
                scoped.where(transactions),
                gte(transactions.date, start),
                lte(transactions.date, end),
                notDeleted(transactions),
              ),
            )
            .all();

          let spending = 0;
          let income = 0;
          for (const r of rows) {
            if (r.amount > 0) spending += r.amount;
            else income += Math.abs(r.amount);
          }

          results.push({
            month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
            spending: `$${(spending / 100).toFixed(2)}`,
            income: `$${(income / 100).toFixed(2)}`,
          });
        }

        return results;
      },
    }),

    getUpcomingBills: tool({
      description: "Get upcoming recurring bills",
      parameters: z.object({
        days: z.number().min(1).max(30).default(14).describe("Number of days to look ahead"),
      }),
      execute: async ({ days }) => {
        const today = new Date().toISOString().split("T")[0];
        const endDate = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];

        const rows = db
          .select({
            description: recurringTransactions.description,
            amount: recurringTransactions.averageAmount,
            nextDate: recurringTransactions.predictedNextDate,
            frequency: recurringTransactions.frequency,
          })
          .from(recurringTransactions)
          .where(
            and(
              eq(recurringTransactions.householdId, householdId),
              eq(recurringTransactions.isActive, true),
              gte(recurringTransactions.predictedNextDate, today),
              lte(recurringTransactions.predictedNextDate, endDate),
            ),
          )
          .all();

        return rows.map((r) => ({
          description: r.description ?? "Unknown",
          amount: `$${(Math.abs(r.amount ?? 0) / 100).toFixed(2)}`,
          dueDate: r.nextDate,
          frequency: r.frequency,
        }));
      },
    }),

    getBudgetStatus: tool({
      description: "Get budget vs actual spending for current month",
      parameters: z.object({
        month: z.string().optional().describe("Month (YYYY-MM), defaults to current"),
      }),
      execute: async ({ month }) => {
        const now = new Date();
        const targetMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const [year, m] = targetMonth.split("-").map(Number);
        const startDate = `${targetMonth}-01`;
        const endDate = new Date(year, m, 0).toISOString().split("T")[0];

        const budget = db
          .select()
          .from(budgets)
          .where(and(eq(budgets.householdId, householdId), eq(budgets.month, targetMonth)))
          .get();

        if (!budget) return { message: "No budget set for this month" };

        const budgetCats = db
          .select()
          .from(budgetCategories)
          .where(eq(budgetCategories.budgetId, budget.id))
          .all();

        const results = [];
        for (const bc of budgetCats) {
          const cat = db.select({ name: categories.name }).from(categories).where(eq(categories.id, bc.categoryId)).get();
          const spent = db
            .select({ amount: transactions.amount })
            .from(transactions)
            .where(
              and(
                scoped.where(transactions),
                eq(transactions.categoryId, bc.categoryId),
                gte(transactions.date, startDate),
                lte(transactions.date, endDate),
                notDeleted(transactions),
              ),
            )
            .all()
            .reduce((sum, r) => sum + (r.amount > 0 ? r.amount : 0), 0);

          results.push({
            category: cat?.name ?? "Unknown",
            budgeted: `$${(bc.amount / 100).toFixed(2)}`,
            spent: `$${(spent / 100).toFixed(2)}`,
            remaining: `$${((bc.amount - spent) / 100).toFixed(2)}`,
            percentUsed: Math.round((spent / bc.amount) * 100),
          });
        }

        return results;
      },
    }),
  };
}
```

- [ ] **Step 2: Implement system prompt builder**

```typescript
// src/lib/ai/chat/system-prompt.ts
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notDeleted } from "@/lib/query-helpers";
import { and } from "drizzle-orm";

export function buildSystemPrompt(householdId: string): string {
  const accts = db
    .select({ name: accounts.name, type: accounts.type, currentBalance: accounts.currentBalance })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), notDeleted(accounts)))
    .all();

  const accountSummary = accts
    .map((a) => `${a.name} (${a.type}): $${((a.currentBalance ?? 0) / 100).toFixed(2)}`)
    .join(", ");

  const today = new Date().toISOString().split("T")[0];

  return `You are a helpful financial assistant. You help users understand their spending, find transactions, and get insights about their finances.

You have access to tools that query the user's financial data. Always use tools to get accurate data — never guess amounts or dates.

Today's date: ${today}
Accounts: ${accountSummary || "No accounts connected yet"}

Guidelines:
- Be concise and specific with numbers
- When asked about spending, use getSpendingByCategory or searchTransactions
- When asked about trends, use getMonthlyTrends
- Format money as $X.XX
- If unsure, ask for clarification rather than guessing`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/chat/tools.ts src/lib/ai/chat/system-prompt.ts
git commit -m "feat(phase11): add chat tools (read-only financial queries) and system prompt"
```

---

## Task 13: Chat API Route

**Files:**
- Create: `src/app/api/ai/chat/route.ts`

- [ ] **Step 1: Implement chat route**

```typescript
// src/app/api/ai/chat/route.ts
import { streamText } from "ai";
import { getSession } from "@/lib/auth/session";
import { getUserAiSettings } from "@/queries/settings";
import { createUserModel, type AiProvider } from "@/lib/ai/provider";
import { decrypt } from "@/lib/encryption";
import { financialTools } from "@/lib/ai/chat/tools";
import { buildSystemPrompt } from "@/lib/ai/chat/system-prompt";
import { resolveHouseholdId } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const settings = getUserAiSettings(session.user.id);

  if (!settings?.aiProvider || !settings?.aiModel || !settings.hasKey) {
    return Response.json(
      { error: "AI not configured. Go to Settings to add your API key." },
      { status: 400 },
    );
  }

  const model = createUserModel({
    aiProvider: settings.aiProvider as AiProvider,
    aiModel: settings.aiModel,
    aiApiKey: decrypt(settings.rawEncryptedKey!),
    aiBaseUrl: settings.aiBaseUrl ?? undefined,
  });

  const { messages } = await request.json();
  const householdId = resolveHouseholdId(session.user.id);

  const useTools = settings.toolCallingSupported !== false;

  const result = streamText({
    model,
    system: buildSystemPrompt(householdId),
    messages,
    ...(useTools ? { tools: financialTools(householdId), maxSteps: 5 } : {}),
    abortSignal: request.signal,
  });

  return result.toDataStreamResponse();
}
```

- [ ] **Step 2: Verify route responds**

Run: `pnpm dev`
Test with curl:
```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```
Expected: 400 "AI not configured" (since no settings saved yet — confirms route + auth work)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/chat/route.ts
git commit -m "feat(phase11): add streaming chat API route with tool-calling"
```

---

## Task 14: Chat Panel UI

**Files:**
- Create: `src/components/providers/chat-panel-provider.tsx`
- Create: `src/components/organisms/chat-panel.tsx`
- Create: `src/components/molecules/chat-message.tsx`
- Create: `src/components/molecules/chat-input.tsx`
- Create: `src/components/molecules/chat-empty-state.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/organisms/sidebar-nav.tsx`

- [ ] **Step 1: Create chat panel provider**

```typescript
// src/components/providers/chat-panel-provider.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface ChatPanelContextType {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const ChatPanelContext = createContext<ChatPanelContextType>({
  isOpen: false,
  toggle: () => {},
  open: () => {},
  close: () => {},
});

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ChatPanelContext.Provider
      value={{
        isOpen,
        toggle: () => setIsOpen((v) => !v),
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelContext);
}
```

- [ ] **Step 2: Create chat message molecule**

```typescript
// src/components/molecules/chat-message.tsx
"use client";

import { cn } from "@/lib/utils";
import type { Message } from "@ai-sdk/react";

interface Props {
  message: Message;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted",
        )}
      >
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
          }
          if (part.type === "tool-invocation") {
            return (
              <p key={i} className="text-xs text-muted-foreground italic">
                {part.toolInvocation.state === "result"
                  ? `✓ ${part.toolInvocation.toolName}`
                  : `⏳ ${part.toolInvocation.toolName}...`}
              </p>
            );
          }
          return null;
        }) ?? <p className="whitespace-pre-wrap">{message.content}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create chat input molecule**

```typescript
// src/components/molecules/chat-input.tsx
"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SendHorizontal } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t p-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about your finances..."
        rows={1}
        disabled={isLoading}
        className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        aria-label="Chat message"
      />
      <Button
        size="icon"
        onClick={handleSubmit}
        disabled={!value.trim() || isLoading}
        className="shrink-0"
      >
        <SendHorizontal className="size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Create chat empty state molecule**

```typescript
// src/components/molecules/chat-empty-state.tsx
"use client";

import { Button } from "@/components/ui/button";

interface Props {
  onSuggest: (prompt: string) => void;
  hasAiConfigured: boolean;
}

const SUGGESTIONS = [
  "How much did I spend on food this month?",
  "What are my upcoming bills?",
  "Show my spending trends for the last 3 months",
  "What's my biggest expense category?",
];

export function ChatEmptyState({ onSuggest, hasAiConfigured }: Props) {
  if (!hasAiConfigured) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center text-sm text-muted-foreground">
          <p className="font-medium">AI not configured</p>
          <p className="mt-1">
            <a href="/settings" className="text-primary underline">Go to Settings</a> to add your API key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <p className="text-sm font-medium text-muted-foreground">Ask me anything about your finances</p>
      <div className="flex flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s}
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal text-left text-xs"
            onClick={() => onSuggest(s)}
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create chat panel organism**

```typescript
// src/components/organisms/chat-panel.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useChatPanel } from "@/components/providers/chat-panel-provider";
import { ChatMessage } from "@/components/molecules/chat-message";
import { ChatInput } from "@/components/molecules/chat-input";
import { ChatEmptyState } from "@/components/molecules/chat-empty-state";

interface Props {
  hasAiConfigured: boolean;
}

export function ChatPanel({ hasAiConfigured }: Props) {
  const { isOpen, close } = useChatPanel();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, isLoading } = useChat({
    api: "/api/ai/chat",
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend(text: string) {
    sendMessage({ content: text, role: "user" });
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:w-[400px]">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">AI Assistant</SheetTitle>
        </SheetHeader>

        {messages.length === 0 ? (
          <ChatEmptyState onSuggest={handleSend} hasAiConfigured={hasAiConfigured} />
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Thinking...
                </div>
              </div>
            )}
          </div>
        )}

        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 6: Update dashboard layout**

```typescript
// src/app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserAiSettings } from "@/queries/settings";
import { SidebarNav } from "@/components/organisms/sidebar-nav";
import { ChatPanel } from "@/components/organisms/chat-panel";
import { ChatPanelProvider } from "@/components/providers/chat-panel-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const aiSettings = getUserAiSettings(session.user.id);
  const hasAiConfigured = !!(aiSettings?.hasKey && aiSettings?.aiProvider);

  return (
    <ChatPanelProvider>
      <div className="flex h-screen overflow-hidden">
        <SidebarNav
          userName={session.user?.name ?? "User"}
          userEmail={session.user?.email ?? ""}
        />
        <main className="flex-1 overflow-auto px-6 py-6 lg:px-8">
          {children}
        </main>
      </div>
      <ChatPanel hasAiConfigured={hasAiConfigured} />
    </ChatPanelProvider>
  );
}
```

- [ ] **Step 7: Add chat toggle to sidebar**

In `src/components/organisms/sidebar-nav.tsx`, add the chat toggle button in the footer area:

```typescript
// Add import:
import { MessageCircle } from "lucide-react";
import { useChatPanel } from "@/components/providers/chat-panel-provider";

// Inside SidebarNav component, before the sign-out section:
export function SidebarNav({ userName, userEmail }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toggle } = useChatPanel();

  // ... existing nav code ...

  // Replace the footer section (after nav, before Separator):
  // Add this button between the nav and the user info section:
```

Add before the final `<Separator />`:

```tsx
      <div className="px-3 py-2">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <MessageCircle className="size-4" />
          AI Assistant
        </button>
      </div>

      <Separator />
```

- [ ] **Step 8: Verify chat panel works in browser**

Run: `pnpm dev`
Navigate to dashboard → click "AI Assistant" in sidebar → verify Sheet opens from right, shows empty state with suggestions or "AI not configured" message. If AI is configured, test a message.

- [ ] **Step 9: Commit**

```bash
git add src/components/providers/chat-panel-provider.tsx src/components/organisms/chat-panel.tsx src/components/molecules/chat-message.tsx src/components/molecules/chat-input.tsx src/components/molecules/chat-empty-state.tsx src/app/\(dashboard\)/layout.tsx src/components/organisms/sidebar-nav.tsx
git commit -m "feat(phase11): add AI chat panel with streaming, tools, and empty state"
```

---

## Task 15: Typecheck + Lint + Final Integration Test

**Files:**
- No new files

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. Fix any type errors.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS. Fix any lint errors.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All existing tests + new tests pass. Fix any regressions.

- [ ] **Step 4: Manual smoke test**

Test these flows in the browser:
1. `/settings` — configure AI provider, test connection
2. `/import` — upload a CSV, verify column detection, preview, import
3. Chat panel — open from sidebar, ask a financial question
4. Verify imported transactions appear in `/transactions`

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(phase11): address typecheck and lint issues"
```

---

## Summary

| Task | Description | Est. |
|------|-------------|------|
| 1 | Schema migration | 3 min |
| 2 | Install dependencies | 2 min |
| 3 | AI provider factory | 5 min |
| 4 | Settings queries + actions | 8 min |
| 5 | Settings page UI | 8 min |
| 6 | CSV parser + column mapper | 7 min |
| 7 | Normalize + dedup | 7 min |
| 8 | OFX parser | 5 min |
| 9 | Import API route | 8 min |
| 10 | Import wizard UI | 10 min |
| 11 | AI batch categorization | 10 min |
| 12 | Chat tools + system prompt | 8 min |
| 13 | Chat API route | 5 min |
| 14 | Chat panel UI | 12 min |
| 15 | Typecheck + lint + smoke test | 5 min |

**Total: ~103 minutes of implementation work, 15 tasks, ~15 commits.**
