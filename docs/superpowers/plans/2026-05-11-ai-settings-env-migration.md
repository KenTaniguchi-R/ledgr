# AI Settings .env Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace database-stored AI settings and their settings UI with environment variable configuration, simplifying the architecture from DB+encryption+CRUD+form to a single env-reading module.

**Architecture:** A new `src/lib/ai/config.ts` module reads `AI_*` env vars and exports `getAiConfig()` (returns `ProviderConfig & { confidenceThreshold, toolCalling }` or null), `isAiConfigured()` (boolean), and `createAiModel()` (factory that returns `LanguageModel | null`). No singleton caching — `process.env` reads are O(1) hash lookups. All consumers switch from the DB-backed `getUserAiSettings()` + `decrypt()` chain to `createAiModel()`. The AI settings form, server actions, DB columns, and integration tests are deleted.

**Tech Stack:** Next.js App Router, Drizzle ORM, TypeScript, Vitest

**Review fixes incorporated:** No lazy singleton (breaks hot reload + tests). Unified type with `ProviderConfig` (eliminates mapping boilerplate). `createAiModel()` factory (DRY). Warn instead of throw on invalid config (safe in render path). `AI_TOOL_CALLING` env var (custom provider safety). Startup warnings for misconfiguration.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/ai/config.ts` | Create | Env-based AI config reader + model factory |
| `src/lib/ai/provider.ts` | Modify | Add `confidenceThreshold` and `toolCalling` to `ProviderConfig` |
| `src/lib/ai/categorize.ts` | Modify | Switch from DB settings to `createAiModel()` |
| `src/app/api/ai/chat/route.ts` | Modify | Switch from DB settings to `createAiModel()` |
| `src/app/(dashboard)/layout.tsx` | Modify | Sync `isAiConfigured()` replaces async DB query |
| `src/app/(dashboard)/settings/page.tsx` | Modify | Remove AI form, keep MCP + Demo |
| `src/queries/settings.ts` | Modify | Remove `getUserAiSettings` + `AiSettings` interface |
| `src/actions/settings.ts` | Modify | Remove AI CRUD actions + schemas |
| `src/db/schema/households.ts` | Modify | Drop 6 AI columns from `userSettings` |
| `.env.example` | Modify | Add `AI_*` env var definitions |
| `src/components/organisms/ai-settings-form.tsx` | Delete | No longer needed |
| `tests/integration/settings.test.ts` | Delete | Tests AI settings CRUD against DB — all invalid |

---

### Task 1: Update `ProviderConfig` and create `src/lib/ai/config.ts`

**Files:**
- Modify: `src/lib/ai/provider.ts`
- Create: `src/lib/ai/config.ts`

- [ ] **Step 1: Extend `ProviderConfig` in `provider.ts`**

Add `confidenceThreshold` and `toolCalling` to the existing interface:

```ts
// src/lib/ai/provider.ts — only the interface changes, rest stays the same
export interface ProviderConfig {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl?: string;
  confidenceThreshold: number;
  toolCalling: boolean;
}
```

The `createUserModel` function signature stays the same — it already only reads `aiProvider`, `aiModel`, `aiApiKey`, `aiBaseUrl` from the config. The extra fields are ignored by `createUserModel` but used by consumers.

- [ ] **Step 2: Create the config module**

```ts
// src/lib/ai/config.ts
import type { LanguageModel } from "ai";
import { createUserModel, type AiProvider, type ProviderConfig } from "./provider";

const VALID_PROVIDERS: AiProvider[] = ["openai", "anthropic", "google", "custom"];

