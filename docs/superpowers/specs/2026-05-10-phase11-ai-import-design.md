# Phase 11 — AI Assistant + CSV/OFX Import

## Overview

Add AI-powered transaction categorization (batch mode), a streaming chat assistant with read-only financial insights via tool-calling, and file import (CSV with auto-detect column mapping, minimal OFX/QFX support). BYOK model — supports OpenAI, Anthropic, Google, and any OpenAI-compatible endpoint (Ollama, Together, Groq, vLLM, etc.).

## Architecture

### Module Structure

```
src/lib/ai/
├── provider.ts            # BYOK provider factory (decrypt key → create provider)
├── categorize.ts          # Batch categorization with generateObject
├── chat/
│   ├── tools.ts           # Read-only DB tools for financial insights
│   └── system-prompt.ts   # Financial assistant persona + dynamic context

src/lib/import/
├── csv.ts                 # PapaParse wrapper: preview parse + full parse
├── ofx.ts                 # Minimal OFX/QFX SGML+XML parser
├── mapper.ts              # Auto-detect columns + manual override logic
├── dedup.ts               # Duplicate detection (date+amount+description hash)
├── normalize.ts           # Convert mapped rows → transaction insert format

src/app/api/ai/chat/route.ts       # POST: streaming chat endpoint
src/app/(dashboard)/import/page.tsx # Import wizard page
src/app/(dashboard)/settings/page.tsx # AI provider + settings page
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `ai` | Vercel AI SDK core (streamText, generateObject) |
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

### Schema Addition

Add to `userSettings` table in `src/db/schema/households.ts`:

```typescript
aiBaseUrl: text("ai_base_url"),  // only for "custom" provider
```

The existing columns are sufficient:
- `aiProvider: text("ai_provider", { enum: ["openai", "anthropic", "google", "custom"] })`
- `aiModel: text("ai_model")`
- `aiApiKey: text("ai_api_key")` — encrypted with AES-256-GCM

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

Step 3 in the categorization pipeline (after rules + merchant default). Processes remaining uncategorized transactions via LLM structured output.

### Data Flow

```
Uncategorized transactions (post-rules, post-merchant-default)
  → Group into batches of 20
  → For each batch:
      generateObject({
        model: userModel,
        schema: categorizationSchema,
        system: "You are a financial categorization assistant...",
        prompt: buildCategorizationPrompt(batch, categories)
      })
  → Filter assignments by confidence (> threshold, default 0.7)
  → Write high-confidence assignments to DB
  → Remaining stay "uncategorized" for manual review
