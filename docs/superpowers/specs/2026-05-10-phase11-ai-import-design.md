# Phase 11 — AI Assistant + CSV/OFX Import

## Overview

Add AI-powered transaction categorization (batch mode), a streaming chat assistant with read-only financial insights via tool-calling, and file import (CSV with auto-detect column mapping, minimal OFX/QFX support). BYOK model — supports OpenAI, Anthropic, Google, and any OpenAI-compatible endpoint (Ollama, Together, Groq, vLLM, etc.).

## Architecture

### Module Structure

```
src/lib/ai/
├── provider.ts            # BYOK provider factory (decrypt key → create provider)
├── categorize.ts          # Batch categorization with generateText + Output.object
├── chat/
│   ├── tools.ts           # Read-only DB tools for financial insights
│   └── system-prompt.ts   # Financial assistant persona + dynamic context

src/lib/import/
├── csv.ts                 # PapaParse wrapper: preview parse + full parse
├── ofx.ts                 # Minimal OFX/QFX SGML+XML parser
├── mapper.ts              # Auto-detect columns + manual override logic
├── dedup.ts               # Duplicate detection (hash-based + fitId)
├── normalize.ts           # Convert mapped rows → transaction insert format (Plaid sign convention)

src/app/api/ai/chat/route.ts       # POST: streaming chat endpoint
src/app/api/import/route.ts        # POST: file upload + server-side parse + insert
src/app/(dashboard)/import/page.tsx # Import wizard page
src/app/(dashboard)/settings/page.tsx # AI provider + settings page
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `ai` | Vercel AI SDK core (streamText, generateText, Output) |
| `@ai-sdk/react` | useChat hook for client-side chat |
| `@ai-sdk/openai` | OpenAI provider |
| `@ai-sdk/anthropic` | Anthropic provider |
| `@ai-sdk/google` | Google provider |
| `@ai-sdk/openai-compatible` | Custom endpoint provider (Ollama, Together, etc.) |
| `papaparse` | CSV parsing with auto-detection |
| `@types/papaparse` | TypeScript types |

No new DB dependencies — uses existing Drizzle + SQLite stack.

---

## 1. AI Provider Factory

### Schema Migration (Required)

Modify `userSettings` table in `src/db/schema/households.ts`:

```typescript
// CHANGE: add "custom" to existing enum
aiProvider: text("ai_provider", {
  enum: ["openai", "anthropic", "google", "custom"],
}),

// ADD: new columns
aiBaseUrl: text("ai_base_url"),              // only for "custom" provider
aiConfidenceThreshold: real("ai_confidence_threshold").default(0.7),
```

This requires a Drizzle migration (`pnpm db:generate` + `pnpm db:migrate`).

### Settings Lookup: userId vs householdId

The `userSettings` table is keyed by `userId`, not `householdId`. The lookup path is:

```typescript
// In queries/settings.ts:
export function getUserAiSettings(userId: string, db?: LedgrDb): AiSettings | null
// Direct lookup by userId — no household join needed

// In route handlers / actions:
const session = await getSession(); // returns { userId, householdId }
const settings = getUserAiSettings(session.userId);
```

For household-scoped operations (batch categorization in scheduler), resolve via `householdMembers` table → find owner → load their settings. Only the household owner's AI config is used for automated operations.

### Provider Factory API

```typescript
// src/lib/ai/provider.ts
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

type AiProvider = "openai" | "anthropic" | "google" | "custom";

interface ProviderConfig {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;       // already decrypted
  aiBaseUrl?: string;     // required when provider = "custom"
}

export function createUserModel(config: ProviderConfig): LanguageModel
```

Implementation: simple switch on `config.aiProvider`, each branch creates the appropriate SDK provider and returns `provider(config.aiModel)`.

For "custom": uses `createOpenAICompatible({ baseURL: config.aiBaseUrl, apiKey: config.aiApiKey || "none", name: "custom" })`. API key is optional (Ollama doesn't need one).

No caching, no singleton — fresh per request. Providers are lightweight config objects.

---

## 2. Batch AI Categorization

### Purpose

Separate async function called after sync completes. Processes uncategorized transactions via LLM structured output. **Not embedded inside `categorizeSyncedTransactions()`** — kept as a separate step at the orchestration level to preserve the existing sync function's synchronous contract.

### Integration Architecture

```typescript
// In src/lib/plaid/sync.ts — doSync orchestrator:
const result = await syncInstitution(item, db);