export function getAiConfig(): ProviderConfig | null {
  const provider = process.env.AI_PROVIDER;
  const model = process.env.AI_MODEL;
  const apiKey = process.env.AI_API_KEY;

  if (!provider || !model) return null;

  if (!VALID_PROVIDERS.includes(provider as AiProvider)) {
    console.warn(
      `[ledgr] AI_PROVIDER must be one of: ${VALID_PROVIDERS.join(", ")}. Got: "${provider}" — AI features disabled`,
    );
    return null;
  }

  const isCustom = provider === "custom";

  if (!apiKey && !isCustom) {
    console.warn(
      "[ledgr] AI_PROVIDER and AI_MODEL are set but AI_API_KEY is missing — AI features disabled",
    );
    return null;
  }

  const rawThreshold = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD ?? "0.7");
  const confidenceThreshold = Math.min(0.9, Math.max(0.5, rawThreshold));

  const toolCalling = process.env.AI_TOOL_CALLING !== undefined
    ? process.env.AI_TOOL_CALLING !== "false"
    : !isCustom;

  return {
    aiProvider: provider as AiProvider,
    aiModel: model,
    aiApiKey: apiKey || "none",
    aiBaseUrl: process.env.AI_BASE_URL || undefined,
    confidenceThreshold,
    toolCalling,
  };
}

export function isAiConfigured(): boolean {
  return getAiConfig() !== null;
}

export function createAiModel(): LanguageModel | null {
  const config = getAiConfig();
  if (!config) return null;
  return createUserModel(config);
}
```

- [ ] **Step 3: Verify no type errors**

Run: `rtk tsc --noEmit`
Expected: PASS (new file + extended interface, no consumers changed yet)

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/provider.ts src/lib/ai/config.ts
git commit -m "feat: add env-based AI config module with model factory"
```

---

### Task 2: Update `src/app/api/ai/chat/route.ts`

**Files:**
- Modify: `src/app/api/ai/chat/route.ts`

- [ ] **Step 1: Replace the full file content**

```ts
// src/app/api/ai/chat/route.ts
import { streamText, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { getSession, getHouseholdId } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { getAiConfig, createAiModel } from "@/lib/ai/config";
import { financialTools } from "@/lib/ai/chat/tools";
import { buildSystemPrompt } from "@/lib/ai/chat/system-prompt";

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const config = getAiConfig();
  const model = createAiModel();

  if (!config || !model) {
    return Response.json(
      { error: "AI not configured. Set AI_PROVIDER and AI_MODEL in your .env file." },
      { status: 400 },
    );
  }

  const blocked = await guardDemoMode(session.user.id);
  if (blocked) {
    return Response.json(blocked, { status: 403 });
  }

  const { messages }: { messages: UIMessage[] } = await request.json();
  const householdId = await getHouseholdId();
  const tools = config.toolCalling ? financialTools(householdId) : undefined;

  const result = streamText({
    model,
    system: await buildSystemPrompt(householdId),
    messages: await convertToModelMessages(messages),
    ...(tools ? { tools, stopWhen: stepCountIs(5) } : {}),
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Verify no type errors**

Run: `rtk tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/chat/route.ts
git commit -m "refactor: chat route reads AI config from env"
```

---

### Task 3: Update `src/lib/ai/categorize.ts`

**Files:**
- Modify: `src/lib/ai/categorize.ts`

- [ ] **Step 1: Replace the full file content**

Remove owner lookup, `getUserAiSettings`, `decrypt`. Use `getAiConfig()` + `createAiModel()`. Threshold from config. Remove unused `householdMembers` import.

```ts
// src/lib/ai/categorize.ts
import { generateText, Output } from "ai";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  categories,
  categoryGroups,
} from "@/db/schema";
import { notDeleted } from "@/lib/query-helpers";
import { getAiConfig, createAiModel } from "./config";