```

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

### Integration Points

- **Post-sync:** Called from `categorizeSyncedTransactions()` as a new final step, only if user has AI configured. Non-fatal — caught and logged.
- **Post-import:** Called after CSV/OFX import inserts transactions.
- **Manual trigger:** "Categorize Uncategorized" button on transactions page or settings.
- **Server action:** `categorizeWithAi(householdId, transactionIds?)` — categorizes specified transactions or all uncategorized ones.

### Prompt Strategy

System prompt includes:
- User's full category list (id + name + group name)
- 10 recent manually-categorized examples for few-shot learning
- Instructions to return low confidence when uncertain

---

## 3. AI Chat Assistant

### Route Handler

```typescript
// src/app/api/ai/chat/route.ts
export async function POST(request: Request) {
  const householdId = await getHouseholdId();
  const settings = getUserSettings(householdId);
  
  if (!settings.aiApiKey) {
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
    system: buildSystemPrompt(householdId),
    messages,
    tools: financialTools(householdId),
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

### Tools (Read-Only Financial Queries)

All tools are scoped to the user's household. None perform mutations.

| Tool | Parameters | Returns |
|------|-----------|---------|
| `getSpendingByCategory` | `{ startDate, endDate }` | Category breakdown with amounts |
| `searchTransactions` | `{ query?, startDate?, endDate?, category? }` | Matching transactions (max 20) |
| `getAccountBalances` | none | All accounts with current balances |
| `getMonthlyTrends` | `{ months?: number }` | Month-over-month spending totals |
| `getUpcomingBills` | `{ days?: number }` | Recurring bills due within N days |
| `getBudgetStatus` | `{ month?: string }` | Budget vs actual per category |

Each tool is defined with `tool()` from the AI SDK, Zod input schema, and an `execute` function that calls existing query functions with `scopedQuery`.

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

### Client UI — Slide-Over Chat Panel

Renders in the dashboard layout, persists across page navigation.

**Components:**

```
src/components/organisms/chat-panel.tsx     # "use client", useChat, slide-over container
src/components/molecules/chat-message.tsx   # Message bubble (user/assistant), markdown rendering
src/components/molecules/chat-input.tsx     # Text input + send button + loading state
src/components/atoms/chat-toggle.tsx        # Sidebar button to open/close
```

**State management:**
- `useChat` from `@ai-sdk/react` with `api: '/api/ai/chat'`
- Panel open/closed state managed in layout context (not per-page)
- Messages persist in `useChat` state during session (cleared on page reload)
- No message persistence in DB (keeping it simple — it's a tool, not a product)

**Panel behavior:**
- Slides in from right, ~400px wide, full height
- Overlay on mobile, side-by-side on desktop (>1024px)
- Close on Escape key
- Input auto-focuses when opened

---

## 4. CSV Import

### Parser Module

```typescript
// src/lib/import/csv.ts
import Papa from "papaparse";

export function parsePreview(file: File): Promise<CsvPreview>
// Returns: { headers: string[], rows: Record<string, string>[], delimiter: string }
// Parses first 10 rows for preview display

export function parseAll(file: File, config: ParseConfig): Promise<ParsedRow[]>
// Full streaming parse with step callback for progress
```

### Column Mapper

```typescript
// src/lib/import/mapper.ts

// Auto-detection heuristics
const COLUMN_PATTERNS: Record<RequiredField, RegExp[]> = {
  date: [/^(date|posted|trans.*date|booking|settlement)/i],
  amount: [/^(amount|sum|value|total)/i],
  description: [/^(desc|narr|memo|detail|payee|merchant|name)/i],
};

// Also detect optional fields
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
  category?: string;      // auto-map to existing categories if possible
  reference?: string;
}

export function autoDetectMapping(headers: string[]): Partial<ColumnMapping>
export function validateMapping(mapping: ColumnMapping): ValidationResult
```

**Split amount handling:** Many bank CSVs have separate credit/debit columns instead of a single signed amount. The mapper detects this and combines them: `amount = credit ? +credit : -debit` (converted to cents).

### Deduplication

```typescript
// src/lib/import/dedup.ts

export function generateDedupHash(row: { date: string; amount: number; description: string }): string
// SHA-256 of normalized(date + amount + description)

export function findDuplicates(
  rows: NormalizedRow[],
  accountId: string,
  householdId: string,
  db?: LedgrDb,
): Promise<DedupResult>
// Returns: { unique: NormalizedRow[], duplicates: { row: NormalizedRow, existing: Transaction }[] }
```

Comparison is against existing transactions in the selected target account only. Uses a hash of `date + amount_cents + lowercase_trimmed_description`.

### Normalize

```typescript
// src/lib/import/normalize.ts

export function normalizeImportedRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  accountId: string,
  householdId: string,
): NormalizedRow[]
// Parses dates, converts amounts to cents, generates IDs, applies householdId
```

### Import Flow (User Journey)

1. Navigate to `/import`
2. Upload file (drag-and-drop or file picker)
3. App detects file type (.csv → PapaParse, .ofx/.qfx → OFX parser)
4. **For CSV:** Show preview table (10 rows) with auto-detected column mapping
5. User confirms/adjusts mapping via dropdowns
6. Select target account (or create new manual account)
7. "Import" → full parse → normalize → dedup check
8. If duplicates found: show count + option to skip or force-import
9. Insert transactions → run auto-categorization (rules → AI if configured)
10. Redirect to transactions page filtered to imported date range

### Components

```
src/app/(dashboard)/import/page.tsx              # Server component shell
src/components/organisms/import-wizard.tsx        # "use client", multi-step state machine
src/components/molecules/file-dropzone.tsx        # Drag-and-drop + file picker
src/components/molecules/column-mapper.tsx        # Header → field mapping dropdowns
src/components/molecules/import-preview.tsx       # Preview table with mapped data
src/components/molecules/dedup-review.tsx         # Shows duplicates, skip/import options
src/components/atoms/import-progress.tsx          # Progress bar during insert
```

### Server Action

```typescript
// src/actions/import.ts
export async function importTransactions(input: {
  rows: NormalizedRow[];      // already parsed + mapped on client
  accountId: string;
  skipDuplicates: boolean;
}): Promise<{ success: true; imported: number; skipped: number } | { error: string }>
```

---

## 5. OFX Import (Minimal)

### Parser

```typescript
// src/lib/import/ofx.ts

export function parseOfx(content: string): OfxTransaction[]

interface OfxTransaction {
  date: string;        // from DTPOSTED (YYYYMMDD format → ISO)
  amount: number;      // from TRNAMT (already signed, convert to cents)
  description: string; // from NAME or MEMO
  type: string;        // from TRNTYPE (DEBIT, CREDIT, etc.)
  fitId: string;       // from FITID (unique per institution, use for dedup)
}
```

**Implementation approach:** Regex-based extraction of `<STMTTRN>...</STMTTRN>` blocks. OFX v1 is SGML (no closing tags), v2 is XML. Handle both by:
1. Try XML parse first (v2)
2. Fall back to regex extraction (v1 SGML)

No external library — OFX is simple enough for ~80 lines of parsing code.

**Dedup enhancement:** For OFX, use `fitId` (Financial Institution Transaction ID) as the primary dedup key instead of the date+amount+description hash. It's globally unique per institution.

### Integration

After parsing, OFX transactions feed into the same `normalize.ts` → `dedup.ts` pipeline as CSV. The import wizard detects `.ofx`/`.qfx` extension and skips the column mapping step (OFX has fixed field positions).

---

## 6. Settings Page

### Queries + Actions

```typescript
// src/queries/settings.ts
export function getUserSettings(householdId: string, db?: LedgrDb): UserSettings | null

// src/actions/settings.ts
export async function updateAiSettings(input: {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey?: string;    // only sent when changed (empty = keep existing)
  aiBaseUrl?: string;
}): Promise<{ success: true } | { error: string }>

export async function testAiConnection(input: {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;     // raw, not encrypted — for testing before save
  aiBaseUrl?: string;
}): Promise<{ success: true; response: string } | { error: string }>
```

### Page Layout

```
/settings
├── AI Configuration (card)
│   ├── Provider select (OpenAI / Anthropic / Google / Custom)
│   ├── Base URL input (visible only when Custom selected)
│   ├── Model input
│   ├── API Key input (password field)
│   ├── Confidence threshold slider (0.5 - 0.9)
│   ├── Test Connection button
│   └── Save button
└── (Future: display preferences, notification settings, etc.)
```

### Components

```
src/app/(dashboard)/settings/page.tsx              # Server component
src/components/organisms/ai-settings-form.tsx       # "use client", form state + validation
```

---

## 7. Data Flow Diagrams

### Batch Categorization

```
User configures AI → encrypt(apiKey) → userSettings table
                                              │
Transaction sync completes ──────────────────▶│
                                              ▼
                                    categorizeSyncedTransactions()
                                        │
                                        ├── 1. Apply rules (existing)
                                        ├── 2. Merchant default (existing)
                                        └── 3. AI fallback (NEW)
                                              │
                                              ├── getUserSettings() → decrypt key
                                              ├── createUserModel()
                                              ├── Batch uncategorized (groups of 20)
                                              ├── generateObject() per batch
                                              ├── Filter by confidence threshold
                                              └── Write assignments to DB
```

### Chat

```
User opens chat panel → types question
       │
       ▼
useChat sends POST /api/ai/chat
       │
       ▼
Route: auth → decrypt key → createUserModel → streamText(tools)
       │                                          │
       │                                    AI calls tools
       │                                          │
       │                              ┌───────────┼───────────┐
       │                              ▼           ▼           ▼
       │                     getSpending   searchTxns   getBudget
       │                         (scoped queries, read-only)
       │                              │           │           │
       │                              └───────────┼───────────┘
       │                                          ▼
       │                                    AI generates response
       ▼
Stream response → chat-message renders with markdown
```

### CSV Import

```
User uploads .csv
       │
       ▼
parsePreview(file) → 10 rows + headers
       │
       ▼
autoDetectMapping(headers) → suggested mapping
       │
       ▼
User confirms/adjusts mapping + selects account
       │
       ▼
parseAll(file) → raw rows
       │
       ▼
normalizeImportedRows(rows, mapping) → NormalizedRow[]
       │
       ▼
findDuplicates(rows, accountId) → { unique, duplicates }
       │
       ▼
User reviews duplicates (skip/import)
       │
       ▼
importTransactions() server action → INSERT + categorize pipeline
       │
       ▼
Redirect to /transactions?imported=true
```

---

## 8. Testing Strategy

| Layer | Target | Approach |
|-------|--------|----------|
| Unit | `autoDetectMapping` heuristic | Various bank CSV headers |
| Unit | `normalizeImportedRows` | Edge cases: split amounts, date formats, negative values |
| Unit | `generateDedupHash` | Deterministic hash verification |
| Unit | `parseOfx` | Both SGML v1 and XML v2 samples |
| Unit | `buildCategorizationPrompt` | Prompt construction with mock categories |
| Property | Amount parsing | fast-check: any valid decimal → cents → display roundtrips |
| Integration | Full CSV import pipeline | createTestDb + PapaParse + insert + dedup |
| Integration | Settings CRUD | encrypt/decrypt cycle, upsert behavior |
| Integration | AI categorization write | Mock generateObject response → DB write |
| Contract | AI structured output | Zod schema validates against sample responses |
| MSW | Chat route | Mock AI provider endpoint, verify tool calls |
| E2E | Import wizard happy path | Playwright: upload CSV → map → import → verify |
| E2E | Settings save + test connection | Playwright: fill form → save → verify persisted |

**Test budget:** ~35-45 tests total (12 unit, 4 property, 8 integration, 3 contract, 3 MSW, 4 E2E).

---

## 9. UI Components Summary

### Atomic Design

**Atoms:**
- `chat-toggle.tsx` — button to open/close chat panel
- `import-progress.tsx` — progress bar for import

**Molecules:**
- `chat-message.tsx` — message bubble with markdown rendering
- `chat-input.tsx` — text input + send button + loading indicator
- `file-dropzone.tsx` — drag-and-drop file upload area
- `column-mapper.tsx` — dropdown per detected column
- `import-preview.tsx` — table showing first 10 mapped rows
- `dedup-review.tsx` — duplicate list with skip/import toggles

**Organisms:**
- `chat-panel.tsx` — slide-over panel, useChat hook, message list
- `import-wizard.tsx` — multi-step state machine (upload → map → preview → dedup → done)
- `ai-settings-form.tsx` — full settings form with validation + test

---

## 10. Sidebar + Navigation Changes

Add to `NAV_ITEMS` in `sidebar-nav.tsx`:
- Import (Upload icon) → `/import`
- Settings (Gear icon) → `/settings`
- Chat toggle button (MessageCircle icon) in sidebar footer → opens panel

---

## 11. Error Handling

| Scenario | Behavior |
|----------|----------|
| AI not configured | Chat panel shows "Configure AI in Settings" link. Categorization step silently skipped. |
| Invalid API key | "Test Connection" fails with clear error. Chat returns user-friendly message. |
| AI rate limit | Retry with exponential backoff (max 3 attempts). Categorization skips remaining batches. |
| CSV parse error | Show error row count + preview of problematic rows. Allow "skip errors" option. |
| OFX parse failure | "Unable to parse file. Please try CSV format instead." |
| Large file (>10MB) | Client-side validation before upload. Reject with helpful message. |
| All transactions are duplicates | Show "All N transactions already exist" message with details. No insert. |

---

## 12. Security Considerations

- API keys encrypted at rest (AES-256-GCM, same as Plaid tokens)
- API keys never sent to client — decrypted only server-side in route handler/action
- Chat tools are read-only — no mutations possible via AI
- `maxSteps: 5` prevents infinite tool-calling loops
- File uploads validated: type (csv/ofx/qfx only), size (<10MB), content sniffing
- All queries household-scoped — AI tools use `scopedQuery` same as everything else
- Custom base URLs allow localhost (for Ollama) — no SSRF risk since it's the user's own server

---

## 13. Future Considerations (Not in Scope)

- Message persistence / chat history in DB
- Multiple AI provider configs per user
- Scheduled auto-categorization job (currently only post-sync + manual)
- Import templates (saved mappings for recurring bank exports)
- AI-assisted transaction splitting