// Step 1: synchronous rule-based categorization (existing, unchanged)
try {
  categorizeSyncedTransactions(itemId, householdId, db);
} catch (e) { /* non-fatal, logged */ }

// Step 2: async AI categorization (NEW, separate call)
try {
  await categorizeWithAi(householdId, db);
} catch (e) { /* non-fatal, logged */ }
```

This avoids making `categorizeSyncedTransactions()` async and breaking its type contract.

### Data Flow

```
Uncategorized transactions (post-rules, post-merchant-default)
  → Filter out transactions with aiCategorizationAttemptedAt set (already tried)
  → Group into adaptive batches (50 for cloud providers, 20 for custom/ollama)
  → For each batch:
      generateText({
        model: userModel,
        output: Output.object({ schema: categorizationSchema }),
        system: "You are a financial categorization assistant...",
        prompt: buildCategorizationPrompt(batch, categories)
      })
  → Post-validate: discard assignments with categoryIds not in the user's category list
  → Filter by confidence (> threshold from settings, default 0.7)
  → Write high-confidence assignments to DB
  → Mark ALL batch transactions with aiCategorizationAttemptedAt = now()
  → Remaining stay "uncategorized" for manual review
```

### Schema Addition (transactions table)

```typescript
aiCategorizationAttemptedAt: text("ai_categorization_attempted_at"),
```

Prevents re-processing low-confidence transactions on every sync. Reset when user manually re-triggers "Categorize All".

### Zod Output Schema

```typescript
const categorizationSchema = z.object({
  assignments: z.array(z.object({
    transactionId: z.string(),
    categoryId: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});
```

### Post-Validation (Critical)

After successful `Output.object` parse, validate each assignment:
1. `transactionId` must exist in the current batch (reject hallucinated IDs)
2. `categoryId` must exist in the user's category list (reject hallucinated categories)
3. Discard invalid assignments silently (treat as confidence: 0)

### Fallback for Weak Structured Output (Ollama/Llama)

If `Output.object` throws (model returns invalid JSON):
1. First retry with simplified prompt: "Respond ONLY with JSON matching this schema: ..."
2. If still fails, attempt lenient extraction: regex for JSON block in markdown code fence
3. If all fail, skip AI categorization for this batch (non-fatal, logged)

### Prompt Strategy

System prompt includes:
- User's full category list (id + name + group name)
- 10 diverse manually-categorized examples (sampled across categories, not just recent)
- If <5 examples exist (cold start): omit few-shot, rely on descriptive category names
- Instructions to return low confidence when uncertain
- Merchant name highlighted as primary signal

### Adaptive Batch Size

```typescript
function getBatchSize(provider: AiProvider): number {
  return provider === "custom" ? 20 : 50;
}
```

Cloud providers (GPT-4, Claude, Gemini) handle larger contexts reliably. Custom/Ollama gets smaller batches for reliability.

---

## 3. AI Chat Assistant

### Route Handler

```typescript
// src/app/api/ai/chat/route.ts
export async function POST(request: Request) {
  const session = await getSession(); // { userId, householdId }
  const settings = getUserAiSettings(session.userId);

  if (!settings?.aiApiKey) {
    return Response.json({ error: "AI not configured" }, { status: 400 });
  }

  const model = createUserModel({
    aiProvider: settings.aiProvider,
    aiModel: settings.aiModel,
    aiApiKey: decrypt(settings.aiApiKey),
    aiBaseUrl: settings.aiBaseUrl,
  });

  const { messages } = await request.json();

  const result = streamText({
    model,
    system: buildSystemPrompt(session.householdId),
    messages,
    tools: financialTools(session.householdId),
    maxSteps: 5,
    abortSignal: request.signal, // abort on client disconnect
  });

  return result.toDataStreamResponse();
}
```

### Tools (Read-Only Financial Queries)

All tools are scoped to the user's household. None perform mutations. Tool results are capped to prevent context overflow.

| Tool | Parameters | Returns | Max Size |
|------|-----------|---------|----------|
| `getSpendingByCategory` | `{ startDate, endDate }` | Category breakdown with amounts | All categories |
| `searchTransactions` | `{ query?, startDate?, endDate?, category? }` | Matching transactions | 20 rows, descriptions trimmed to 60 chars |
| `getAccountBalances` | none | All accounts with current balances | All accounts |
| `getMonthlyTrends` | `{ months?: number }` | Month-over-month spending totals | Max 12 months |
| `getUpcomingBills` | `{ days?: number }` | Recurring bills due within N days | Max 30 days |
| `getBudgetStatus` | `{ month?: string }` | Budget vs actual per category | All budget categories |

Each tool is defined with `tool()` from the AI SDK, Zod input schema, and an `execute` function that calls existing query functions with `scopedQuery`.

### Graceful Degradation (Models Without Tool-Calling)

Some open-source models via Ollama don't support tool-calling. Strategy:
- During "Test Connection" in settings, attempt a trivial tool-calling request
- If it fails, store `toolCallingSupported: false` flag in settings
- For models without tool-calling: inject a financial summary directly into the system prompt (spending last 30 days, account balances, upcoming bills) — the AI can reference this context without tool calls
- Show a notice in the chat panel: "Your model has limited capabilities. For full insights, use a model with tool-calling support."

### System Prompt

Dynamic, built per-request:

```
You are a financial assistant for {userName}. You help understand spending,
find transactions, and provide insights about their finances.

You have access to tools that query their financial data. Use them to answer
questions accurately. Never guess amounts — always query first.

Today's date: {today}
Accounts: {accountSummary}
Monthly budget: {budgetSummary}
```

### Client UI — Chat Panel (shadcn Sheet)

Uses shadcn `Sheet` component (side="right") for built-in focus management, overlay, escape-to-close, and accessibility. Renders in the dashboard layout, persists across page navigation.

**Layout integration:**

```
src/components/providers/chat-panel-provider.tsx  # Client context for open/close state
```

Added to dashboard layout:
```tsx
// src/app/(dashboard)/layout.tsx
<ChatPanelProvider>
  <div className="flex">
    <SidebarNav />
    <main className="flex-1">{children}</main>
  </div>
  <ChatPanel />  {/* Sheet renders as portal, doesn't affect flex layout */}
</ChatPanelProvider>
```

**Components:**

```
src/components/providers/chat-panel-provider.tsx  # "use client", context + state
src/components/organisms/chat-panel.tsx           # "use client", useChat, Sheet container
src/components/molecules/chat-message.tsx         # Message bubble, markdown, tool status
src/components/molecules/chat-input.tsx           # Textarea + send button + Ctrl+Enter
src/components/molecules/chat-empty-state.tsx     # Suggested prompts when no messages
src/components/molecules/chat-tool-status.tsx     # Inline tool execution indicator
```

**State management:**
- `useChat` from `@ai-sdk/react` with `api: '/api/ai/chat'`
- Panel open/closed state in `ChatPanelProvider` context
- Messages persist in `useChat` state during session (cleared on page reload)
- No message persistence in DB

**Panel behavior:**
- shadcn `Sheet` (side="right"), ~400px wide on desktop
- Full-screen on mobile (<768px) via Sheet's responsive behavior
- Close on Escape (built into Sheet)
- Input auto-focuses when opened
- `aria-live="polite"` on message container for screen reader support

**Tool-calling progress UI:**
- `useChat` exposes `toolInvocations` on message parts
- Render `chat-tool-status.tsx` inline: shows tool name + spinner during execution, checkmark when done
- Example: "📊 Querying spending by category..." → "✓ Got spending data"

**Chat toggle:**
- Integrated directly into `sidebar-nav.tsx` footer (not a separate atom — single-use button)
- MessageCircle icon with "AI" label

---

## 4. CSV Import

### Architecture Decision: Server-Side Parsing

CSV parsing and normalization happen on the server (not client) to prevent injection of arbitrary data through the server action. The client only handles:
1. File upload (raw file sent to API route)
2. Preview display (server returns first 10 parsed rows)
3. Column mapping UI (sends mapping config back to server)
4. Dedup review (server returns duplicate candidates)

### API Route (File Upload + Parse)

```typescript
// src/app/api/import/route.ts
export async function POST(request: Request) {
  const session = await getSession();
  const formData = await request.formData();
  const file = formData.get("file") as File;
  const step = formData.get("step") as "preview" | "import";
  const mapping = formData.get("mapping") as string | null; // JSON ColumnMapping
  const accountId = formData.get("accountId") as string | null;

  // Validate file type + size (<10MB)
  // Validate accountId ownership via scopedQuery

  if (step === "preview") {
    // Parse first 10 rows, auto-detect mapping
    return Response.json({ headers, rows, suggestedMapping });
  }

  if (step === "import") {
    // Full parse → normalize → dedup → insert
    // Amount convention: store as Plaid convention (positive = debit/expense)
    return Response.json({ imported, skipped, duplicates });
  }
}
```

### Amount Sign Convention (Critical)

Imported amounts MUST follow Plaid convention before storage:
- **Plaid convention:** positive = money leaving account (debit/expense), negative = money entering (credit/income)
- **CSV with single amount column:** If positive means credit (common in bank exports), flip sign: `amount = -parsedAmount`
- **CSV with split credit/debit columns:** `amount = debit > 0 ? +debit : -credit`
- **OFX TRNAMT:** Already signed correctly (positive = debit), no flip needed

The `normalizedAmount` column is then computed by `normalizeAmount(amount, accountType)` — same as Plaid transactions. This ensures all spending/budget calculations work identically for imported and synced transactions.

### Parser Module

```typescript
// src/lib/import/csv.ts
import Papa from "papaparse";

export function parsePreview(content: string): CsvPreview
// Returns: { headers: string[], rows: Record<string, string>[], delimiter: string }
// Parses first 10 rows for preview display

export function parseAll(content: string): ParsedRow[]
// Full parse, returns all rows as Record<string, string>[]
```

### Column Mapper

```typescript
// src/lib/import/mapper.ts

const COLUMN_PATTERNS: Record<RequiredField, RegExp[]> = {
  date: [/^(date|posted|trans.*date|booking|settlement)/i],
  amount: [/^(amount|sum|value|total)/i],
  description: [/^(desc|narr|memo|detail|payee|merchant|name)/i],
};

const OPTIONAL_PATTERNS: Record<OptionalField, RegExp[]> = {
  credit: [/^(credit|deposit|cr)/i],
  debit: [/^(debit|withdrawal|dr|charge)/i],
  category: [/^(category|cat|type)/i],
  reference: [/^(ref|reference|check|cheque)/i],
};

export interface ColumnMapping {
  date: string;           // header name mapped to date
  amount: string;         // single amount column
  // OR split credit/debit columns:
  credit?: string;
  debit?: string;
  description: string;
  category?: string;
  reference?: string;
  amountSignConvention: "positive_is_expense" | "positive_is_income";
}

export function autoDetectMapping(headers: string[]): Partial<ColumnMapping>
export function validateMapping(mapping: ColumnMapping): ValidationResult
```

### Deduplication

```typescript
// src/lib/import/dedup.ts

export function generateDedupHash(row: {
  date: string;
  amountCents: number;
  description: string;
}): string
// SHA-256 of normalized(date + amountCents + lowercase_trimmed_description)

export function findDuplicates(
  rows: NormalizedRow[],
  accountId: string,
  householdId: string,
  db?: LedgrDb,
): DedupResult
// Returns: { unique: NormalizedRow[], duplicates: { row: NormalizedRow, existing: Transaction }[] }
```

**Comparison strategy:**
- For hash-based dedup: compare against `originalName` field of existing transactions (raw bank description), not `name` (normalized merchant name). This matches what CSV descriptions look like.
- For OFX with `fitId`: check against a new `externalId` column on transactions (see schema addition below).

### Schema Addition (transactions table)

```typescript
externalId: text("external_id"),  // OFX fitId or other external reference
// + index: uniqueIndex on (accountId, externalId) WHERE externalId IS NOT NULL
```

### Normalize

```typescript
// src/lib/import/normalize.ts

export function normalizeImportedRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  accountId: string,
  householdId: string,
): NormalizedRow[]
// Parses dates, converts amounts to cents (Plaid sign convention),
// generates UUIDs, applies householdId + accountId
```

### Import Flow (User Journey)

1. Navigate to `/import`
2. Upload file (drag-and-drop or file picker) — accepted: .csv, .ofx, .qfx, max 10MB
3. File sent to `POST /api/import?step=preview`
4. App detects file type, parses preview, auto-detects mapping
5. **For CSV:** Show preview table (10 rows) with column mapping dropdowns
6. **For OFX:** Show preview table directly (fixed field positions, no mapping needed)
7. User confirms/adjusts mapping + selects target account + amount sign convention
8. User clicks "Import" → `POST /api/import?step=import`
9. Server: full parse → normalize (Plaid sign convention) → dedup check
10. If duplicates found: return count to client, user chooses skip/force
11. Insert transactions → run categorize pipeline (rules → AI if configured)
12. Return result → client redirects to `/transactions` filtered to imported date range

### Components

```
src/app/(dashboard)/import/page.tsx              # Server component shell
src/components/organisms/import-wizard.tsx        # "use client", multi-step state machine
src/components/molecules/file-dropzone.tsx        # Drag-and-drop + file picker
src/components/molecules/column-mapper.tsx        # Select dropdowns per detected column
src/components/molecules/import-preview.tsx       # shadcn Table showing mapped preview
src/components/molecules/dedup-review.tsx         # Duplicate list with skip/import options
src/components/atoms/import-progress.tsx          # shadcn Progress bar wrapper
```

**Wizard navigation:** Each step has Back/Next buttons. State machine manages step transitions. Steps: Upload → Map → Preview → (Dedup if needed) → Done.

### Server Action (Post-Insert Operations)

```typescript
// src/actions/import.ts
"use server";

export async function triggerPostImportCategorization(
  householdId: string,
  transactionIds: string[],
): Promise<void>
// Runs rule-based + AI categorization on newly imported transactions
// Called after successful import via the API route
// Includes revalidatePath("/transactions") + revalidatePath("/accounts")
```

---

## 5. OFX Import (Minimal)

### Parser

```typescript
// src/lib/import/ofx.ts

export function parseOfx(content: string): OfxTransaction[]

interface OfxTransaction {
  date: string;        // from DTPOSTED (YYYYMMDD format → ISO)
  amount: number;      // from TRNAMT (already Plaid-convention signed, convert to cents)
  description: string; // from NAME or MEMO
  type: string;        // from TRNTYPE (DEBIT, CREDIT, etc.)
  fitId: string;       // from FITID (unique per institution, stored as externalId)
}
```

**Implementation approach:** Regex-based extraction of `<STMTTRN>...</STMTTRN>` blocks. OFX v1 is SGML (no closing tags), v2 is XML. Handle both by:
1. Try XML parse first (v2)
2. Fall back to regex extraction (v1 SGML)

No external library — OFX is simple enough for ~80 lines of parsing code.

**Dedup strategy:** For OFX, use `fitId` stored as `externalId` on the transaction. Check `WHERE accountId = ? AND externalId = ?` — this is more reliable than hash-based dedup since `fitId` is institution-assigned. Falls back to hash if `fitId` is missing (some OFX files omit it).

### Integration

After parsing, OFX transactions feed into `normalize.ts` (with `fitId` → `externalId` mapping) → `dedup.ts` (tries `externalId` match first, falls back to hash). The import wizard detects `.ofx`/`.qfx` extension and skips the column mapping step.

---

## 6. Settings Page

### Queries + Actions

```typescript
// src/queries/settings.ts
export function getUserAiSettings(userId: string, db?: LedgrDb): AiSettings | null
// Returns: { aiProvider, aiModel, hasKey: boolean, keyHint: string (last 4 chars),
//            aiBaseUrl, aiConfidenceThreshold, toolCallingSupported }
// NEVER returns the full decrypted key to the client

// src/actions/settings.ts
"use server";

export async function updateAiSettings(input: {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey?: string;    // only sent when user enters a new key (empty = keep existing)
  aiBaseUrl?: string;
  aiConfidenceThreshold?: number;
}): Promise<{ success: true } | { error: string }>
// Validates with Zod, encrypts new API key if provided, upserts userSettings
// revalidatePath("/settings")

export async function testAiConnection(input: {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl?: string;
}): Promise<{ success: true; response: string; toolCallingSupported: boolean } | { error: string }>
// Creates temp provider, sends trivial prompt + tool-calling test
// Rate-limited: max 5 calls per minute per user
// Note: raw key traverses TLS but is not persisted unencrypted
```

### API Key Security

- Full key is NEVER sent from server to client
- `getUserAiSettings()` returns `hasKey: true` + `keyHint: "••••sk-1234"` (last 4 chars)
- Client shows masked display with "Change" button to reveal editable input
- When saving: if `aiApiKey` field is empty/unchanged, keep existing encrypted value

### Page Layout

```
/settings
├── AI Configuration (Card)
│   ├── Provider select (OpenAI / Anthropic / Google / Custom)
│   ├── Base URL input (conditional: visible only when Custom selected)
│   ├── Model input (with provider-specific suggestions)
│   ├── API Key input (password field, masked display if key exists)
│   ├── Provider help text (dynamic per selection):
│   │   - OpenAI: "Get your key at platform.openai.com/api-keys"
│   │   - Anthropic: "Get your key at console.anthropic.com/settings/keys"
│   │   - Google: "Get your key at aistudio.google.com/apikey"
│   │   - Custom: "Enter your OpenAI-compatible endpoint URL"
│   ├── Confidence threshold slider (0.5 - 0.9) with aria-valuetext
│   ├── Test Connection button (shows success/error inline)
│   └── Save button
└── (Future: display preferences, notification settings, etc.)
```

### Components

```
src/app/(dashboard)/settings/page.tsx              # Server component
src/components/organisms/ai-settings-form.tsx       # "use client", form state + validation
```

**shadcn components used:** Card, CardHeader, CardTitle, CardContent, Input, Select, Slider, Button, Label, FormDescription, Alert.

---

## 7. Data Flow Diagrams

### Batch Categorization

```
User configures AI → encrypt(apiKey) → userSettings table
                                              │
Transaction sync completes ──────────────────▶│
                                              ▼
                              doSync() orchestrator
                                  │
                                  ├── 1. categorizeSyncedTransactions() [sync, existing]
                                  │       ├── Apply rules
                                  │       └── Merchant default
                                  │
                                  └── 2. categorizeWithAi() [async, NEW, separate call]
                                          │
                                          ├── getSession() → userId
                                          ├── getUserAiSettings(userId) → decrypt key
                                          ├── Filter: exclude aiCategorizationAttemptedAt != null
                                          ├── createUserModel()
                                          ├── Adaptive batch (50 cloud / 20 custom)
                                          ├── generateText + Output.object per batch
                                          ├── Post-validate categoryIds against user's list
                                          ├── Filter by confidence threshold
                                          ├── Write assignments to DB
                                          └── Mark all attempted (aiCategorizationAttemptedAt)
```

### Chat

```
User opens chat panel → types question
       │
       ▼
useChat sends POST /api/ai/chat
       │
       ▼
Route: auth → decrypt key → createUserModel → streamText(tools, abortSignal)
       │                                          │
       │                                    AI calls tools
       │                                          │
       │                              ┌───────────┼───────────┐
       │                              ▼           ▼           ▼
       │                     getSpending   searchTxns   getBudget
       │                       (scoped queries, read-only, capped output)
       │                              │           │           │
       │                              └───────────┼───────────┘
       │                                          ▼
       │                                    AI generates response
       ▼
Stream → chat-message renders markdown + chat-tool-status shows progress
```

### CSV Import

```
User uploads .csv via file-dropzone
       │
       ▼
POST /api/import?step=preview (FormData with raw file)
       │
       ▼
Server: parsePreview(content) → 10 rows + autoDetectMapping(headers)
       │
       ▼
Client: shows import-preview + column-mapper dropdowns
       │
       ▼
User confirms mapping + selects account + amount sign convention
       │
       ▼
POST /api/import?step=import (FormData: file + mapping JSON + accountId)
       │
       ▼
Server: validate ownership → parseAll → normalize (Plaid sign) → findDuplicates
       │
       ├── No duplicates → INSERT + categorize → return { imported: N }
       └── Duplicates found → return { duplicates: [...] }
              │
              ▼
       Client: dedup-review (skip/import)
              │
              ▼
       POST /api/import?step=import&skipDuplicates=true
              │
              ▼
       INSERT remaining + categorize → redirect to /transactions
```

---

## 8. Testing Strategy

| Layer | Target | Approach |
|-------|--------|----------|
| Unit | `autoDetectMapping` heuristic | Various bank CSV headers (Chase, BofA, generic) |
| Unit | `normalizeImportedRows` | Edge cases: split amounts, sign flip, date formats |
| Unit | `generateDedupHash` | Deterministic hash, case insensitivity |
| Unit | `parseOfx` | Both SGML v1 and XML v2 samples |
| Unit | `buildCategorizationPrompt` | Prompt construction with mock categories |
| Unit | `createUserModel` | Each provider type + custom URL |
| Property | Amount parsing | fast-check: decimal → cents (Plaid sign) → display roundtrips |
| Property | Dedup hash | fast-check: same inputs always same hash, different inputs differ |
| Integration | Full CSV import pipeline | createTestDb + PapaParse + normalize + insert + dedup |
| Integration | OFX import with externalId dedup | createTestDb + parseOfx + insert |
| Integration | Settings CRUD | encrypt/decrypt cycle, upsert, masked key retrieval |
| Integration | AI categorization write | Mock generateText response → post-validate → DB write |
| Integration | Post-validate rejects invalid categoryIds | Hallucinated IDs discarded |
| Contract | AI structured output | Zod schema validates against sample responses |
| MSW | Chat route | Mock AI provider endpoint, verify tool calls + streaming |
| MSW | Test connection | Mock provider, verify capability detection |
| E2E | Import wizard happy path | Playwright: upload CSV → map → import → verify in /transactions |
| E2E | Settings save + test connection | Playwright: fill form → save → verify masked display |
| E2E | Chat panel open/close + message | Playwright: toggle → type → verify response |

**Test budget:** ~45-55 tests total (14 unit, 4 property, 10 integration, 4 contract/MSW, 5 E2E).

---

## 9. UI Components Summary

### Atomic Design

**Atoms:**
- `import-progress.tsx` — thin wrapper around shadcn `Progress` with label

**Molecules:**
- `chat-message.tsx` — message bubble (user/assistant), markdown rendering, inline tool status
- `chat-input.tsx` — auto-resize textarea + send button + Ctrl+Enter + disabled during response
- `chat-empty-state.tsx` — suggested prompts ("How much did I spend on food?", "What are my upcoming bills?", "Show my spending trends")
- `chat-tool-status.tsx` — inline indicator showing tool name + spinner/checkmark
- `file-dropzone.tsx` — drag-and-drop with type/size validation, drag-over highlight, accepted formats label
- `column-mapper.tsx` — shadcn Select dropdown per detected column + "(skip)" option
- `import-preview.tsx` — shadcn Table showing first 10 mapped rows with mapped headers
- `dedup-review.tsx` — duplicate list with Alert + skip/import toggles per row

**Organisms:**
- `chat-panel.tsx` — shadcn Sheet (side="right"), useChat hook, message list with ScrollArea, empty state
- `import-wizard.tsx` — multi-step state machine with Back/Next navigation (upload → map → preview → dedup → done)
- `ai-settings-form.tsx` — full settings form with conditional fields, validation, test connection feedback

**Providers:**
- `chat-panel-provider.tsx` — React context for chat panel open/close state across pages

### Chat Toggle Integration

Not a separate component — integrated directly into `sidebar-nav.tsx` as a footer button (MessageCircle icon + "AI Assistant" label). Uses `useChatPanel()` context hook from the provider.

---

## 10. Sidebar + Navigation Changes

Add to `NAV_ITEMS` in `sidebar-nav.tsx`:
- Import (Upload icon) → `/import`
- Settings (Gear icon) → `/settings`

Sidebar footer addition:
- Chat toggle button (MessageCircle icon) → triggers `ChatPanelProvider.toggle()`

---

## 11. Error Handling

| Scenario | Behavior |
|----------|----------|
| AI not configured | Chat panel shows `chat-empty-state` with "Configure AI in Settings" link. Categorization step skipped. |
| Invalid API key | "Test Connection" fails with inline error. Chat returns "Invalid API key — check Settings." |
| AI rate limit | Retry with exponential backoff (max 3). Categorization skips remaining batches, logs warning. |
| AI returns invalid JSON | Retry once with simplified prompt. If still fails, skip batch (non-fatal). |
| AI hallucinates categoryIds | Post-validation discards invalid assignments. Logged for debugging. |
| Model lacks tool-calling | Detected during "Test Connection". Chat uses prompt-stuffing fallback with financial summary in system prompt. |
| CSV parse error | Return error row count + sample of problematic rows. "Skip errors" option. |
| OFX parse failure | "Unable to parse file. Supported: OFX 1.x (SGML) and 2.x (XML). Try CSV format instead." |
| Large file (>10MB) | Client-side validation before upload. Rejection with "Files must be under 10MB" message. |
| All duplicates | "All N transactions already exist in this account" with details. No insert. |
| Import account not owned | Server rejects with 403. Should never happen from UI (only shows user's accounts). |
| Client disconnect during chat | `abortSignal` cancels the AI request server-side. No orphaned processes. |

---

## 12. Security Considerations

- API keys encrypted at rest (AES-256-GCM, same as Plaid tokens)
- API keys never returned to client in full — only `hasKey` + `keyHint` (last 4 chars)
- `testAiConnection` accepts raw key over TLS (unavoidable for test-before-save UX), rate-limited to 5/min
- Chat tools are read-only — no mutations possible via AI
- `maxSteps: 5` + `abortSignal` prevents infinite loops and orphaned requests
- File uploads validated server-side: type (csv/ofx/qfx only), size (<10MB), content-type sniffing
- Import API route validates `accountId` ownership via `scopedQuery` before any insert
- All import parsing + normalization happens server-side — client never sends pre-parsed rows
- All queries household-scoped — AI tools use `scopedQuery` same as everything else
- Custom base URLs allow localhost (for Ollama) — no SSRF risk since it's the user's own server

---

## 13. Accessibility

- Chat panel: shadcn `Sheet` provides focus trap (mobile overlay), escape-to-close, focus return to trigger
- Chat messages: `aria-live="polite"` on message container for screen reader announcements
- Chat input: Ctrl+Enter to send, clear label, `aria-busy` during AI response
- Import wizard: step indicators with `aria-current="step"`, file dropzone with `role="button"` + keyboard activation
- Column mapper: shadcn Select components have built-in keyboard navigation + ARIA
- Confidence slider: `aria-label="AI confidence threshold"` + `aria-valuetext` (e.g., "70%")
- Settings form: proper Label associations, FormDescription for help text

---

## 14. Future Considerations (Not in Scope)

- Message persistence / chat history in DB
- Multiple AI provider configs per user
- Scheduled auto-categorization job (currently only post-sync + manual)
- Import templates (saved mappings for recurring bank exports)
- AI-assisted transaction splitting
- Chat keyboard shortcut (Cmd+K) — deferred due to potential conflicts