const categorizationSchema = z.object({
  assignments: z.array(
    z.object({
      transactionId: z.string(),
      categoryId: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
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
  let prompt =
    "Categorize these transactions. Use ONLY the category IDs listed below.\n\n";
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

  prompt +=
    "\nReturn low confidence (<0.5) when uncertain. Use ONLY the exact category IDs listed above.";
  return prompt;
}

export function validateAssignments(
  assignments: z.infer<typeof categorizationSchema>["assignments"],
  validCategoryIds: Set<string>,
  batchTransactionIds: Set<string>,
): z.infer<typeof categorizationSchema>["assignments"] {
  return assignments.filter(
    (a) =>
      validCategoryIds.has(a.categoryId) &&
      batchTransactionIds.has(a.transactionId),
  );
}

function getBatchSize(provider: string): number {
  return provider === "custom" ? 20 : 50;
}

export async function categorizeWithAi(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<{ categorized: number; skipped: number }> {
  const config = getAiConfig();
  const model = createAiModel();
  if (!config || !model) return { categorized: 0, skipped: 0 };

  const uncategorized = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        isNull(transactions.categoryId),
        isNull(transactions.aiCategorizationAttemptedAt),
        notDeleted(transactions),
      ),
    );

  if (uncategorized.length === 0) return { categorized: 0, skipped: 0 };

  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.householdId, householdId));
  const groups = await db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.householdId, householdId));
  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const categoryInfos: CategoryInfo[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: groupMap.get(c.groupId) ?? "Other",
  }));
  const validCategoryIds = new Set(cats.map((c) => c.id));

  const exampleRows = await db
    .select({ name: transactions.name, categoryId: transactions.categoryId })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.reviewed, true),
      ),
    )
    .limit(10);

  const examples = exampleRows
    .filter((e) => e.categoryId)
    .map((e) => ({
      description: e.name,
      categoryName: cats.find((c) => c.id === e.categoryId)?.name ?? "Unknown",
    }));

  const threshold = config.confidenceThreshold;
  const batchSize = getBatchSize(config.aiProvider);
  let categorized = 0;
  const now = new Date();

  for (let i = 0; i < uncategorized.length; i += batchSize) {
    const batch = uncategorized.slice(i, i + batchSize);
    const batchInputs: CategorizationInput[] = batch.map((t) => ({
      id: t.id,
      description: t.name,
      amount: t.amount,
    }));
    const batchIds = new Set(batch.map((t) => t.id));

    let aboveThreshold: z.infer<typeof categorizationSchema>["assignments"] = [];
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: categorizationSchema }),
        system:
          "You are a financial transaction categorization assistant. Be precise and conservative.",
        prompt: buildCategorizationPrompt(batchInputs, categoryInfos, examples),
      });

      if (output) {
        const validated = validateAssignments(
          output.assignments,
          validCategoryIds,
          batchIds,
        );
        aboveThreshold = validated.filter((a) => a.confidence >= threshold);
      }
    } catch (e) {
      console.error(`AI categorization batch failed:`, e);
    }

    await db.transaction(async (tx) => {
      for (const a of aboveThreshold) {
        await tx.update(transactions)
          .set({ categoryId: a.categoryId, categorySource: "ai", updatedAt: now })
          .where(eq(transactions.id, a.transactionId));
      }
      for (const id of batchIds) {
        await tx.update(transactions)
          .set({ aiCategorizationAttemptedAt: now })
          .where(eq(transactions.id, id));
      }
    });
    categorized += aboveThreshold.length;
  }

  return { categorized, skipped: uncategorized.length - categorized };
}
```

- [ ] **Step 2: Verify no type errors**

Run: `rtk tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/categorize.ts
git commit -m "refactor: categorize reads AI config from env"
```

---

### Task 4: Update dashboard layout and settings page

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Update `layout.tsx`**

Replace the entire file:

```tsx
// src/app/(dashboard)/layout.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isAiConfigured } from "@/lib/ai/config";
import { DashboardShell } from "@/components/organisms/dashboard-shell";
import { ChatPanelLoader } from "@/components/organisms/chat-panel-loader";
import { seedDemoHousehold } from "@/db/seed/demo";

