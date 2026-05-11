# AI Settings: DB/UI to .env Migration

## Summary

Migrate AI configuration (provider, model, API key, confidence threshold) from the `user_settings` database table and settings UI to `.env` environment variables. This removes encryption complexity, settings CRUD, and the AI settings form — replacing it with a simple env-based config module.

## Motivation

- AI config is deployment-level (one provider per instance), not per-user
- `.env` is where all other secrets already live (Plaid keys, encryption key, DB URL)
- Removes the need to encrypt/decrypt API keys in the database
- Simplifies code: no settings form, no server actions, no DB queries for AI config
- Matches the pattern self-hosters expect from Docker apps

## Environment Variables

Added to `.env.example`, following the existing `PLAID_*` flat prefix convention:

```
AI_PROVIDER=            # openai | anthropic | google | custom
AI_MODEL=               # e.g. gpt-4o, claude-sonnet-4-5, gemini-2.0-flash
AI_API_KEY=             # provider API key (optional when AI_PROVIDER=custom for local models)
AI_BASE_URL=            # only required for custom provider (e.g. http://localhost:11434/v1)
AI_CONFIDENCE_THRESHOLD=0.7   # 0.5-0.9, controls auto-categorization strictness
```

AI is optional. If `AI_PROVIDER` and `AI_MODEL` are not set, AI features (chat, auto-categorization) are disabled gracefully.

## New Module: `src/lib/ai/config.ts`

Single module exporting two functions:

### `getAiConfig(): AiConfig | null`

Returns a typed config object or `null` if AI is not configured. Uses a lazy singleton pattern (computed once per process, cached in module scope).

```ts
interface AiConfig {
  provider: AiProvider;   // "openai" | "anthropic" | "google" | "custom"
  model: string;
  apiKey: string;
  baseUrl?: string;
  confidenceThreshold: number;
}
```

Validation:
- Returns `null` if `AI_PROVIDER` or `AI_MODEL` are missing
- `AI_API_KEY` is optional when provider is `custom` (supports local Ollama/LM Studio without auth)
- Throws if `AI_PROVIDER` is set to an unrecognized value (fail-fast)
- `AI_CONFIDENCE_THRESHOLD` defaults to `0.7`, clamped to 0.5-0.9

### `isAiConfigured(): boolean`

Convenience wrapper: `getAiConfig() !== null`. Synchronous, zero DB cost.

## Files Deleted

| File | Reason |
|------|--------|
| `src/components/organisms/ai-settings-form.tsx` | Entire AI settings form — no longer needed |

## Files Created

| File | Purpose |
|------|--------|
| `src/lib/ai/config.ts` | Env-based AI config reader with lazy singleton |

## Files Modified

### `src/app/api/ai/chat/route.ts`

- Replace `getUserAiSettings()` + `decrypt()` + `createUserModel()` chain with `getAiConfig()` + `createUserModel()`
- Remove `toolCallingSupported` conditional — always enable tools
- Remove imports: `getUserAiSettings`, `decrypt`
- Add import: `getAiConfig` from `@/lib/ai/config`

### `src/lib/ai/categorize.ts`

- Replace owner lookup + `getUserAiSettings()` + `decrypt()` chain with `getAiConfig()`
- Confidence threshold comes from `getAiConfig().confidenceThreshold` instead of DB
- Remove the `owner` DB query (no longer need userId to find AI settings)
- Remove imports: `getUserAiSettings`, `decrypt`, `householdMembers`

### `src/app/(dashboard)/layout.tsx`

- Replace async `getUserAiSettings(session.user.id)` with sync `isAiConfigured()`
- Simplify `Promise.all` — only `cookies()` remains async
- Remove import: `getUserAiSettings`
- Add import: `isAiConfigured` from `@/lib/ai/config`

### `src/app/(dashboard)/settings/page.tsx`

- Remove `AiSettingsForm` component and its import
- Remove `getUserAiSettings` call and `aiSettings` variable
- Update page description from "Configure AI providers, integrations, and access controls." to "Configure integrations and access controls."

### `src/queries/settings.ts`

- Remove `getUserAiSettings()` function and `AiSettings` interface
- Keep `getMcpSettings()` and `getLayoutForUser()` unchanged

### `src/actions/settings.ts`

- Remove `updateAiSettings()`, `testAiConnection()`, `upsertAiSettings()`, and related Zod schemas
- Remove imports: `encrypt`, `decrypt`, `getUserAiSettings`, `createUserModel`
- Keep `upsertMcpEnabled()`, `saveLayoutForUser()`, `toggleDemoMode()`

### `src/db/schema/households.ts`

Drop 6 columns from `userSettings` table:
- `aiProvider` (`ai_provider`)
- `aiModel` (`ai_model`)
- `aiApiKey` (`ai_api_key`)
- `aiBaseUrl` (`ai_base_url`)
- `aiConfidenceThreshold` (`ai_confidence_threshold`)
- `toolCallingSupported` (`tool_calling_supported`)

Requires a Drizzle migration (`pnpm db:generate` + `pnpm db:migrate`).

### `.env.example`

Replace the AI comment block with actual env var definitions.

## Key Decisions

### `toolCallingSupported` — dropped entirely

Was a per-user flag set by `testAiConnection()` to detect if a model supports tool calling. All four supported providers (OpenAI, Anthropic, Google, custom OpenAI-compatible) handle tools reliably. The chat route will always enable tools. If a user picks a model that doesn't support tools, the AI SDK handles the error gracefully.

### Confidence threshold becomes instance-wide

Previously per-user in the DB. Now a single `.env` value for the instance. This is correct for a self-hosted single-household app.

### `encryption.ts` unchanged

Still needed for Plaid access tokens. The AI key encryption code paths are simply no longer called.

### Chat panel stays conditional

`ChatPanelLoader` still receives `hasAiConfigured` and hides when AI is not configured. The signal source changes from DB query to env var check.

## Data Flow After Migration

```
Layout (sync):     isAiConfigured() → boolean → ChatPanelLoader prop
Chat route:        getAiConfig() → createUserModel(config) → streamText
Auto-categorize:   getAiConfig() → createUserModel(config) → generateText
```

## Test Impact

- `tests/integration/settings.test.ts` — delete AI settings tests (CRUD against DB). MCP/layout tests in the same file, if any, remain.
- No new tests needed for `config.ts` — it reads env vars with trivial logic. If tests are desired later, they can set `process.env` in `beforeEach`.

## Migration Safety

This is a self-hosted app. The migration drops columns that are no longer read or written. Users upgrading:

1. Add `AI_*` vars to their `.env` (values they previously entered in the settings UI)
2. Run `pnpm db:migrate` (drops unused columns)
3. Restart the app

No data loss risk — the AI settings in the DB were configuration, not user data.