seedDemoHousehold().catch((e) => console.error("[demo] seed failed:", e));

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const hasAiConfigured = isAiConfigured();
  const sidebarDefaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <>
      <DashboardShell
        userName={session.user?.name ?? "User"}
        userEmail={session.user?.email ?? ""}
        defaultOpen={sidebarDefaultOpen}
      >
        {children}
      </DashboardShell>
      <ChatPanelLoader hasAiConfigured={hasAiConfigured} />
    </>
  );
}
```

- [ ] **Step 2: Update `settings/page.tsx`**

Replace the entire file:

```tsx
// src/app/(dashboard)/settings/page.tsx
import { getSession } from "@/lib/auth/session";
import { getMcpSettings } from "@/queries/settings";
import { McpSettingsForm } from "@/components/organisms/mcp-settings-form";
import { DemoModeToggle } from "@/components/molecules/demo-mode-toggle";
import { isDemoMode } from "@/lib/demo-mode";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const mcpSettings = await getMcpSettings(session.user.id);
  const demoEnabled = await isDemoMode(session.user.id);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure integrations and access controls.
        </p>
      </div>
      <DemoModeToggle initialEnabled={demoEnabled} />
      <McpSettingsForm
        mcpEnabled={mcpSettings.mcpEnabled}
        connectedClients={mcpSettings.connectedClients}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify no type errors**

Run: `rtk tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx src/app/\(dashboard\)/settings/page.tsx
git commit -m "refactor: remove AI settings UI, use env config in layout"
```

---

### Task 5: Clean up queries and actions

**Files:**
- Modify: `src/queries/settings.ts`
- Modify: `src/actions/settings.ts`

- [ ] **Step 1: Update `src/queries/settings.ts`**

Remove `getUserAiSettings` and `AiSettings`. Keep `getMcpSettings` and `getLayoutForUser`:

```ts
// src/queries/settings.ts
import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { getConsentsForUser } from "@/lib/mcp/auth/oauth-server";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export interface ConnectedClient {
  clientId: string;
  clientName: string | null;
  scope: string;
  grantedAt: string;
}

export interface McpSettings {
  mcpEnabled: boolean;
  connectedClients: ConnectedClient[];
}

export async function getMcpSettings(
  userId: string,
  db: LedgrDb = defaultDb,
): Promise<McpSettings> {
  const [row] = await db
    .select({ mcpEnabled: userSettings.mcpEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const consents = await getConsentsForUser(userId, db);

  return {
    mcpEnabled: row?.mcpEnabled === true,
    connectedClients: consents.map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName ?? null,
      scope: c.scope,
      grantedAt: c.grantedAt,
    })),
  };
}

export async function getLayoutForUser(
  userId: string,
  db: LedgrDb = defaultDb,
): Promise<DashboardLayout | null> {
  const [row] = await db
    .select({ dashboardLayout: userSettings.dashboardLayout })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row?.dashboardLayout) return null;

  try {
    return JSON.parse(row.dashboardLayout) as DashboardLayout;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Update `src/actions/settings.ts`**

Remove all AI-related code. Keep `upsertMcpEnabled`, `saveLayoutForUser`, `toggleDemoMode`:

```ts
// src/actions/settings.ts
"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getSession } from "@/lib/auth/session";
import { db, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function upsertMcpEnabled(
  userId: string,
  mcpEnabled: boolean,
  txDb: LedgrDb = db,
): Promise<void> {
  const [existing] = await txDb
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const now = new Date();

  if (existing) {
    await txDb.update(userSettings)
      .set({ mcpEnabled, updatedAt: now })
      .where(eq(userSettings.id, existing.id));
  } else {
    await txDb.insert(userSettings).values({
      id: uuid(),
      userId,
      mcpEnabled,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function saveLayoutForUser(
  userId: string,
  layout: DashboardLayout,
  txDb: LedgrDb = db,
): Promise<void> {
  const layoutJson = JSON.stringify(layout);
  const [existing] = await txDb
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (existing) {
    await txDb.update(userSettings)
      .set({ dashboardLayout: layoutJson })
      .where(eq(userSettings.userId, userId));
  } else {
    await txDb.insert(userSettings)
      .values({ id: uuid(), userId, dashboardLayout: layoutJson });
  }
}

export async function toggleDemoMode(): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const [existing] = await db
    .select({ id: userSettings.id, demoMode: userSettings.demoMode })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  if (existing) {
    await db.update(userSettings)
      .set({ demoMode: !existing.demoMode, updatedAt: new Date() })
      .where(eq(userSettings.id, existing.id));
  } else {
    await db.insert(userSettings)
      .values({ id: uuid(), userId: session.user.id, demoMode: true });
  }

  revalidatePath("/", "layout");
  return { success: true };
}
```

- [ ] **Step 3: Verify no type errors**

Run: `rtk tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/queries/settings.ts src/actions/settings.ts
git commit -m "refactor: remove AI settings queries and actions"
```

---

### Task 6: Delete AI settings form and tests

**Files:**
- Delete: `src/components/organisms/ai-settings-form.tsx`
- Delete: `tests/integration/settings.test.ts`

- [ ] **Step 1: Delete the files**

```bash
rm src/components/organisms/ai-settings-form.tsx
rm tests/integration/settings.test.ts
```

- [ ] **Step 2: Verify no type errors**

Run: `rtk tsc --noEmit`
Expected: PASS — no remaining imports of these files

- [ ] **Step 3: Commit**

```bash
git add -u src/components/organisms/ai-settings-form.tsx tests/integration/settings.test.ts
git commit -m "refactor: delete AI settings form and obsolete tests"
```

---

### Task 7: Update DB schema and .env.example

**Files:**
- Modify: `src/db/schema/households.ts`
- Modify: `.env.example`

- [ ] **Step 1: Update `src/db/schema/households.ts`**

Remove the 6 AI columns from `userSettings`:

```ts
// src/db/schema/households.ts
import { pgTable, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const households = pgTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["owner", "member", "advisor"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_household_user").on(table.householdId, table.userId),
  ]
);

export const userSettings = pgTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  theme: text("theme").default("system"),
  currency: text("currency").default("USD"),
  mcpEnabled: boolean("mcp_enabled").notNull().default(false),
  dashboardLayout: text("dashboard_layout"),
  demoMode: boolean("demo_mode").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Update `.env.example`**

Replace the old AI comment block (`# AI (optional — BYOK, user configures in settings)` and `# No server-side AI keys needed...`) with:

```
# AI (optional — set to enable chat and auto-categorization)
AI_PROVIDER=              # openai | anthropic | google | custom
AI_MODEL=                 # e.g. gpt-4o, claude-sonnet-4-5, gemini-2.0-flash
AI_API_KEY=               # Provider API key (optional for custom/local models)
AI_BASE_URL=              # Required when AI_PROVIDER=custom (e.g. http://localhost:11434/v1)
AI_CONFIDENCE_THRESHOLD=  # default: 0.7, range: 0.5-0.9 — auto-categorization strictness
AI_TOOL_CALLING=          # default: true for standard providers, false for custom. Set to override.
```

- [ ] **Step 3: Generate and run Drizzle migration**

```bash
rtk pnpm db:generate
rtk pnpm db:migrate
```

Expected: Migration file created that drops `ai_provider`, `ai_model`, `ai_api_key`, `ai_base_url`, `ai_confidence_threshold`, `tool_calling_supported` columns from `user_settings`.

- [ ] **Step 4: Verify no type errors**

Run: `rtk tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/households.ts .env.example src/db/migrations/
git commit -m "refactor: drop AI columns from user_settings, add AI env vars to .env.example"
```

---

### Task 8: Final verification

- [ ] **Step 1: Type check**

Run: `rtk tsc --noEmit`
Expected: PASS with zero errors

- [ ] **Step 2: Run existing tests**

Run: `rtk vitest run`
Expected: All remaining tests pass. The deleted `settings.test.ts` no longer runs.

- [ ] **Step 3: Grep for stale references**

```bash
grep -rn "getUserAiSettings\|upsertAiSettings\|testAiConnection\|AiSettingsForm\|ai-settings-form\|rawEncryptedKey\|toolCallingSupported" src/ tests/ --include="*.ts" --include="*.tsx"
```

Expected: Zero matches.

- [ ] **Step 4: Start dev server and verify**

```bash
pnpm dev
```

Manually check:
- Dashboard loads without errors
- Settings page shows MCP + Demo toggle only (no AI form)
- Chat panel hidden when `AI_*` env vars are not set
- Chat panel visible when `AI_*` env vars are set

- [ ] **Step 5: Final commit if any fixes needed**

Only if previous steps revealed issues requiring code changes.
